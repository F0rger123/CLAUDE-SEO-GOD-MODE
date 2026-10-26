# Changelog

## 2.11.0 (2026-10-26): extension 1.6: business / client / competitor roles and competitor comparison

- Track: every site is **My business**, **Client (I manage its SEO)** or **Competitor** (linked to a business). The list is grouped by role; the role and name can be edited.
- **You vs competitors** on each business or client: latest scores side by side, a shared overall-score chart, checks where a competitor is clearly ahead (from the latest full scans) with a fix prompt, search positions for your keywords across all of them, and one button to rescan the group.
- Compete: "+ Track" on a results row adds that site as a competitor of the chosen business; "Your website" lists only your businesses and clients.
- Summary: a 100/100 site (or one with nothing failing) now says there's nothing you need to do, instead of "only small polish left"; the potential card says nothing is left to fix.

## 2.10.1 (2026-10-26): extension 1.5.1: Compete checked against real Google pages

Ran the reader on a live Google results page, a business panel and a Google Maps place page (in a normal Chrome session) and fixed what didn't match:
- Review count on the search panel read 9522 instead of 522 (Google prints "4.9522 Google reviews" with the rating glued on); it now reads the element that holds only the count.
- Category on the panel included the rating text; now just the category ("Roofing contractor").
- "Own this business?" was treated as unclaimed, but Google shows it on claimed profiles too. Only "Claim this business" now counts as unclaimed.
- The description came from the service-area field; it now reads the owner's description. Posts, booking links and social profiles are read from the panel's own fields.
- Map pack entries hidden under "more places" had names and categories run together; review counts like "3K" now read as 3000.
- Icon glyphs before addresses are stripped.
Confirmed correct on the live pages: organic results (ads skipped), People also ask, related searches, map pack ratings and counts, and every Maps field (rating, reviews, category, address, phone, website, hours, photos, posts, booking).

## 2.10.0 (2026-10-26): extension 1.5: Compete, Business Profile audit, Track with history charts, one-click updates

- **Compete view:** reads the Google results page you open (it never searches by itself): your position, the top results with directories and ads skipped, the map pack. **Compare** fetches the top pages and compares 21 on-page factors with yours, then lists where they're ahead with fixes, topic gaps, questions to answer (People also ask and their headings), a content brief, and a fix prompt. Backlinks and domain age are listed as not measured.
- **Keyword ideas:** Google autocomplete expansion (plus People also ask and related searches), grouped into questions, buyer searches, comparisons and related, with title/heading/body coverage for your page and the changes to make.
- **Business Profile audit:** from a Google Maps place page or the panel beside search results: claimed, category, rating and reviews vs the map pack, website, phone, address, hours, photos, description, posts, Q&A, name stuffing. Fields not on screen stay grey.
- **Track view:** follow any number of sites; every whole-site scan adds a score point and every analyzed search records each site's position. Charts for score and keyword history, per-site keyword lists, rescan all, export/import. `unlimitedStorage` so history keeps growing.
- **Updates:** the extension checks GitHub Releases daily and shows a banner. Unpacked installs can turn on one-click updates (`scripts/updater/install_updater.py`, a native messaging helper that installs the release into the same folder and reloads). History is kept across updates.
- Tests: the e2e test drives Compete on a locally served stand-in for a Google results page, the profile audit, Track and the update check; `tests/test_updater.py` covers the helper (protocol, version check, refusing foreign or path-escaping zips).

## 2.9.0 (2026-10-26): competitor and search-demand checks in the loop; extension 1.4 (potential score, free, built by Agency Zero)

- **`scripts/loop/compete.py`:** `find` (the service × area searches to run, plus Google autocomplete phrasing), `add` (save a competitor), `scan` (rate you and up to 5 competitors with the `rate_site.py` rubric; list checks they beat you on, topic and page gaps, customer-question gaps and schema gaps), `trends` (autocomplete phrasing, Bing search volumes and trend if connected, rising Search Console queries, and which searches no page answers).
- **The loop uses it:** `seo_loop.py scan` adds `competitor_gap` and `trend` opportunities from the last month's scan, weighted by what has worked on the site. `workflows/seo-loop.md` covers finding competitors on the first run and the monthly refresh.
- **MCP:** `seo_competitor_scan` and `seo_search_demand` (31 tools).
- **Agent guide:** pasting the repo link with "use this for my website" now walks the agent through the interview (including services, towns and competitors), a plain-English "how it works" breakdown, what to set up, install and the first rating (`AGENTS.md`, `docs/SETUP_WIZARD.md`, README, `llms.txt`).
- **Extension 1.4:** a Now → Potential score card (potential after the top 5 fixes, and after every fix) with a ghost arc on the dial; the summary and fix prompt state the potential too. "Built by theagencyzero.com" in the panel and proof report. Store name "SEO God Mode - Free Agentic SEO, AEO & GEO Audit".
- Tests: `tests/test_compete.py` (offline fixtures), MCP smoke test covers the new tools.

