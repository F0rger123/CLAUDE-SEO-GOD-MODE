# Attribution: geo-seo-claude ("Claude GEO SEO")

- **Source:** https://github.com/zubair-trabzada/geo-seo-claude
- **Author:** Zubair Trabzada and contributors
- **Commit copied:** 989cae0 (2026-10-25)
- **License:** MIT (`LICENSE`)
- **Copied (unmodified):** `skills/geo-citability`, `geo-brand-mentions`, `geo-platform-optimizer`, `geo-prospect`, `geo-proposal`, `geo-compare`, and `scripts/citability_scorer.py`, `brand_scanner.py`, `fetch_page.py`. This folder's `scripts/requirements.txt` is a trimmed list for those three scripts.

This is third-party work, not this project's.

## Not copied (duplicates of something this repo already has)

| Upstream | Primary here instead |
|---|---|
| `geo/SKILL.md`, `geo-audit` (full GEO audit) | claude-seo `seo-geo` + `skills/rate-my-site` |
| `geo-crawlers` | `robots_check.py` / rate-my-site GEO crawler checks (Google longest-match rules + live WAF probe) |
| `geo-schema`, `geo-technical`, `geo-content` | `workflows/schema.md`, `technical-seo.md`, claude-seo audit |
| `geo-llmstxt`, `llmstxt_generator.py` | Optional only; Google Search doesn't use llms.txt (see `skills/ai-search-answer-workflow`) |
| `geo-report`, `geo-report-pdf` | `rate_site.py` `report.html` + `workflows/reporting.md` |
| `geo-update`, webapp, `crm_dashboard.py`, white-label | Out of scope |

## Role here

| Skill / script | Role |
|---|---|
| `geo-citability` + `citability_scorer.py` | Passage-level "could an AI quote this?" scoring of a single page. Complements rate-my-site's site-level AEO checks. |
| `geo-brand-mentions` + `brand_scanner.py` | Off-site entity presence checklist (Wikipedia, Wikidata, YouTube, Reddit, LinkedIn…). |
| `geo-platform-optimizer` | Per-platform tips (Google AI Overviews, ChatGPT, Perplexity, Gemini, Copilot). |
| `geo-prospect`, `geo-proposal`, `geo-compare` | Agency sales tools: prospect pipeline, proposal from an audit, month-over-month delta report. |

## Read before using (RULES.md applies)

- **`brand_scanner.py` only looks up Wikipedia and Wikidata for real.** For YouTube, Reddit, LinkedIn and others it returns default `false` values plus manual check instructions. Treat those `false` values as **UNKNOWN**, never as "no presence", until someone checks by hand.
- **`citability_scorer.py` rewards 134–167-word passages.** The upstream presents that range as research-backed; it isn't a Google rule, and Google says there is "no ideal page length" and not to chunk content just for AI. Report its scores as **INFERRED** heuristics.
- **Market statistics in the upstream skills** (market size, conversion multipliers, "3x correlation") are not verified here. Never repeat them to clients as fact without checking the original source.
- Its proposal and prospect skills can suggest pricing and promises. Don't promise rankings or AI placement (RULES.md §4).
- Dependencies: `pip install -r skills/vendor/geo-seo-claude/scripts/requirements.txt` (requests, beautifulsoup4, lxml). Run the scripts with `python -I`.
