"""Offline test of scripts/loop/compete.py: a thin "you" site and a richer competitor, served locally.

Run: python -m unittest tests/test_compete.py      (no internet; autocomplete and Bing are skipped with --offline)
"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_rating import serve  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "loop"))
sys.path.insert(0, str(ROOT / "scripts"))
import compete  # noqa: E402

WORDS = "Licensed crews, written estimates and photo reports after every job across York County. " * 30


def page(title, h1, body, links="", lang=' lang="en"'):
    return (f'<!doctype html><html{lang}><head><meta charset="utf-8"><title>{title}</title></head><body>'
            f'<nav><a href="/">Home</a> {links}</nav><h1>{h1}</h1>{body}</body></html>')


def write(root: Path, pages: dict):
    for path, html in pages.items():
        d = root / path.strip("/")
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(html, encoding="utf-8")
    (root / "robots.txt").write_text("User-agent: *\nAllow: /\n", encoding="utf-8")


class CompeteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        t = Path(cls.tmp.name)
        (t / "you").mkdir(); (t / "rival").mkdir()
        write(t / "you", {"/": page("Ridge Roofing York PA", "Ridge Roofing", f"<p>{WORDS}</p>", '<a href="/roof-repair/">Repair</a>'),
                          "/roof-repair/": page("Roof Repair in York PA", "Roof repair", f"<p>{WORDS}</p>")})
        links = '<a href="/roof-repair/">Repair</a> <a href="/metal-roofing/">Metal roofing</a>'
        write(t / "rival", {
            "/": page("Rival Roofing York PA", "Rival Roofing", f"<p>{WORDS}</p><h2>How much does a metal roof cost in York?</h2><p>{WORDS}</p>", links),
            "/roof-repair/": page("Roof Repair York PA", "Roof repair", f"<p>{WORDS}</p>", links),
            "/metal-roofing/": page("Metal Roofing Installation York PA", "Metal roofing", f"<p>{WORDS}</p><h2>Do metal roofs make noise in the rain?</h2><p>{WORDS}</p>", links)})
        cls.servers = []
        bases = {}
        for name in ("you", "rival"):
            srv, base = serve(t / name)
            cls.servers.append(srv); bases[name] = base
        cls.cfg = t / "seo-loop.json"
        cls.cfg.write_text(json.dumps({"site": bases["you"] + "/", "state_dir": "state",
                                       "market": {"services": ["roof repair", "metal roofing"], "areas": ["York PA"]}}), encoding="utf-8")
        run = lambda *a: subprocess.run([sys.executable, str(ROOT / "scripts/loop/compete.py"), *a, "--config", str(cls.cfg)],
                                        capture_output=True, text=True, encoding="utf-8", errors="replace", check=True)
        run("add", "--url", bases["rival"] + "/", "--name", "Rival Roofing")
        cls.scan_out = run("scan", "--max-pages", "10", "--delay", "0").stdout
        cls.trends_out = run("trends", "--offline").stdout
        cls.state = t / "state"

    @classmethod
    def tearDownClass(cls):
        for s in cls.servers:
            s.shutdown()
        cls.tmp.cleanup()

    def test_scan_finds_gaps(self):
        c = json.loads((self.state / "competitors.json").read_text(encoding="utf-8"))
        self.assertEqual(len(c["competitors"]), 1)
        self.assertIn("overall", c["competitors"][0]["scores"])
        topics = [g["topic"] for g in c["topic_gaps"]]
        self.assertTrue(any("metal" in t for t in topics), topics)
        self.assertFalse(any(t == "repair roof" or t == "roof repair" for t in topics), "you already cover roof repair")
        qs = [g["question"] for g in c["question_gaps"]]
        self.assertIn("Do metal roofs make noise in the rain?", qs)
        self.assertIn("Never copy", self.scan_out.replace("never copy", "Never copy"))

    def test_trends_marks_unanswered(self):
        t = json.loads((self.state / "trends.json").read_text(encoding="utf-8"))
        by = {r["phrase"]: r for r in t["phrases"]}
        self.assertIs(by["metal roofing York PA"]["answered"], False)
        self.assertIs(by["roof repair York PA"]["answered"], True)

    def test_loop_gets_opportunities(self):
        ops = compete.loop_opportunities(self.state)
        kinds = {o["type"] for o in ops}
        self.assertEqual(kinds, {"competitor_gap", "trend"})
        self.assertTrue(all(o["suggest"] for o in ops))


if __name__ == "__main__":
    unittest.main()
