#!/usr/bin/env python3
"""CLAUDE SEO GOD MODE — MCP server.

Exposes this repository's deterministic SEO tools to any MCP client (Claude Code, Claude Desktop,
Cursor, VS Code, Codex) over stdio. Every Google/Bing call goes to the official API from this
machine; no third-party service sees client data.

Credentials (environment variables, never arguments):
  GSC_SERVICE_ACCOUNT_FILE or GSC_OAUTH_CLIENT_FILE   Google Search Console
  BING_WEBMASTER_API_KEY                              Bing Webmaster Tools
  GOOGLE_API_KEY                                      PageSpeed Insights / CrUX
  SEO_CLIENTS_DIR                                     client state folder (default ~/seo-clients; legacy AZ_SEO_CLIENTS)

Safety: tools that change something outside this machine (sitemap submit/delete, URL submission,
IndexNow) refuse to run unless SEO_GODMODE_ALLOW_WRITES=1 is set AND the call passes confirm=true.

Run:  python mcp/server.py            (stdio)
Add:  claude mcp add seo-god-mode --scope user -- python /path/to/repo/mcp/server.py
"""
from __future__ import annotations

import csv
import functools
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

try:  # MCP Python SDK 2.x renamed FastMCP to MCPServer
    from mcp.server.mcpserver import MCPServer as FastMCP
except ImportError:  # SDK 1.x
    from mcp.server.fastmcp import FastMCP

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))
import common  # noqa: E402

mcp = FastMCP("seo-god-mode")
MAX_CHARS = 25_000


