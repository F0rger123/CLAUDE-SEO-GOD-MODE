# Workflow: Bing Webmaster Tools

Tool: `scripts/integrations/bing.py` (official API) and `scripts/integrations/indexnow.py`. Setup: `docs/INTEGRATIONS.md` § Bing.

Why it matters: Bing powers Bing search, DuckDuckGo results in part, Yahoo, and Microsoft Copilot grounding. A clean Bing index helps AI-search visibility.

## Access check

```bash
python scripts/integrations/bing.py sites
```

Not listed: user task. Fastest path is Bing Webmaster > Add site > **Import from Google Search Console**. Record: `client_state.py set <slug> integrations.bing '{"status":"connected","property":"https://www.example.com/"}'`. The `--site` value must match the site URL exactly as Bing lists it.

## Baseline

```bash
D=<client>/data
python scripts/integrations/bing.py traffic      --site <site> --csv $D/bing-traffic-<date>.csv
python scripts/integrations/bing.py queries      --site <site> --csv $D/bing-queries-<date>.csv
python scripts/integrations/bing.py pages        --site <site> --csv $D/bing-pages-<date>.csv
python scripts/integrations/bing.py crawl-issues --site <site> --json $D/bing-crawl-issues-<date>.json
python scripts/integrations/bing.py sitemaps     --site <site>
```

Checkpoint clicks and impressions (`--source bing`).

## Sitemaps (ask first)

```bash
python scripts/integrations/bing.py submit-sitemap --site <site> --sitemap https://<host>/sitemap.xml
```

## URL submission (ask first)

Officially supported, quota-limited per site per day. Check quota first:

```bash
python scripts/integrations/bing.py quota --site <site>
python scripts/integrations/bing.py submit-urls --site <site> --urls <url> [...]
```

Use for new or substantially updated important pages. Submission is a request, not a guarantee.

Alternative for ongoing changes: IndexNow (`indexnow.py`), which Bing supports and many CMS plugins automate.

## Monitoring

- `url-info --url <url>` for index/crawl details of a page.
- `crawl-stats` and `crawl-issues` monthly: 4xx/5xx, blocked by robots, DNS, timeouts.
- Bing's SEO reports and Site Scan (manual, in UI) add on-page checks.

## Keyword data (free)

```bash
python scripts/integrations/bing.py keyword --query "kitchen remodeling york pa"
python scripts/integrations/bing.py related --query "kitchen remodeling"
```

Bing volumes are Bing-only and smaller than Google; use for relative comparison. If these calls error, check the current parameter names in Microsoft's Bing Webmaster API docs.
