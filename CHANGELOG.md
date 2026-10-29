# Changelog

## 2.19.2 (2026-10-29): extension 1.14.2 and app: tap the email's Log In link

- **Tapping Log In works now:** the link used to land on a broken localhost:3000 page. It now lands on SEO God Mode's sign-in page (on GitHub Pages). On Android that page opens the app and signs you in; on a computer it has **Copy sign-in** to paste into the extension. The sign-in stays in your browser; the page never sends it anywhere.

## 2.19.1 (2026-10-29): extension 1.14.1 and app: sign in with the emailed link

- **Sign-in works with Supabase's standard email:** its built-in sender only allows a "Log In" link, not a code, unless you set up your own mail server. Sign-in now takes that link: copy it from the email (press and hold or right-click Log In) and paste it in. If you already opened the link, pasting the address of the page it opened also works. A code still works if the email has one.

## 2.19.0 (2026-10-28): extension 1.14 and the Android app: phone sync

- **Android app** (`mobile/`): your businesses, clients and competitors with their scores, score history, summary and fix prompt from the newest scan, keyword positions and keyword report, and each business next to its competitors. Paste a link to look a site up or add it, and **+ Quick add** a client, a website of yours or a competitor (then whose). Same look, scores and wording as the extension, because it uses the extension's own code. Download the APK from the `android-app` release; GitHub builds a new one whenever the app changes.
- **Sync with your phone** (Settings, off until you sign in with an emailed link): tracked sites, keywords, score history, positions, keyword reports and the newest whole-site scan of each site are kept in SEO God Mode's online database, where only your sign-in can read them. Changes go both ways about once a minute. Sites added on the phone are listed at the top of Track with **Scan now**.
- Scanning websites and checking Google positions still run only in the extension.

## 2.18.0 (2026-10-28): extension 1.13: Quick add, and what to do once the page side is done

- **Quick add:** a **+ Quick add** button in the header adds the site in the current tab as a client, a website of yours, or a competitor. For a competitor it then asks whose competitor it is. It opens the usual Track steps with the address filled in.
- **Once a site is ahead on the page, it says what's next:** when a page scores at or above the pages it competes with (hover cards, breakdowns, the keyword report and You vs competitors in Track), or a site scores 85 or more, the summary now says the next biggest wins are off the website: more Google reviews, a stronger Google Maps listing (Business Profile) and links from other websites, and that there's nothing else on the page that would move it much. The fix prompts say the same.

## 2.17.0 (2026-10-27): extension 1.12: Check updates positions, keyword report, new keywords to try

- **Check updates your position:** Check next to a tracked keyword used to open Google in a new tab, and the position only changed if the overlay was on, and never twice within an hour. Now Check searches the keyword on Google in a background tab, reads the results and updates the position on the spot. **Check all keywords on Google** does every keyword (up to 15), one every few seconds. A newer reading within the hour replaces the old one instead of being ignored.
- **Keyword report after every check:** counts of keywords in the top 3, on page 1, and further down. For each keyword not in the top 3, it compares your page with the top three results automatically: who's on top, your on-page score next to theirs, a sentence on why, and what to change. **Copy fix prompt** covers all of them, closest to the top first, and lists the top-3 keywords to protect.
- **New keywords to try:** from the People also ask questions and related searches on the results pages it read, minus keywords you already track, each with **Check** and **+ Track**.
- If Google shows a robot check, checking stops and the tab comes forward for you to solve. It never tries to get past one.
- Hover cards and breakdowns now say "this page 52, theirs 60 on average" instead of "60 vs 52".

## 2.16.0 (2026-10-26): extension 1.11: scan button shows progress, hover scores make sense

- **Scan button fills up:** while a scan runs, the button turns dark and fills with white from left to right as each step finishes (crawling, sitemap, PageSpeed, scoring).
- **Hover scores are now "on-page" scores, shown next to the others':** the card shows the compared pages' scores on the same yardstick ("Others: #2 70 · #3 58") and one sentence that explains the position. A #1 result with a lower score than the pages below it now says its lead comes from links, reviews, brand or site age, which this can't measure.
- **Same result, same score:** page load time is still shown but no longer counts toward the score (one timed fetch swung by seconds and moved the number), and a result's breakdown is kept for an hour, so hovering it again gives the same numbers.
- **Fixed:** "See full breakdown" and "Copy fix prompt" could be cut off below the bottom of the window on a long card. They now sit in a footer that's always visible, and the card always fits on screen.

## 2.15.1 (2026-10-26): extension 1.10.2: updates find the real newest version

- **Fixed:** in Track new site, keywords you were typing were erased if the suggestions finished loading at that moment.

- **Fixed:** the one-click updater and the extension's "Check again" took the first release in GitHub's list as the newest. GitHub listed 1.8.0 above 1.10.0, so both reported 1.8.0 and never offered 1.10. They now compare version numbers.

## 2.15.0 (2026-10-26): extension 1.10: rating colours, delete what you track, finishes its own updates

