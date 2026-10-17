import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('audit', Path(__file__).resolve().parents[1] / 'scripts/audit_release.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ReleaseAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.manifest = dict(id='reading-tool', name='Reader', version='1.2.3', minAppVersion='1.0.0', description='Read', author='Author', isDesktopOnly=False)
        self.write('manifest.json', self.manifest)
        (self.root/'main.js').write_text('console.log("fixture")')
    def write(self, name, value):
        (self.root/name).write_text(json.dumps(value))
    def test_optional_css_passes(self):
        result=module.audit(self.root, '1.2.3'); self.assertTrue(result['ok']); self.assertEqual(len(result['assets']['main.js']['sha256']),64)
    def test_v_prefix_fails(self):
        self.assertFalse(module.audit(self.root,'v1.2.3')['ok'])
    def test_missing_js(self):
        (self.root/'main.js').unlink(); self.assertFalse(module.audit(self.root)['ok'])
    def test_empty_js(self):
        (self.root/'main.js').write_bytes(b''); self.assertFalse(module.audit(self.root)['ok'])
    def test_package_mismatch(self):
        self.write('package.json',dict(version='1.2.2')); self.assertFalse(module.audit(self.root)['ok'])
    def test_package_lock_versions_must_match(self):
        self.write('package-lock.json', {'version': '1.2.2', 'packages': {'': {'version': '1.2.1'}}})
        result = module.audit(self.root)
        self.assertFalse(result['ok'])
        self.assertIn('package-lock version differs from manifest', result['failures'])
        self.assertIn('package-lock root package version differs from manifest', result['failures'])
    def test_invalid_json(self):
        (self.root/'manifest.json').write_text('{'); self.assertFalse(module.audit(self.root)['ok'])
    def test_versions_mismatch(self):
        self.write('versions.json',{'1.2.3':'2.0.0'}); self.assertFalse(module.audit(self.root)['ok'])
    def test_bytes_not_characters(self):
        (self.root/'main.js').write_text('乔'*200); self.assertFalse(module.audit(self.root,budget=500)['ok'])
    def test_read_only(self):
        before={p.name:p.read_bytes() for p in self.root.iterdir()}; module.audit(self.root); self.assertEqual(before,{p.name:p.read_bytes() for p in self.root.iterdir()})
    def test_invalid_id(self):
        self.manifest['id']='obsidian-thing'; self.write('manifest.json',self.manifest); self.assertFalse(module.audit(self.root)['ok'])

    def test_comparison_directory_matches_release_assets(self):
        comparison = self.root / 'release'
        comparison.mkdir()
        (comparison / 'main.js').write_bytes((self.root / 'main.js').read_bytes())
        (comparison / 'manifest.json').write_bytes((self.root / 'manifest.json').read_bytes())
        result = module.audit(self.root, compare_dir=comparison)
        self.assertTrue(result['ok'])
        self.assertEqual(result['compared_dir'], str(comparison.resolve()))

    def test_comparison_directory_detects_wrong_or_missing_assets(self):
        comparison = self.root / 'release'
        comparison.mkdir()
        (comparison / 'main.js').write_text('wrong build')
        result = module.audit(self.root, compare_dir=comparison)
        self.assertFalse(result['ok'])
        self.assertIn('main.js differs from comparison directory', result['failures'])
        self.assertIn('manifest.json missing or unreadable in comparison directory', result['failures'])

    def test_non_string_version_with_mapping_returns_failure(self):
        self.write('versions.json', {'1.2.3': '1.0.0'})
        for version in ([], {}, None, 123):
            with self.subTest(version=version):
                self.manifest['version'] = version
                self.write('manifest.json', self.manifest)
                result = module.audit(self.root)
                self.assertFalse(result['ok'])
                self.assertIn('manifest missing or invalid version', result['failures'])

    def test_clean_sources_pass_the_tips_scan(self):
        (self.root / 'plugin-src').mkdir()
        (self.root / 'plugin-src' / 'view.ts').write_text('button.createSpan({ cls: "sr-only", text: "播放" });')
        result = module.audit(self.root, tips_scan=True)
        self.assertTrue(result['ok'])
        self.assertEqual(result['tips'], [])

    def test_tips_scan_is_off_by_default(self):
        (self.root / 'main.js').write_text('el.setAttribute("aria-label", "播放")')
        result = module.audit(self.root)
        self.assertTrue(result['ok'])
        self.assertEqual(result['tips'], [])

    def test_tips_scan_flags_aria_label_title_and_settooltip(self):
        (self.root / 'plugin-src').mkdir()
        source = self.root / 'plugin-src' / 'view.ts'
        source.write_text('button.setAttribute("aria-label", "播放");\n')
        result = module.audit(self.root, tips_scan=True)
        self.assertFalse(result['ok'])
        self.assertIn('tips: plugin-src/view.ts:1 uses aria-label', result['failures'])

        source.write_text('icon.title = "播放";\n')
        result = module.audit(self.root, tips_scan=True)
        self.assertFalse(result['ok'])
        self.assertTrue(any('title attribute' in failure for failure in result['failures']))

        source.write_text('button.setTooltip("播放");\n')
        result = module.audit(self.root, tips_scan=True)
        self.assertFalse(result['ok'])
        self.assertTrue(any('setTooltip' in failure for failure in result['failures']))

        source.write_text('button.setAttribute("data-tooltip-position", "top");\n')
        result = module.audit(self.root, tips_scan=True)
        self.assertFalse(result['ok'])
        self.assertTrue(any('data-tooltip' in failure for failure in result['failures']))

    def test_tips_scan_checks_built_assets_and_skips_missing_css(self):
        (self.root / 'styles.css').write_text('.qiaomu-radio__device > .view-header { display: none; }')
        result = module.audit(self.root, tips_scan=True)
        self.assertTrue(result['ok'])
        (self.root / 'main.js').write_text('player.setTooltip("播放")')
        result = module.audit(self.root, tips_scan=True)
        self.assertFalse(result['ok'])
        self.assertIn('tips: main.js:1 uses setTooltip', result['failures'])

    def test_bundle_scan_ignores_third_party_titles_and_aria_labels(self):
        (self.root / 'main.js').write_text('l.title="Chrome";el.setAttribute("aria-label","close");')
        result = module.audit(self.root, tips_scan=True)
        self.assertTrue(result['ok'])
        (self.root / 'main.js').write_text('el.setAttribute("data-tooltip-position","top");')
        result = module.audit(self.root, tips_scan=True)
        self.assertFalse(result['ok'])

    def test_tips_scan_skips_test_files(self):
        (self.root / 'plugin-src').mkdir()
        (self.root / 'plugin-src' / 'view.test.ts').write_text('expect(source).not.toContain("aria-label");')
        result = module.audit(self.root, tips_scan=True)
        self.assertTrue(result['ok'])
        self.assertEqual(result['tips'], [])

    def test_tips_scan_only_reads_directories_that_feed_the_plugin(self):
        (self.root / 'plugin-src').mkdir()
        (self.root / 'src').mkdir()
        (self.root / 'src' / 'website.tsx').write_text('button.setAttribute("aria-label", "网页版按钮");')
        (self.root / 'esbuild.plugin.mjs').write_text('entryPoints: ["plugin-src/main.ts"], outfile: "main.js"')
        self.assertEqual(module.plugin_source_dirs(self.root), ['plugin-src'])
        result = module.audit(self.root, tips_scan=True)
        self.assertTrue(result['ok'])

    def test_tips_scan_falls_back_to_known_source_directories(self):
        (self.root / 'src').mkdir()
        (self.root / 'src' / 'view.ts').write_text('button.setAttribute("aria-label", "播放");')
        self.assertEqual(module.plugin_source_dirs(self.root), ['src'])
        result = module.audit(self.root, tips_scan=True)
        self.assertFalse(result['ok'])
        self.assertIn('tips: src/view.ts:1 uses aria-label', result['failures'])

