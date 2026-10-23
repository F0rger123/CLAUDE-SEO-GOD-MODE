# Workflow: 30-day page sprint and daily autopilot

Original Agency Zero workflow. Concept credit: the "SEO autopilot" and "blitz SEO" ideas in Illyism/seo-skills (https://github.com/Illyism/seo-skills). That repository has no license, so none of its text is used here.

All findings follow `RULES.md` (OBSERVED / INFERRED / RECOMMENDED / UNKNOWN).

## Part A: 30-day sprint on one money page

Use when one high-value page sits on page 2 (positions ~8–20) for a money query, or when work feels spread too thin.

### Pick the page (day 0)

```bash
python scripts/integrations/gsc.py performance --site <prop> --dimensions query,page --days 28 --out <client>/data/sprint-pick-<date>.csv
```

Choose one page where: the query is a money service, impressions are meaningful for this site, and average position is 8–20 (OBSERVED from the export). Record:

```bash
python scripts/state/client_state.py rec add <slug> "30-day sprint: <url> for '<query>'" --area sprint --reason "pos <x>, <n> impressions (GSC <dates>)"
python scripts/state/client_state.py checkpoint <slug> --source gsc --metric "sprint_pos:<url>" --value <x>
```

### Week 1: fix the page

- Intent match: compare the page with the current top results for the query (manual SERP check from the client's area). Same page type? Missing subtopics?
- Run `skills/ai-search-answer-workflow` steps 2–3 on this page only.
- Title and H1 aligned to the query; direct answer near the top; proof (projects, photos, reviews, credentials) that only this business has.
- Technical: indexable, fast enough, schema matches visible text.

### Week 2: links in

- 3–5 internal links from the strongest related pages (use `links.json` and GSC top pages), descriptive anchors.
- One or two honest external opportunities: supplier/manufacturer pages, associations, local partners, a project write-up for local news. No paid or swapped links.

### Week 3: supporting content

- One or two supporting pieces for real sub-questions people ask about this service (see `workflows/customer-journey.md`), each linking to the sprint page.

### Week 4: measure and decide

- Re-pull the same query/page data for the last 28 days and compare with day 0 (`compare_periods.py`).
- Report movement as OBSERVED numbers. Attribute it to the sprint only as INFERRED, and name other possible causes (seasonality, algorithm updates, competitor changes).
- Decide: continue, switch page, or stop. Log the result in state.

## Part B: daily autopilot (lightweight)

A short, script-first daily or every-other-day check. It flags problems; it does not change live sites.

```bash
python scripts/state/client_state.py resume <slug>
python scripts/crawling/robots_check.py <site> --test / <money paths>
python scripts/sitemap/sitemap_check.py <sitemap> --check-limit 50 --out <client>/data/daily
python scripts/integrations/gsc.py inspect --site <prop> --urls-file <client>/data/priority-urls.txt --out <client>/data/daily/inspect.json   # weekly, not daily: quota
```

Flag only changes since yesterday: new non-200 URLs, robots changes, sitemap errors, priority pages dropping out of the index. Log each flag as an issue (OBSERVED, with evidence). Everything else waits for the monthly cycle (`recurring-maintenance.md`).

Scheduling: see `recurring-maintenance.md` § Automation options. Credentials must come from environment variables on the machine that runs it.
