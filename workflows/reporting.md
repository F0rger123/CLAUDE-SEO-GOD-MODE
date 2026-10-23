# Workflow: Reporting

Rule: **tag every finding OBSERVED / INFERRED / RECOMMENDED / UNKNOWN (`RULES.md`).** Rule: **every number in a report traces to a data file or API export. If data is missing, say "not available" and why.** Never describe a change as a win unless the data shows it, and never attribute a change to our work without evidence (timing alone is weak evidence; say so).

## Report types

| Report | Template | When |
|---|---|---|
| Initial audit | `templates/seo-audit.md` | after `initial-audit.md` |
| Weekly status | `templates/weekly-status.md` | weekly during active projects |
| Monthly report | `templates/monthly-report.md` | monthly |
| Technical SEO report | `templates/seo-audit.md` (technical sections only) | after major technical work |
| Local SEO report | `templates/monthly-report.md` + Local section | local clients |
| SEO + AEO/GEO report | `templates/monthly-report.md` + AI visibility section | quarterly |
| Post-launch SEO | `templates/post-launch-report.md` | 1, 4, and 12 weeks after a site launch or migration |
| Competitor report | `templates/competitor-report.md` | quarterly or on request |

## Steps

1. **Collect** the period's facts:

   ```bash
   python scripts/reporting/report_data.py <slug> --start <YYYY-MM-DD> --end <YYYY-MM-DD>
   ```

2. **Pull fresh search data** (if connected):

   ```bash
   python scripts/integrations/gsc.py performance --site <prop> --dimensions query --start <s> --end <e> --compare-previous --out-dir <client>/data
   python scripts/integrations/gsc.py performance --site <prop> --dimensions page  --start <s> --end <e> --compare-previous --out-dir <client>/data
   python scripts/reporting/compare_periods.py <prev.csv> <cur.csv>
   python scripts/integrations/bing.py traffic --site <site> --csv <client>/data/bing-traffic-<date>.csv
   ```

   Record checkpoints for the period totals.

   Use year-over-year comparison for seasonal businesses when 13+ months of data exist (Search Console keeps 16 months).

3. **Write** from the template into `<client>/reports/<type>-<period>.md`. Structure: what we did, what changed (data), what it means, issues, next priorities, what we need from the client.
4. **Review** for honesty: every claim has a source; no vanity framing; declines explained plainly.
5. **Send**: Claude does not send reports. The user reviews and sends.
6. `client_state.py log <slug> "Monthly report <period> written"` and `recurring ran <slug> RC-###`.

## Style

Plain English for a business owner. Lead with outcomes (calls, forms, visibility for money services), then supporting metrics. Keep jargon out of the summary; put technical detail in an appendix.
