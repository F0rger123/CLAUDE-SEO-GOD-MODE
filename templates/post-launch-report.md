# Post-launch SEO check — {{BUSINESS}} — {{1 week | 4 weeks | 12 weeks}} after launch

**Launch date:** · **Type:** new site / redesign / domain or URL migration · **Check date:**

## Launch checklist (week 1)

| Check | Result | Evidence |
|---|---|---|
| No site-wide noindex / robots `Disallow: /` | | robots_check.py, crawl |
| Old URLs 301 to correct new URLs (one hop) | | redirect map test |
| New sitemap valid, submitted to Google and Bing | | sitemap_check.py, gsc/bing sitemaps list |
| Canonicals self-referencing on new URLs | | metadata_audit.py |
| Titles/descriptions carried over or improved | | crawl diff |
| Analytics and conversion tracking firing | | GA4 realtime (manual) |
| GSC property covers new domain/protocol; Change of Address filed (domain moves) | | manual |
| Schema present and valid | | schema_check.py |
| Core Web Vitals not worse than before | | pagespeed.py |
| Internal links point to new URLs (not redirects) | | link_check.py |

## Indexing progress

| Week | Priority URLs indexed (x/N) | Old URLs still indexed | Notes |
|---|---|---|---|

## Search performance vs pre-launch baseline

| Metric | Pre-launch (28d) | Now (28d) | Change |
|---|---|---|---|

Temporary fluctuation after migrations is common; report what the data shows and what we are fixing.

## Issues and fixes

## Next check
