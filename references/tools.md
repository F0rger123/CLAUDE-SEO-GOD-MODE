# Tools and MCP servers

Maintenance state checked on **2026-10-22** via the GitHub API (archived flag, last push date, license). Re-check before relying on a tool: `gh api repos/<owner>/<repo> --jq '[.archived,.pushed_at,.license.spdx_id]'`. No star counts or popularity claims are recorded here on purpose.

Legend: **Core** = used by this skill's workflows. **Optional** = add when a client needs it. **Not adopted** = evaluated, not recommended by default.

## Built into this repo (core)

| Script | Replaces | Why build our own |
|---|---|---|
| `scripts/integrations/gsc.py` | GSC MCPs | Official Google client, no third party sees tokens, deterministic CSV output |
| `scripts/integrations/bing.py` | Bing MCPs | Official API, stdlib only, community MCPs are young |
| `scripts/integrations/indexnow.py` | IndexNow plugins | Protocol is 1 HTTP POST |
| `scripts/integrations/pagespeed.py` | Lighthouse CLI for quick checks | Official API, no Chrome install |
| `scripts/crawling/*`, `sitemap/*`, `metadata/*`, `links/*`, `schema/*` | Small-site crawler/auditor | Zero dependencies, output shaped for this skill's state |

## Official Google / Microsoft

| Tool | URL | Purpose | Official | State (2026-10-22) | Credentials | Why | Security |
|---|---|---|---|---|---|---|---|
| google-api-python-client | https://github.com/googleapis/google-api-python-client | Python client for Search Console API | Official (Google) | Active, Apache-2.0 | Service account or OAuth | Used by `gsc.py` | Keep key files outside repos; least-privilege GSC user |
| Google Analytics MCP | https://github.com/googleanalytics/google-analytics-mcp | Read-only GA4 Admin + Data API for agents | Official (Google Analytics org) | Active, Apache-2.0 | ADC with `analytics.readonly` | Conversions/traffic in reports | Read-only scope; local stdio |
| Lighthouse | https://github.com/GoogleChrome/lighthouse | Lab performance/SEO/a11y audits | Official (Google Chrome) | Active, Apache-2.0 | None | Deep local audits beyond PSI | Runs local Chrome |
| web-vitals | https://github.com/GoogleChrome/web-vitals | Field CWV measurement in the browser | Official (Google Chrome) | Active, Apache-2.0 | None | For developers adding RUM to client sites | Client-side script |
| schema-dts | https://github.com/google/schema-dts | TypeScript types for schema.org JSON-LD | Google org | Active, Apache-2.0 | None | Type-safe schema in Next.js/TS client sites | Build-time only |
| Chrome DevTools MCP | https://github.com/ChromeDevTools/chrome-devtools-mcp | Agent control of Chrome: traces, network, performance | Official (Chrome DevTools) | Active, Apache-2.0 | None | CWV debugging, JS rendering checks | Can browse; use a clean profile |
| Playwright MCP | https://github.com/microsoft/playwright-mcp | Agent browser automation, accessibility snapshots | Official (Microsoft) | Active, Apache-2.0 | None | Rendered DOM vs raw HTML, mobile checks | Can browse; isolate profile |
| Bing Webmaster API | https://learn.microsoft.com/en-us/bingwebmaster/ | Official API docs | Official (Microsoft) | — | API key | Used by `bing.py` | Key covers all sites on account |
| IndexNow | https://www.indexnow.org/ | Change notification protocol | Industry protocol (Microsoft, Yandex, others) | — | Per-site key file | Used by `indexnow.py` | Key is public by design |

## Community MCP servers (optional)

Updated comparison of open-source Google Search Console and Bing Webmaster MCP servers (2026-10-23): `docs/MCP.md`. This repo also ships its own MCP server (`mcp/server.py`).

