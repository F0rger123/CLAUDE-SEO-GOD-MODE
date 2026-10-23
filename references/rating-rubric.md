# Rating rubric v2.0 (scripts/rate_site.py)

Published so every score is explainable and repeatable. Each check earns `ratio × weight` points. A score is points earned ÷ points possible × 100, counted only over checks that could be measured. UNKNOWN checks are left out; they are never scored as a pass or a fail.

**Overall = 60% SEO + 20% AEO + 20% GEO.** Grades: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F < 60.

**Fix order:** estimated overall points gained if fixed × impact (High 1.5, Medium 1, Low 0.6), with INFERRED checks discounted 20%. "Potential" = overall + the gains from the top 5 fixes (capped at 100).

## SEO

| Category | Check | Weight | How measured |
|---|---|---|---|
| Crawl & index | Homepage crawlable by Googlebot and Bingbot | 6 | robots.txt, Google longest-match rules |
| | HTTPS | 3 | final URL scheme |
| | One canonical host | 3 | http:// and www/non-www variants must redirect to the canonical https host (variants that don't resolve are skipped) |
| | XML sitemap reachable and clean | 5 | 50% if present, plus 50% if it lists no non-indexable URLs and has no problems |
| | Pages return 200 | 5 | share of crawled URLs |
| | Pages indexable | 6 | no noindex, robots allowed, self or absent canonical, no redirect |
| | Missing pages return a real 404 | 3 | random URL returns 404/410 (a 200 is a soft 404) |
| | Canonical tag on every page | 2 | share |
| | No broken or redirected internal links | 3 | −10% per broken or redirecting target |
| | Server-rendered content | 2 | pages not flagged as JS-only |
| On-page | Titles 25–60 chars and unique | 7 | in-range share × uniqueness |
| | Meta descriptions 70–170 chars | 4 | share |
| | Exactly one H1 | 4 | share |
| | Logical heading order | 2 | no skipped levels, including a page that starts at H3 |
| | Image alt attributes | 3 | share of images |
| | Viewport + html lang | 3 | share |
| | Social cards (og:title, og:description, og:image) | 2 | share |
| Content | 250+ words on indexable pages | 8 | share (INFERRED: length isn't quality) |
| | 2+ internal inlinks | 4 | share, excluding the homepage |
| | HTML response < 1 s | 3 | share |
| Structured data | Organization/LocalBusiness on homepage | 5 | JSON-LD types |
| | Valid JSON-LD | 3 | parse errors |
| | Page-level schema (Breadcrumb, Service, Article…) | 2 | any present |
| Performance | PageSpeed Insights mobile performance | 10 | score ÷ 100, plus CrUX field LCP/INP/CLS shown when available |
| | *or* estimated performance (PageSpeed unavailable) | 10 | INFERRED average of: render-blocking head scripts ≤ 2, stylesheets ≤ 4, homepage HTML ≤ 150 KB, images with width/height, modern image formats. Not Core Web Vitals. |

## AEO (answer engine readiness)

| Check | Weight | How measured |
|---|---|---|
| Snippet eligibility (no noindex/nosnippet/max-snippet:0) | 25 | observed blockers |
| Question-style headings | 20 | pages with at least one question H2/H3 (INFERRED) |
| Direct answer near the top (25–90 word opener) | 20 | opening paragraph length (INFERRED heuristic) |
| FAQ content; FAQ schema matches visible text | 15 | 1.0 matching FAQ schema; 0.5 schema with a mismatch; 0.6 three or more question headings without schema |
| Scannable structure (2+ H2 sections) | 10 | share (INFERRED) |
| Content in raw HTML | 10 | not JS-only |

## GEO (generative AI search readiness)

| Check | Weight | How measured |
|---|---|---|
| AI search crawlers allowed in robots.txt (Googlebot, Bingbot, OAI-SearchBot, PerplexityBot, Claude-SearchBot) | 20 | share allowed |
| No CDN/WAF blocking of those user agents | 15 | live homepage fetch per user agent; 401/403/429/503 = blocked (INFERRED: some WAFs verify by IP) |
| Business name stated in homepage text | 15 | entity name from schema or og:site_name |
| Location/service area in schema | 10 | scored only for local-type entities, or when declared |
| sameAs profiles | 10 | 3 or more = full |
| About and Contact pages | 10 | URL patterns |
| Contact details findable | 5 | tel:/mailto: link on the homepage, or schema telephone/email |
| Outbound source links | 10 | share of pages linking out (INFERRED) |
| Bing access | 5 | Bingbot allowed (ChatGPT search and Copilot use Bing's index) |
| llms.txt | 0 | reported only; Google Search doesn't use it |

## Never scored (UNKNOWN from a public crawl)

Rankings, clicks, impressions, queries, index status, backlinks, brand mentions, AI citations, Google Business Profile, and real Core Web Vitals when PageSpeed is unavailable.

## Changelog

- **v2.0:** added canonical host, soft 404, canonical tag, contact details, og:description, start-of-page heading skips, estimated performance, fix kits, and potential score. Rebalanced GEO (Bing 10→5, contact details 5).
- **v1.0:** initial rubric.
