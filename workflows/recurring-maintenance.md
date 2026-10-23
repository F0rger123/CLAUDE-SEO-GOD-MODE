# Workflow: Recurring maintenance

Ongoing optimization after the roadmap's first phase. `client_state.py resume <slug>` lists recurring items that are due.

## Cadence

| Cadence | Item | Command / workflow |
|---|---|---|
| Weekly (active projects) | Status update | `templates/weekly-status.md` |
| Monthly | Search Console pull + compare | `search-console.md`, `compare_periods.py` |
| Monthly | Bing pull + crawl issues | `bing-webmaster.md` |
| Monthly | Sitemap + robots check | `sitemap_check.py`, `robots_check.py` |
| Monthly | Crawl audit (catch regressions) | `audit.py --client <slug> --log-issues` |
| Monthly | Priority URL inspection | `indexing.md` § 6 |
| Monthly | GBP review/post check (manual or with user) | `local-seo.md` |
| Monthly | Report | `reporting.md` |
| Quarterly | PageSpeed on templates | `pagespeed.py` |
| Quarterly | Competitor refresh | `competitor-analysis.md` |
| Quarterly | AI visibility check | `aeo-geo.md` § 5 |
| Quarterly | Content refresh priorities | `content-strategy.md` |

After running each item: `client_state.py recurring ran <slug> RC-###`.

## Monthly run (one session)

```bash
python scripts/state/client_state.py resume <slug>
python scripts/audit.py --client <slug> --log-issues
python scripts/integrations/gsc.py performance --site <prop> --dimensions page --days 28 --compare-previous --out-dir <client>/data
python scripts/integrations/gsc.py inspect --site <prop> --urls-file <client>/data/priority-urls.txt --out <client>/data/inspect-<date>.json
python scripts/integrations/bing.py crawl-issues --site <site> --json <client>/data/bing-crawl-issues-<date>.json
```

Then: compare the new audit with the previous one (new issue groups = regressions), close fixed issues, add checkpoints, update the roadmap's next priorities, write the monthly report.

## Automation options

All core checks are scripts, so they can run without a model:

- **Local scheduler**: Windows Task Scheduler or cron running the monthly commands above, writing to the client data folder. Claude reads the outputs next session.
- **Claude Code scheduled tasks / routines**: schedule a prompt such as "Use the Master SEO Skill Set. Run recurring maintenance for <slug>." Requires the machine or environment to have the credentials as environment variables.
- **GitHub Actions** (on the private client-data repo): possible for crawl/sitemap checks; store API keys as encrypted secrets only.

Report regressions to the user; do not auto-fix live sites.
