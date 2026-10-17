#!/usr/bin/env python3
"""Read-only local Obsidian release audit; does not establish marketplace approval."""
import argparse
import hashlib
import json
import re
from pathlib import Path

TIPS_DEFAULT_SOURCE_DIRS = ('plugin-src', 'src')
TIPS_ENTRY_SOURCES = ('esbuild.plugin.mjs', 'esbuild.config.mjs', 'esbuild.config.js', 'tsconfig.plugin.json')
TIPS_ENTRY_PATTERN = re.compile(r'["\']([\w./-]+\.(?:ts|tsx|js|jsx|mjs))["\']')
TIPS_SOURCE_SUFFIXES = ('.ts', '.tsx', '.js', '.jsx', '.mjs', '.css')
TIPS_SOURCE_SKIP = re.compile(r'\.(?:test|spec)\.[cm]?[jt]sx?$')
TIPS_LIMIT = 40
# Source scan: Obsidian pops a bubble for any aria-label or title attribute we add.
TIPS_SOURCE_PATTERNS = (
    ('aria-label', re.compile(r'aria-label')),
    ('title attribute', re.compile(r'title\s*=')),
    ('setTooltip', re.compile(r'setTooltip')),
    ('data-tooltip', re.compile(r'data-tooltip')),
)
# Bundle scan: only plugin-owned markers; minified third-party libs use title=/aria-label legally.
TIPS_BUNDLE_PATTERNS = (
    ('setTooltip', re.compile(r'\bsetTooltip\s*\(')),
    ('data-tooltip', re.compile(r'data-tooltip')),
)


def plugin_source_dirs(root):
    """Directories whose sources feed the plugin bundle; other trees (e.g. a website) are ignored."""
    dirs = []
    for name in TIPS_ENTRY_SOURCES:
        config = root / name
        if not config.is_file():
            continue
        try:
            text = config.read_text(errors='replace')
        except OSError:
            continue
        for match in TIPS_ENTRY_PATTERN.finditer(text):
            parent = Path(match.group(1)).parent
            if str(parent) not in ('.', '') and (root / parent).is_dir():
                dirs.append(str(parent))
    if not dirs:
        dirs = [name for name in TIPS_DEFAULT_SOURCE_DIRS if (root / name).is_dir()]
    return sorted(set(dirs))


def scan_tips(root):
    """Static scan for tooltip sources; Obsidian pops a bubble for any aria-label."""
    hits = []
    files = []
    for source_dir in plugin_source_dirs(root):
        base = root / source_dir
        files.extend(sorted(path for path in base.rglob('*')
                            if path.suffix in TIPS_SOURCE_SUFFIXES and not TIPS_SOURCE_SKIP.search(path.name)))
    files.extend(root / name for name in ('main.js', 'styles.css'))
    for path in files:
        if not path.exists():
            continue
        patterns = TIPS_BUNDLE_PATTERNS if path.parent == root else TIPS_SOURCE_PATTERNS
        try:
            text = path.read_text(errors='replace')
        except OSError:
            continue
        relative = path.relative_to(root)
        for number, line in enumerate(text.splitlines(), 1):
            for label, pattern in patterns:
                if pattern.search(line):
                    hits.append({'file': str(relative), 'line': number, 'pattern': label,
                                 'excerpt': line.strip()[:160]})
                    break
            if len(hits) >= TIPS_LIMIT:
                return hits, True
    return hits, False


def audit(root, tag=None, budget=5_000_000, compare_dir=None, tips_scan=False):
    root = Path(root).resolve()
    failures, assets = [], {}
    def read_json(name, required=True):
        path = root / name
        if not path.exists() and not required:
            return None
        try:
            value = json.loads(path.read_text())
            if not isinstance(value, dict):
                raise ValueError('expected object')
            return value
        except (OSError, ValueError) as error:
            failures.append(f'{name}: {error.__class__.__name__}')
            return {}
    manifest = read_json('manifest.json')
    version = manifest.get('version')
    for field in ('id', 'name', 'version', 'minAppVersion', 'description', 'author'):
        if not isinstance(manifest.get(field), str) or not manifest[field].strip():
            failures.append(f'manifest missing or invalid {field}')
    if not isinstance(manifest.get('isDesktopOnly'), bool):
        failures.append('manifest isDesktopOnly must be boolean')
    if not re.fullmatch(r'\d+\.\d+\.\d+', str(version)):
        failures.append('manifest version must be x.y.z')
    if tag is not None and tag != version:
        failures.append('tag must equal manifest version exactly')
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', str(manifest.get('id', ''))) or 'obsidian' in str(manifest.get('id', '')).lower():
        failures.append('invalid plugin id')
    package = read_json('package.json', False)
    if package is not None and package.get('version') != version:
        failures.append('package version differs from manifest')
    package_lock = read_json('package-lock.json', False)
    if package_lock is not None:
        if 'version' in package_lock and package_lock.get('version') != version:
            failures.append('package-lock version differs from manifest')
        lock_packages = package_lock.get('packages')
        if isinstance(lock_packages, dict) and isinstance(lock_packages.get(''), dict):
            root_lock_version = lock_packages[''].get('version')
            if root_lock_version is not None and root_lock_version != version:
                failures.append('package-lock root package version differs from manifest')
    versions = read_json('versions.json', False)
    if versions is not None and (not isinstance(version, str) or versions.get(version) != manifest.get('minAppVersion')):
        failures.append('versions.json does not map this version to minAppVersion')
    for name in ('main.js', 'manifest.json', 'styles.css'):
        path = root / name
        if name == 'styles.css' and not path.exists():
            continue
        try:
            data = path.read_bytes()
            assets[name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
            if not data:
                failures.append(f'{name} is empty')
            if len(data) > budget:
                failures.append(f'{name} exceeds configured {budget}-byte budget')
        except OSError:
            failures.append(f'{name} missing or unreadable')
    compared_dir = None
    if compare_dir is not None:
        comparison_root = Path(compare_dir).resolve()
        compared_dir = str(comparison_root)
        for name in assets:
            comparison_path = comparison_root / name
            try:
                comparison_data = comparison_path.read_bytes()
                source_data = (root / name).read_bytes()
                if comparison_data != source_data:
                    failures.append(f'{name} differs from comparison directory')
            except OSError:
                failures.append(f'{name} missing or unreadable in comparison directory')
    tips = []
    if tips_scan:
        tips, truncated = scan_tips(root)
        for hit in tips:
            failures.append(f"tips: {hit['file']}:{hit['line']} uses {hit['pattern']}")
        if truncated:
            failures.append(f'tips scan stopped after {TIPS_LIMIT} hits; fix the reported ones and rescan')
    return {'ok': not failures, 'version': version, 'assets': assets, 'compared_dir': compared_dir, 'failures': failures,
            'tips': tips,
            'scope': 'local artifacts only; no review, runtime or permission certification'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('--tag')
    parser.add_argument('--max-asset-bytes', type=int, default=5_000_000)
    parser.add_argument('--compare-dir', type=Path,
                        help='directory containing downloaded or rebuilt release assets to compare byte-for-byte')
    parser.add_argument('--scan-tips', action='store_true',
                        help='fail when plugin sources or built assets contain aria-label, title=, setTooltip or data-tooltip')
    args = parser.parse_args()
    if args.max_asset_bytes < 1:
        parser.error('--max-asset-bytes must be positive')
    result = audit(args.root, args.tag, args.max_asset_bytes, args.compare_dir, args.scan_tips)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result['ok'] else 1)


if __name__ == '__main__':
    main()