## 2.8.0 (2026-10-26): extension 1.3: whole-site rating identical to the skill, typed summary, fix prompts

- **Whole-site view (new default):** `extension/lib/siterate.js` ports `scripts/rate_site.py` to the browser: the same polite crawl (robots rules, sitemap seeding, up to 30 pages), sitemap and link checks, the answer check, 39 checks with rubric v2.0 weights, point gains, priority order and fix kits. `lib/pyparse.js` reads HTML the way the Python parsers do.
- **Parity test:** the e2e test runs `rate_site.py --no-psi` and the extension on the same good and bad sites and fails on any difference in scores, check ratios or top fixes. Both currently match exactly.
- **AI crawler firewall probe in the browser:** a short-lived declarativeNetRequest session rule sets each AI crawler's user-agent for one homepage request, so the extension catches CDN/WAF blocks like the skill does.
- **Typed summary:** after a scan the panel types out the verdict, weakest area, biggest wins (with page counts), one-time setup items and what already works. Click to skip; reduced motion shows it instantly.
- **Fix prompt wording:** the "Claude" tab and buttons are now "Fix prompt" / "Copy fix prompt". Prompts adapt to the failed checks and include affected pages and ready-made snippets (robots.txt groups, starter schema, title and description lists).
- Proof works per view (site or page), and the report says which. PageSpeed Insights is called for the homepage on whole-site scans (skipped for local addresses); the privacy policy and store listing say so.

## 2.7.0 (2026-10-26): extension 1.2: 78 checks, Tools tab, animated UI; marketingskills

- **78 checks** (was 33). SEO 50: crawl/index, on-page, links and images, speed, structured data. AEO 12. GEO 16. Ideas drawn from claude-seo, geo-optimizer (citability), marketingskills `ai-seo`, and Google's AI features guide.
- **Tools tab:** Google result preview with pixel-measured title width, share preview, heading outline, schema inspector (Rich Results and schema.org links), a 17-crawler access table, links, images, page facts, quick links.
- **UI:** Overview tab (biggest wins, a per-area segment map, page facts), filterable and searchable Issues, sliding tab indicator, count-up scores, dial and bar animations, staggered rows, smooth expand, toast confirmations, staged scan progress, an empty state. Reduced motion respected.
- **Exports:** scan JSON, checks CSV, issue list.
- **A live run caught false positives, now fixed:** brand-in-title ignores "Co./LLC/Inc"; knowledge-graph profiles accept maps.google/g.page/Yelp/BBB; text-to-code ratio excludes scripts; quotable paragraphs needs 3 (not 30%); the definition check reads the first paragraphs and the description; compression is UNKNOWN when the browser hides it.
- **Skill:** vendored 9 skills from coreyhaines31/marketingskills (MIT): site-architecture, programmatic-seo, link-building, directory-submissions, copywriting, copy-editing, cro, competitor-profiling, ai-seo. Ryze and geo-optimizer were re-checked with no content changes. Illyism still has no license and stays uncopied.

## 2.6.0 (2026-10-26): extension 1.1: new look, download button, skill links, Web Store kit

- New design: fog, navy and ultramarine palette (no orange). One overall dial plus SEO/AEO/GEO bars, a segmented tab control, quiet issue rows, and evidence labels in plain words (Measured, Estimate, Not measured). Light and dark modes. The proof report, rating report and README banner share the palette.
- Uses the skill: each issue links to its workflow guide, prompts include that guide and the skill command that checks the whole site, and the Claude tab lists whole-site skill commands.
- Download: `scripts/build_extension_zip.py` plus a release workflow that tests the extension, then publishes `seo-god-mode-extension.zip`. README download buttons.
- Chrome Web Store kit: `store/LISTING.md` (copy, category, permission justifications, data-use answers), `docs/PRIVACY.md`, and `store/make_images.py` for the 1280×800 screenshots and 440×280 tile. The store name drops "Claude" to avoid a trademark rejection.

## 2.5.0 (2026-10-26): Chrome extension

- `extension/`: Manifest V3 side panel with 33 SEO, AEO and GEO checks on the live page. It also fetches robots.txt (Google matching rules), the sitemap, a random URL to test for 404s, and the http:// variant.
- Fix steps per platform (WordPress, Shopify, Wix, Squarespace, Webflow, Next.js, Astro). Every issue gets a Claude prompt, plus a "fix everything" prompt with built-in rules ([CONFIRM] for unknown facts, verify live after deploy, CDN-level HTTPS).
- Before/after: mark a baseline and rescan to get score deltas and fixed/improved/regressed checks, plus a downloadable HTML proof report. History stays on the device.
- First live-site run caught a false positive: the FAQ check only searched the first 2,000 characters of text, so FAQs lower on the page looked missing. It now checks the whole page and normalizes curly quotes.
- Playwright end-to-end test loads the real extension, scans good and bad fixture sites, fixes one and verifies the proof report. Runs in CI.

