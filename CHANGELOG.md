# Changelog

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
