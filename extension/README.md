# CLAUDE SEO GOD MODE: Chrome extension

A side panel that scans the page you're on for **SEO, AEO (answer engines) and GEO (AI search)**, explains each problem with step-by-step fixes for your platform, writes **ready-to-paste Claude prompts** to fix them, and keeps **before/after proof** you can hand to a client.

<p>
  <img src="../assets/extension-fix.png" alt="Scan results with fix steps" width="300">
  <img src="../assets/extension-proof.png" alt="Before and after proof" width="300">
</p>

## Install (2 minutes, no store needed)

1. Download this repository (Code → Download ZIP) and unzip it, or `git clone` it.
2. In Chrome, open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the `extension` folder.
4. Pin the extension, open any website, and click its icon. The side panel opens; press **Scan this page**.

The first scan of each site asks for access to that site. The extension needs it to read the page, `robots.txt` and the sitemap. It works with Chrome 116+ and other Chromium browsers (Edge, Brave, Arc).

## What it checks (33 checks)

| Area | Checks |
|---|---|
| **SEO** | title, meta description, one H1, heading order, canonical, noindex, viewport and lang, image alt text and dimensions, social share tags, HTTPS, http→https redirect, robots.txt (Googlebot/Bingbot), sitemap, real 404s, valid JSON-LD, content depth, load speed in this visit (LCP, CLS), render-blocking scripts |
| **AEO** | snippet eligibility (Google's AI Overviews requirement), question-style headings, a direct answer near the top, FAQ content that matches its schema, scannable sections, content present in raw HTML (not JavaScript-only) |
| **GEO** | AI search crawlers allowed (OAI-SearchBot, PerplexityBot, Claude-SearchBot, Googlebot, Bingbot), business/organization schema, sameAs profiles, location or service area, contact details, cited sources, author/date signals, Bing access |

Scores are out of 100 per area. **Overall = 60% SEO + 20% AEO + 20% GEO**, the same weighting as the repo's `rate_site.py`. Every result is tagged **OBSERVED** (measured on the live page), **INFERRED** (a stated heuristic) or **UNKNOWN** (couldn't measure). Nothing is guessed.

## Tabs

- **Fix:** failed checks ranked by how many points each one is worth. Open a check to see why it matters, steps tailored to the detected platform (WordPress, Shopify, Wix, Squarespace, Webflow, Next.js, Astro), and a **Copy Claude prompt** button.
- **Passed:** what to keep.
- **Before / after:** mark a scan as **BEFORE**, make the fixes, scan again. The tab shows score changes and every check that was fixed, improved or regressed. **Download proof report** saves a dated, self-contained HTML page for the client.
- **Claude prompt:** one "fix everything" prompt in priority order, with built-in rules: no invented facts (`[CONFIRM]` placeholders), keep the design, verify the live page after deploying, and do CDN-level HTTPS changes in the CDN settings rather than in code.

## Privacy

Everything runs in your browser. Scan history is stored in `chrome.storage.local` on your device (the last 25 scans per page). The extension sends nothing anywhere except requests to the site you're scanning (its page, `robots.txt`, sitemap, `llms.txt`, a random URL to test for 404s, and its `http://` address). There's no analytics and no account.

## Limits

- Scores cover one page plus its site files. For a whole-site crawl, use `python scripts/rate_site.py <site>` or the MCP tool `seo_rate_site`.
- Load speed comes from your own visit (device and network). Search Console and PageSpeed Insights have field data.
- Rankings, traffic, index status, backlinks and AI citations aren't visible from a page. Connect Search Console through the skill for those.

## Develop

- Code: `lib/collect.js` (runs in the page), `lib/site.js` (robots.txt with Google's matching rules, sitemap, 404, http), `lib/rubric.js` (checks, weights, fix steps, prompt goals), `lib/prompts.js`, `lib/proof.js`, `sidepanel.*`.
- **Add a check:** one entry in `CHECKS` in `lib/rubric.js` (`id`, `cat`, `name`, `weight`, `tag`, `test`, `why`, `steps`, `platform`, `goal`). Then extend the fixtures in `tests/e2e.mjs` so the GOOD site passes and the BAD site fails.
- **Test:** `npm i playwright && npx playwright install chromium`, then `node extension/tests/e2e.mjs`. It loads the real extension in Chromium, scans a good and a bad local site, fixes the bad one, and checks the before/after proof and the downloaded report. CI runs it on every push.
- **Chrome Web Store:** zip the `extension` folder and upload it in the developer dashboard (one-time $5 developer fee; the listing needs a privacy statement, and the section above covers it). Do that only when you want public installs.
