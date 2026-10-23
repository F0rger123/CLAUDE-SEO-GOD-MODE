# Scripts

Run any script with `--help` for usage. Paths are relative to the skill root.

| Script | Does | Needs |
|---|---|---|
| `rate_site.py` | Rate any URL: Overall/SEO/AEO/GEO scores, grades, ranked fixes (`references/rating-rubric.md`) | network |
| `audit.py` | Full deterministic audit, writes `summary.md`, updates client state | network |
| `state/client_state.py` | Client memory: init, resume, set, task, issue, rec, checkpoint, recurring, log | — |
| `crawling/crawl.py` | Polite same-site crawl to `crawl.json` | network |
| `crawling/robots_check.py` | robots.txt rules for search and AI crawlers | network |
| `sitemap/sitemap_check.py` | Validate sitemap + every URL; compare with crawl | network |
| `sitemap/generate_sitemap.py` | Build sitemap.xml from crawl | — |
| `metadata/metadata_audit.py` | Titles, descriptions, headings, canonicals, alt, OG, thin pages | — |
| `links/link_check.py` | Broken links, links to redirects, weak inlinks | optional network |
| `schema/schema_check.py` | JSON-LD validity, recommended props, NAP match | network |
| `schema/generate_schema.py` | JSON-LD from client profile | — |
| `integrations/gsc.py` | Search Console: performance, sitemaps, URL Inspection | Google creds + `requirements.txt` |
| `integrations/bing.py` | Bing Webmaster API | `BING_WEBMASTER_API_KEY` |
| `integrations/indexnow.py` | IndexNow keygen/verify/submit | per-site key |
| `integrations/pagespeed.py` | PageSpeed Insights + CrUX | `GOOGLE_API_KEY` |
| `ai_answer/answer_check.py` | AI-search answer check: crawler allowlist, snippet eligibility, who/what/where, direct answers, FAQ-schema match, query grading; tagged findings | network; GSC CSV optional |
| `reporting/compare_periods.py` | Diff two GSC/Bing CSV exports | — |
| `reporting/report_data.py` | Period data pack from state + log | — |

Conventions: Python 3.10+, standard library (except `gsc.py`), print a short summary for the model, write full JSON for the next step, never print secrets.
