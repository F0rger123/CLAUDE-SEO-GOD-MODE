# The Master SEO Skill Set for Claude

Agency Zero's reusable SEO operating system for Claude Code (formerly `agency-zero-seo-skill`). Clone it once, then start any client with one prompt. Claude runs onboarding and the audits it can automate, tells you exactly what you must authorize by hand, builds the roadmap, and tracks the work across sessions.

It works for any business and geography, with extra depth for local service businesses around York, Pennsylvania.

**Hard rules** (`RULES.md`): never invent data; tag findings OBSERVED / INFERRED / RECOMMENDED / UNKNOWN; third-party skills keep their license and attribution; never promise rankings or AI placement; ask before external changes.

## Quick start

```bash
git clone https://github.com/F0rger123/master-seo-skill-set-for-claude ~/.claude/skills/master-seo-skill-set
pip install -r ~/.claude/skills/master-seo-skill-set/scripts/requirements.txt   # only for Search Console
```

New client:

```text
Use the Master SEO Skill Set for this new client.

Business: D-Hauss Remodeling
Website: https://example.com
Primary area: York, PA

Start onboarding.
```

Resume:

```text
Use the Master SEO Skill Set. Resume client d-hauss-remodeling: run client_state.py resume, then continue with the next step it lists.
```

Setup and credentials: [docs/SETUP.md](docs/SETUP.md), [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

## Skill index

### Agency Zero original

| Skill / workflow | Covers |
|---|---|
| `SKILL.md` (router) | Routes each request to one workflow or sub-skill; core rules |
| `skills/ai-search-answer-workflow` | Google AI Overviews / AI Mode readiness grounded in Google's May 2026 guide: real GSC queries → page grading → drafted rewrites → fan-out coverage → weekly re-check; AI crawler allowlist; local who/what/where |
| `workflows/onboarding.md` | Guided client intake, integration checklist |
| `workflows/initial-audit.md` | Audit orchestration and prioritization (fallback when claude-seo plugin is absent) |
| `workflows/technical-seo.md` | Crawlability, indexability, redirects, canonicals, CWV, JS rendering |
| `workflows/local-seo.md` | GBP, NAP, service-area strategy, location pages (doorway test), reviews, citations |
| `workflows/on-page-seo.md` | Titles, headings, service-page architecture, internal links |
| `workflows/search-console.md` | Official GSC API: performance, sitemaps, URL Inspection |
| `workflows/bing-webmaster.md` | Official Bing API, IndexNow |
| `workflows/indexing.md` | 10-step indexing process |
| `workflows/keyword-research.md` | Keyword map, intent, sources |
| `workflows/competitor-analysis.md` | Structure, positioning, proof, link-opportunity review |
| `workflows/content-strategy.md` | Content plan, clusters, briefs, refresh queue |
| `workflows/customer-journey.md` | Five-stage question mapping for Google and AI assistants |
| `workflows/sprint-and-autopilot.md` | 30-day single-page sprint and a lightweight daily check |
| `workflows/aeo-geo.md` | Entity clarity, answer-ready content, AI visibility checks |
| `workflows/schema.md` | JSON-LD audit and generation from client facts |
| `workflows/reporting.md` | Honest reporting from data packs |
| `workflows/recurring-maintenance.md` | Cadence and automation |
| `scripts/` | Deterministic crawler, robots (Google longest-match rules), sitemap, metadata, links, schema, GSC, Bing, IndexNow, PageSpeed, AI-answer check, state, reporting. See `scripts/README.md`. |

### Third-party (vendored, MIT, attribution in each folder)

| Skill | Source | Role here |
|---|---|---|
| `vendor/claude-seo/seo-audit` | AgriciDaniel/claude-seo | **Primary site audit** (needs claude-seo plugin for its scripts/agents) |
| `vendor/claude-seo/seo-geo` | AgriciDaniel/claude-seo | **Primary GEO/AEO audit** |
| `vendor/open-seo-mcp-skills/seo-audit` | Ryze-AI-Adgent/open-seo-mcp-skills | Search-data audit on real GSC + GA4 (via Ryze connector) |
| `vendor/open-seo-mcp-skills/keyword-research` | Ryze | Keyword data executor |
| `vendor/open-seo-mcp-skills/rank-tracking` | Ryze | **Primary rank tracking** (GSC positions) |
| `vendor/open-seo-mcp-skills/competitor-gap` | Ryze | **Primary competitor keyword gap** |
| `vendor/open-seo-mcp-skills/backlink-check` | Ryze | Backlink comparison |
| `vendor/open-seo-mcp-skills/ai-visibility` | Ryze | **Primary AI-referral measurement** (GA4) |
| `vendor/open-seo-mcp-skills/content-brief` | Ryze | **Primary content brief** |
| `vendor/egeoagents/geo-loop`, `content-scoring`, `validation-doctor` | mverab/eGEOagents | GEO rewrite engine (drafts for review) |
| `vendor/geo-optimizer` | Auriti-Labs/geo-optimizer-skill | AI-readiness score 0–100 only |
| `vendor/seo-intelligence` | Trementdv/seo-intelligence-skill | **Evidence layer** (`rules/`) + reference checklists |

Details, commits, and dependencies: `skills/vendor/README.md` and each `ATTRIBUTION.md`.

## Coverage vs target

| Target | Covered by |
|---|---|
| Technical audit | claude-seo `seo-audit` + `scripts/audit.py` + `workflows/technical-seo.md` |
| Keyword research | `workflows/keyword-research.md` + Ryze `keyword-research` (when connected) |
| Rank tracking | Ryze `rank-tracking`, `compare_periods.py` |
| Content briefs | Ryze `content-brief`, `workflows/content-strategy.md` |
| Local SEO | `workflows/local-seo.md` |
| Schema | `workflows/schema.md`, `generate_schema.py`, `schema_check.py` |
| GEO/AEO (AI citations) | `ai-search-answer-workflow`, claude-seo `seo-geo`, `geo-optimizer`, eGEO |
| AI-referral measurement | Ryze `ai-visibility` (GA4); GA4 official MCP as fallback |

## Dedupe decisions

Where two skills do the same job, one is primary and the rest are alternatives, so audits don't contradict each other.

| Job | Primary | Alternatives (not routed by default) |
|---|---|---|
| Full site audit | claude-seo `seo-audit` | `workflows/initial-audit.md` (when plugin absent); seo-intelligence `/full-audit` |
| GEO/AEO audit | claude-seo `seo-geo` | seo-intelligence `/geo-audit`, `/aeo-audit`, `/llm-audit`; eGEO `content-scoring` |
| Google AI features readiness | `ai-search-answer-workflow` | — |
| AI-readiness numeric score | geo-optimizer | — |
| Competitor keyword gap | Ryze `competitor-gap` | eGEO `competitive-analysis` (not copied) |
| Schema generation | `scripts/schema/generate_schema.py` | eGEO `schema-generator` (not copied), geo-optimizer `geo schema` |
| Search-data audit | Ryze `seo-audit` (with connector) | `workflows/search-console.md` (official API, no third party) |

Not copied: **Illyism/seo-skills** has no license. Its ideas are covered by original workflows that credit it (`sprint-and-autopilot.md`, `customer-journey.md`, refresh section of `content-strategy.md`).

## Layout

`SKILL.md` router · `RULES.md` · `skills/` (original + `vendor/`) · `workflows/` · `references/` · `templates/` · `scripts/` · `docs/` · `examples/`. Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Inventory history: [docs/INVENTORY.md](docs/INVENTORY.md).

## License

Agency Zero original files: proprietary (`LICENSE`). Vendored skills: their own MIT licenses in `skills/vendor/*/`.