def _load(rel: str):
    """Import a script from scripts/ as a module (scripts are CLIs, not a package)."""
    path = SCRIPTS / rel
    spec = importlib.util.spec_from_file_location(path.stem, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _run(rel: str, *args: str, timeout: int = 900) -> str:
    r = subprocess.run([sys.executable, str(SCRIPTS / rel), *args], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=timeout)
    out = r.stdout + (f"\n[stderr]\n{r.stderr[-3000:]}" if r.returncode else "")
    return _cap(out)


def _cap(text: str) -> str:
    return text if len(text) <= MAX_CHARS else text[:MAX_CHARS] + f"\n… truncated ({len(text)} chars total)"


def _write_guard(confirm: bool, action: str) -> str | None:
    if os.environ.get("SEO_GODMODE_ALLOW_WRITES") != "1":
        return (f"REFUSED: {action} changes an external system. Set SEO_GODMODE_ALLOW_WRITES=1 in the server "
                "environment to enable write tools.")
    if not confirm:
        return f"REFUSED: {action} needs confirm=true, after the user approved this specific action."
    return None


def _guarded(fn):
    """Turn script sys.exit() errors into readable tool output (keeps the signature for the tool schema)."""
    @functools.wraps(fn)
    def wrapper(*a, **kw):
        try:
            return fn(*a, **kw)
        except SystemExit as e:
            return f"ERROR: {e}"
    return wrapper


# ------------------------------------------------------------------ client state

@mcp.tool()
def seo_client_list() -> str:
    """List clients in the state folder (slug, name, phase, last update)."""
    return _run("state/client_state.py", "list")


@mcp.tool()
def seo_client_resume(slug: str) -> str:
    """Resume a client: profile gaps, integrations, tasks waiting on the user, open issues, recommendations
    (including rejected ones never to re-propose), recurring work due, latest checkpoints, next step."""
    return _run("state/client_state.py", "resume", slug)


@mcp.tool()
def seo_client_init(slug: str, business_name: str, website: str, area: str = "") -> str:
    """Create client state (state.json, profile.md, roadmap.md, log.md) for a new client."""
    args = ["init", slug, "--name", business_name, "--website", website] + (["--area", area] if area else [])
    return _run("state/client_state.py", *args)


@mcp.tool()
def seo_client_set(slug: str, key: str, value: str, append: bool = False) -> str:
    """Set a dotted key in client state, e.g. key='profile.services', value='["Roofing","Gutters"]'.
    Value is parsed as JSON when possible. Never store credentials."""
    return _run("state/client_state.py", "set", slug, key, value, *(["--append"] if append else []))


@mcp.tool()
def seo_client_record(slug: str, kind: str, action: str, text: str, severity: str = "medium",
                      area: str = "", owner: str = "claude", reason: str = "") -> str:
    """Record work in client state. kind: task|issue|rec. action: add, or task done|block|reopen,
    issue fix|wontfix|reopen, rec accept|reject|done. text: title for add, otherwise the ID (T-001, I-002, R-003)."""
    args = [kind, action, slug, text]
    if kind == "task" and action == "add":
        args += ["--owner", owner]
    if kind == "issue" and action == "add":
        args += ["--severity", severity] + (["--area", area] if area else [])
    if kind == "rec":
        args += (["--area", area] if area and action == "add" else []) + (["--reason", reason] if reason else [])
    return _run("state/client_state.py", *args)


@mcp.tool()
def seo_client_log(slug: str, text: str) -> str:
    """Append one line to the client's work log."""
    return _run("state/client_state.py", "log", slug, text)


# ------------------------------------------------------------------ site checks (no credentials)

@mcp.tool()
def seo_robots_check(site: str, paths: list[str] | None = None) -> str:
    """robots.txt check using Google's longest-match rules: declared sitemaps and whether Googlebot, Bingbot,
    OAI-SearchBot, PerplexityBot, Claude-SearchBot and training bots may fetch each path."""
    return _run("crawling/robots_check.py", site, "--test", *(paths or ["/"]))


@mcp.tool()
def seo_audit(site: str = "", client: str = "", max_pages: int = 200, log_issues: bool = False) -> str:
    """Full deterministic audit (robots, crawl, sitemap, metadata, links, schema). Give a site URL or a client
    slug. Returns summary.md; raw JSON is saved next to it. All results are OBSERVED."""
    args = ["--max-pages", str(max_pages)]
    if client:
        args += ["--client", client] + (["--log-issues"] if log_issues else [])
    elif site:
        out = Path(tempfile.gettempdir()) / f"seo-audit-{common.today()}-{abs(hash(site)) % 10_000}"
        args += ["--url", site, "--out", str(out)]
    else:
        return "ERROR: pass site or client"
    log = _run("audit.py", *args, timeout=3600)
    summary = next((l.split("Summary:", 1)[1].strip() for l in log.splitlines() if "Summary:" in l), "")
    return _cap(Path(summary).read_text(encoding="utf-8")) if summary and Path(summary).exists() else log


@mcp.tool()
def seo_sitemap_check(sitemap_url: str, check_limit: int = 200) -> str:
    """Validate a sitemap (or index) and fetch up to check_limit URLs: non-200, redirects, noindex, canonical mismatch."""
    with tempfile.TemporaryDirectory() as d:
        return _run("sitemap/sitemap_check.py", sitemap_url, "--check-limit", str(check_limit), "--out", d)


@mcp.tool()
def seo_schema_check(urls: list[str], client: str = "") -> str:
    """Extract and sanity-check JSON-LD on the given URLs (validity, recommended properties, NAP vs client profile)."""
    with tempfile.TemporaryDirectory() as d:
        return _run("schema/schema_check.py", *urls, "--out", d, *(["--client", client] if client else []))


@mcp.tool()
def seo_generate_schema(client: str, kind: str, subtype: str = "LocalBusiness", service: str = "", url: str = "") -> str:
    """Generate JSON-LD from client facts only. kind: organization|localbusiness|website|service.
    Missing facts are listed, never invented."""
    args = [client, kind, "--subtype", subtype] + (["--service", service] if service else []) + (["--url", url] if url else [])
    return _run("schema/generate_schema.py", *args)


@mcp.tool()
def seo_ai_answer_check(site: str, urls: list[str] | None = None, client: str = "", gsc_query_page_csv: str = "") -> str:
    """AI-search answer check (Google AI Overviews / AI Mode readiness and ChatGPT/Perplexity/Claude search):
    crawler allowlist, snippet eligibility, who/what/where, direct answers, FAQ-schema match, and grading against
    real Search Console queries when a query,page CSV path is given. Findings tagged OBSERVED/INFERRED/UNKNOWN."""
    with tempfile.TemporaryDirectory() as d:
        args = ["--site", site, "--out", d] + (["--urls", *urls] if urls else []) + \
               (["--client", client] if client else []) + (["--queries", gsc_query_page_csv] if gsc_query_page_csv else [])
        _run("ai_answer/answer_check.py", *args)
        md = Path(d) / "answer-check.md"
        return _cap(md.read_text(encoding="utf-8")) if md.exists() else "ERROR: no output"


@mcp.tool()
@_guarded
def pagespeed(url: str, strategy: str = "mobile") -> str:
    """PageSpeed Insights: Lighthouse scores, lab metrics, CrUX field data (LCP/INP/CLS p75), top opportunities.
    Uses GOOGLE_API_KEY if set (keyless quota is often exhausted)."""
    return json.dumps(_load("integrations/pagespeed.py").psi(url, strategy, os.environ.get("GOOGLE_API_KEY")), indent=1)


# ------------------------------------------------------------------ Google Search Console (official API)

def _gsc():
    return _load("integrations/gsc.py")


@mcp.tool()
@_guarded
def gsc_list_sites() -> str:
    """List Search Console properties this credential can access, with permission level."""
    sites = _gsc().service(True).sites().list().execute().get("siteEntry", [])
    return "\n".join(f"{s['siteUrl']}\t{s['permissionLevel']}" for s in sites) or "No properties."


@mcp.tool()
@_guarded
def gsc_search_analytics(site: str, dimensions: list[str] | None = None, days: int = 28, start_date: str = "",
                         end_date: str = "", filters: list[str] | None = None, row_limit: int = 1000,
                         search_type: str = "web") -> str:
    """Search Analytics (clicks, impressions, CTR, position). site: 'sc-domain:example.com' or URL-prefix property.
    dimensions: query, page, date, device, country, searchAppearance. filters: 'dim~operator~expr'
    (e.g. 'page~contains~/services'). Default window ends 3 days ago (data lag). Returns CSV."""
    g = _gsc()
    dims = dimensions or ["query"]
    s, e = (start_date, end_date) if start_date else g.date_range(days)
    rows = g.query_all(g.service(True), site, s, e, dims, search_type, g.parse_filters(filters or []), row_limit)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(dims + ["clicks", "impressions", "ctr", "position"])
    for r in rows:
        w.writerow(r.get("keys", []) + [r["clicks"], r["impressions"], round(r["ctr"], 4), round(r["position"], 2)])
    return _cap(f"# {site} {s}..{e} rows={len(rows)} (query rows exclude anonymized queries)\n" + buf.getvalue())


@mcp.tool()
@_guarded
def gsc_compare_periods(site: str, dimension: str = "page", days: int = 28, top: int = 15) -> str:
    """Compare the last `days` with the previous equal period for one dimension (page or query):
    totals, winners, losers, new, lost."""
    g = _gsc()
    svc = g.service(True)
    s, e = g.date_range(days)
    d0 = date.fromisoformat(s)
    ps, pe = (d0 - timedelta(days=days)).isoformat(), (d0 - timedelta(days=1)).isoformat()
    with tempfile.TemporaryDirectory() as d:
        cur, prev = Path(d) / "cur.csv", Path(d) / "prev.csv"
        g.write_rows(g.query_all(svc, site, s, e, [dimension], "web", [], 25000), [dimension], cur)
        g.write_rows(g.query_all(svc, site, ps, pe, [dimension], "web", [], 25000), [dimension], prev)
        return f"current {s}..{e} vs previous {ps}..{pe}\n" + _run("reporting/compare_periods.py", str(prev), str(cur),
                                                                  "--key", dimension, "--top", str(top))


@mcp.tool()
@_guarded
def gsc_list_sitemaps(site: str) -> str:
    """Sitemaps known to Search Console: last submitted/downloaded, errors, warnings, URL counts."""
    sm = _gsc().service(True).sitemaps().list(siteUrl=site).execute().get("sitemap", [])
    return json.dumps(sm, indent=1) if sm else "No sitemaps."


@mcp.tool()
@_guarded
def gsc_inspect_urls(site: str, urls: list[str]) -> str:
    """URL Inspection API (read-only): verdict, coverage state, Google vs user canonical, last crawl, robots,
    rich results. Quota 2,000/day per property. It CANNOT request indexing; that is manual in Search Console."""
    svc, out = _gsc().service(True), []
    for u in urls[:50]:
        try:
            r = svc.urlInspection().index().inspect(body={"inspectionUrl": u, "siteUrl": site}).execute()
            ix = r["inspectionResult"].get("indexStatusResult", {})
            out.append({"url": u, "verdict": ix.get("verdict"), "coverage": ix.get("coverageState"),
                        "google_canonical": ix.get("googleCanonical"), "user_canonical": ix.get("userCanonical"),
                        "last_crawl": ix.get("lastCrawlTime"), "robots": ix.get("robotsTxtState"),
                        "fetch": ix.get("pageFetchState"),
                        "rich_results": r["inspectionResult"].get("richResultsResult", {}).get("verdict")})
        except Exception as e:  # keep going per URL
            out.append({"url": u, "error": str(e)[:300]})
    return json.dumps(out, indent=1)


@mcp.tool()
@_guarded
def gsc_submit_sitemap(site: str, sitemap_url: str, confirm: bool = False) -> str:
    """WRITE: submit a sitemap to Search Console. Needs SEO_GODMODE_ALLOW_WRITES=1 and confirm=true.
    Does not force crawling or indexing."""
    if (refusal := _write_guard(confirm, "Search Console sitemap submit")):
        return refusal
    _gsc().service(False).sitemaps().submit(siteUrl=site, feedpath=sitemap_url).execute()
    return f"Submitted {sitemap_url} to {site}."


@mcp.tool()
@_guarded
def gsc_delete_sitemap(site: str, sitemap_url: str, confirm: bool = False) -> str:
    """WRITE: remove a sitemap from Search Console (does not de-index URLs). Needs SEO_GODMODE_ALLOW_WRITES=1 and confirm=true."""
    if (refusal := _write_guard(confirm, "Search Console sitemap delete")):
        return refusal
    _gsc().service(False).sitemaps().delete(siteUrl=site, feedpath=sitemap_url).execute()
    return f"Removed {sitemap_url} from {site}."


# ------------------------------------------------------------------ Bing Webmaster Tools (official API)

BING_READ = {"sites": "GetUserSites", "traffic": "GetRankAndTrafficStats", "queries": "GetQueryStats",
             "pages": "GetPageStats", "crawl_stats": "GetCrawlStats", "crawl_issues": "GetCrawlIssues",
             "sitemaps": "GetFeeds", "quota": "GetUrlSubmissionQuota"}


@mcp.tool()
@_guarded
def bing_report(report: str, site: str = "", limit: int = 200) -> str:
    """Bing Webmaster read-only data. report: sites | traffic | queries | pages | crawl_stats | crawl_issues |
    sitemaps | quota. site must match the URL exactly as verified in Bing (e.g. https://www.example.com/)."""
    if report not in BING_READ:
        return f"ERROR: report must be one of {', '.join(BING_READ)}"
    data = _load("integrations/bing.py").call(BING_READ[report], None if report == "sites" else {"siteUrl": site})
    if isinstance(data, list):
        data = data[:limit]
    return _cap(json.dumps(data, indent=1))


@mcp.tool()
@_guarded
def bing_url_info(site: str, url: str) -> str:
    """Bing index/crawl info for one URL (discovery, last crawl, HTTP status, inbound links)."""
    return json.dumps(_load("integrations/bing.py").call("GetUrlInfo", {"siteUrl": site, "url": url}), indent=1)


@mcp.tool()
@_guarded
def bing_keyword(query: str, country: str = "us", language: str = "en-US", related: bool = False) -> str:
    """Bing keyword volume history (GetKeyword) or related keywords (GetRelatedKeywords). Bing-only volumes."""
    end = date.today()
    params = {"q": query, "country": country, "language": language,
              "startDate": (end - timedelta(days=90)).isoformat(), "endDate": end.isoformat()}
    return _cap(json.dumps(_load("integrations/bing.py").call("GetRelatedKeywords" if related else "GetKeyword", params), indent=1))


@mcp.tool()
@_guarded
def bing_submit(site: str, kind: str, urls: list[str], confirm: bool = False) -> str:
    """WRITE: kind='sitemap' submits urls[0] as a sitemap (SubmitFeed); kind='urls' submits URLs for crawling
    (SubmitUrlBatch, daily quota). Needs SEO_GODMODE_ALLOW_WRITES=1 and confirm=true."""
    if (refusal := _write_guard(confirm, f"Bing {kind} submission")):
        return refusal
    bing = _load("integrations/bing.py")
    if kind == "sitemap":
        bing.call("SubmitFeed", body={"siteUrl": site, "feedUrl": urls[0]})
        return f"Submitted sitemap {urls[0]} to Bing."
    quota = bing.call("GetUrlSubmissionQuota", {"siteUrl": site})
    bing.call("SubmitUrlBatch", body={"siteUrl": site, "urlList": urls})
    return f"Submitted {len(urls)} URL(s). Quota before: {json.dumps(quota)}"


@mcp.tool()
def indexnow_submit(host: str, key: str, urls: list[str], confirm: bool = False) -> str:
    """WRITE: notify IndexNow engines (Bing, Yandex, Seznam, Naver, Yep; NOT Google) that URLs changed.
    Key file must be hosted at https://<host>/<key>.txt. Needs SEO_GODMODE_ALLOW_WRITES=1 and confirm=true."""
    if (refusal := _write_guard(confirm, "IndexNow submission")):
        return refusal
    return _run("integrations/indexnow.py", "submit", "--host", host, "--key", key, "--urls", *urls)


@mcp.tool()
def seo_status() -> str:
    """Which integrations are configured on this machine (checks env vars only; never prints secrets)."""
    checks = {
        "Search Console": bool(os.environ.get("GSC_SERVICE_ACCOUNT_FILE") or os.environ.get("GSC_OAUTH_CLIENT_FILE")),
        "Bing Webmaster": bool(os.environ.get("BING_WEBMASTER_API_KEY")),
        "PageSpeed/CrUX key": bool(os.environ.get("GOOGLE_API_KEY")),
        "Write tools enabled": os.environ.get("SEO_GODMODE_ALLOW_WRITES") == "1",
    }
    try:
        import googleapiclient  # noqa: F401
        checks["google-api-python-client installed"] = True
    except ImportError:
        checks["google-api-python-client installed"] = False
    lines = [f"{'OK ' if v else '-- '} {k}" for k, v in checks.items()]
    lines.append(f"client state folder: {common.clients_dir()}")
    return "\n".join(lines)


if __name__ == "__main__":
    mcp.run()
