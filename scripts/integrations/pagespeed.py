#!/usr/bin/env python3
"""PageSpeed Insights API v5 (lab Lighthouse + CrUX field data) and CrUX API. Standard library only.

Auth: GOOGLE_API_KEY (API key with PageSpeed Insights API / Chrome UX Report API enabled).
PSI works without a key at low volume; CrUX API requires a key.

Usage:
  pagespeed.py psi https://example.com/ https://example.com/services/ --strategy mobile --out psi.json
  pagespeed.py crux --origin https://example.com --form-factor PHONE
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402

PSI = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
CRUX = "https://chromeuxreport.googleapis.com/v1/records:queryRecord"
FIELD = {"LARGEST_CONTENTFUL_PAINT_MS": "LCP ms", "INTERACTION_TO_NEXT_PAINT": "INP ms",
         "CUMULATIVE_LAYOUT_SHIFT_SCORE": "CLS x100", "EXPERIMENTAL_TIME_TO_FIRST_BYTE": "TTFB ms"}


def get_json(url, data=None):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data else None,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:300]}"}


def psi(url, strategy, key):
    q = [("url", url), ("strategy", strategy)] + [("category", c) for c in
                                                  ("performance", "accessibility", "best-practices", "seo")]
    if key:
        q.append(("key", key))
    d = get_json(PSI + "?" + urllib.parse.urlencode(q))
    if "error" in d:
        return {"url": url, "error": d["error"]}
    lh = d.get("lighthouseResult", {})
    cats = {k: round(v["score"] * 100) if v.get("score") is not None else None for k, v in lh.get("categories", {}).items()}
    audits = lh.get("audits", {})
    lab = {k: audits.get(k, {}).get("displayValue") for k in
           ("largest-contentful-paint", "cumulative-layout-shift", "total-blocking-time", "first-contentful-paint", "speed-index")}
    field = {}
    for scope in ("loadingExperience", "originLoadingExperience"):
        m = d.get(scope, {}).get("metrics", {})
        if m:
            field[scope] = {FIELD.get(k, k): {"p75": v.get("percentile"), "category": v.get("category")} for k, v in m.items()}
    opps = sorted(((a.get("title"), a.get("details", {}).get("overallSavingsMs", 0)) for a in audits.values()
                   if a.get("details", {}).get("type") == "opportunity" and a.get("details", {}).get("overallSavingsMs", 0) > 100),
                  key=lambda x: -x[1])[:6]
    return {"url": url, "strategy": strategy, "scores": cats, "lab": lab, "field": field,
            "top_opportunities": [{"title": t, "savings_ms": int(s)} for t, s in opps]}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("psi"); p.add_argument("urls", nargs="+")
    p.add_argument("--strategy", choices=["mobile", "desktop"], default="mobile"); p.add_argument("--out")
    p = sub.add_parser("crux"); p.add_argument("--origin"); p.add_argument("--url")
    p.add_argument("--form-factor", choices=["PHONE", "DESKTOP", "TABLET"]); p.add_argument("--out")
    a = ap.parse_args()
    key = os.environ.get("GOOGLE_API_KEY")

    if a.cmd == "psi":
        results = []
        for u in a.urls:
            r = psi(u, a.strategy, key)
            results.append(r)
            if "error" in r:
                print(f"{u}: {r['error']}")
                continue
            print(f"{u} [{a.strategy}] scores={r['scores']} lab={r['lab']}")
            if r["field"]:
                print(f"  field: {json.dumps(r['field'].get('loadingExperience') or r['field'].get('originLoadingExperience'))}")
            else:
                print("  field: no CrUX data (not enough real-user traffic)")
            for o in r["top_opportunities"]:
                print(f"  - {o['title']} (~{o['savings_ms']} ms)")
        data = results
    else:
        if not key:
            sys.exit("CrUX API needs GOOGLE_API_KEY")
        body = {"origin": a.origin} if a.origin else {"url": a.url}
        if a.form_factor:
            body["formFactor"] = a.form_factor
        data = get_json(f"{CRUX}?key={key}", body)
        if "record" in data:
            for m, v in data["record"]["metrics"].items():
                print(f"{m}: p75={v.get('percentiles', {}).get('p75')}")
        else:
            print(data.get("error", data))
    if a.out:
        common.write_json(Path(a.out), data)
        print(f"Wrote {a.out}")


if __name__ == "__main__":
    main()
