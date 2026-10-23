#!/usr/bin/env python3
"""Validate an XML sitemap (or sitemap index) and every URL in it.

Checks: XML validity, index recursion, URL count, lastmod presence, off-site URLs,
and per-URL status (non-200, redirects, noindex, canonical pointing elsewhere).
With --crawl, also compares sitemap vs crawl (pages missing from sitemap, sitemap URLs not linked).

Usage:
  sitemap_check.py https://example.com/sitemap.xml --out ./data/audit-2026-10-22
  sitemap_check.py https://example.com/sitemap.xml --crawl ./data/audit-2026-10-22/crawl.json --check-limit 500
"""
from __future__ import annotations

import argparse
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402


def load_sitemap(url: str, problems: list, depth: int = 0) -> list[dict]:
    r = common.fetch(url)
    if r["status"] != 200:
        problems.append(f"Sitemap {url} returned {r['status'] or r['error']}")
        return []
    if len(r["chain"]) > 1:
        problems.append(f"Sitemap {url} redirects to {r['final_url']} — submit the final URL")
    try:
        root = ET.fromstring(r["body"].encode("utf-8"))
    except ET.ParseError as e:
        problems.append(f"Sitemap {url} is not valid XML: {e}")
        return []
    entries = []
    if root.tag.endswith("sitemapindex"):
        if depth > 2:
            problems.append(f"Sitemap index nesting too deep at {url}")
            return []
        for sm in root:
            loc = next((c.text.strip() for c in sm if c.tag.endswith("loc") and c.text), None)
            if loc:
                entries.extend(load_sitemap(loc, problems, depth + 1))
        return entries
    for u in root:
        d = {c.tag.split("}")[-1]: (c.text or "").strip() for c in u}
        if d.get("loc"):
            entries.append({"loc": d["loc"], "lastmod": d.get("lastmod", ""), "sitemap": url})
    if len(entries) > 50000:
        problems.append(f"{url} has {len(entries)} URLs (limit 50,000 per file)")
    return entries


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("sitemap")
    ap.add_argument("--crawl", help="crawl.json to compare against")
    ap.add_argument("--check-limit", type=int, default=300, help="max URLs to fetch (0 = none)")
    ap.add_argument("--delay", type=float, default=0.3)
    ap.add_argument("--out", default=".")
    a = ap.parse_args()

    problems: list[str] = []
    entries = load_sitemap(a.sitemap, problems)
    root_host = a.sitemap
    off_site = [e["loc"] for e in entries if not common.same_site(e["loc"], root_host)]
    if off_site:
        problems.append(f"{len(off_site)} URL(s) on a different host than the sitemap")
    no_lastmod = sum(1 for e in entries if not e["lastmod"])
    dupes = len(entries) - len({e["loc"] for e in entries})
    if dupes:
        problems.append(f"{dupes} duplicate URL(s) in sitemap")

    url_issues = []
    for e in entries[: a.check_limit]:
        r = common.fetch(e["loc"])
        issue = None
        if r["status"] is None:
            issue = f"error: {r['error']}"
        elif len(r["chain"]) > 1:
            issue = f"redirects ({r['chain'][0][1]}) to {r['final_url']}"
        elif r["status"] != 200:
            issue = f"status {r['status']}"
        else:
            p = common.parse_html(r["body"])
            xrt = r["headers"].get("x-robots-tag", "")
            if "noindex" in (p.robots_meta + xrt).lower():
                issue = "noindex"
            elif p.canonical and common.normalize_url(p.canonical, e["loc"]) != common.normalize_url(e["loc"]):
                issue = f"canonical points to {common.normalize_url(p.canonical, e['loc'])}"
        if issue:
            url_issues.append({"url": e["loc"], "issue": issue})
        time.sleep(a.delay)

    comparison = {}
    if a.crawl:
        crawl = common.read_json(Path(a.crawl))
        sm = {common.normalize_url(e["loc"]) for e in entries}
        indexable = {p["url"] for p in crawl["pages"] if p.get("indexable")}
        linked = {p["url"] for p in crawl["pages"] if p.get("inlinks", 0) > 0} | {crawl["root"]}
        comparison = {
            "indexable_not_in_sitemap": sorted(indexable - sm),
            "in_sitemap_not_reached_by_crawl": sorted(sm - {p["url"] for p in crawl["pages"]}),
            "in_sitemap_zero_inlinks": sorted((sm & {p["url"] for p in crawl["pages"]}) - linked),
        }

    result = {"sitemap": a.sitemap, "date": common.today(), "url_count": len(entries),
              "missing_lastmod": no_lastmod, "checked": min(len(entries), a.check_limit),
              "problems": problems, "url_issues": url_issues, "comparison": comparison}
    out = common.write_json(Path(a.out) / "sitemap-check.json", result)

    print(f"Sitemap: {a.sitemap}\nURLs: {len(entries)} | checked: {result['checked']} | missing lastmod: {no_lastmod}")
    for p in problems:
        print(f"- {p}")
    print(f"URL issues: {len(url_issues)}")
    for u in url_issues[:25]:
        print(f"  - {u['url']}: {u['issue']}")
    for k, v in comparison.items():
        print(f"{k}: {len(v)}")
        for u in v[:10]:
            print(f"  - {u}")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
