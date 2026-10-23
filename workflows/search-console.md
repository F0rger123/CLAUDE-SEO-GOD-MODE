# Workflow: Google Search Console

Tool: `scripts/integrations/gsc.py` (official API). Setup: `docs/INTEGRATIONS.md` § Google Search Console. Limits: `references/apis.md`, `references/indexing-limitations.md`.

## Access check

```bash
python scripts/integrations/gsc.py sites
```

- Property listed: record it. Prefer the Domain property (`sc-domain:example.com`).
  `client_state.py set <slug> integrations.gsc '{"status":"connected","property":"sc-domain:example.com","notes":"service account, Full"}'`
- Not listed: user task to add the service account email (or your Google account) to the property. If no property exists: user task to verify a Domain property via DNS TXT record.

## Baseline (first time)

```bash
D=<client>/data
python scripts/integrations/gsc.py performance --site <prop> --dimensions date  --days 90 --out-dir $D
python scripts/integrations/gsc.py performance --site <prop> --dimensions query --days 28 --compare-previous --out-dir $D
python scripts/integrations/gsc.py performance --site <prop> --dimensions page  --days 28 --compare-previous --out-dir $D
python scripts/integrations/gsc.py sitemaps list --site <prop>
```

Record checkpoints (totals from the `date` export: sum clicks and impressions):

```bash
python scripts/state/client_state.py checkpoint <slug> --source gsc --metric clicks_28d --value <n> --file <csv>
python scripts/state/client_state.py checkpoint <slug> --source gsc --metric impressions_28d --value <n>
python scripts/state/client_state.py checkpoint <slug> --source gsc --metric avg_position_28d --value <n>
```

Also note the indexed page count from Search Console > Pages (manual: the API does not expose the coverage report totals) as `--metric indexed_pages`.

## Analysis recipes

All from exported CSVs; no extra API calls.

| Question | How |
|---|---|
| Quick wins | Queries with position 4–20 and impressions above the site median: improve the ranking page (on-page workflow). |
| CTR problems | Position ≤ 5 but CTR far below siblings: rewrite title/description. |
| Cannibalization | `--dimensions query,page`: same query split across 2+ pages with similar impressions. |
| Brand vs non-brand | `--filter query~notContains~<brand>` for non-brand performance. |
| Local intent | Filter queries containing city names/"near me". |
| Decliners | `scripts/reporting/compare_periods.py prev.csv cur.csv` losers list; check for lost pages, indexing, or SERP changes. |
| Content gaps | Queries with impressions but no good matching page: content plan. |
| Device/country | `--dimensions device` or `country` to spot mobile problems or off-market traffic. |

Note: query-level rows exclude anonymized queries, so they sum to less than the site total.

## Sitemaps

```bash
python scripts/integrations/gsc.py sitemaps submit --site <prop> --sitemap https://<host>/sitemap.xml   # ask first
python scripts/integrations/gsc.py sitemaps delete --site <prop> --sitemap <old sitemap URL>        # ask first
```

Submit after the sitemap passes `sitemap_check.py` with zero URL issues. Submitting does not force crawling or indexing.

## URL Inspection

See `indexing.md` § Inspect. Quota: 2,000/day, 600/min per property.

## What stays manual in the Search Console UI

Request Indexing, Pages (coverage) report totals and examples, Removals, Core Web Vitals report, Manual actions, Security issues, Links report export, Change of address, Settings/users (the user does these). Ask the user for a screenshot or export when needed.
