---
name: seo-god-mode
description: CLAUDE SEO GOD MODE (Agency Zero). Use when someone asks to rate or score a website's SEO, GEO, or AEO from a URL, or when onboarding, auditing, optimizing, reporting on, or resuming SEO work for any client website, including technical SEO, local SEO, keyword research, rank tracking, content briefs, Google Search Console, Bing Webmaster Tools, indexing, schema, competitor analysis, AI search (AI Overviews, AI Mode, ChatGPT/Perplexity/Claude citations, AEO/GEO), and AI-referral measurement.
---

# CLAUDE SEO GOD MODE

Open-source SEO operating system for Claude. Works for any business, agency, or freelancer, in any geography. Created by Agency Zero.

## Start here

New session? Read `START_HERE.md` (two minutes), then run `python scripts/setup/connect.py status`. To connect Search Console, Bing, or PageSpeed, relay `docs/CONNECT.md` word for word and use `scripts/setup/connect.py`. Never ask for key-file contents in chat. Listings and social profiles: `references/social-and-listings.md` and `workflows/listings-browser.md`.

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

Client data never lives in this repository: `$SEO_CLIENTS_DIR` (default `~/seo-clients/`) → `<slug>/state.json`, `profile.md`, `roadmap.md`, `log.md`, `data/`, `reports/`. Read and change state with `scripts/state/client_state.py`. Never ask for a fact `state.json` already holds.

## Route the request

| User intent | Use |
|---|---|
| "rate my website", SEO/GEO/AEO score, quick audit of any URL | `skills/rate-my-site` (`python scripts/rate_site.py <url>` or MCP `seo_rate_site`) |
| "improve yourself", a rating looked wrong, add a check/skill/tool | `CONTRIBUTING.md` (self-improvement loop) |
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
| Apple Maps, Siri, Apple Business Connect | `workflows/apple-business-connect.md` (`apple_maps.py check`) |
| paid ads (Google, Meta, LinkedIn, TikTok, Apple Search Ads…) | companion plugin **claude-ads** (`docs/ADS.md`) |
| citability of a page, brand mentions, per-AI-platform tips | `skills/vendor/geo-seo-claude/` (`geo-citability`, `geo-brand-mentions`, `geo-platform-optimizer`) |
| prospects, proposals, month-over-month client deltas | `skills/vendor/geo-seo-claude/` (`geo-prospect`, `geo-proposal`, `geo-compare`) |
| titles, headings, service pages, internal links | `workflows/on-page-seo.md` |
| Search Console data | `workflows/search-console.md` |
| Bing | `workflows/bing-webmaster.md` |
| indexing | `workflows/indexing.md` |
| schema / JSON-LD | `workflows/schema.md` |
| report | `workflows/reporting.md` |
| recurring work | `workflows/recurring-maintenance.md` |

MCP: if the `seo-god-mode` MCP server is connected, prefer its tools (`seo_*`, `gsc_*`, `bing_*`, `pagespeed`) over shelling out to scripts; they are the same code. Tool list: `docs/MCP.md`.

Evidence layer for every route: `skills/vendor/seo-intelligence/rules/` (confidence labels, never-fake-data, safe changes). Its own audit modes are alternatives, not defaults. Full index and dedupe notes: `README.md`.

## Operating rules

- Scripts and official APIs before model reasoning.
- Humans first: no keyword stuffing, no doorway or mass fan-out pages, no copied competitor content.
- Do not change a live site, submit to Google or Bing, publish, deploy, or push without the user's go-ahead for that action.
- Credentials stay out of chat, state, and git (`docs/SECURITY.md`).
- After every work block: update state (tasks, issues, recommendations) and `client_state.py log`.
- Rejected recommendations stay rejected.

Python 3.10+. Core scripts use the standard library; `scripts/integrations/gsc.py` needs `pip install -r scripts/requirements.txt`. Vendored skills have their own dependencies (see each `ATTRIBUTION.md`).
