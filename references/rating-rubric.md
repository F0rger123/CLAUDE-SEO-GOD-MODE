# Rating rubric (scripts/rate_site.py)

Published so scores are explainable and repeatable. Each check earns `ratio × weight` points; a category score is earned ÷ possible × 100 over checks that could be measured (UNKNOWN checks are left out, never scored as zero or full).

**Overall = 60% SEO + 20% AEO + 20% GEO.** Grades: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F < 60.

Fix-list order: estimated overall points gained if fixed × impact (High 1.5, Medium 1, Low 0.6), with INFERRED checks discounted 20%.

## SEO

| Category | Check | Weight | How measured |
|---|---|---|---|
| Crawl & index | Homepage crawlable by Googlebot and Bingbot | 6 | robots.txt, Google longest-match rules |
| | HTTPS | 3 | final URL scheme |
| | XML sitemap reachable and clean | 5 | 50% present, 50% no non-indexable URLs / problems |
| | Pages return 200 | 5 | share of crawled URLs |
| | Pages indexable | 6 | no noindex, robots allowed, self/absent canonical, no redirect |
| | No broken or redirected internal links | 3 | −10% per broken/redirect target |
| | Server-rendered content | 2 | pages not flagged JS-shell |
| On-page | Titles 25–60 chars and unique | 7 | in-range share × uniqueness |
| | Meta descriptions 70–170 chars | 4 | share |
| | Exactly one H1 | 4 | share |
| | Logical heading order | 2 | no skipped levels |
| | Image alt attributes | 3 | share of images |
| | Viewport + html lang | 3 | share |
| | Open Graph title + image | 2 | share |
| Content | 250+ words on indexable pages | 8 | share (INFERRED: length ≠ quality) |
| | 2+ internal inlinks | 4 | share, excluding homepage |
| | HTML response < 1 s | 3 | share |
| Structured data | Organization/LocalBusiness on homepage | 5 | JSON-LD types |
| | Valid JSON-LD | 3 | parse errors |
| | Page-level schema (Breadcrumb, Service, Article…) | 2 | any present |
| Performance | PageSpeed Insights mobile performance | 10 | score ÷ 100; UNKNOWN if PSI unavailable |

## AEO (answer engine readiness)

| Check | Weight | How measured |
|---|---|---|
| Snippet eligibility (no noindex/nosnippet/max-snippet:0) | 25 | observed blockers |
| Question-style headings | 20 | pages with ≥ 1 question H2/H3 (INFERRED) |
| Direct answer near the top (25–90 word opener) | 20 | opening paragraph length (INFERRED heuristic) |
| FAQ content; FAQ schema matches visible text | 15 | 1.0 FAQ schema matching, 0.5 schema with mismatch, 0.6 three+ question headings without schema |
| Readable structure (2+ H2 sections) | 10 | share (INFERRED) |
| Content in raw HTML | 10 | not JS-shell |

## GEO (generative AI search readiness)

| Check | Weight | How measured |
|---|---|---|
| AI search crawlers allowed in robots.txt (Googlebot, Bingbot, OAI-SearchBot, PerplexityBot, Claude-SearchBot) | 20 | share allowed |
| No CDN/WAF blocking of those user-agents | 15 | live homepage fetch per UA vs browser UA; 401/403/429/503 = blocked (INFERRED: some WAFs verify by IP) |
| Business name stated in homepage text | 15 | entity name from schema/og:site_name |
| Location/service area in schema | 10 | only scored for local-type entities or when declared |
| sameAs profiles | 10 | 3+ = full |
| About and Contact pages | 10 | URL patterns |
| Outbound source links | 10 | share of pages linking out (INFERRED) |
| Bingbot allowed (ChatGPT search/Copilot use Bing's index) | 10 | robots.txt |
| llms.txt | 0 | reported only; Google Search does not use it |

## Never scored (UNKNOWN from a public crawl)

Rankings, clicks, impressions, queries, index status, backlinks, brand mentions, AI citations, Google Business Profile, real-user Core Web Vitals beyond the PSI CrUX sample.
