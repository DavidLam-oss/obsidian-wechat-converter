import importlib.util
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('host_eval', Path(__file__).resolve().parents[1] / 'scripts/host_eval.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class HostEvalTests(unittest.TestCase):
    def test_wrap_embeds_code_and_screenshot(self):
        js = module.wrap('return 1 + 1;', '/tmp/a "b".png')
        self.assertIn('return 1 + 1;', js)
        self.assertIn('"/tmp/a \\"b\\".png"', js)
        self.assertNotIn('/*__USER__*/', js)

    def test_wrap_rejects_placeholders(self):
        with self.assertRaises(ValueError):
            module.wrap('/*__USER__*/')

    @unittest.skipUnless(shutil.which('node'), 'node not installed')
    def test_wrapped_code_is_valid_javascript_and_reports(self):
        js = module.wrap('console.error("boom"); if (globalThis.fail) throw new Error("bad"); return { n: await Promise.resolve(3) };')
        # Minimal stand-ins for the browser globals the wrapper touches.
        harness = 'globalThis.window={addEventListener(){},removeEventListener(){}};' \
                  f'Promise.resolve({js}).then(v=>process.stdout.write(v));'
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'run.js'
            path.write_text(harness)
            out = subprocess.run(['node', str(path)], capture_output=True, text=True, timeout=30)
        result = module.parse_output('=> ' + out.stdout)
        self.assertTrue(result['ok'])
        self.assertEqual(result['result'], {'n': 3})
        self.assertEqual(result['errors'], ['boom'])

    def test_parse_output_variants(self):
        self.assertEqual(module.parse_output('=> {"ok": true, "result": 2, "errors": []}')['result'], 2)
        self.assertFalse(module.parse_output('Error: Cannot read properties of undefined')['ok'])
        self.assertFalse(module.parse_output('=> not json')['ok'])
        self.assertFalse(module.parse_output('')['ok'])


if __name__ == '__main__':
    unittest.main()
