"""Offline end-to-end test of scripts/rate_site.py against two local fixture sites (good vs bad).

Run: python -m unittest tests/test_rating.py      (no internet needed; PageSpeed disabled)

When you add a rating check, add the matching markup to GOOD (passes) and leave it out of BAD (fails),
then assert it below. See CONTRIBUTING.md.
"""
import functools
import http.server
import json
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORDS = ("We repair and replace residential roofs across York County with licensed crews, written estimates, "
         "and photo reports after every job so homeowners know exactly what was done and why. ") * 6

PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title><meta name="description" content="{desc}">
<link rel="canonical" href="{base}{path}">
<meta property="og:title" content="{title}"><meta property="og:description" content="{desc}">
<meta property="og:image" content="{base}/og.webp"><meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{schema}</script></head><body>
<nav><a href="/">Home</a> <a href="/services/">Services</a> <a href="/about/">About</a> <a href="/contact/">Contact</a></nav>
<h1>{h1}</h1>
<p>Summit Ridge Roofing is a roofing contractor in York, PA that repairs and replaces residential roofs for homeowners
across York County, with free inspections, written estimates, and a ten-year workmanship warranty on every replacement.</p>
<h2>How much does a roof replacement cost?</h2><p>{words}</p>
<h2>What areas do you serve?</h2><p>{words}</p>
<img src="/roof.webp" alt="New asphalt roof" width="800" height="600">
<p><a href="tel:+17175550142">717-555-0142</a> · Source: <a href="https://www.energystar.gov/">ENERGY STAR</a></p>
</body></html>"""

BAD_INDEX = """<html><head><script src="/a.js"></script><script src="/b.js"></script><script src="/c.js"></script>
<script src="/d.js"></script></head><body><div id="root"></div><h3>Welcome</h3><h1>Hi</h1><h1>Again</h1>
<img src="/x.png"><a href="/missing/">old page</a></body></html>"""


def build(root: Path, base: str, good: bool):
    if not good:
        (root / "index.html").write_text(BAD_INDEX, encoding="utf-8")
        (root / "robots.txt").write_text("User-agent: *\nAllow: /\n\nUser-agent: OAI-SearchBot\nDisallow: /\n\n"
                                         "User-agent: PerplexityBot\nDisallow: /\n", encoding="utf-8")
        return
    org = {"@context": "https://schema.org", "@type": "RoofingContractor", "name": "Summit Ridge Roofing", "url": base + "/",
           "telephone": "+1-717-555-0142", "address": {"@type": "PostalAddress", "addressLocality": "York", "addressRegion": "PA"},
           "areaServed": ["York, PA"], "sameAs": ["https://www.facebook.com/x", "https://www.linkedin.com/company/x", "https://maps.google.com/?cid=1"]}
    pages = {"/": "Summit Ridge Roofing: Roof Repair & Replacement, York PA",
             "/services/": "Roof Replacement & Repair Services in York, PA",
             "/about/": "About Summit Ridge Roofing, Licensed York Roofers",
             "/contact/": "Contact Summit Ridge Roofing for a Free Roof Inspection"}
    urls = []
    for path, title in pages.items():
        d = root / path.strip("/")
        d.mkdir(parents=True, exist_ok=True)
        schema = dict(org, **{"@type": "RoofingContractor"}) if path == "/" else {
            "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": []}
        (d / "index.html").write_text(PAGE.format(
            title=title, desc=f"{title}. Free inspections, written estimates and a ten-year workmanship warranty from a licensed local crew.",
            base=base, path=path, h1=title.split(":")[0], words=WORDS, schema=json.dumps(schema)), encoding="utf-8")
        urls.append(base + path)
    (root / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {base}/sitemap.xml\n", encoding="utf-8")
    (root / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                                      + "".join(f"<url><loc>{u}</loc></url>" for u in urls) + "</urlset>", encoding="utf-8")


def serve(root: Path):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
    handler.log_message = lambda *a, **k: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


def rate(base: str, out: Path) -> dict:
    subprocess.run([sys.executable, str(ROOT / "scripts/rate_site.py"), base, "--no-psi", "--max-pages", "10",
                    "--delay", "0", "--out", str(out)], capture_output=True, text=True, encoding="utf-8", errors="replace", check=True)
    return json.loads((out / "rating.json").read_text(encoding="utf-8"))


class RatingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        t = Path(cls.tmp.name)
        cls.results, cls.servers = {}, []
        for name in ("good", "bad"):
            (t / name).mkdir()
            srv, base = serve(t / name)
            cls.servers.append(srv)
            build(t / name, base, name == "good")
            cls.results[name] = rate(base, t / f"out-{name}")

    @classmethod
    def tearDownClass(cls):
        for s in cls.servers:
            s.shutdown()
        cls.tmp.cleanup()

    def check(self, name, check):
        return next(c for c in self.results[name]["checks"] if c["check"].startswith(check))

    def test_good_beats_bad(self):
        g, b = self.results["good"]["scores"], self.results["bad"]["scores"]
        for k in ("overall", "seo", "aeo", "geo"):
            self.assertGreater(g[k], b[k] + 15, k)
        self.assertGreaterEqual(g["geo"], 80)

    def test_specific_checks(self):
        for check in ("Titles", "Meta descriptions", "Exactly one H1", "Canonical tag", "Missing pages return a real 404",
                      "Organization/LocalBusiness", "Consistent identity", "Contact details", "AI search crawlers allowed",
                      "Question-style headings", "Direct answer near the top", "Social cards"):
            self.assertEqual(self.check("good", check)["ratio"], 1.0, f"good: {check}")
        for check in ("Titles", "Exactly one H1", "Organization/LocalBusiness", "Logical heading order", "Social cards"):
            self.assertLess(self.check("bad", check)["ratio"], 0.5, f"bad: {check}")
        self.assertAlmostEqual(self.check("bad", "AI search crawlers allowed")["ratio"], 0.6)

    def test_honesty(self):
        bad = self.results["bad"]
        self.assertEqual(self.check("bad", "Performance")["tag"], "INFERRED")   # PSI off -> estimate, labeled
        self.assertTrue(any("Rankings" in u for u in bad["unknown"]))
        self.assertTrue(bad["fix_kits"])                                            # starter schema, robots groups...
        self.assertTrue(all("[CONFIRM" in k["body"] for k in bad["fix_kits"] if "JSON-LD" in k["title"]))

    def test_outputs(self):
        self.assertTrue(self.results["good"]["top_fixes"] is not None)
        self.assertGreaterEqual(self.results["bad"]["scores"]["potential_after_top5"], self.results["bad"]["scores"]["overall"])


if __name__ == "__main__":
    unittest.main()