- **Rating colours on the black and white base:** green for good (85+, passing, top 3), amber for fair (65 to 84, partial, 4 to 10), red for poor (under 65, failing, below 10). Scores, bars, dials, check marks, search positions, the hover card's score and the labels and launcher on Google use them. Everything else stays black and white.
- **Delete what you track:** a × on each tracked site (with a confirm step) stops tracking it and deletes its score history, positions and saved scans; competitors linked to it are kept, unlinked. A × on each keyword deletes it and its positions. Settings → Your data → **Delete all tracked sites and history**.
- **Finishes its own updates:** when new files are on disk but Chrome is still running the old code (the cause of old colours showing after an update), the panel says so with a **Reload now** button, and the background reloads itself after the next Google search or daily check.
- **Fixed:** a scan finishing in the background redrew the site page while you were editing its name or role, closing the form or resetting your choice.

## 2.14.0 (2026-10-26): extension 1.9: full breakdown of any Google result, compared with the pages above it

- **Hover cards are a real breakdown now**, not a rough estimate. The page and up to three results ranking above it (or, for #1, right below it) are read and compared on the same 21 on-page factors as Compete. The card shows a search match score, the site's full rating if it was scanned, why it ranks there, a side-by-side table with those pages, what they do differently, **Copy fix prompt** and **See full breakdown** (was "Compare all results in SEO God Mode").
- **See full breakdown** opens that result in the side panel with the same numbers: why it ranks, what the pages above it do differently with the fix for each, every factor side by side, a fix prompt, **Rate the whole site** (opens it and runs the 39-check rating) and **Track as competitor**.
- **Why they rank** lists every result as a link to its own breakdown, with "‹ Why they rank" to go back. The last search stays available after you leave Google (for example after clicking through to #1), so the panel no longer gets stuck.
- **Labels on Google** follow Google's own light or dark theme (a solid black label looked inverted on dark Google) and sit on their own line above the result. "You" is now "Your site" or "Your client".
- The breakdown runs in an offscreen document (new `offscreen` permission: a hidden extension page that can parse HTML; no new access to sites or data).

## 2.13.0 (2026-10-26): extension 1.8: black and white redesign, hosting and tech, step-by-step Track new, clearer Compete

- **Fixed:** "Check for updates and due rescans" and the "Show on Google results" switch failed with "Could not establish connection. Receiving end does not exist." They sent a message to the background worker, which wasn't listening (for example after the files were replaced without a reload). Both now run in the panel itself (`lib/daily.js`, shared with the worker's daily alarm), so they work whatever state the worker is in. Hover cards on a Google page opened before an update now say to reload the page instead of showing the raw error.
- **Black and white redesign:** inverted black header, black pill buttons, switches, and no status colours. How complete a check is shows as how filled its mark is (solid passing, half partial, hollow failing); chart lines are told apart by dash pattern. The Google hover cards and labels match. Dark mode swaps black and white.
- **Hosting and tech:** Site, Track and the Google hover cards show what a site is built with (WordPress, Shopify, Wix, Webflow, Next.js and 30+ more), its hosting and CDN (Cloudflare, Vercel, Netlify, WP Engine, Kinsta, AWS...), web server, DNS and email providers (from public DNS records via dns.google), and tracking tools (GA4, Tag Manager, Meta Pixel, CallRail...).
- **Compete** opens on a home screen: where your site ranks for every search you've made (position, change, when checked), suggested keywords, and three tools. Each tool opens by itself with "‹ Compete" to go back, and long results fold away. Suggestions and keyword ideas leave out keywords you already track or have searched, and say how many were left out.
- **Track new site** walks through adding a site one step at a time: address, what it is to you (my business, a client, a competitor), whose competitor, and which searches it should rank for (suggested from its pages). "Add a competitor" on a business uses the same steps.
- **Settings** replaces the On Google tab: Google overlay, reminders, updates ("Check again" also recounts sites due a rescan and sets the badge) and export/import.

## 2.12.0 (2026-10-26): extension 1.7: SEO God Mode on Google, detected keywords, auto-rescan, notifications, verified updates

- **On Google** view (replaces the Page button; single-page scans moved to Site → "Just this page"). Once turned on, Google results get role labels with positions, hover cards (quick 0–100 rating, keywords the page targets, why it shows for the search, gaps), a launcher that opens Compete, and automatic position recording for tracked sites. Built in a Shadow DOM with text only; nothing fetched is injected as HTML.
- **Compete detects what your site targets** from its own titles, headings and schema ("roof repair york pa") with one-click Search, Ideas and Track.
- **Track:** adding a site (or "+ Track" in Compete) scans it straight away.
- **Notifications and badge:** a daily check for a new version and for tracked sites due a rescan (3/7/14/30 days), shown as an icon badge and, if allowed, a Chrome notification.
- **Updates:** "Check again" visibly asks GitHub and shows when it last checked and the newest version; errors are shown instead of silence. The one-click updater now picks the release through the GitHub API, follows redirects only to GitHub hosts, and verifies GitHub's SHA-256 checksum before writing anything.

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
