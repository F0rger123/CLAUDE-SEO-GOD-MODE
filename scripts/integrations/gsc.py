#!/usr/bin/env python3
"""Google Search Console via the official Search Console API (searchconsole v1).

Capabilities (all official API):
  sites                      list properties this credential can see
  performance                Search Analytics: clicks, impressions, CTR, position by query/page/date/device/country
  sitemaps list|submit|delete
  inspect                    URL Inspection API (index status; read-only — cannot request indexing)

NOT possible through any Google API for normal pages: "Request Indexing". See references/indexing-limitations.md.

Auth (pick one; never commit credential files):
  Service account: set GSC_SERVICE_ACCOUNT_FILE=/path/key.json and add the service account email
                   as a user on the property (Full; Owner for some write actions).
  OAuth (desktop): set GSC_OAUTH_CLIENT_FILE=/path/client_secret.json; first run opens a browser.
                   Token cached at ~/.config/agency-zero-seo/gsc-token.json.

Property format: "sc-domain:example.com" (domain property) or "https://www.example.com/" (URL-prefix).

Usage:
  gsc.py sites
  gsc.py performance --site sc-domain:example.com --dimensions query --out q.csv
  gsc.py performance --site sc-domain:example.com --dimensions page --days 28 --compare-previous --out-dir ./data
  gsc.py sitemaps list --site sc-domain:example.com
  gsc.py sitemaps submit --site sc-domain:example.com --sitemap https://example.com/sitemap.xml
  gsc.py inspect --site sc-domain:example.com --urls https://example.com/ https://example.com/services/
  gsc.py inspect --site sc-domain:example.com --urls-file priority-urls.txt --out inspect.json

Requires: pip install -r scripts/requirements.txt
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402

SCOPES_RW = ["https://www.googleapis.com/auth/webmasters"]
SCOPES_RO = ["https://www.googleapis.com/auth/webmasters.readonly"]
TOKEN_PATH = Path.home() / ".config" / "agency-zero-seo" / "gsc-token.json"


def service(readonly: bool):
    try:
        from googleapiclient.discovery import build
    except ImportError:
        sys.exit("Missing libraries. Run: pip install -r scripts/requirements.txt")
    scopes = SCOPES_RO if readonly else SCOPES_RW
    sa = os.environ.get("GSC_SERVICE_ACCOUNT_FILE")
    oauth = os.environ.get("GSC_OAUTH_CLIENT_FILE")
    for path in (sa, oauth):
        if path and not Path(path).exists():
            sys.exit(f"Credential file not found: {path}")
    if sa:
        from google.oauth2 import service_account
        creds = service_account.Credentials.from_service_account_file(sa, scopes=scopes)
    elif oauth:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        creds = None
        if TOKEN_PATH.exists():
            creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES_RW)
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                creds = InstalledAppFlow.from_client_secrets_file(oauth, SCOPES_RW).run_local_server(port=0)
            TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
            TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")
    else:
        sys.exit("No credentials. Set GSC_SERVICE_ACCOUNT_FILE or GSC_OAUTH_CLIENT_FILE (see docs/INTEGRATIONS.md).")
    return build("searchconsole", "v1", credentials=creds, cache_discovery=False)


def date_range(days: int, end_offset: int = 3) -> tuple[str, str]:
    """Search Analytics data lags ~2-3 days; default window ends 3 days ago."""
    end = date.today() - timedelta(days=end_offset)
    return (end - timedelta(days=days - 1)).isoformat(), end.isoformat()


def query_all(svc, site, start, end, dims, search_type, filters, limit):
    rows, start_row = [], 0
    body = {"startDate": start, "endDate": end, "dimensions": dims, "type": search_type,
            "rowLimit": min(25000, limit), "dataState": "final"}
    if filters:
        body["dimensionFilterGroups"] = [{"filters": filters}]
    while True:
        body["startRow"] = start_row
        resp = svc.searchanalytics().query(siteUrl=site, body=body).execute()
        batch = resp.get("rows", [])
        rows.extend(batch)
        if len(batch) < body["rowLimit"] or len(rows) >= limit:
            return rows[:limit]
        start_row += len(batch)


def write_rows(rows, dims, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(dims + ["clicks", "impressions", "ctr", "position"])
        for r in rows:
            w.writerow(r.get("keys", []) + [r["clicks"], r["impressions"], round(r["ctr"], 4), round(r["position"], 2)])


def parse_filters(raw: list[str]) -> list[dict]:
    """dimension~operator~expression, e.g. page~contains~/services  query~notContains~brand"""
    out = []
    for f in raw or []:
        dim, op, expr = f.split("~", 2)
        out.append({"dimension": dim, "operator": op, "expression": expr})
    return out


def cmd_sites(a):
    for s in service(True).sites().list().execute().get("siteEntry", []):
        print(f"{s['siteUrl']}\t{s['permissionLevel']}")


def cmd_performance(a):
    svc = service(True)
    dims = a.dimensions.split(",")
    start, end = (a.start, a.end) if a.start else date_range(a.days)
    rows = query_all(svc, a.site, start, end, dims, a.type, parse_filters(a.filter), a.limit)
    tot_c = sum(r["clicks"] for r in rows)
    tot_i = sum(r["impressions"] for r in rows)
    print(f"{a.site} {start}..{end} dims={dims} rows={len(rows)} clicks={tot_c} impressions={tot_i}")
    print("(Row totals undercount site totals: Google drops anonymized queries. Use --dimensions date for totals.)")
    out_dir = Path(a.out_dir) if a.out_dir else None
    cur_path = Path(a.out) if a.out else (out_dir / f"gsc-{'-'.join(dims)}-{start}_{end}.csv" if out_dir else None)
    if cur_path:
        write_rows(rows, dims, cur_path)
        print(f"Wrote {cur_path}")
    else:
        for r in rows[:25]:
            print(f"{' | '.join(r['keys'])}\t{r['clicks']}\t{r['impressions']}\t{r['ctr']:.2%}\t{r['position']:.1f}")
    if a.compare_previous and cur_path:
        d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
        span = (d1 - d0).days + 1
        pstart, pend = (d0 - timedelta(days=span)).isoformat(), (d0 - timedelta(days=1)).isoformat()
        prev = query_all(svc, a.site, pstart, pend, dims, a.type, parse_filters(a.filter), a.limit)
        prev_path = cur_path.with_name(f"gsc-{'-'.join(dims)}-{pstart}_{pend}.csv")
        write_rows(prev, dims, prev_path)
        print(f"Wrote {prev_path}\nCompare: python scripts/reporting/compare_periods.py {prev_path} {cur_path}")


def cmd_sitemaps(a):
    svc = service(a.action == "list")
    sm = svc.sitemaps()
    if a.action == "list":
        for s in sm.list(siteUrl=a.site).execute().get("sitemap", []):
            contents = "; ".join(f"{c.get('type')}: submitted={c.get('submitted')}" for c in s.get("contents", []))
            print(f"{s['path']}\tlastSubmitted={s.get('lastSubmitted','')}\tlastDownloaded={s.get('lastDownloaded','')}"
                  f"\terrors={s.get('errors', 0)}\twarnings={s.get('warnings', 0)}\tpending={s.get('isPending')}\t{contents}")
    elif a.action == "submit":
        sm.submit(siteUrl=a.site, feedpath=a.sitemap).execute()
        print(f"Submitted {a.sitemap} to {a.site}")
    elif a.action == "delete":
        sm.delete(siteUrl=a.site, feedpath=a.sitemap).execute()
        print(f"Removed {a.sitemap} from {a.site} (this does not de-index URLs)")


def cmd_inspect(a):
    svc = service(True)
    urls = list(a.urls or [])
    if a.urls_file:
        urls += [l.strip() for l in Path(a.urls_file).read_text(encoding="utf-8").splitlines() if l.strip()]
    results = []
    print("Quota: 2,000 inspections/day and 600/minute per property.")
    for u in urls:
        try:
            r = svc.urlInspection().index().inspect(body={"inspectionUrl": u, "siteUrl": a.site}).execute()
            ix = r["inspectionResult"].get("indexStatusResult", {})
            rich = r["inspectionResult"].get("richResultsResult", {})
            row = {"url": u, "verdict": ix.get("verdict"), "coverage": ix.get("coverageState"),
                   "indexing": ix.get("indexingState"), "robots": ix.get("robotsTxtState"),
                   "fetch": ix.get("pageFetchState"), "last_crawl": ix.get("lastCrawlTime"),
                   "google_canonical": ix.get("googleCanonical"), "user_canonical": ix.get("userCanonical"),
                   "sitemaps": ix.get("sitemap", []), "referring_urls": ix.get("referringUrls", [])[:5],
                   "rich_results": rich.get("verdict"),
                   "link": r["inspectionResult"].get("inspectionResultLink")}
        except Exception as e:  # keep going on per-URL errors
            row = {"url": u, "error": str(e)[:300]}
        results.append(row)
        print(f"{row.get('verdict', 'ERROR'):<8} {row.get('coverage', row.get('error', ''))[:60]:<60} {u}")
        time.sleep(0.2)
    if a.out:
        common.write_json(Path(a.out), {"site": a.site, "date": common.today(), "results": results})
        print(f"Wrote {a.out}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("sites").set_defaults(fn=cmd_sites)

    p = sub.add_parser("performance")
    p.add_argument("--site", required=True)
    p.add_argument("--dimensions", default="query", help="comma list: query,page,date,device,country,searchAppearance")
    p.add_argument("--days", type=int, default=28)
    p.add_argument("--start"); p.add_argument("--end")
    p.add_argument("--type", default="web", choices=["web", "image", "video", "news", "discover", "googleNews"])
    p.add_argument("--filter", action="append", help="dim~operator~expr (operators: contains, equals, notContains, notEquals, includingRegex, excludingRegex)")
    p.add_argument("--limit", type=int, default=25000)
    p.add_argument("--out"); p.add_argument("--out-dir")
    p.add_argument("--compare-previous", action="store_true", help="also pull the previous period of equal length")
    p.set_defaults(fn=cmd_performance)

    p = sub.add_parser("sitemaps")
    p.add_argument("action", choices=["list", "submit", "delete"])
    p.add_argument("--site", required=True); p.add_argument("--sitemap")
    p.set_defaults(fn=cmd_sitemaps)

    p = sub.add_parser("inspect")
    p.add_argument("--site", required=True)
    p.add_argument("--urls", nargs="*"); p.add_argument("--urls-file"); p.add_argument("--out")
    p.set_defaults(fn=cmd_inspect)

    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
