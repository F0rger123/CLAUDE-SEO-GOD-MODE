---
name: agency-zero-seo
description: Agency Zero SEO operating system. Use when onboarding, auditing, optimizing, reporting on, or resuming SEO work for any client website, including technical SEO, local SEO, Google Search Console, Bing Webmaster Tools, indexing, schema, content strategy, competitor analysis, and AEO/GEO (AI search visibility).
---

# Agency Zero SEO

Reusable SEO operating system for client websites. Works for any business and any geography.

## Load rules (progressive disclosure)

Read only what the current step needs. Do not read the whole repository.

1. This file. Always.
2. One workflow file in `workflows/` for the current step.
3. A reference file in `references/` only when the workflow points to it.
4. A script in `scripts/` only when you are about to run it. Run scripts with `--help` before reading their source.

Paths in this skill are relative to the skill root (the folder that holds this file).

## Client state

Client data never lives in this repository. It lives in the clients directory:

- `$AZ_SEO_CLIENTS` if set, else `~/agency-zero-clients/`.
- One folder per client: `<clients>/<slug>/` with `state.json`, `profile.md`, `roadmap.md`, `log.md`, `data/`, `reports/`.

`state.json` is the single source of truth. Read and change it with `scripts/state/client_state.py`. Never ask the user for a fact that `state.json` already holds.

## Route the request

| User intent | Do this |
|---|---|
| "new client", "start onboarding" | `workflows/onboarding.md` |
| "resume", "continue", client name only | Run `python scripts/state/client_state.py resume <slug>`, then follow the `next` items it prints |
| "audit" | `workflows/initial-audit.md` |
| crawl, robots, sitemap, canonical, redirects, speed | `workflows/technical-seo.md` |
| Google Business Profile, map pack, city pages, NAP | `workflows/local-seo.md` |
| titles, headings, service pages, internal links | `workflows/on-page-seo.md` |
| Search Console data, queries, pages | `workflows/search-console.md` |
| Bing | `workflows/bing-webmaster.md` |
| "get pages indexed", coverage | `workflows/indexing.md` |
| keywords | `workflows/keyword-research.md` |
| competitors | `workflows/competitor-analysis.md` |
| content plan, blog, topic clusters | `workflows/content-strategy.md` |
| AI search, AEO, GEO, ChatGPT/Perplexity/AI Overviews | `workflows/aeo-geo.md` |
| structured data, JSON-LD | `workflows/schema.md` |
| report | `workflows/reporting.md` |
| monthly / recurring work | `workflows/recurring-maintenance.md` |

## Non-negotiable rules

- Scripts and APIs before model reasoning. Run the deterministic tool, then interpret its output.
- Never fabricate data, rankings, traffic, indexing status, or results. If data is missing, say so.
- Never claim an API can do something it cannot. Read `references/indexing-limitations.md` before any indexing promise.
- Humans first. No keyword stuffing, no doorway pages, no copied competitor text.
- Do not change a live website, submit to Google or Bing, or send anything externally without the user's go-ahead for that action.
- Credentials stay out of chat, out of `state.json`, and out of git. See `docs/SECURITY.md`.
- After every work block: update `state.json` (tasks, issues, recommendations) and append to `log.md` with `client_state.py log`.
- Rejected recommendations stay rejected. Check `state.json` → `recommendations` before proposing again.

## Python

Scripts need Python 3.10+. Core scripts use the standard library only. Google API scripts need `pip install -r scripts/requirements.txt`.
