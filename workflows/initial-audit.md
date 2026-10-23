# Workflow: Initial audit

Goal: a prioritized, evidence-backed list of issues and opportunities, saved to state, plus `reports/initial-audit.md` and a first `roadmap.md`. Ends by moving `phase` to `roadmap`, then `execution`.

## 1. Automated technical pass (no credentials needed)

```bash
python scripts/audit.py --client <slug> --max-pages 500 --log-issues
```

Read only `<client>/data/audit-<date>/summary.md`. Open the JSON files only to answer a specific question.

If `summary.md` shows `js_shell_suspect` pages, render one with Playwright MCP or Chrome DevTools MCP (if available) and compare the rendered text with the crawl. See `workflows/technical-seo.md` § Rendering.

## 2. Performance sample

Pick one URL per template (home, a service page, a location page, a blog post, contact):

```bash
python scripts/integrations/pagespeed.py psi <url1> <url2> ... --out <client>/data/psi-<date>.json
```

## 3. Search engine data (if connected)

- Search Console: `workflows/search-console.md` § Baseline. Save checkpoints.
- Bing: `workflows/bing-webmaster.md` § Baseline.
- Index status for the 10–30 most important URLs: `workflows/indexing.md` § Inspect.

If not connected, note "no search data yet" in the report. Do not estimate traffic.

## 4. Strategic passes

Run each that applies. Each workflow logs its own issues and recommendations.

| Pass | When | Workflow |
|---|---|---|
| Local | Has a location or service area | `local-seo.md` § Audit |
| On-page | Always | `on-page-seo.md` § Audit (top 10–20 money pages) |
| Schema | Always | `schema.md` § Audit |
| AEO/GEO | Always (brief) | `aeo-geo.md` § Audit |
| Competitors | Competitors known | `competitor-analysis.md` (light version) |

If subagents are available, these passes can run in parallel; each reads only its workflow and the shared `crawl.json`.

## 5. Prioritize

Score each finding: **Impact** (traffic/leads affected) × **Confidence** (evidence strength) ÷ **Effort**. Order:

1. Anything that blocks indexing or crawling of money pages (critical).
2. Money pages missing, thin, or mis-targeted.
3. Local fundamentals (GBP, NAP, LocalBusiness schema, location relevance).
4. Site-wide template fixes (titles, headings, internal links): one fix, many pages.
5. Content gaps and new pages.
6. Polish.

Record each recommendation:

```bash
python scripts/state/client_state.py rec add <slug> "<action>" --area <area> --reason "<evidence>"
```

## 6. Write outputs

- `reports/initial-audit-<date>.md` from `templates/seo-audit.md`. Plain language first, evidence second. Every number must come from a script output or API export.
- `roadmap.md` from `templates/seo-roadmap.md`: 30/60/90-day plan from the recommendations.
- Tasks: split each accepted recommendation into `claude` tasks (things Claude can do: drafts, schema, sitemap, meta rewrites) and `user` tasks (access, approvals, CMS publishing, GBP edits).

```bash
python scripts/state/client_state.py set <slug> phase roadmap
python scripts/state/client_state.py log <slug> "Initial audit complete: X critical, Y high issues"
```

After the user reviews the roadmap: mark accepted/rejected recommendations, set `phase execution`.
