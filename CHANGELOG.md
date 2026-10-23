# Changelog

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
