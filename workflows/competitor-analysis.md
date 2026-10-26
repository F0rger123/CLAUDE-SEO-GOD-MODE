# Workflow: Competitor analysis

Goal: understand why competitors outrank the client and find gaps the client can fill honestly. Output: `reports/competitor-report-<date>.md` from `templates/competitor-report.md`.

**Never copy competitor text, images, or reviews.** Study structure, coverage, and signals; write original content.

## 1. Identify competitors

- **Business competitors**: `profile.competitors` (who the client loses jobs to).
- **SERP competitors**: who ranks for the top 5–10 money keywords (manual SERP check from the target area, or paid SERP API). Directories (Angi, Yelp, Houzz) count: note them, but compare against real businesses.
- **Map-pack competitors**: top 3 for "service + city" (see `local-seo.md`).

Pick 3–5 to analyze. Save to state: `client_state.py set <slug> profile.competitors '[...]' `.

**Quick path (free, deterministic):** put the services and areas in a `seo-loop.json` (see `workflows/seo-loop.md`), run `python scripts/loop/compete.py find --config seo-loop.json` for the searches to run, save the winners with `compete.py add`, then `compete.py scan`. It rates every competitor with the same rubric as `rate_site.py` and lists where they beat the client, topic gaps, question gaps and schema gaps. `compete.py trends` adds search demand (autocomplete, Bing volumes, rising Search Console queries). MCP: `seo_competitor_scan`, `seo_search_demand`. Then do the human parts below (positioning, proof, links).

## 2. Light crawl (polite, small)

```bash
python scripts/crawling/crawl.py https://competitor.com --max-pages 60 --delay 1 --out <client>/data/competitors/<name>
```

Do not crawl competitor sites in full. 60 pages shows architecture and templates.

## 3. Compare

| Dimension | What to compare |
|---|---|
| Site architecture | Service pages count and depth, location pages, project/portfolio, blog, hub structure |
| Service positioning | Which services they lead with, specialties, guarantees, financing, pricing transparency |
| Metadata | Title patterns, H1 patterns (from crawl) |
| Content depth | Word count is weak evidence; look at coverage: process, cost factors, FAQs, proof |
| Proof and trust | Reviews count/rating on GBP, photos, awards, certifications, years in business |
| Schema | Types used (`jsonld_types` in crawl) |
| Local signals | GBP categories, review velocity, location pages quality |
| Speed | `pagespeed.py psi` on their homepage and one service page |
| Links | Paid backlink tools (optional) or visible signals: sponsorships, associations, local press, supplier dealer pages |

## 4. Gaps and opportunities

- **Keyword/content gaps**: services or questions they cover that the client does not (and the client really offers).
- **Proof gaps**: client has better proof (more reviews, longer history) but does not show it.
- **Backlink opportunities**: associations, suppliers, local organizations linking to competitors that the client could also earn.
- **Positioning**: what the client can credibly claim that competitors do not.

Log each actionable gap as a recommendation with the evidence (competitor URL, observation).
