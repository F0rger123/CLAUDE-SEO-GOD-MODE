#!/usr/bin/env python3
"""Fetch and check robots.txt: status, sitemaps declared, and whether key URLs are blocked.

Usage:
  robots_check.py https://example.com
  robots_check.py https://example.com --test / /services/ /contact/ --json out.json
"""
from __future__ import annotations

import argparse
import sys
import urllib.robotparser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402

AGENTS = ["Googlebot", "Bingbot", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot",
          "ClaudeBot", "Claude-SearchBot", "Google-Extended", "Applebot", "*"]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("site")
    ap.add_argument("--test", nargs="*", default=["/"], help="paths to test")
    ap.add_argument("--json")
    a = ap.parse_args()

    url = common.normalize_url("/robots.txt", a.site)
    r = common.fetch(url)
    findings = []
    result = {"robots_url": url, "status": r["status"], "error": r["error"], "sitemaps": [], "tests": {}, "findings": findings}
    if r["status"] != 200:
        findings.append(f"robots.txt returned {r['status']} — crawlers treat 4xx as 'allow all'; 5xx can pause crawling.")
        lines = []
    else:
        lines = r["body"].splitlines()
        result["sitemaps"] = [l.split(":", 1)[1].strip() for l in lines if l.lower().startswith("sitemap:")]
        if not result["sitemaps"]:
            findings.append("No Sitemap: line in robots.txt (optional but recommended).")
        if any(l.strip().lower() == "disallow: /" for l in lines):
            findings.append("A 'Disallow: /' rule exists — check which user-agent it applies to.")
    rp = urllib.robotparser.RobotFileParser()
    rp.parse(lines)
    for path in a.test:
        full = common.normalize_url(path, a.site)
        result["tests"][full] = {ag: rp.can_fetch(ag, full) for ag in AGENTS}
        blocked = [ag for ag, ok in result["tests"][full].items() if not ok]
        if "Googlebot" in blocked or "Bingbot" in blocked:
            findings.append(f"BLOCKED for search crawlers: {full} ({', '.join(blocked)})")
        elif blocked:
            findings.append(f"{full} blocked for: {', '.join(blocked)} (AI/other crawlers — confirm this is intended)")

    print(f"robots.txt: {url} -> {r['status']}")
    print(f"sitemaps declared: {result['sitemaps'] or 'none'}")
    for f in findings:
        print(f"- {f}")
    if not findings:
        print("- no problems found for tested paths")
    if a.json:
        common.write_json(Path(a.json), result)


if __name__ == "__main__":
    main()
