# SEO God Mode: Chrome extension

A side panel that rates **a whole site or one page** for **SEO, AEO (answer engines) and GEO (AI search)**. It types out a plain-English summary of what's good and what needs doing, explains each problem with step-by-step fixes, gives you a **fix prompt** to copy, and keeps **before/after proof** you can hand to a client.

The whole-site rating is the skill's own `rate_site.py` rubric, ported to the browser: same crawl, same 39 checks, same weights, same scores. A test runs both on the same sites and fails if a single score or check differs.

<p>
  <img src="../assets/extension-overview.png" alt="Whole-site scores and typed summary" width="260">
  <img src="../assets/extension-fix.png" alt="Issues with fix steps" width="260">
  <img src="../assets/extension-tools.png" alt="Tools: search preview" width="260">
  <img src="../assets/extension-proof.png" alt="Before and after proof" width="260">
  <img src="../assets/extension-prompt.png" alt="Fix prompt" width="260">
</p>

## Install (2 minutes, no store needed)

1. **[Download the extension zip](https://github.com/F0rger123/CLAUDE-SEO-GOD-MODE/releases/latest/download/seo-god-mode-extension.zip)** and unzip it.
2. In Chrome, open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the unzipped folder.
4. Pin the extension, open any website, and click its icon. The side panel opens; press **Scan the whole site** (or switch to **This page**).

The first scan of each site asks for access to that site (both its `www` and non-`www` address, so the redirect check works). It works with Chrome 116+ and other Chromium browsers (Edge, Brave, Arc).

## Two views

- **Whole site** (default): crawls up to 30 pages the way the skill does, then scores 39 checks with rubric v2.0. Fixes are ranked the same way as the skill (points gained × impact) and list the affected pages.
- **This page:** 78 detailed checks on the page you're viewing, plus 8 tools.

## The summary

After a scan the panel types out a short verdict ("This site looks good, with a few gaps worth closing"), the weakest area, the biggest wins with how many pages each touches, the one-time things you should set up (sitemap, HTTPS redirects, business schema, AI crawler access, Bing), and what's already working. Click it to skip the animation; reduced-motion settings show it instantly. **Copy fix prompt** sits right under it.

## What it checks

**Whole site (39 checks, same as `rate_site.py`):**

| Area | Checks |
|---|---|
| **SEO** | Crawl & index: homepage crawlable, HTTPS, one canonical host, clean sitemap, pages return 200, indexable, real 404, canonicals, no broken/redirected internal links, server-rendered. On-page: titles, descriptions, one H1, heading order, alt text, viewport + lang, social cards. Content: 250+ words, 2+ internal links, HTML under 1 s. Schema: business entity, valid JSON-LD, page-level schema. Performance: PageSpeed Insights mobile score, or an estimate when it isn't available |
| **AEO** | Snippet eligibility, question headings, a direct answer up top, FAQ matching its schema, H2 sections, content in raw HTML |
| **GEO** | AI search crawlers in robots.txt, CDN/firewall blocking of AI crawler user-agents (tested live), business name on the homepage, location, sameAs, About and Contact, contact details, cited sources, Bing access, llms.txt (info only) |

**This page (78 checks):**

| Area | Checks |
|---|---|
| **SEO** (50) | Crawl & index, on-page, links and images, speed (LCP, CLS, TTFB from your visit), structured data |
| **AEO** (12) | Snippet eligibility, image previews, direct answer, definition sentence, question headings, FAQ, quotable paragraphs, walls of text, sections, lists/tables, reading level, freshness |
| **GEO** (16) | AI search and user-fetch crawlers, Bing, business schema and details, sameAs, knowledge-graph profiles, location, contact, About/Contact, author/date, sources, figures, reviews, llms.txt |

Scores are out of 100 per area. **Overall = 60% SEO + 20% AEO + 20% GEO.** Every result is tagged **Measured**, **Estimate** or **Not measured**. Nothing is guessed.

## Tabs

- **Overview:** the biggest wins, a per-area breakdown (tap a row to jump to those issues), and site or page facts, including what a public scan can't see.
- **Issues:** every failed check grouped by area, with filters, search and a "show passing" toggle. Each one explains why it matters, gives steps, lists the affected pages, and has a **Copy fix prompt** button.
- **Tools:** Google result preview, share preview, heading outline, schema inspector, a 17-crawler access table, links, images, page facts and quick links.
- **Proof:** mark a scan as "before", fix things, scan again. You see score changes and every check that was fixed, improved or slipped, and can download a dated report. Site and page scans keep separate histories.
- **Fix prompt:** one prompt for every fix in order, with the affected pages and ready-made snippets (robots.txt groups, starter schema, title and description lists), plus exports (JSON, CSV, issue list). The prompt's rules: no invented facts (`[CONFIRM]`), keep the design, verify the live page, do HTTPS/redirects in the CDN when there is one.

## Privacy

Scans run in your browser and history stays in `chrome.storage.local` on your device. The extension requests pages only from the site you scan, except one call: a whole-site scan asks **Google PageSpeed Insights** to test the homepage URL (skipped for local addresses). The CDN/firewall check briefly sets a crawler user-agent on requests to that homepage. There's no analytics and no account. Full policy: [docs/PRIVACY.md](../docs/PRIVACY.md).

## Limits

- Rankings, traffic, index status, backlinks and AI citations aren't visible from outside. Connect Search Console and Bing through the skill for those.
- Page-view speed comes from your own visit. PageSpeed Insights can hit its shared quota; the score then uses the labeled estimate, same as the skill.

## Develop

- Code: `lib/siterate.js` (whole-site rating, a port of `scripts/rate_site.py`), `lib/pyparse.js` (HTML facts read the way the skill's Python parsers read them), `lib/collect.js` (runs in the page), `lib/site.js` (robots.txt with Google's matching rules), `lib/rubric.js` (page checks), `lib/summary.js` (typed summary), `lib/prompts.js`, `lib/proof.js`, `sidepanel.*`.
- **Change a whole-site check:** change `scripts/rate_site.py` and `lib/siterate.js` together. The parity test fails until they agree.
- **Add a page check:** one entry in `CHECKS` in `lib/rubric.js`, then extend the fixtures in `tests/e2e.mjs`.
- **Test:** `npm i playwright && npx playwright install chromium`, then `node extension/tests/e2e.mjs` (needs Python for the parity step). It runs `rate_site.py` and the extension on the same good and bad sites and compares every score, check and top fix; then scans both views through the real side panel, checks the summary and fix prompts, fixes the bad site and checks the proof report. CI runs it on every push.
- **Chrome Web Store:** listing copy, images, permission justifications and privacy policy are in [`store/LISTING.md`](../store/LISTING.md). Build the upload with `python scripts/build_extension_zip.py`.
- **Releases:** every change to `extension/` on main runs the test, then publishes `seo-god-mode-extension.zip` to GitHub Releases.
