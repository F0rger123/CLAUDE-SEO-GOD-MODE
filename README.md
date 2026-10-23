# Agency Zero SEO Skill

A reusable SEO operating system for Claude Code. Clone it once, then start any client with one prompt. Claude runs onboarding, runs the audits it can automate, tells you exactly what you must authorize by hand, builds the roadmap, and tracks the work across sessions.

It works for any business and any geography. It has extra depth for local service businesses (Agency Zero's core market around York, Pennsylvania).

## What it does

- **Guided onboarding.** Questions come in small groups. Answers are saved to a per-client `state.json`, so Claude never asks twice.
- **Deterministic audits.** Python scripts crawl the site and check robots.txt, sitemaps, status codes, redirects, canonicals, titles, descriptions, headings, internal links, orphan pages, image alt text, Open Graph, JSON-LD, and signs of JavaScript-only rendering.
- **Official integrations.** Google Search Console API (performance, sitemaps, URL Inspection), Bing Webmaster API (performance, crawl issues, sitemap and URL submission), IndexNow, PageSpeed Insights and CrUX.
- **Strategy workflows.** Local SEO, on-page SEO, keyword research, competitor analysis, content strategy, schema, and AEO/GEO (AI search visibility).
- **Honest reporting.** Report data is collected by script from state and data files. Nothing is invented.
- **Memory.** Tasks, issues, recommendations (including rejected ones), integrations, data checkpoints, and recurring work are all tracked, so any new session can resume.

## Quick start

```bash
# 1. Install as a global Claude Code skill
git clone https://github.com/F0rger123/agency-zero-seo-skill ~/.claude/skills/agency-zero-seo

# 2. (Optional) Google API libraries, only needed for Search Console
pip install -r ~/.claude/skills/agency-zero-seo/scripts/requirements.txt
```

Then, in any Claude Code session:

```text
Use the Agency Zero SEO skill for this new client.

Business: D-Hauss Remodeling
Website: https://example.com
Primary area: York, PA

Start onboarding.
```

To continue later:

```text
Use the Agency Zero SEO skill. Resume client d-hauss-remodeling.
```

Full setup, credentials, and Windows notes: [docs/SETUP.md](docs/SETUP.md).

## Repository map

| Path | Purpose |
|---|---|
| `SKILL.md` | Entry point Claude loads first. Routing table and core rules. |
| `CLAUDE.md`, `AGENTS.md` | Rules for agents working on or with this repo. |
| `workflows/` | One file per job (onboarding, audit, local SEO, indexing...). Loaded one at a time. |
| `references/` | Facts and limits (APIs, tools, schema, indexing limits). Loaded only when a workflow points to them. |
| `templates/` | Client profile, roadmap, audit, reports, content plan. |
| `scripts/` | Deterministic tools. Standard-library Python except the Search Console client. |
| `docs/` | Architecture, setup, integrations, security. |
| `examples/` | A filled-in example client. |

Client data is stored outside this repo in `~/agency-zero-clients/<slug>/` (or `$AZ_SEO_CLIENTS`). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Principles

1. Scripts and official APIs first; model reasoning second.
2. Never fabricate data or results.
3. Never claim an API can force Google indexing. It cannot. See [references/indexing-limitations.md](references/indexing-limitations.md).
4. People first: no keyword stuffing, no doorway pages, no copied competitor content.
5. Nothing changes on a live site, and nothing is submitted to a search engine, without approval.
