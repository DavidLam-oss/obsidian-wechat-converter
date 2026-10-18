#!/usr/bin/env python3
"""Anonymously verify public Obsidian release assets against local artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


REPO_PATTERN = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")
STANDARD_ASSETS = ("main.js", "manifest.json", "styles.css")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def check_public_release(
    root: Path,
    repo: str,
    version: str | None = None,
    attempts: int = 1,
    retry_delay: float = 0,
    timeout: float = 30,
    opener=urlopen,
    sleeper=time.sleep,
) -> dict:
    root = Path(root).resolve()
    failures: list[str] = []
    assets: dict[str, dict] = {}

    if not REPO_PATTERN.fullmatch(repo):
        return {
            "ok": False,
            "repo": repo,
            "version": version,
            "anonymous": True,
            "assets": {},
            "failures": ["repo must be owner/name"],
            "scope": "anonymous public release assets only; no directory or runtime certification",
        }

    try:
        manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        manifest = {}
        failures.append(f"manifest.json: {error.__class__.__name__}")

    local_version = manifest.get("version")
    target_version = version or local_version
    if not isinstance(target_version, str) or not re.fullmatch(r"\d+\.\d+\.\d+", target_version):
        failures.append("version must be x.y.z")
    if version is not None and local_version != version:
        failures.append("requested version differs from local manifest")

    local_assets: dict[str, bytes] = {}
    for name in STANDARD_ASSETS:
        path = root / name
        if name == "styles.css" and not path.exists():
            continue
        try:
            local_assets[name] = path.read_bytes()
        except OSError:
            failures.append(f"{name} missing or unreadable")

    if failures or not isinstance(target_version, str):
        return {
            "ok": False,
            "repo": repo,
            "version": target_version,
            "anonymous": True,
            "assets": assets,
            "failures": failures,
            "scope": "anonymous public release assets only; no directory or runtime certification",
        }

    for name, local_data in local_assets.items():
        url = (
            f"https://github.com/{repo}/releases/download/"
            f"{quote(target_version, safe='')}/{quote(name, safe='')}"
        )
        record = {
            "url": url,
            "status": None,
            "bytes": None,
            "sha256": None,
            "expected_bytes": len(local_data),
            "expected_sha256": sha256(local_data),
            "attempts": 0,
        }
        remote_data: bytes | None = None
        last_error = ""
        for attempt in range(1, attempts + 1):
            record["attempts"] = attempt
            request = Request(url, headers={"User-Agent": "qiaomu-obsidian-dev-public-release-check"})
            try:
                with opener(request, timeout=timeout) as response:
                    status = getattr(response, "status", response.getcode())
                    record["status"] = status
                    remote_data = response.read()
                if status == 200:
                    break
                last_error = f"HTTP {status}"
            except HTTPError as error:
                record["status"] = error.code
                last_error = f"HTTP {error.code}"
                error.close()
            except (URLError, TimeoutError, OSError) as error:
                last_error = f"{error.__class__.__name__}: {error}"
            if attempt < attempts and retry_delay:
                sleeper(retry_delay)

        if remote_data is not None:
            record["bytes"] = len(remote_data)
            record["sha256"] = sha256(remote_data)
        if record["status"] != 200:
            failures.append(f"{name} is not anonymously downloadable: {last_error or record['status']}")
        elif remote_data != local_data:
            failures.append(f"{name} public bytes differ from local artifact")
        assets[name] = record

    return {
        "ok": not failures,
        "repo": repo,
        "version": target_version,
        "anonymous": True,
        "assets": assets,
        "failures": failures,
        "scope": "anonymous public release assets only; no directory or runtime certification",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, help="plugin root containing final release artifacts")
    parser.add_argument("--repo", required=True, help="public GitHub repository as owner/name")
    parser.add_argument("--version", help="release version; defaults to local manifest.json")
    parser.add_argument("--attempts", type=int, default=1, help="bounded attempts for CDN propagation")
    parser.add_argument("--retry-delay", type=float, default=2, help="seconds between attempts")
    parser.add_argument("--timeout", type=float, default=30, help="seconds per request")
    args = parser.parse_args()
    if args.attempts < 1:
        parser.error("--attempts must be positive")
    if args.retry_delay < 0:
        parser.error("--retry-delay must be non-negative")
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    result = check_public_release(
        args.root,
        args.repo,
        args.version,
        args.attempts,
        args.retry_delay,
        args.timeout,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
