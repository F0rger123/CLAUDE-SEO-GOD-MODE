# Architecture

## Layers

```
SKILL.md                 always loaded (~70 lines): routing + rules
  -> workflows/<job>.md  one per task, loaded on demand
       -> references/*   loaded only when a workflow points to it
       -> scripts/*      run, not read (use --help)
       -> templates/*    copied into client folder when needed
```

Sub-skills sit in `skills/`: originals (e.g. `skills/ai-search-answer-workflow`) and third-party skills in `skills/vendor/<source>/`, each with its LICENSE and ATTRIBUTION.md. Claude Code only auto-registers the top-level `SKILL.md`; sub-skills load when the router points to them. `RULES.md` applies to all of them.

This is progressive disclosure. A typical request loads `SKILL.md` plus one workflow, which keeps context small and cost low.

## Client state (memory)

Client data lives outside the skill repository so the skill stays generic and shareable.

```
$SEO_CLIENTS_DIR (default ~/seo-clients)/
  <slug>/
    state.json     single source of truth (machine-readable)
    profile.md     human-readable mirror of state.profile (generated)
    roadmap.md     prioritized plan (from templates/seo-roadmap.md)
    log.md         append-only work log, one line per action
    data/          raw script outputs, dated: audit-YYYY-MM-DD/, gsc-*.csv, bing-*.csv, psi-*.json
    reports/       finished reports
```

Recommended: make `~/seo-clients` its own private git repository for backup and history. Keep it separate from this skill repository.

### state.json sections

| Key | Holds |
|---|---|
| `phase` | onboarding, audit, roadmap, execution, maintenance |
| `profile` | business facts from onboarding (name, services, locations, NAP, competitors, goals...) |
| `integrations` | status per integration: gsc, bing, gbp, ga4, pagespeed, indexnow, cms_access, keyword_data |
| `audit` | status and history of audit runs |
| `tasks` | `T-###`, owner `user` (manual) or `claude`, status open/done/blocked |
| `issues` | `I-###`, severity, area, URLs, open/fixed/wontfix |
| `recommendations` | `R-###`, proposed/accepted/rejected/done, with reason |
| `checkpoints` | dated metric snapshots (clicks, impressions, indexed pages, rankings) with source |
| `recurring` | `RC-###` cadence items with last run date |

All writes go through `scripts/state/client_state.py`. It de-duplicates issues and recommendations and refuses to re-add a rejected recommendation silently.

## Resume protocol

1. `python scripts/state/client_state.py list` to find the slug.
2. `python scripts/state/client_state.py resume <slug>`. It prints profile gaps, integration status, tasks waiting on the user, open issues by severity, open and rejected recommendations, recurring items due, latest checkpoints, the last log lines, and the next phase action.
3. Load the workflow named in `next`.

## Scripts

| Script | Network | Writes |
|---|---|---|
| `audit.py` | yes (site) | `data/audit-DATE/*` + `summary.md`, state audit run, optional issues |
| `crawling/crawl.py` | yes (site) | `crawl.json` |
| `crawling/robots_check.py` | yes (site) | optional JSON |
| `sitemap/sitemap_check.py` | yes (site) | `sitemap-check.json` |
| `sitemap/generate_sitemap.py` | no | `sitemap.xml` |
| `metadata/metadata_audit.py` | no | `metadata-issues.json` |
| `links/link_check.py` | optional | `links.json` |
| `schema/schema_check.py` | yes (site) | `schema-check.json` |
| `schema/generate_schema.py` | no | stdout JSON-LD |
| `integrations/gsc.py` | Google API | CSV/JSON |
| `integrations/bing.py` | Bing API | CSV/JSON |
| `integrations/indexnow.py` | IndexNow API | none |
| `integrations/pagespeed.py` | Google API | JSON |
| `reporting/compare_periods.py` | no | optional JSON |
| `reporting/report_data.py` | no | stdout data pack |
| `state/client_state.py` | no | client state |

Design choices:

- Standard-library Python keeps setup to "have Python". Only `gsc.py` needs pip packages (official Google client).
- Scripts print a short summary for the model and write full JSON for later steps. The model reads the summary, not the JSON.
- The crawler is polite (delay, robots.txt honored by default) and capped (`--max-pages`). For large sites (10k+ URLs) use a dedicated crawler (see `references/tools.md`).

## Optional MCP servers

MCP servers are optional accelerators, not dependencies. Every core capability works through the scripts. See `docs/INTEGRATIONS.md` for the vetted list.
