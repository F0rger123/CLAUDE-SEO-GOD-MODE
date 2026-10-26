"""Offline test of the extension's one-click updater (scripts/updater/install_updater.py).

Checks the Chrome native-messaging protocol, that a newer release zip is unpacked over the extension folder, that an
older or foreign zip is refused, and that nothing is written outside the folder. No browser or registry needed.
Run: python -m unittest tests/test_updater.py
"""
import functools
import http.server
import importlib.util
import io
import json
import os
import struct
import subprocess
import sys
import tempfile
import threading
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "updater" / "install_updater.py"


def make_zip(path: Path, version: str, name="SEO God Mode - Free Agentic SEO, AEO & GEO Audit", extra=None):
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("manifest.json", json.dumps({"name": name, "version": version, "manifest_version": 3}))
        z.writestr("lib/new.js", "export const v = '%s';" % version)
        for k, val in (extra or {}).items():
            z.writestr(k, val)


class UpdaterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        t = Path(cls.tmp.name)
        (t / "www").mkdir()
        make_zip(t / "www" / "new.zip", "9.9.9")
        make_zip(t / "www" / "old.zip", "0.1.0")
        make_zip(t / "www" / "other.zip", "9.9.9", name="Something Else")
        make_zip(t / "www" / "evil.zip", "9.9.9", extra={"../escape.txt": "x"})
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(t / "www"))
        handler.log_message = lambda *a, **k: None
        cls.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        spec = importlib.util.spec_from_file_location("upd", SCRIPT)
        cls.m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.m)

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.tmp.cleanup()

    def ext(self, version="1.0.0") -> Path:
        d = Path(tempfile.mkdtemp(dir=self.tmp.name)) / "ext"
        d.mkdir()
        (d / "manifest.json").write_text(json.dumps({"name": "SEO God Mode - Free Agentic SEO, AEO & GEO Audit", "version": version}), encoding="utf-8")
        return d

    def test_updates_newer(self):
        d = self.ext()
        r = self.m.update(d, "1.0.0", self.base + "/new.zip")
        self.assertTrue(r["ok"] and r["updated"])
        self.assertEqual(json.loads((d / "manifest.json").read_text())["version"], "9.9.9")
        self.assertTrue((d / "lib" / "new.js").exists())

    def test_skips_older_and_refuses_bad(self):
        d = self.ext()
        self.assertFalse(self.m.update(d, "1.0.0", self.base + "/old.zip")["updated"])
        self.assertFalse(self.m.update(d, "1.0.0", self.base + "/other.zip")["ok"])
        self.assertFalse(self.m.update(d, "1.0.0", self.base + "/evil.zip")["ok"])
        self.assertFalse((d.parent / "escape.txt").exists())
        self.assertFalse(self.m.update(Path(self.tmp.name), "1.0.0", self.base + "/new.zip")["ok"], "refuses a folder that isn't the extension")

    def test_native_messaging_protocol(self):
        d = self.ext()
        home = Path(tempfile.mkdtemp(dir=self.tmp.name))
        env = {**os.environ, "LOCALAPPDATA": str(home), "HOME": str(home), "USERPROFILE": str(home)}
        cfg_dir = home / ("SEOGodMode" if os.name == "nt" else ".seo-god-mode")
        cfg_dir.mkdir(parents=True)
        (cfg_dir / "config.json").write_text(json.dumps({"extensions": {"abcdef": str(d)}, "source": self.base + "/new.zip"}), encoding="utf-8")

        def call(msg):
            data = json.dumps(msg).encode()
            p = subprocess.run([sys.executable, str(SCRIPT), "--host", "chrome-extension://abcdef/"], input=struct.pack("=I", len(data)) + data,
                               capture_output=True, env=env, timeout=60)
            n = struct.unpack("=I", p.stdout[:4])[0]
            return json.loads(p.stdout[4:4 + n])

        self.assertEqual(call({"cmd": "ping"})["folder"], str(d))
        r = call({"cmd": "update", "current": "1.0.0"})
        self.assertTrue(r["updated"], r)
        self.assertEqual(r["version"], "9.9.9")


if __name__ == "__main__":
    unittest.main()