## 2.5.0 (2026-10-25): self-learning SEO loop

- `scripts/loop/seo_loop.py`: `scan` (CTR gap on page 1, striking distance 8-20, searched-but-unanswered, cannibalization, declines; prints `ACTIONABLE: n`), `record` (stores each change with its 28-day before-numbers), `evaluate` (after 28 days marks win, loss or flat and updates `learnings.json` weights per change type), `status`.
- `workflows/seo-loop.md`: per-site `seo-loop.json` guardrails (allowed change types, never-change list, max 3 changes per run, cooldown, auto-deploy commands) and a weekly low-usage run that stops early when nothing is actionable.
- Handles Git Bash path mangling (`C:/Program Files/Git/path`) in page arguments.
- First live use: a local service business, with 8 changes recorded and evaluation due in 28 days.

## 2.4.0 (2026-10-25): Claude GEO SEO, claude-ads companion, Apple Maps

| Added | Why / notes |
|---|---|
| Vendored 6 skills and 3 scripts from **geo-seo-claude** (MIT) | Passage citability scoring, off-site brand presence, per-AI-platform tips, and agency prospect/proposal/compare. The overlapping audit, schema, crawler, llms.txt and report parts were not copied (primary skills already exist). ATTRIBUTION.md flags its unverified market stats and placeholder brand checks. |
| **claude-ads** as a companion plugin (`docs/ADS.md`) | 12 ad platforms, approval-gated changes. Installed alongside rather than copied (~430 files), with SEO↔ads overlap guidance. |
| **Apple Maps**: `scripts/integrations/apple_maps.py`, MCP `apple_maps_check`, `connect.py apple`, `workflows/apple-business-connect.md` | Official Apple Maps Server API presence check (signed ES256 token, scope `server_api`, offline-tested). Editing stays in Apple Business Connect (browser-assisted). The Apple Business API is partner-only. |
| MCP `geo_citability` | Wraps the vendored scorer; results are INFERRED. |

## 2.3.0 (2026-10-23): lessons from a live local-business engagement

From a real engagement with a local service-area business (permanent lighting installer, York, PA):

| Problem hit | Fix |
|---|---|
| MCP server failed with "Connection closed" because the `mcp` package wasn't installed | `scripts/setup/connect.py status` detects it; `connect.py deps` installs it |
| Owner downloaded the service-account key and couldn't find "the email" to add in Search Console | `connect.py gsc --find` moves the key out of Downloads, saves the setting, and prints the exact email and clicks |
| Bing key, GSC key and PageSpeed key each needed manual env-var setup | `connect.py bing --key` (validated against Bing first) and `connect.py pagespeed --key` save them per user |
| Owner-facing setup steps were scattered | `docs/CONNECT.md`: word-for-word steps for agents to relay |
| A new agent had no single "what do I do" file | `START_HERE.md`: setup check, owner communication, proven order of work, false positives, environment gotchas |
| Titles flagged at 100+ characters on pages with an inline SVG map | `PageParser` ignores `<title>` inside `<svg>` and keeps only the first document title |
| "About and Contact pages" failed when contact lived at `/quote` | Also accepts ContactPage/AboutPage schema |

## 2.2.0 (2026-10-23): smarter rater, visual report, self-improvement loop

Findings from a self-audit of theagencyzero.com, python.org, and example.com, and what changed:

| Miss found in self-audit | Fix |
|---|---|
| Performance was blank whenever PageSpeed's free quota ran out | Estimated performance proxy (render-blocking scripts, stylesheets, HTML weight, image sizing, modern formats), labeled INFERRED, used only when PageSpeed is unavailable |
| Didn't notice http:// serving the site without redirecting (duplicate host) | New check: http and www/non-www variants must redirect to one canonical https host |
| Soft 404s went undetected | New check: a random URL must return 404/410 |
| No canonical-tag check in the rating | New check |
| Social check ignored og:description; tips had no copy-paste help | Social cards check covers og:title, og:description, and og:image, plus a filled-in tag kit |
| Contact details not checked for GEO | New check: tel:/mailto: link or schema telephone/email |
| Heading check missed pages starting at H3 | Now flags "start→H3" |
| Tips were generic | Fix kits: current titles and descriptions with lengths, starter Organization JSON-LD, sameAs block, robots groups, sitemap command (all facts as [CONFIRM]) |
| Plain-text report only; leaked temp file paths in chat | Visual `report.html` (score rings, category bars, ranked fix cards, page-by-page table, collapsible checks); the skill no longer prints temp paths |
| No regression protection | Offline fixture tests (good vs bad site), `scripts/dev/benchmark.py`, and a CONTRIBUTING self-improvement loop |

Also: the MCP server folder moved from `mcp/` to `mcp-server/`, so it no longer shadows the `mcp` Python package during test discovery. If you registered the server by path, update it.

Rubric version 2.0. Scores aren't comparable with 1.x: new checks were added, and GEO weights were rebalanced (Bing access 10→5, new contact-details check worth 5).
