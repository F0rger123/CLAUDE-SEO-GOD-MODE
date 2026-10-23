# Inventory (2026-10-23, before the Master SEO Skill Set expansion)

## Skills that existed

One skill (`agency-zero-seo`) with 15 workflows:

| Item | Covered |
|---|---|
| SKILL.md | Router, rules, client-state pointer |
| onboarding | Guided intake, integration checklist, state creation |
| initial-audit | Audit orchestration, prioritization, roadmap |
| technical-seo | Crawl, robots, sitemap, status, redirects, canonicals, CWV, JS rendering |
| local-seo | GBP, NAP, service-area strategy, location pages, reviews, citations |
| on-page-seo | Titles, descriptions, headings, service pages, internal links |
| search-console | Official GSC API: performance, sitemaps, URL Inspection |
| bing-webmaster | Official Bing API, IndexNow |
| indexing | 10-step indexing process |
| keyword-research | Keyword map from GSC/Bing/manual sources (no paid volume source) |
| competitor-analysis | Light crawl comparison, gaps |
| content-strategy | Content plan, clusters, briefs, refresh |
| aeo-geo | AI crawler access, entity clarity, answer-ready content, manual AI checks |
| schema | JSON-LD audit/generation |
| reporting | Report types and honest-data rules |
| recurring-maintenance | Cadence and automation |

## Gaps vs target coverage (before)

| Target | Status before | Filled by |
|---|---|---|
| Technical audit | Covered | — (claude-seo `seo-audit` added as primary) |
| Keyword research | Partial: no volume/difficulty data source | Ryze `keyword-research` |
| Rank tracking | Partial: period comparison only | Ryze `rank-tracking` |
| Content briefs | Partial: template only | Ryze `content-brief` |
| Local SEO | Covered | — |
| Schema | Covered | — |
| GEO/AEO (AI citations) | Partial: no Google-grounded workflow, no scorer, no rewrite engine | `ai-search-answer-workflow`, claude-seo `seo-geo`, geo-optimizer, eGEO |
| AI-referral measurement | **Missing** | Ryze `ai-visibility`; GA4 official MCP as fallback |
| Evidence tagging | Implicit ("never fabricate") | `RULES.md` + seo-intelligence `rules/` |
