#!/usr/bin/env python3
"""On-page metadata audit from crawl.json. No network calls.

Checks titles, meta descriptions, H1s, heading order, canonicals, noindex, thin content,
image alt text, viewport, lang, Open Graph, and duplicate titles/descriptions.

Output: <out>/metadata-issues.json  (list of grouped issues: title, severity, area, urls, count)

Usage:
  metadata_audit.py crawl.json --out ./data/audit-2026-10-22
"""
from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402

TITLE_MIN, TITLE_MAX = 25, 60       # characters; Google truncates by pixel width, ~60 chars is a safe guide
DESC_MIN, DESC_MAX = 70, 160
THIN_WORDS = 250


def audit(pages: list[dict]) -> list[dict]:
    groups: dict[tuple, list[str]] = defaultdict(list)

    def add(title, severity, area, url):
        groups[(title, severity, area)].append(url)

    html_pages = [p for p in pages if p.get("status") == 200 and "title" in p and not p.get("redirect_chain")]
    by_title, by_desc = defaultdict(list), defaultdict(list)
    for p in html_pages:
        u, t, d = p["url"], p.get("title", ""), p.get("meta_description", "")
        if p.get("noindex"):
            add("Page is noindex (confirm intended)", "high", "indexability", u)
        canonical = p.get("canonical")
        if not canonical:
            add("Missing canonical tag", "low", "canonicalization", u)
        elif canonical != common.normalize_url(p.get("final_url", u)):
            add("Canonical points to a different URL", "medium", "canonicalization", u)
        if not t:
            add("Missing <title>", "high", "titles", u)
        elif len(t) < TITLE_MIN:
            add(f"Title shorter than {TITLE_MIN} chars", "low", "titles", u)
        elif len(t) > TITLE_MAX:
            add(f"Title longer than {TITLE_MAX} chars (may truncate)", "low", "titles", u)
        if not d:
            add("Missing meta description", "medium", "descriptions", u)
        elif len(d) < DESC_MIN:
            add(f"Meta description shorter than {DESC_MIN} chars", "low", "descriptions", u)
        elif len(d) > DESC_MAX:
            add(f"Meta description longer than {DESC_MAX} chars", "low", "descriptions", u)
        h1 = p.get("h1", [])
        if not h1:
            add("Missing H1", "medium", "headings", u)
        elif len(h1) > 1:
            add("Multiple H1 tags", "low", "headings", u)
        levels = p.get("heading_levels", [])
        if any(b - a > 1 for a, b in zip(levels, levels[1:])):
            add("Heading levels skip (e.g. H2 to H4)", "low", "headings", u)
        if p.get("word_count", 0) < THIN_WORDS and not p.get("js_shell_suspect"):
            add(f"Thin content (< {THIN_WORDS} words) — review if page should rank", "medium", "content", u)
        if p.get("js_shell_suspect"):
            add("Little server-rendered text; content may depend on JavaScript", "high", "rendering", u)
        if not p.get("viewport"):
            add("Missing viewport meta (mobile)", "high", "mobile", u)
        if not p.get("lang"):
            add("Missing <html lang>", "low", "accessibility", u)
        if not p.get("og", {}).get("og:title") or not p.get("og", {}).get("og:image"):
            add("Missing og:title or og:image (social sharing)", "low", "open-graph", u)
        imgs = p.get("images", [])
        if any(i.get("alt") is None for i in imgs):
            add("Images missing alt attribute", "medium", "images", u)
        if any(i.get("src") and not (i.get("width") and i.get("height")) for i in imgs):
            add("Images without width/height (CLS risk)", "low", "images", u)
        if p.get("jsonld_errors"):
            add("Invalid JSON-LD block", "high", "schema", u)
        if p.get("elapsed_ms", 0) > 2500:
            add("Slow server response (> 2.5s HTML fetch)", "medium", "performance", u)
        if p.get("indexable") and p.get("inlinks", 0) == 0 and p["url"].rstrip("/").count("/") > 2:
            add("Indexable page with zero internal inlinks found by crawl", "medium", "internal-links", u)
        if t and not p.get("noindex"):
            by_title[t.lower()].append(u)
        if d and not p.get("noindex"):
            by_desc[d.lower()].append(u)

    for t, urls in by_title.items():
        if len(urls) > 1:
            groups[(f"Duplicate title: \"{t[:70]}\"", "medium", "titles")].extend(urls)
    for d, urls in by_desc.items():
        if len(urls) > 1:
            groups[(f"Duplicate meta description: \"{d[:60]}...\"", "low", "descriptions")].extend(urls)

    for p in pages:
        if p.get("status") and p["status"] >= 400:
            add(f"HTTP {p['status']} page reached by crawl", "high", "status-codes", p["url"])
        if p.get("redirect_chain") and len(p["redirect_chain"]) > 2:
            add("Redirect chain (2+ hops)", "medium", "redirects", p["url"])
        if p.get("status") and 500 <= p["status"]:
            add("Server error (5xx)", "critical", "status-codes", p["url"])

    rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    issues = [{"title": k[0], "severity": k[1], "area": k[2], "count": len(v), "urls": sorted(set(v))}
              for k, v in groups.items()]
    return sorted(issues, key=lambda i: (rank[i["severity"]], -i["count"]))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("crawl")
    ap.add_argument("--out", default=".")
    a = ap.parse_args()
    crawl = common.read_json(Path(a.crawl))
    issues = audit(crawl["pages"])
    out = common.write_json(Path(a.out) / "metadata-issues.json", issues)
    print(common.md_table([{**i, "example": i["urls"][0]} for i in issues], ["severity", "area", "title", "count", "example"]))
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
