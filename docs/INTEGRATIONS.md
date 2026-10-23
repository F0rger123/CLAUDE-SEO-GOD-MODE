# Integrations

Each integration lists: what it gives, how to connect, what Claude can do, and what stays manual. Capability limits are in `references/apis.md` and `references/indexing-limitations.md`.

Track status per client: `client_state.py set <slug> integrations.<name>.status <unknown|not_set_up|pending_user|connected|unavailable>`.

---

## Google Search Console (primary)

**Gives:** clicks, impressions, CTR, position by query/page/date/device/country; sitemap list/submit/delete; URL Inspection (index status, canonical, last crawl, rich results); property list.

**Tool:** `scripts/integrations/gsc.py` (official `google-api-python-client`, Search Console API v1).

### Connect: service account (best for an agency, one setup for all clients)

1. Google Cloud Console: create project `agency-zero-seo`.
2. APIs & Services > Library: enable **Google Search Console API**.
3. IAM & Admin > Service Accounts: create `seo-reader`. Keys > Add key > JSON. Save outside any repo, for example `~/.config/agency-zero-seo/gsc-sa.json`.
4. Set `GSC_SERVICE_ACCOUNT_FILE` to that path.
5. **Per client (manual, client or you):** Search Console > Settings > Users and permissions > Add user > the service-account email > **Full**.
6. Test: `python scripts/integrations/gsc.py sites`.

### Connect: OAuth (use your own Google login)

1. Same project. Enable the API. OAuth consent screen: External, add yourself as test user.
2. Credentials > Create OAuth client ID > **Desktop app**. Download JSON.
3. Set `GSC_OAUTH_CLIENT_FILE`. First run opens a browser to sign in.

### Manual only

- Verifying a property (DNS TXT record is best: covers all subdomains and protocols via a Domain property).
- **Request Indexing** button in URL Inspection (no API for normal pages).
- Removals tool, Change of Address, manual-action review, security-issue review, disavow.

---

## Bing Webmaster Tools

**Gives:** sites, daily traffic, query and page stats, crawl stats and crawl issues, URL info, sitemap submit/remove, URL submission (quota-limited), Bing keyword data.

**Tool:** `scripts/integrations/bing.py` (official JSON API, `https://ssl.bing.com/webmaster/api.svc/json/`).

### Connect

1. Sign in at bing.com/webmasters. Add the site. Fastest: **Import from Google Search Console** (needs GSC access), or verify with DNS/XML file/meta tag.
2. Settings (gear) > API access > API Key > Generate.
3. Set `BING_WEBMASTER_API_KEY`. One key covers every verified site on that account.
4. Test: `python scripts/integrations/bing.py sites`.

Bing data also feeds Microsoft Copilot answers, so Bing indexing matters for AI visibility.

---

## IndexNow

**Gives:** instant change notification to Bing and other participating engines. **Google does not participate.**

**Tool:** `scripts/integrations/indexnow.py`.

1. `indexnow.py keygen` and record the key in client state: `client_state.py set <slug> integrations.indexnow.property "<key>"`. The key is public by design (it is served from the site), so storing it is fine.
2. Manual (dev/CMS): host `https://<host>/<key>.txt` containing only the key. Many CMS plugins do this (Yoast, Rank Math, Cloudflare Crawler Hints, Wix and Shopify built-ins vary; check the platform).
3. `indexnow.py verify --host <host> --key <key>`.

---

## PageSpeed Insights + CrUX

**Gives:** Lighthouse lab scores and opportunities; real-user Core Web Vitals (LCP, INP, CLS) at URL and origin level when the site has enough Chrome traffic.

**Tool:** `scripts/integrations/pagespeed.py`.

1. Same Google Cloud project: enable **PageSpeed Insights API** and **Chrome UX Report API**.
2. Credentials > API key. Restrict it to those two APIs.
3. Set `GOOGLE_API_KEY`. Without a key, PSI uses a shared quota that is often exhausted (HTTP 429).

---

## Google Analytics 4 (optional, for conversions)

**Option A (recommended): official Google Analytics MCP server** `googleanalytics/google-analytics-mcp`. Read-only GA4 Admin and Data API access via Application Default Credentials. Setup per its README: enable Analytics Admin API and Analytics Data API, `gcloud auth application-default login` with the `analytics.readonly` scope, add the server to Claude Code.

**Option B:** the client exports reports, or you read GA4 in the browser.

Grant: the client adds your Google account (or service account) as **Viewer** on the GA4 property.

---

## Google Business Profile

**Reality:** the Business Profile APIs need an approved access application from Google and are designed for profile management at scale. Most single-client work is manual in the GBP dashboard.

- Manual: you or the client grant **Manager** access in GBP > Business Profile settings > People and access.
- Claude prepares: category recommendations, description, services list, photos plan, post calendar, Q&A-style FAQ content for the website, review-request templates, NAP checklist.
- Ranking checks: manual searches in a private window from the target area, or a paid grid tool (see `references/tools.md`).

---

## Optional MCP servers

Add only after reading `docs/SECURITY.md`. Commands use the Claude Code CLI.

| Server | Why | Add |
|---|---|---|
| `AminForou/mcp-gsc` | Conversational GSC queries, batch URL inspection, sitemap management | see its README (`uvx`, OAuth or service account) |
| `googleanalytics/google-analytics-mcp` | Official GA4 read-only access | see its README |
| `microsoft/playwright-mcp` | Render JS pages, compare rendered vs raw HTML, mobile screenshots | `claude mcp add playwright -- npx @playwright/mcp@latest` |
| `ChromeDevTools/chrome-devtools-mcp` | Performance traces, network waterfall, CWV debugging | `claude mcp add chrome-devtools -- npx chrome-devtools-mcp@latest` |
| `ncosentino/bing-webmaster-mcp` | Conversational Bing data (prebuilt binary) | see its README; verify release checksums |
| `dataforseo/mcp-server-typescript` | Paid SERP, keyword volume, backlink, local pack data | see its README; needs DataForSEO account |
| `firecrawl/firecrawl-mcp-server` | Large or JS-heavy crawls, clean page markdown | needs Firecrawl API key (paid tiers) |

Pin versions in production use (replace `@latest` with a tested version).
