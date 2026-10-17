#!/usr/bin/env python3
"""Run a JavaScript check inside a running Obsidian vault and return JSON.

Wraps the snippet so that console.error, window errors and unhandled rejections raised while it
runs are collected, exceptions come back as data, and the result is JSON — then calls
`obsidian vault=<name> eval code=<js>` without going through a shell (no quoting problems).

The snippet is an async function body: use `await`, and `return` the value to report.
It runs with full app access in that vault, so point it at a QA vault, never a personal one.

Examples:
  python3 host_eval.py --vault my-qa --file check.js
  python3 host_eval.py --vault my-qa --reload my-plugin --code 'return app.plugins.plugins["my-plugin"].manifest.version'
  python3 host_eval.py --vault my-qa --file check.js --screenshot /tmp/after.png
  python3 host_eval.py --file check.js --print-js   # show the wrapped code only
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

WRAPPER = """(async () => {
  const __errors = [];
  const __error = console.error;
  console.error = (...args) => { __errors.push(args.map(x => (x && x.stack) || String(x)).join(" ").slice(0, 600)); __error(...args); };
  const __onError = event => __errors.push("window: " + ((event.error && event.error.stack) || event.message));
  const __onRejection = event => __errors.push("unhandled: " + ((event.reason && event.reason.stack) || String(event.reason)));
  window.addEventListener("error", __onError);
  window.addEventListener("unhandledrejection", __onRejection);
  try {
    const __result = await (async () => {
/*__USER__*/
    })();
    const __shot = /*__SHOT__*/null;
    if (__shot) {
      try {
        const win = require("electron").remote.getCurrentWindow();
        const image = await win.webContents.capturePage();
        require("fs").writeFileSync(__shot, image.toPNG());
      } catch (error) { __errors.push("screenshot: " + ((error && error.message) || String(error))); }
    }
    return JSON.stringify({ ok: true, result: __result === undefined ? null : __result, errors: __errors });
  } catch (error) {
    return JSON.stringify({ ok: false, error: (error && error.stack) || String(error), errors: __errors });
  } finally {
    console.error = __error;
    window.removeEventListener("error", __onError);
    window.removeEventListener("unhandledrejection", __onRejection);
  }
})()"""


def wrap(code: str, screenshot: str | None = None) -> str:
    """Wrapped, self-reporting JS for `obsidian eval`."""
    if "/*__USER__*/" in code or "/*__SHOT__*/" in code:
        raise ValueError("snippet must not contain the wrapper placeholders")
    shot = json.dumps(screenshot) if screenshot else "null"
    return WRAPPER.replace("/*__SHOT__*/null", shot).replace("/*__USER__*/", code)


def parse_output(output: str) -> dict:
    """Turns the CLI's `=> {...}` / `Error: ...` text into a result dict."""
    text = output.strip()
    marker = text.find("=> ")
    if marker >= 0:
        payload = text[marker + 3:].strip()
        try:
            value = json.loads(payload)
            return value if isinstance(value, dict) else {"ok": True, "result": value, "errors": []}
        except json.JSONDecodeError:
            return {"ok": False, "error": "unparsed output", "raw": payload[:2000], "errors": []}
    return {"ok": False, "error": text[:2000] or "no output from obsidian eval", "errors": []}


def run(vault: str, js: str, reload: str | None, timeout: int) -> dict:
    cli = shutil.which("obsidian")
    if not cli:
        return {"ok": False, "error": "obsidian CLI not found on PATH (enable it in Obsidian settings → General → Command line interface)", "errors": []}
    if reload:
        done = subprocess.run([cli, f"vault={vault}", "plugin:reload", f"id={reload}"], capture_output=True, text=True, timeout=timeout)
        if "Reloaded" not in done.stdout:
            return {"ok": False, "error": f"reload failed: {(done.stdout + done.stderr).strip()[:500]}", "errors": []}
    done = subprocess.run([cli, f"vault={vault}", "eval", f"code={js}"], capture_output=True, text=True, timeout=timeout)
    return parse_output(done.stdout + ("\n" + done.stderr if done.returncode and done.stderr else ""))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--file", type=Path, help="JS file holding an async function body")
    source.add_argument("--code", help="JS async function body")
    parser.add_argument("--vault", help="vault name as shown by `obsidian vaults` (use a QA vault)")
    parser.add_argument("--reload", metavar="PLUGIN_ID", help="run `plugin:reload` first")
    parser.add_argument("--screenshot", help="save a PNG of the Obsidian window after the snippet")
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--print-js", action="store_true", help="print the wrapped code and exit")
    args = parser.parse_args()
    code = args.file.read_text(encoding="utf-8") if args.file else args.code
    js = wrap(code, args.screenshot)
    if args.print_js:
        print(js)
        return 0
    if not args.vault:
        parser.error("--vault is required unless --print-js is used")
    result = run(args.vault, js, args.reload, args.timeout)
    print(json.dumps(result, ensure_ascii=False, indent=1))
    return 0 if result.get("ok") and not result.get("errors") else 1


if __name__ == "__main__":
    sys.exit(main())
