# Privacy policy: SEO God Mode browser extension

_Last updated: 2026-10-26 (extension 1.5)_

SEO God Mode ("the extension") checks web pages for SEO, AEO and AI-search readiness. It's published by Agency Zero (https://theagencyzero.com) as part of the open-source CLAUDE SEO GOD MODE project.

## What the extension accesses

When you press **Scan**, the extension reads the page you're viewing and requests files from that same website: `robots.txt`, the XML sitemap, `llms.txt`, one made-up URL (to check that missing pages return 404), and the site's `http://` and `www`/non-`www` addresses. A **whole-site** scan also loads up to 30 of the site's pages (following its links and sitemap, and respecting robots.txt), and requests the homepage once with each of five search-crawler user-agents to see whether a firewall blocks them. It only does this for sites you choose to scan, after you grant access to that site.

One request goes to a third party: a whole-site scan asks **Google PageSpeed Insights** (`www.googleapis.com`) to test the site's homepage URL, the same as visiting pagespeed.web.dev. Only that public URL is sent. Local addresses (localhost and private networks) are never sent. If you add your own PageSpeed API key, it's stored only in the extension's local storage and sent only to Google with that request.

**Compete view (only when you use it):** it reads the Google search results page or Google Maps page you have open (what's on screen), loads the web pages ranking there to compare them with yours, and sends the keyword you type to Google autocomplete (`suggestqueries.google.com`) for keyword ideas. It never runs Google searches by itself.

**On Google overlay (only if you turn it on):** it reads the Google results pages you open, and when you hover a result it loads that one page to rate it. If "record my positions" is on, it saves where your tracked sites rank for that search, on your computer. Notifications, if you allow them, are shown by Chrome on your computer.

**Updates:** once a day it asks GitHub for the latest release number. If you turn on one-click updates, a small helper on your computer downloads the release zip from GitHub into the extension folder you chose. Nothing about you is sent.

## What it stores

Scan results (scores, check results and the page facts behind them) are saved in your browser's local extension storage on your device, so you can compare before and after. It keeps up to 25 full scans per page and per site, plus a compact history for the sites you track (scores over time and the keyword positions you recorded). Export it from the Track view to back it up. You can remove them at any time by removing the extension or clearing its data.

## What it shares

Nothing about you. The extension has no servers, no analytics, no advertising and no accounts. Apart from the requests listed above, it doesn't send, sell, transfer or share any data with anyone. Prompts and reports leave your device only when you copy or download them yourself.

## Contact

Questions: agencyzeroteam@gmail.com or https://github.com/F0rger123/CLAUDE-SEO-GOD-MODE/issues
