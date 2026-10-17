import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from urllib.error import HTTPError


spec = importlib.util.spec_from_file_location(
    "public_release",
    Path(__file__).resolve().parents[1] / "scripts/check_public_release.py",
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FakeResponse:
    def __init__(self, data: bytes, status: int = 200):
        self.data = data
        self.status = status

    def getcode(self):
        return self.status

    def read(self):
        return self.data

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class PublicReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "manifest.json").write_text(
            json.dumps({"version": "1.2.3"}), encoding="utf-8"
        )
        (self.root / "main.js").write_bytes(b"final build")

    def test_anonymous_public_assets_match(self):
        payloads = {
            "main.js": b"final build",
            "manifest.json": (self.root / "manifest.json").read_bytes(),
        }

        def opener(request, timeout):
            self.assertEqual(timeout, 30)
            self.assertNotIn("?", request.full_url)
            return FakeResponse(payloads[request.full_url.rsplit("/", 1)[-1]])

        result = module.check_public_release(
            self.root, "owner/plugin", "1.2.3", opener=opener
        )
        self.assertTrue(result["ok"])
        self.assertTrue(result["anonymous"])
        self.assertEqual(result["assets"]["main.js"]["status"], 200)

    def test_draft_like_404_fails_even_when_local_assets_exist(self):
        def opener(request, timeout):
            raise HTTPError(request.full_url, 404, "Not Found", {}, None)

        result = module.check_public_release(
            self.root, "owner/plugin", "1.2.3", opener=opener
        )
        self.assertFalse(result["ok"])
        self.assertTrue(any("not anonymously downloadable" in item for item in result["failures"]))

    def test_public_byte_mismatch_fails(self):
        def opener(request, timeout):
            name = request.full_url.rsplit("/", 1)[-1]
            data = b"wrong" if name == "main.js" else (self.root / name).read_bytes()
            return FakeResponse(data)

        result = module.check_public_release(
            self.root, "owner/plugin", "1.2.3", opener=opener
        )
        self.assertFalse(result["ok"])
        self.assertIn("main.js public bytes differ from local artifact", result["failures"])

    def test_version_mismatch_fails_before_network(self):
        def opener(_request, timeout):
            self.fail(f"network should not run: {timeout}")

        result = module.check_public_release(
            self.root, "owner/plugin", "1.2.4", opener=opener
        )
        self.assertFalse(result["ok"])
        self.assertIn("requested version differs from local manifest", result["failures"])


if __name__ == "__main__":
    unittest.main()
