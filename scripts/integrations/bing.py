#!/usr/bin/env python3
"""Bing Webmaster Tools via the official Bing Webmaster API (JSON endpoint). Standard library only.

Auth: set BING_WEBMASTER_API_KEY (Bing Webmaster Tools > Settings > API access > API Key).
One key covers every site verified under that Microsoft account. Never commit it.

Commands:
  sites                         GetUserSites
  sitemaps    --site            GetFeeds
  submit-sitemap --site --sitemap   SubmitFeed           (write)
  remove-sitemap --site --sitemap   RemoveFeed           (write)
  traffic     --site            GetRankAndTrafficStats (daily clicks/impressions)
  queries     --site            GetQueryStats
  pages       --site            GetPageStats
  crawl-stats --site            GetCrawlStats
  crawl-issues --site           GetCrawlIssues
  url-info    --site --url      GetUrlInfo (index/crawl info for one URL)
  quota       --site            GetUrlSubmissionQuota
  submit-urls --site --urls ... SubmitUrlBatch          (write; official, quota-limited)
  keyword     --query           GetKeyword (Bing search volume; params per Microsoft docs)
  related     --query           GetRelatedKeywords

Usage:
  bing.py sites
  bing.py traffic --site https://www.example.com/ --csv bing-traffic.csv
  bing.py submit-sitemap --site https://www.example.com/ --sitemap https://www.example.com/sitemap.xml
  bing.py submit-urls --site https://www.example.com/ --urls https://www.example.com/new-page/
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402

BASE = "https://ssl.bing.com/webmaster/api.svc/json/"


def call(method: str, params: dict | None = None, body: dict | None = None):
    key = os.environ.get("BING_WEBMASTER_API_KEY")
    if not key:
        sys.exit("Set BING_WEBMASTER_API_KEY (see docs/INTEGRATIONS.md).")
    q = urllib.parse.urlencode({**(params or {}), "apikey": key})
    req = urllib.request.Request(BASE + method + "?" + q, method="POST" if body is not None else "GET",
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:500]
        sys.exit(f"Bing API {method} failed: HTTP {e.code} {detail}")
    return fix_dates(data.get("d", data))


def fix_dates(obj):
    """Convert WCF '/Date(1700000000000)/' strings to ISO dates."""
    if isinstance(obj, str):
        m = re.match(r"/Date\((-?\d+)", obj)
        return datetime.fromtimestamp(int(m.group(1)) / 1000, tz=timezone.utc).date().isoformat() if m else obj
    if isinstance(obj, list):
        return [fix_dates(x) for x in obj]
    if isinstance(obj, dict):
        return {k: fix_dates(v) for k, v in obj.items() if k != "__type"}
    return obj


def output(data, a):
    if getattr(a, "csv", None) and isinstance(data, list) and data and isinstance(data[0], dict):
        with open(a.csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(data[0].keys()))
            w.writeheader()
            w.writerows(data)
        print(f"Wrote {a.csv} ({len(data)} rows)")
    elif getattr(a, "json", None):
        common.write_json(Path(a.json), data)
        print(f"Wrote {a.json}")
    else:
        rows = data if isinstance(data, list) else [data]
        for r in rows[: a.top if hasattr(a, "top") else 50]:
            print(json.dumps(r, ensure_ascii=False))
        if isinstance(data, list) and len(data) > getattr(a, "top", 50):
            print(f"... {len(data)} rows total (use --csv/--json)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["sites", "sitemaps", "submit-sitemap", "remove-sitemap", "traffic", "queries",
                                    "pages", "crawl-stats", "crawl-issues", "url-info", "quota", "submit-urls",
                                    "keyword", "related"])
    ap.add_argument("--site", help="site URL exactly as verified in Bing, e.g. https://www.example.com/")
    ap.add_argument("--sitemap"); ap.add_argument("--url"); ap.add_argument("--urls", nargs="*")
    ap.add_argument("--urls-file")
    ap.add_argument("--query"); ap.add_argument("--country", default="us"); ap.add_argument("--language", default="en-US")
    ap.add_argument("--days", type=int, default=90)
    ap.add_argument("--csv"); ap.add_argument("--json"); ap.add_argument("--top", type=int, default=50)
    a = ap.parse_args()
    s = {"siteUrl": a.site}
    need_site = a.cmd not in ("sites", "keyword", "related")
    if need_site and not a.site:
        sys.exit("--site required")

    if a.cmd == "sites":
        output(call("GetUserSites"), a)
    elif a.cmd == "sitemaps":
        output(call("GetFeeds", s), a)
    elif a.cmd == "submit-sitemap":
        call("SubmitFeed", body={**s, "feedUrl": a.sitemap})
        print(f"Submitted {a.sitemap} to Bing for {a.site}")
    elif a.cmd == "remove-sitemap":
        call("RemoveFeed", body={**s, "feedUrl": a.sitemap})
        print(f"Removed {a.sitemap} from Bing for {a.site}")
    elif a.cmd == "traffic":
        output(call("GetRankAndTrafficStats", s), a)
    elif a.cmd == "queries":
        output(call("GetQueryStats", s), a)
    elif a.cmd == "pages":
        output(call("GetPageStats", s), a)
    elif a.cmd == "crawl-stats":
        output(call("GetCrawlStats", s), a)
    elif a.cmd == "crawl-issues":
        output(call("GetCrawlIssues", s), a)
    elif a.cmd == "url-info":
        output(call("GetUrlInfo", {**s, "url": a.url}), a)
    elif a.cmd == "quota":
        output(call("GetUrlSubmissionQuota", s), a)
    elif a.cmd == "submit-urls":
        urls = list(a.urls or [])
        if a.urls_file:
            urls += [l.strip() for l in Path(a.urls_file).read_text(encoding="utf-8").splitlines() if l.strip()]
        quota = call("GetUrlSubmissionQuota", s)
        print(f"Quota before submit: {quota}")
        call("SubmitUrlBatch", body={**s, "urlList": urls})
        print(f"Submitted {len(urls)} URL(s) to Bing")
    elif a.cmd in ("keyword", "related"):
        end = date.today()
        params = {"q": a.query, "country": a.country, "language": a.language,
                  "startDate": (end - timedelta(days=a.days)).isoformat(), "endDate": end.isoformat()}
        output(call("GetKeyword" if a.cmd == "keyword" else "GetRelatedKeywords", params), a)


if __name__ == "__main__":
    main()
