#!/usr/bin/env python3
"""Polite same-site crawler. Records the SEO facts of every HTML page it reaches.

Output: <out>/crawl.json  {"root", "date", "pages": [...], "summary": {...}}

Each page: url, final_url, status, redirect_chain, content_type, elapsed_ms, bytes, title,
meta_description, robots_meta, x_robots_tag, canonical, h1, headings, word_count, lang,
internal_links, external_links, images, jsonld_types, jsonld_errors, og, hreflang,
indexable, blocked_by_robots, js_shell_suspect, inlinks.

Usage:
  crawl.py https://example.com --max-pages 300 --out ./data/crawl-2026-10-22
  crawl.py https://example.com --seed-sitemap https://example.com/sitemap.xml
"""
from __future__ import annotations

import argparse
import sys
import time
import urllib.robotparser
from collections import deque
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402

SKIP_EXT = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg", ".pdf", ".zip", ".mp4", ".mp3",
            ".css", ".js", ".ico", ".woff", ".woff2", ".ttf", ".xml", ".txt", ".doc", ".docx", ".xls", ".xlsx")


def robots_for(root: str):
    rp = urllib.robotparser.RobotFileParser()
    r = common.fetch(common.normalize_url("/robots.txt", root))
    rp.parse(r["body"].splitlines() if r["status"] == 200 else [])
    return rp


def sitemap_urls(url: str, limit: int = 5000) -> list[str]:
    import xml.etree.ElementTree as ET
    out, queue = [], [url]
    while queue and len(out) < limit:
        r = common.fetch(queue.pop(0))
        if r["status"] != 200:
            continue
        try:
            root = ET.fromstring(r["body"].encode("utf-8"))
        except ET.ParseError:
            continue
        locs = [e.text.strip() for e in root.iter() if e.tag.endswith("loc") and e.text]
        (queue if root.tag.endswith("sitemapindex") else out).extend(locs)
    return out[:limit]


def analyse(resp: dict, root: str, rp, googlebot_rp) -> tuple[dict, list[str]]:
    url = resp["url"]
    ctype = resp["headers"].get("content-type", "")
    page = {
        "url": url, "final_url": resp["final_url"], "status": resp["status"], "error": resp["error"],
        "redirect_chain": resp["chain"] if len(resp["chain"]) > 1 else [],
        "content_type": ctype, "elapsed_ms": resp["elapsed_ms"], "bytes": len(resp["body"].encode("utf-8")),
        "x_robots_tag": resp["headers"].get("x-robots-tag", ""),
        "blocked_by_robots": not googlebot_rp.can_fetch("Googlebot", url),
    }
    links_out = []
    if resp["status"] == 200 and "html" in ctype:
        p = common.parse_html(resp["body"])
        items, errors = common.parse_jsonld(p.jsonld)
        internal, external = [], []
        for link in p.links:
            href = link["href"]
            if href.startswith(("mailto:", "tel:", "javascript:", "#", "data:")):
                continue
            absu = common.normalize_url(href, resp["final_url"])
            if not absu.startswith("http"):
                continue
            entry = {"url": absu, "text": link["text"][:120], "nofollow": "nofollow" in link["rel"]}
            if common.same_site(absu, root):
                internal.append(entry)
                links_out.append(absu)
            else:
                external.append(entry)
        canonical = common.normalize_url(p.canonical, resp["final_url"]) if p.canonical else None
        noindex = "noindex" in (p.robots_meta + page["x_robots_tag"]).lower()
        words = len(p.text.split())
        page.update({
            "title": p.title, "meta_description": p.meta.get("description", ""),
            "robots_meta": p.robots_meta, "canonical": canonical, "lang": p.lang,
            "h1": [h[1] for h in p.headings if h[0] == 1],
            "headings": [f"h{lvl}: {txt[:100]}" for lvl, txt in p.headings][:60],
            "heading_levels": [lvl for lvl, _ in p.headings],
            "word_count": words,
            "internal_links": internal, "external_links": external,
            "images": [{**img, "src": common.normalize_url(img["src"], resp["final_url"]) if img["src"] else ""}
                       for img in p.images],
            "jsonld_types": sorted({t for i in items for t in common.schema_types(i) if t}),
            "jsonld_errors": errors,
            "og": p.og, "hreflang": p.hreflang,
            "viewport": p.meta.get("viewport", ""),
            "indexable": (not noindex) and not page["blocked_by_robots"] and not page["redirect_chain"] and
                         (canonical is None or canonical == common.normalize_url(resp["final_url"])),
            "noindex": noindex,
            # Little visible text + a near-empty body usually means client-side rendering.
            "js_shell_suspect": words < 80 and p.script_count >= 3,
        })
    else:
        page["indexable"] = False
    return page, links_out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root")
    ap.add_argument("--max-pages", type=int, default=300)
    ap.add_argument("--delay", type=float, default=0.5, help="seconds between requests (be polite)")
    ap.add_argument("--seed-sitemap", action="append", default=[], help="also queue URLs from sitemap(s)")
    ap.add_argument("--ignore-robots", action="store_true", help="crawl paths robots.txt disallows (still flagged)")
    ap.add_argument("--include-query", action="store_true", help="follow URLs with ?query strings")
    ap.add_argument("--out", default=".")
    a = ap.parse_args()

    root = common.normalize_url(a.root)
    rp = robots_for(root)
    queue, seen, pages, inlinks = deque([root]), {root}, [], {}
    for sm in a.seed_sitemap:
        for u in sitemap_urls(sm):
            u = common.normalize_url(u)
            if u not in seen and common.same_site(u, root):
                seen.add(u)
                queue.append(u)

    while queue and len(pages) < a.max_pages:
        url = queue.popleft()
        if not a.ignore_robots and not rp.can_fetch(common.USER_AGENT, url):
            pages.append({"url": url, "status": None, "skipped": "robots.txt disallow",
                          "blocked_by_robots": True, "indexable": False})
            continue
        resp = common.fetch(url)
        page, links = analyse(resp, root, rp, rp)
        pages.append(page)
        print(f"[{len(pages)}/{a.max_pages}] {page['status']} {url}", file=sys.stderr)
        final = page.get("final_url")
        if final and final != url and final not in seen and common.same_site(final, root):
            seen.add(final)
            queue.append(final)
        for link in links:
            if link in (url, final):
                continue
            inlinks.setdefault(link, set()).add(url)
            path = urlparse(link).path.lower()
            if link in seen or path.endswith(SKIP_EXT) or (not a.include_query and "?" in link):
                continue
            seen.add(link)
            queue.append(link)
        time.sleep(a.delay)

    for p in pages:
        p["inlinks"] = len(inlinks.get(p["url"], set()) | inlinks.get(p.get("final_url", ""), set()))
    statuses = {}
    for p in pages:
        statuses[str(p.get("status"))] = statuses.get(str(p.get("status")), 0) + 1
    summary = {"pages_crawled": len(pages), "queue_remaining": len(queue), "status_counts": statuses,
               "indexable": sum(1 for p in pages if p.get("indexable")),
               "js_shell_suspects": sum(1 for p in pages if p.get("js_shell_suspect")),
               "hit_page_limit": bool(queue)}
    out = common.write_json(Path(a.out) / "crawl.json",
                            {"root": root, "date": common.today(), "pages": pages, "summary": summary})
    print(f"Wrote {out}\n{summary}")


if __name__ == "__main__":
    main()
