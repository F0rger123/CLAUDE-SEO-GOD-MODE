# Chrome Web Store submission kit

Everything to paste into the Chrome Web Store Developer Dashboard. Upload file: `dist/seo-god-mode-extension.zip` (build it with `python scripts/build_extension_zip.py`, or download it from the GitHub release).

## Store listing tab

**Name** (comes from the manifest): SEO God Mode: SEO, AEO & GEO Checker

**Summary** (comes from the manifest, 132 characters max): Check any page for SEO, AEO and AI-search (GEO) issues, get step-by-step fixes and Claude prompts, and prove the before/after.

**Description:**

```
Find out why a page isn't showing up in Google or AI answers, fix it, and prove it worked.

SEO God Mode scans the page you're on with 33 checks across three areas:
• SEO: title, meta description, headings, canonical, indexing, robots.txt, sitemap, real 404s, HTTPS, image alt text, social share tags, load speed in your visit.
• AEO (answer engines): whether Google can quote the page, question-style headings, a direct answer near the top, FAQ content that matches its schema, and content that's readable without JavaScript.
• GEO (AI search): whether ChatGPT, Perplexity and Claude search crawlers can reach the page, business details, profile links, location, contact details, sources, author and date.

What you get:
• Scores out of 100 for SEO, AEO and GEO, plus an overall score.
• Issues ranked by how many points each fix adds.
• Step-by-step fixes for WordPress, Shopify, Wix, Squarespace, Webflow, Next.js and Astro.
• A ready-to-paste prompt for Claude or another AI assistant on every issue, plus one prompt that fixes everything in order. Prompts tell the AI never to invent facts and to check the live site after changes.
• Before/after proof: save a "before" scan, make your fixes, scan again, and download a dated report for your client or boss.

Honest by design: every result is labeled as measured, an estimate, or not measured. Scores describe page health and AI-search readiness, not rankings.

Private: scans run in your browser. Nothing is sent to any server. History stays on your computer.

Works with the free, open-source CLAUDE SEO GOD MODE skill for Claude, which adds whole-site crawls, Search Console and Bing data, and client tracking: github.com/F0rger123/CLAUDE-SEO-GOD-MODE
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
Checks the web page the user is viewing for SEO, answer-engine and AI-search readiness, explains how to fix each issue, and compares scans before and after fixes.
```

**Permission justifications:**
| Permission | Justification to paste |
|---|---|
| activeTab | Lets the extension read the page the user chooses to scan when they click the extension. |
| scripting | Runs the read-only page check (titles, headings, structured data, images, links) in the tab the user is scanning. |
| storage | Saves the user's scan results on their device so they can compare before and after. |
| sidePanel | Shows the scan results, fix steps and before/after comparison in Chrome's side panel. |
| Host permissions (optional, requested per site) | Requested only for the site the user scans, to fetch that site's robots.txt, sitemap and a test URL. These checks can't be done from the page alone. |

**Remote code:** No, I am not using remote code. All JavaScript is included in the package.

**Data usage:** tick nothing in "collects" (the extension doesn't collect or transmit user data). Then certify the three statements: you don't sell data, don't use it for unrelated purposes, and don't use it for creditworthiness.

**Privacy policy URL:** https://github.com/F0rger123/CLAUDE-SEO-GOD-MODE/blob/main/docs/PRIVACY.md

## Distribution tab

- **Visibility:** Public (anyone can find it). Choose Unlisted if you only want people with the link to install it.
- **Regions:** All regions.
- **Pricing:** Free.

## Before each update

1. Bump `version` in `extension/manifest.json`. The store rejects a re-upload with the same version.
2. `python scripts/build_extension_zip.py`, then upload the new zip on the Package tab and submit for review.
