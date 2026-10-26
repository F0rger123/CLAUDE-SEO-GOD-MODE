# Changelog

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
