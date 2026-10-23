#!/usr/bin/env python3
"""Internal-link and broken-link analysis from crawl.json.

Finds: links to 4xx/5xx pages, links to redirected URLs (update to final URL),
pages with few inlinks, and (with --external) broken outbound links.
Also writes an inlink table so internal-link plans can target weak pages.

Usage:
  link_check.py crawl.json --out ./data/audit-2026-10-22
  link_check.py crawl.json --external --delay 0.5
"""
from __future__ import annotations

import argparse
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("crawl")
    ap.add_argument("--external", action="store_true", help="also check outbound links (HEAD, then GET)")
    ap.add_argument("--delay", type=float, default=0.3)
    ap.add_argument("--out", default=".")
    a = ap.parse_args()

    crawl = common.read_json(Path(a.crawl))
    by_url = {p["url"]: p for p in crawl["pages"]}
    broken, redirected, sources = defaultdict(set), defaultdict(set), defaultdict(set)
    externals = defaultdict(set)
    for p in crawl["pages"]:
        for l in p.get("internal_links", []):
            sources[l["url"]].add(p["url"])
            target = by_url.get(l["url"])
            if not target:
                continue
            if target.get("status") and target["status"] >= 400:
                broken[l["url"]].add(p["url"])
            elif target.get("redirect_chain"):
                redirected[l["url"]].add(p["url"])
        for l in p.get("external_links", []):
            externals[l["url"]].add(p["url"])

    ext_broken = {}
    if a.external:
        for url, srcs in externals.items():
            r = common.fetch(url, method="HEAD", timeout=12)
            if r["status"] in (403, 405, None):
                r = common.fetch(url, timeout=12)
            if r["status"] is None or r["status"] >= 400:
                ext_broken[url] = {"status": r["status"] or r["error"], "sources": sorted(srcs)}
            time.sleep(a.delay)

    inlinks = sorted(({"url": u, "inlinks": len(sources.get(u, ())), "status": p.get("status")}
                      for u, p in by_url.items() if p.get("indexable")), key=lambda r: r["inlinks"])
    result = {
        "broken_internal": [{"target": t, "status": by_url[t]["status"], "sources": sorted(s)} for t, s in broken.items()],
        "links_to_redirects": [{"target": t, "final": by_url[t].get("final_url"), "sources": sorted(s)}
                               for t, s in redirected.items()],
        "broken_external": [{"target": t, **v} for t, v in ext_broken.items()],
        "weakest_inlinks": inlinks[:40],
        "external_checked": a.external,
    }
    out = common.write_json(Path(a.out) / "links.json", result)
    print(f"Broken internal targets: {len(result['broken_internal'])}")
    for b in result["broken_internal"][:20]:
        print(f"  - {b['target']} ({b['status']}) linked from {len(b['sources'])} page(s), e.g. {b['sources'][0]}")
    print(f"Internal links pointing at redirects: {len(result['links_to_redirects'])}")
    for b in result["links_to_redirects"][:10]:
        print(f"  - {b['target']} -> {b['final']} ({len(b['sources'])} source pages)")
    if a.external:
        print(f"Broken external links: {len(ext_broken)}")
    print("Weakest indexable pages by inlinks:")
    print(common.md_table(inlinks, ["inlinks", "url"], limit=15))
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
