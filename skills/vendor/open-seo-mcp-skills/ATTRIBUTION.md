# Attribution: open-seo-mcp-skills

- **Source:** https://github.com/Ryze-AI-Adgent/open-seo-mcp-skills
- **Author:** Ryze AI
- **Commit copied:** cf7d804 (2026-10-23)
- **License:** MIT (`LICENSE`)
- **Copied:** `skills/seo-audit`, `keyword-research`, `rank-tracking`, `competitor-gap`, `backlink-check`, `ai-visibility`, `content-brief`. Files are unmodified. `seo-vs-ads` was not copied (paid ads are out of scope).

This is third-party work, not Agency Zero's.

## Dependency and security

Every skill calls tools from the hosted **Ryze MCP connector** (`https://connector.get-ryze.ai/mcp`), a third-party service. The client's Search Console and GA4 data passes through Ryze when you use it. Get the client's agreement before connecting their accounts.

Without the connector, run the same workflows on official data: `scripts/integrations/gsc.py` (Search Console), the official Google Analytics MCP (GA4), and `scripts/reporting/compare_periods.py` (rank movement). Tool names in these files (for example `google_search_console__getIndexationSummary`) are Ryze's tools, not Google API methods.

## Role in the Master SEO Skill Set

| Skill | Role |
|---|---|
| seo-audit | Search-data audit (GSC + GA4 performance). Different job from the crawl-based site audit, so both stay. |
| rank-tracking | Primary rank-movement skill (GSC positions between two periods). |
| keyword-research | Executor for `workflows/keyword-research.md` when Ryze/DataForSEO data is connected. |
| competitor-gap | Primary competitor keyword-gap skill. |
| backlink-check | Primary backlink comparison (DataForSEO via Ryze). |
| ai-visibility | Primary **AI-referral measurement** skill (GA4 AI referrers). |
| content-brief | Primary content-brief skill. |
