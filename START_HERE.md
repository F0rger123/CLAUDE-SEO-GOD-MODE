# START HERE (for any agent picking up this skill)

Read this first, then `RULES.md`, then `SKILL.md`. It is short on purpose: what to do, in what order, and the mistakes already made once on a real client so you don't repeat them.

## 0. First two minutes

1. `python scripts/setup/connect.py status`: shows which data sources are connected and the one next step for each.
2. If the `seo-god-mode` MCP server failed to connect ("Connection closed"), Python is missing packages. Run `python scripts/setup/connect.py deps` and tell the owner to restart Claude Code. The scripts work without the MCP server, so carry on with them meanwhile.
3. If OpenSEO's MCP is connected, check `list_projects`. It may already read the site's Search Console data at no credit cost.

## 1. Talking to the owner

- Owners are usually not technical. Give exact clicks and URLs, one connection at a time, using `docs/CONNECT.md` word for word.
- Ask everything you need in one message, grouped: links, access, decisions. Don't drip questions across turns.
- Never ask for a key file's contents in chat. Ask them to download it; `connect.py gsc --find` picks it up from Downloads.
- After they hand over a key, run the matching `connect.py` command immediately, say what it unlocked, and keep working.
- Ask before changing prices, legal wording, guarantees, or any business claim. Say plainly what changed and why.
- Never invent reviews, review counts, hours, addresses, coordinates, years in business, or certifications. Use what the site, the Google Business Profile, or the owner states. For a service-area business, don't publish the GBP pin as `geo`: it is often the owner's home.

## 2. The order that worked (local service business)

1. **Score:** `python scripts/rate_site.py <url> --out <dir>`. Verify each top fix against the live page before acting (see false positives below).
2. **Deep audit:** `python scripts/audit.py --url <url> --out <dir> --max-pages 500 --external`. Read `summary.md` only.
3. **Real search data:** Search Console queries × pages for 3 months. Look for striking distance (positions 5–25), cannibalization (a guide outranking the money page), and junk geography to ignore.
4. **Local pack:** Google Maps results for 2–3 money terms from the main town. Record rank, review counts, categories. Review count is usually the gap.
5. **Keyword volumes:** one batch call for about 20 candidate terms. Map each term to one URL.
6. **Competitors:** a light crawl (60 pages, 1 s delay) of the 2–3 map-pack leaders. Compare architecture and positioning. Never copy text.
7. **Fix:** answer-first openers (25–90 words), question headings, titles of 60 characters or fewer including the brand, schema facts matching the GBP (hours, phone, email), a real Contact page, and internal links to weakly linked pages.
8. **Re-score, deploy, then notify:** IndexNow plus Bing `submit-urls` for changed pages. Google has no indexing API for normal pages; check Search Console in 2–6 weeks.
9. **Write it up:** a plain-language report with OBSERVED/INFERRED/RECOMMENDED/UNKNOWN tags, plus owner tasks (reviews, citations/sameAs, GBP posts, real customer questions).

## 2b. Index check (after Search Console is connected)

- `python scripts/integrations/gsc.py inspect --site sc-domain:<domain> --urls-file urls.txt --out inspect.json`, with URLs taken from the live sitemap. Group by `coverage`.
- "Discovered - currently not indexed" on a young site usually means low priority, not a penalty. Add contextual body links (not just the footer) from the homepage and money pages, make the page clearly unique, resubmit the sitemap (`gsc.py sitemaps submit`), then ask the owner to press **Request indexing** in URL Inspection for those URLs. There is no API for that button.
- Bing: `bing.py crawl-stats` shows the index count; `bing.py submit-urls` (100 per day) pushes the pages directly.

## 2c. Keep improving (the loop)

Once the one-time work is done, set up `workflows/seo-loop.md`: a `seo-loop.json` in the site repo plus a weekly run. It scans Search Console for page-1-but-not-clicked, striking-distance, searched-but-unanswered, and cannibalized queries; changes up to 3 pages; records them; and after 28 days scores each change and re-weights what to try next. Most weeks it stops at `ACTIONABLE: 0`, which keeps usage low.

## 3. Known false positives (check before you "fix")

- **Long titles from SVG:** inline `<svg><title>` (maps, icons) used to be glued onto the page title. Fixed in `common.py` (SVG titles are ignored). If an old report shows a title over 100 characters, view the page source first.
- **"No Contact page":** a site may put contact details on `/quote` and redirect `/contact`. The rater now also accepts ContactPage/AboutPage schema.
- **"No direct answer":** the rater takes the first `<p>` with 8 or more words. A byline ("By Company · Updated …") in a `<p>` counts as the opener. Put bylines in a `<div>`.
- **Performance 100 "estimated":** without `GOOGLE_API_KEY` the speed score is a proxy. Say so.
- **"http doesn't redirect to https" on Cloudflare-hosted sites (Workers/OpenNext/Pages): fix it in Cloudflare, never in app code.** Turn on SSL/TLS → Edge Certificates → **Always Use HTTPS** (the owner flips it, or ask for API access). Don't add a Next.js `redirects()` rule keyed on `x-forwarded-proto`: behind Cloudflare that header reads `http` on *every* request, and on OpenNext the `:path*` isn't substituted. On 2026-10-25 that took theagencyzero.com down (every page 308 to `/:path*`) for about 10 minutes until it was reverted.
- **After any change that deploys:** load the live homepage and 2–3 pages and check for HTTP 200 within a few minutes of the deploy. A local `next start` build doesn't reproduce the CDN in front of the site.

## 4. Environment gotchas

- `python -I` ignores user site-packages, so `import mcp` fails even when installed. Run the skill's own scripts without `-I`. Use `-I` only for scripts that read untrusted downloaded files.
- Git Bash on Windows rewrites arguments that start with `/` into Windows paths (`/contact` becomes `C:/Program Files/Git/contact`). Prefix with `MSYS_NO_PATHCONV=1` when passing URL paths to any script.
- On Windows, `connect.py` saves settings with `setx`. New terminals and a restarted Claude Code see them; the current shell does not, so export them for the current session too.
- OpenSEO and DataForSEO calls cost credits. Check `whoami` first, batch keywords in one call, and prefer free Search Console data.

## 4b. Social profiles and listings

Facebook, Instagram, Buffer, Yelp, Nextdoor, Bing Places, Apple: what can and can't be connected, and the owner steps, are in `references/social-and-listings.md`. Posting always needs the owner's yes on each post.

## 5. Where things go

- Client reports: inside the client's own project (for example `docs/seo-rating/`), not temp folders. Mention file names, not temp paths.
- Lessons that would help the next client: add them to this file and `CHANGELOG.md` in the same change.
