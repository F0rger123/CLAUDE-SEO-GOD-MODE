"""Business audit scorer and directory list (scripts/business/business_audit.py).
Run: python -m unittest tests/test_business.py
"""
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("business_audit", ROOT / "scripts" / "business" / "business_audit.py")
ba = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ba)


class BusinessAudit(unittest.TestCase):
    def test_directories_are_free_and_complete(self):
        dirs = ba.load_directories()
        ids = [d["id"] for d in dirs]
        self.assertEqual(len(ids), len(set(ids)), "ids are unique")
        for d in dirs:
            self.assertTrue(d.get("signup", "").startswith("https://"), d["id"])
            self.assertTrue(d.get("steps"), d["id"])
            self.assertTrue(d.get("domain") or d.get("check"), f"{d['id']} can be checked")
        for core in ("yelp", "bbb", "nextdoor", "facebook", "bing", "apple"):
            self.assertIn(core, ids)

    def test_trade_directories_only_for_their_trades(self):
        roofer = {d["id"] for d in ba.directories_for("roofing contractor")}
        lawyer = {d["id"] for d in ba.directories_for("family lawyer")}
        self.assertIn("angi", roofer)
        self.assertNotIn("angi", lawyer)
        self.assertIn("yelp", lawyer)
        self.assertIn("angi", {d["id"] for d in ba.directories_for("permanent lighting installer")})

    def test_score_leaves_out_unchecked_parts(self):
        f = {"website": 80, "profile": {"found": True, "score": 60},
             "listings": {"yelp": "listed", "bbb": "missing", "apple": "unknown"},
             "consistency": {"phone-match": False, "profile-hours": True, "site-hours": None}}
        parts = ba.parts_from(f)
        self.assertEqual(parts["listings"], 50)  # both core: 3 of 6
        self.assertEqual(parts["consistency"], 50)
        self.assertIsNone(parts["reviews"])
        self.assertEqual(ba.business_score(parts), round((80 * 35 + 60 * 25 + 50 * 20 + 50 * 10) / 90))

    def test_missing_profile_counts_as_zero_and_tops_the_list(self):
        r = ba.report({"business": {"name": "Hi Roofing"}, "website": 70, "profile": {"found": False}, "listings": {"bbb": "missing"}})
        self.assertIn("Business Score: 31/100", r)
        self.assertLess(r.index("Google Business Profile**"), r.index("BBB"))
        self.assertIn("bbb.org/get-listed", r)
        self.assertIn("never pay for listings", r)


    def test_no_stray_control_characters_in_code(self):
        # A regex  written through a script can land as a backspace (0x08) and silently break matching.
        bad = []
        for base in ("extension", "mobile/src", "scripts"):
            for f in (ROOT / base).rglob("*"):
                if f.suffix in (".js", ".mjs", ".py", ".css", ".html") and "vendor" not in f.parts and "node_modules" not in f.parts and "__pycache__" not in f.parts:
                    if "" in f.read_text(encoding="utf-8", errors="replace"):
                        bad.append(str(f.relative_to(ROOT)))
        self.assertEqual(bad, [])


if __name__ == "__main__":
    unittest.main()
