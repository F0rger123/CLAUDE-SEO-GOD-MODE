#!/usr/bin/env python3
"""Build sitemap.xml from crawl.json, keeping only indexable 200 HTML pages.

Use this when the CMS/framework cannot produce a clean sitemap. Prefer the platform's own
generator when it exists (WordPress core/Yoast/Rank Math, Next.js app/sitemap.ts, Astro @astrojs/sitemap).

Usage:
  generate_sitemap.py crawl.json --out sitemap.xml [--exclude /thank-you /cart]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from xml.sax.saxutils import escape

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("crawl")
    ap.add_argument("--out", default="sitemap.xml")
    ap.add_argument("--exclude", nargs="*", default=[], help="path prefixes to leave out")
    ap.add_argument("--lastmod", default=common.today(), help="lastmod to write (only if pages changed)")
    ap.add_argument("--no-lastmod", action="store_true")
    a = ap.parse_args()

    crawl = common.read_json(Path(a.crawl))
    urls = sorted({p["url"] for p in crawl["pages"]
                   if p.get("indexable") and p.get("status") == 200 and not p.get("redirect_chain")
                   and not any(p["url"].split("/", 3)[-1].startswith(x.lstrip("/")) for x in a.exclude if x)})
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        lm = "" if a.no_lastmod else f"<lastmod>{a.lastmod}</lastmod>"
        lines.append(f"  <url><loc>{escape(u)}</loc>{lm}</url>")
    lines.append("</urlset>")
    Path(a.out).write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {a.out} with {len(urls)} URLs")


if __name__ == "__main__":
    main()
