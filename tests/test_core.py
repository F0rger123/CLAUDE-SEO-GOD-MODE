"""Offline unit tests for core helpers. Run: python -m unittest discover -s tests -p "test_core.py" """
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import common  # noqa: E402

ROBOTS = """User-Agent: *
Allow: /
Disallow: /app
Disallow: /*.pdf$

User-agent: GPTBot
Disallow: /

User-agent: Googlebot
User-agent: Bingbot
Allow: /
Disallow: /private
Allow: /private/ok
"""


class RobotsTest(unittest.TestCase):
    r = common.Robots(ROBOTS)

    def check(self, agent, path, expected):
        self.assertEqual(self.r.can_fetch(agent, "https://a.com" + path), expected, f"{agent} {path}")

    def test_longest_match_beats_order(self):
        self.check("AnyBot", "/app", False)       # urllib.robotparser gets this wrong
        self.check("AnyBot", "/apple", False)
        self.check("AnyBot", "/", True)

    def test_wildcards(self):
        self.check("AnyBot", "/f.pdf", False)
        self.check("AnyBot", "/f.pdf?x=1", True)

    def test_specific_groups(self):
        self.check("GPTBot", "/", False)
        self.check("Googlebot", "/app", True)
        self.check("Googlebot", "/private/x", False)
        self.check("Googlebot", "/private/ok", True)
        self.check("Bingbot", "/private", False)
        self.check("Googlebot-Image", "/private", False)

    def test_empty_allows_all(self):
        self.assertTrue(common.Robots("").can_fetch("Googlebot", "https://a.com/x"))


class ParserTest(unittest.TestCase):
    def test_page_parser(self):
        p = common.parse_html('<html lang="en"><title>T</title><meta name="description" content="D">'
                              '<link rel="canonical" href="/x"><h1>Main</h1><h2><a href="/s">Svc</a></h2>'
                              '<img src="a.png"><script type="application/ld+json">{"@type":"Organization"}</script>')
        self.assertEqual((p.title, p.meta["description"], p.canonical, p.lang), ("T", "D", "/x", "en"))
        self.assertEqual(p.headings, [[1, "Main"], [2, "Svc"]])
        self.assertIsNone(p.images[0]["alt"])
        items, errors = common.parse_jsonld(p.jsonld)
        self.assertEqual((items[0]["@type"], errors), ("Organization", []))

    def test_normalize(self):
        self.assertEqual(common.normalize_url("HTTPS://A.com#x"), "https://a.com/")
        self.assertTrue(common.same_site("https://www.a.com/x", "https://a.com"))


class StateTest(unittest.TestCase):
    def test_rejected_recommendation_stays_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            env = {**os.environ, "SEO_CLIENTS_DIR": d}
            cs = [sys.executable, str(ROOT / "scripts/state/client_state.py")]
            run = lambda *a: subprocess.run(cs + list(a), env=env, capture_output=True, text=True).stdout
            run("init", "t", "--name", "T", "--website", "https://a.com")
            run("rec", "add", "t", "Build Hanover page")
            run("rec", "reject", "t", "R-001", "--reason", "not a market")
            self.assertIn("rejected", run("rec", "add", "t", "Build Hanover page"))
            state = json.loads(Path(d, "t", "state.json").read_text(encoding="utf-8"))
            self.assertEqual(len(state["recommendations"]), 1)


class SvgTitleTest(unittest.TestCase):
    def test_svg_title_is_not_the_page_title(self):
        p = common.parse_html('<html><head><title>Real title</title></head><body><svg><title>Map of York</title></svg></body></html>')
        self.assertEqual(p.title, "Real title")


if __name__ == "__main__":
    unittest.main()