| Tool | URL | Purpose | State (2026-10-22) | Credentials | Why | Security notes |
|---|---|---|---|---|---|---|
| mcp-gsc | https://github.com/AminForou/mcp-gsc | GSC: analytics, URL inspection (incl. batch), sitemap submit/delete | Active, MIT, Python | OAuth or service account | Most complete GSC MCP reviewed; conversational analysis | Community. Use the local version, not the advertised hosted version, so tokens stay local. Pin a commit. Write tools exist (sitemap submit/delete): approve each call |
| mcp-server-gsc | https://github.com/ahonn/mcp-server-gsc | GSC search analytics via Node | Active, no license file | Service account | Alternative if Node preferred | No license declared: legal grey area for agency use; not adopted by default |
| bing-webmaster-mcp | https://github.com/ncosentino/bing-webmaster-mcp | Bing Webmaster (many tools) + IndexNow | Active, MIT | Bing API key | Broadest Bing MCP reviewed | Distributed as prebuilt binaries: verify checksums; HTTP mode has no auth, keep stdio/loopback |
| mcp-server-bing-webmaster | https://github.com/isiahw1/mcp-server-bing-webmaster | Bing Webmaster tools via Python | MIT, last push 2026-02 | Bing API key | Readable Python source | Less recent activity; a hardened read-only fork exists (`parthguru/bing-webmaster-mcp`), unreviewed |
| DataForSEO MCP | https://github.com/dataforseo/mcp-server-typescript | SERP, keywords, backlinks, local pack, on-page via DataForSEO | Active, Apache-2.0, vendor-maintained | DataForSEO login (paid, pay-as-you-go) | Real keyword volumes and SERP data when budget allows | Paid per call: estimate cost first; vendor sees queries |
| Firecrawl MCP | https://github.com/firecrawl/firecrawl-mcp-server | Scrape/crawl/map sites incl. JS, returns markdown | Active, MIT, vendor-maintained | Firecrawl API key | Large or JS-heavy sites beyond our crawler | Pages are fetched via vendor cloud |

## Crawling, links, sitemaps (optional CLIs/libraries)

| Tool | URL | Purpose | State (2026-10-22) | Credentials | Why | Security |
|---|---|---|---|---|---|---|
| advertools | https://github.com/eliasdabbas/advertools | Python SEO toolkit: Scrapy crawler, sitemap/robots to DataFrames, log analysis | Active (last push 2026-06), MIT | None | Large-site crawls (10k+ URLs) and sitemap analysis | pip package; crawl politely |
| ultimate-sitemap-parser | https://github.com/GateNLP/ultimate-sitemap-parser | Robust sitemap discovery/parsing | Active, GPL-3.0 | None | Messy multi-level sitemaps | GPL: use as a tool, do not vendor into proprietary code |
| lychee | https://github.com/lycheeverse/lychee | Fast link checker (Rust) | Active, Apache-2.0 | None | Large external link checks, CI | Rate-limit external hosts |
| linkinator | https://github.com/JustinBeckwith/linkinator | Crawling broken-link checker (Node) | Active, MIT | None | Quick CLI check: `npx linkinator <url> --recurse` | — |
| Unlighthouse | https://github.com/harlan-zw/unlighthouse | Lighthouse across a whole site | Active, MIT | None | Site-wide CWV/SEO scoring without PSI quota | Runs local Chrome; heavy on the target server, use off-hours |
| llms.txt spec | https://github.com/AnswerDotAI/llms-txt | Proposal for `/llms.txt` | Active, Apache-2.0 | None | Reference for optional llms.txt | Not used by Google |

## Not adopted by default

| Tool | Reason |
|---|---|
| structured-data-testing-tool (iaincollins) | Last push 2023-07; stale. Use Rich Results Test + validator.schema.org + `schema_check.py`. |
| Google Indexing API wrappers for normal pages | Indexing API is only for JobPosting and livestream BroadcastEvent pages. See `indexing-limitations.md`. |
| Google Business Profile community MCPs | GBP API access requires Google approval; community servers are new and unreviewed. Revisit if API access is granted. |
| "Instant indexing" services | Misuse Indexing API or link spam; violates guidelines. |

## Commercial (manual or paid, user decides)

Screaming Frog SEO Spider (desktop crawler; free up to 500 URLs), Ahrefs/Semrush/Moz (backlinks, keywords), BrightLocal/Local Falcon/Whitespark (local rank grids, citations), Google Ads Keyword Planner (free with an Ads account). Record which ones a client pays for in `integrations.keyword_data.notes`.

## Already on this machine (Agency Zero setup)

The user's Claude environment may include other SEO skills/plugins (for example an OpenSEO plugin with Search Console, SERP, and IndexNow tools). They are optional accelerators; this skill does not depend on them. If one is available and connected, prefer it over manual steps, but keep results in this skill's client state.
