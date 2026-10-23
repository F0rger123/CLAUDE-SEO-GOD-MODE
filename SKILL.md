---
name: master-seo-skill-set
description: The Master SEO Skill Set for Claude (Agency Zero). Use when onboarding, auditing, optimizing, reporting on, or resuming SEO work for any client website, including technical SEO, local SEO, keyword research, rank tracking, content briefs, Google Search Console, Bing Webmaster Tools, indexing, schema, competitor analysis, AI search (AI Overviews, AI Mode, ChatGPT/Perplexity/Claude citations, AEO/GEO), and AI-referral measurement.
---

# The Master SEO Skill Set for Claude

Agency Zero's SEO operating system. Works for any business and any geography.

## Hard rules first

Read `RULES.md` once per session. In short: never invent data; tag every finding OBSERVED / INFERRED / RECOMMENDED / UNKNOWN; keep third-party attribution; never promise rankings or AI placement; ask before any external change.

## Load rules (progressive disclosure)

Read only what the current step needs.

1. This file. Always.
2. One workflow (`workflows/`) or one sub-skill (`skills/`) for the current step.
3. A reference (`references/`) only when the workflow points to it.
4. A script (`scripts/`) only when you are about to run it. Run with `--help` before reading source.

Paths are relative to this skill's root folder.

## Client state

Client data never lives in this repository: `$AZ_SEO_CLIENTS` (default `~/agency-zero-clients/`) → `<slug>/state.json`, `profile.md`, `roadmap.md`, `log.md`, `data/`, `reports/`. Read and change state with `scripts/state/client_state.py`. Never ask for a fact `state.json` already holds.

## Route the request

| User intent | Use |
|---|---|
| new client, onboarding | `workflows/onboarding.md` |
| resume, continue | `python scripts/state/client_state.py resume <slug>`, then its `next` items |
| full site audit | `skills/vendor/claude-seo/seo-audit` (needs claude-seo plugin) + `scripts/audit.py` data; fallback `workflows/initial-audit.md` |
| audit from real GSC/GA4 performance | `skills/vendor/open-seo-mcp-skills/seo-audit` (Ryze connector) or `workflows/search-console.md` (official API) |
| crawl, robots, sitemap, canonicals, speed | `workflows/technical-seo.md` |
| Google AI Overviews / AI Mode, "answer the questions people search" | `skills/ai-search-answer-workflow` |
| GEO/AEO audit (citability, entity, brand) | `skills/vendor/claude-seo/seo-geo` + `workflows/aeo-geo.md` |
| AI-readiness score (0–100, before/after) | `skills/vendor/geo-optimizer` |
| GEO rewrites of flagged pages | `skills/vendor/egeoagents/geo-loop` (drafts only) |
| AI referral traffic (ChatGPT, Perplexity, Claude, Gemini) | `skills/vendor/open-seo-mcp-skills/ai-visibility` |
| keywords | `workflows/keyword-research.md` (+ `open-seo-mcp-skills/keyword-research` when connected) |
| rank tracking, movers | `skills/vendor/open-seo-mcp-skills/rank-tracking` or `scripts/reporting/compare_periods.py` |
| competitor keyword gap | `skills/vendor/open-seo-mcp-skills/competitor-gap`; structure review `workflows/competitor-analysis.md` |
| backlinks | `skills/vendor/open-seo-mcp-skills/backlink-check` |
| content brief | `skills/vendor/open-seo-mcp-skills/content-brief`; plan `workflows/content-strategy.md` |
| customer journey / question mapping | `workflows/customer-journey.md` |
| 30-day sprint on one page, daily autopilot | `workflows/sprint-and-autopilot.md` |
| Google Business Profile, map pack, city pages, NAP | `workflows/local-seo.md` |
| titles, headings, service pages, internal links | `workflows/on-page-seo.md` |
| Search Console data | `workflows/search-console.md` |
| Bing | `workflows/bing-webmaster.md` |
| indexing | `workflows/indexing.md` |
| schema / JSON-LD | `workflows/schema.md` |
| report | `workflows/reporting.md` |
| recurring work | `workflows/recurring-maintenance.md` |

Evidence layer for every route: `skills/vendor/seo-intelligence/rules/` (confidence labels, never-fake-data, safe changes). Its own audit modes are alternatives, not defaults. Full index and dedupe notes: `README.md`.

## Operating rules

- Scripts and official APIs before model reasoning.
- Humans first: no keyword stuffing, no doorway or mass fan-out pages, no copied competitor content.
- Do not change a live site, submit to Google or Bing, publish, deploy, or push without the user's go-ahead for that action.
- Credentials stay out of chat, state, and git (`docs/SECURITY.md`).
- After every work block: update state (tasks, issues, recommendations) and `client_state.py log`.
- Rejected recommendations stay rejected.

Python 3.10+. Core scripts use the standard library; `scripts/integrations/gsc.py` needs `pip install -r scripts/requirements.txt`. Vendored skills have their own dependencies (see each `ATTRIBUTION.md`).
