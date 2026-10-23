# MCP servers

## Built in: `seo-god-mode` (mcp/server.py)

A local stdio MCP server that exposes this repo's tools to any MCP client (Claude Code, Claude Desktop, Cursor, VS Code, Codex). Google and Bing calls go straight to the official APIs from your machine; no third-party service sees client data.

### Install

```bash
pip install -r mcp/requirements.txt          # mcp SDK + Google API client
claude mcp add seo-god-mode --scope user -- python /absolute/path/to/repo/mcp/server.py
```

As a Claude Code plugin, `.mcp.json` registers it automatically (you still run the `pip install` once).

Claude Desktop / Cursor / other clients (`mcpServers` JSON):

```json
{
  "mcpServers": {
    "seo-god-mode": {
      "command": "python",
      "args": ["/absolute/path/to/repo/mcp/server.py"],
      "env": {
        "GSC_SERVICE_ACCOUNT_FILE": "/path/to/gsc-sa.json",
        "BING_WEBMASTER_API_KEY": "your-key",
        "GOOGLE_API_KEY": "your-key"
      }
    }
  }
}
```

Credentials: environment variables only (`docs/INTEGRATIONS.md`). Call `seo_status` to see what's configured.

### Tools (27)

| Group | Tools |
|---|---|
| Client memory | `seo_client_list`, `seo_client_init`, `seo_client_resume`, `seo_client_set`, `seo_client_record`, `seo_client_log` |
| Site checks (no credentials) | `seo_rate_site`, `seo_robots_check`, `seo_audit`, `seo_sitemap_check`, `seo_schema_check`, `seo_generate_schema`, `seo_ai_answer_check`, `pagespeed` |
| Google Search Console | `gsc_list_sites`, `gsc_search_analytics`, `gsc_compare_periods`, `gsc_list_sitemaps`, `gsc_inspect_urls`, `gsc_submit_sitemap`*, `gsc_delete_sitemap`* |
| Bing Webmaster | `bing_report` (sites, traffic, queries, pages, crawl stats/issues, sitemaps, quota), `bing_url_info`, `bing_keyword`, `bing_submit`* |
| IndexNow | `indexnow_submit`* |
| Setup | `seo_status` |

\* **Write tools** are off by default. They run only when the server has `SEO_GODMODE_ALLOW_WRITES=1` **and** the call passes `confirm=true` after the user approved that specific action.

What it deliberately does **not** do: request Google indexing for normal pages (no such API; the Indexing API is only for JobPosting and livestream pages), or anything that edits a live site.

Test: `python tests/test_mcp_server.py`.

## Community MCP servers: Google Search Console and Bing

Checked 2026-10-23 via the GitHub API and each README. No star counts or popularity claims. All are community projects, not Google or Microsoft.

### Google Search Console

| Repo | License / lang | Last push | Notable | Verdict |
|---|---|---|---|---|
| [saurabhsharma2u/search-console-mcp](https://github.com/saurabhsharma2u/search-console-mcp) | MIT / TS | 2026-10-21 | GSC + Bing + GA4 (+AdSense) in one server; GSC write tools need an explicit write scope; `npx search-console-mcp setup` | **Best all-in-one community option.** Its "GenAI query insights" are the author's heuristics, not Google data. |
| [AminForou/mcp-gsc](https://github.com/AminForou/mcp-gsc) | MIT / Python | 2026-09-15 | Mature; batch URL inspection; sitemap submit/delete; OAuth or service account | **Best GSC-only option.** Use the local server, not the advertised hosted version. |
| [FlorianBruniaux/google-search-console-mcp](https://github.com/FlorianBruniaux/google-search-console-mcp) | MIT / Python | 2026-10-18 | ~98 tools, GSC + Bing + IndexNow, `gsc-cli` | Broad. README mentions "Google indexing requests": keep any Indexing API tool off for normal pages. |
| [avansaber/seo-monster](https://github.com/avansaber/seo-monster) | MIT / Python | 2026-10-18 | 70 tools: GSC, GA4, PageSpeed, Cloudflare writes | Indexing-request writes are **on by default**; turn them off. Cloudflare write tools need care. |
| [surendranb/google-search-console-mcp](https://github.com/surendranb/google-search-console-mcp) | MIT / Python | 2026-10-03 | Simple GSC server | OK alternative. |
| [ahonn/mcp-server-gsc](https://github.com/ahonn/mcp-server-gsc) | **no license** / TS | 2026-09-04 | Search analytics | Not recommended (no license). |

### Bing Webmaster Tools

| Repo | License / lang | Last push | Notable | Verdict |
|---|---|---|---|---|
| [parthguru/bing-webmaster-mcp](https://github.com/parthguru/bing-webmaster-mcp) | MIT / Python | 2026-09-02 | Hardened fork of isiahw1: **read-only by default**, site allowlist, bearer auth for HTTP | **Best for agencies** (least privilege). Young fork. |
| [R1tom/bing-webmaster-mcp](https://github.com/R1tom/bing-webmaster-mcp) | MIT / Python | 2026-10-20 | Small, focused: sites, url_info, sitemaps, submit, keyword volume | Simple and readable. Very new; README advertises a hosted version (keep local). |
| [ncosentino/bing-webmaster-mcp](https://github.com/ncosentino/bing-webmaster-mcp) | MIT / C# | 2026-08-05 | ~55 tools + IndexNow, prebuilt binaries | Broadest. Verify release checksums; HTTP mode has no auth, keep stdio. |
| [isiahw1/mcp-server-bing-webmaster](https://github.com/isiahw1/mcp-server-bing-webmaster) | MIT / Python | 2026-02-10 | ~60 tools, all registered, single key | Less active; prefer the hardened fork. |
| [idowebid/bing-webmaster-mcp](https://github.com/idowebid/bing-webmaster-mcp) | **no license** | 2026-06-28 | — | Not recommended. |

### Recommendation

1. Default: the built-in `seo-god-mode` server (official APIs, writes off by default, client memory included).
2. Want more GSC/Bing analysis tools: add `saurabhsharma2u/search-console-mcp` (GSC + Bing + GA4) or `AminForou/mcp-gsc` + `parthguru/bing-webmaster-mcp`.
3. GA4 / AI-referral traffic: Google's official [googleanalytics/google-analytics-mcp](https://github.com/googleanalytics/google-analytics-mcp) (Apache-2.0, read-only).
4. Rendering and Core Web Vitals debugging: [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp), [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp).
5. Paid SERP, volume, backlink, and local-pack data: [dataforseo/mcp-server-typescript](https://github.com/dataforseo/mcp-server-typescript).

Before enabling any third-party server: read `docs/SECURITY.md`, pin a version, prefer local stdio, keep write tools off.
