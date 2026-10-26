# Chrome Web Store submission kit

Everything to paste into the Chrome Web Store Developer Dashboard. Upload file: `dist/seo-god-mode-extension.zip` (build it with `python scripts/build_extension_zip.py`, or download it from the GitHub release).

## Store listing tab

**Name** (comes from the manifest): SEO God Mode: SEO, AEO & GEO Checker

**Summary** (comes from the manifest, 132 characters max): Rate a site for SEO, AEO and AI search (GEO): plain summary, step-by-step fixes, a fix prompt to copy, and before/after proof.

**Description:**

```
Find out why a page isn't showing up in Google or AI answers, fix it, and prove it worked.

SEO God Mode rates a whole site (it crawls up to 30 pages and scores 39 checks) or the page you're on (78 checks), and adds 8 tools: a Google result preview, share preview, heading outline, schema inspector, AI-crawler access table, links and images tables, and quick links. After each scan it writes a short plain-English summary: how the site is doing, the biggest wins, and what you should set up.

• SEO: title, meta description, headings, canonical, indexing, robots.txt, sitemap, real 404s, HTTPS, image alt text, social share tags, load speed in your visit.
• AEO (answer engines): whether Google can quote the page, question-style headings, a direct answer near the top, FAQ content that matches its schema, and content that's readable without JavaScript.
• GEO (AI search): whether ChatGPT, Perplexity and Claude search crawlers can reach the page, business details, profile links, location, contact details, sources, author and date.

What you get:
• Scores out of 100 for SEO, AEO and GEO, plus an overall score.
• Issues ranked by how many points each fix adds.
• Step-by-step fixes for WordPress, Shopify, Wix, Squarespace, Webflow, Next.js and Astro.
• A fix prompt to copy for every issue, plus one that fixes everything in order, ready to paste into your AI assistant. Prompts list the affected pages, include ready-made snippets, tell the AI never to invent facts, and say to check the live site after changes.
• Before/after proof: save a "before" scan, make your fixes, scan again, and download a dated report for your client or boss.

Honest by design: every result is labeled as measured, an estimate, or not measured. Scores describe page health and AI-search readiness, not rankings.

Private: scans run in your browser and history stays on your computer. The only outside request is Google PageSpeed Insights for the homepage on whole-site scans.

Same scoring as the free, open-source SEO God Mode skill, which adds Search Console and Bing data and client tracking: github.com/F0rger123/CLAUDE-SEO-GOD-MODE
```

**Category:** Developer Tools (alternative: Tools)
**Language:** English

**Graphic assets** (all in `store/images/`):
| Field | File | Size |
|---|---|---|
| Store icon | `extension/icons/icon128.png` | 128×128 |
| Screenshots (1–3) | `screenshot-1.png`, `screenshot-2.png`, `screenshot-3.png` | 1280×800 |
| Small promo tile | `promo-small.png` | 440×280 |

**Official URL / homepage:** https://github.com/F0rger123/CLAUDE-SEO-GOD-MODE
**Support URL:** https://github.com/F0rger123/CLAUDE-SEO-GOD-MODE/issues

## Privacy practices tab

**Single purpose:**
```
Checks the website the user is viewing for SEO, answer-engine and AI-search readiness, explains how to fix each issue, and compares scans before and after fixes.
```

**Permission justifications:**
| Permission | Justification to paste |
|---|---|
| activeTab | Lets the extension read the page the user chooses to scan when they click the extension. |
| scripting | Runs the read-only page check (titles, headings, structured data, images, links) in the tab the user is scanning. |
| storage | Saves the user's scan results on their device so they can compare before and after. |
| sidePanel | Shows the scan results, fix steps and before/after comparison in Chrome's side panel. |
| declarativeNetRequestWithHostAccess | For one homepage request per search crawler, sets that crawler's user-agent so the scan can tell whether the site's firewall blocks AI search crawlers. The rule is removed right after the request and only applies to the site being scanned. |
| Host permissions (optional, requested per site) | Requested only for the site the user scans (its www and non-www address), to fetch its pages, robots.txt, sitemap and a test URL. A whole-site rating can't be done from one page. |

**Remote code:** No, I am not using remote code. All JavaScript is included in the package.

**Data usage:** tick nothing in "collects" (the extension doesn't collect user data; it only sends the scanned site's public homepage URL to Google PageSpeed Insights, as the privacy policy says). Then certify the three statements: you don't sell data, don't use it for unrelated purposes, and don't use it for creditworthiness.

**Privacy policy URL:** https://github.com/F0rger123/CLAUDE-SEO-GOD-MODE/blob/main/docs/PRIVACY.md

## Distribution tab

- **Visibility:** Public (anyone can find it). Choose Unlisted if you only want people with the link to install it.
- **Regions:** All regions.
- **Pricing:** Free.

## Before each update

1. Bump `version` in `extension/manifest.json`. The store rejects a re-upload with the same version.
2. `python scripts/build_extension_zip.py`, then upload the new zip on the Package tab and submit for review.
