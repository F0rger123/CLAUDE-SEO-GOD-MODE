#!/usr/bin/env python3
"""Business audit helpers for the skill (the extension and Android app run the same audit in extension/lib/business.js).

  directories [--trade "roofing contractor"]   Free places to list or claim the business, with sign-up links and steps.
  score findings.json                           Business Score and the issues, from what the audit found.

findings.json (fill in what you checked; leave a part out, or null, if you couldn't check it):
  {"business": {"name": "...", "city": "...", "category": "...", "site": "https://..."},
   "website": 72,                                   # seo_rate_site overall
   "profile": {"found": true, "score": 64},         # Google Business Profile audit, or {"found": false}
   "listings": {"yelp": "listed", "bbb": "missing", "apple": "unknown"},   # ids from `directories`
   "consistency": {"phone-match": true, "address-match": false, "profile-hours": true, "site-hours": null},
   "reviews": {"rating_ok": true, "count_ok": false}}

Weights match business.js: Website 35, Google Business Profile 25, Listings 20, Consistent details 10, Reviews 10.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIRECTORIES = ROOT / "extension" / "lib" / "directories.json"
PARTS = {"website": ("Website", 35), "profile": ("Google Business Profile", 25), "listings": ("Listings", 20),
         "consistency": ("Consistent details", 10), "reviews": ("Reviews", 10)}
FIXES = {
    "phone-match": "Pick one main phone number and use it on the website, its schema, Google and every listing.",
    "address-match": "Use the exact same address (post office format) on the website, its schema and the Google profile.",
    "profile-hours": "Add regular and holiday hours at business.google.com > Edit profile > Hours.",
    "site-hours": "Add openingHoursSpecification to the website's LocalBusiness schema, matching Google.",
    "site-phone": "Add telephone to the website's LocalBusiness schema, in the same format as on Google.",
}


def load_directories() -> list[dict]:
    return json.loads(DIRECTORIES.read_text(encoding="utf-8"))


def directories_for(trade: str = "") -> list[dict]:
    what = trade.lower()
    return [d for d in load_directories() if not d.get("trades") or any(t in what for t in d["trades"])]


def _ratio(values) -> float | None:
    known = [v for v in values if v is not None]
    return sum(1 for v in known if v) / len(known) if known else None


def parts_from(f: dict) -> dict:
    dirs = {d["id"]: d for d in load_directories()}
    listed = [(dirs.get(k, {}).get("core", False), v) for k, v in (f.get("listings") or {}).items() if v in ("listed", "missing")]
    weight = sum(3 if core else 1 for core, _ in listed)
    prof = f.get("profile")
    rv = f.get("reviews") or {}
    cons = _ratio((f.get("consistency") or {}).values())
    revs = _ratio([rv.get("rating_ok"), rv.get("count_ok")])
    return {
        "website": f.get("website"),
        "profile": None if prof is None else (prof.get("score") if prof.get("found") else 0),
        "listings": round(100 * sum(3 if core else 1 for core, v in listed if v == "listed") / weight) if weight else None,
        "consistency": None if cons is None else round(100 * cons),
        "reviews": None if revs is None else round(100 * revs),
    }


def business_score(parts: dict) -> int | None:
    known = [(k, v) for k, v in parts.items() if v is not None]
    if not known:
        return None
    w = sum(PARTS[k][1] for k, _ in known)
    return round(sum(v * PARTS[k][1] for k, v in known) / w)


def report(f: dict) -> str:
    parts = parts_from(f)
    score = business_score(parts)
    dirs = {d["id"]: d for d in load_directories()}
    b = f.get("business") or {}
    lines = [f"# Business audit: {b.get('name', '?')}", "",
             f"**Business Score: {score if score is not None else 'not enough checked'}/100**", ""]
    lines += [f"- {label}: {parts[k] if parts[k] is not None else 'not checked (left out of the score)'}" for k, (label, _) in PARTS.items()]
    lines += ["", "## Fix these, biggest first", ""]
    items: list[tuple[int, str]] = []
    if (f.get("profile") or {}).get("found") is False:
        items.append((5, "**Create or claim the Google Business Profile** at https://business.google.com: search the business, "
                         "claim or add it, pick the exact primary category, add phone, website, hours and service area, then verify."))
    for k, v in (f.get("listings") or {}).items():
        d = dirs.get(k)
        if d and v in ("missing", "unknown"):
            steps = " ".join(f"({i}) {s}" for i, s in enumerate(d.get("steps") or [], 1))
            items.append((3 if d.get("core") else 1, f"**{'Get listed on' if v == 'missing' else 'Check'} {d['name']}** "
                                                    f"({d.get('signup') or d.get('check')}). {steps}".rstrip()))
    for k, v in (f.get("consistency") or {}).items():
        if v is False:
            items.append((2, f"**{k.replace('-', ' ').capitalize()}**: {FIXES.get(k, 'Make it match everywhere.')}"))
    items.sort(key=lambda x: -x[0])
    lines += [f"{i}. {text}" for i, (_, text) in enumerate(items, 1)] or ["Nothing failing among what was checked."]
    lines += ["", "Unchecked parts are UNKNOWN, not passes. Every site above offers a free listing; never pay for listings or buy reviews."]
    return "\n".join(lines)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("directories")
    d.add_argument("--trade", default="")
    s = sub.add_parser("score")
    s.add_argument("findings")
    a = ap.parse_args()
    if a.cmd == "directories":
        for x in directories_for(a.trade):
            print(f"- **{x['name']}**{' (important)' if x.get('core') else ''}: {x.get('signup') or x.get('check')}"
                  + (f"\n  Already listed? Search Google: \"<business name>\" <town> site:{x['domain']}" if x.get("domain") else "")
                  + "".join(f"\n  {i}. {step}" for i, step in enumerate(x.get("steps") or [], 1)))
    else:
        print(report(json.loads(Path(a.findings).read_text(encoding="utf-8"))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
