# Workflow: Indexing

Repeatable process to get important pages crawled and indexed, and to find out why others are not. Read `references/indexing-limitations.md` before promising anything.

Indexing is Google's decision. We remove blockers, send clear signals, and monitor. We do not "force" indexing.

## Steps

### 1. Verify crawlability

```bash
python scripts/crawling/crawl.py <url> --max-pages 500 --out <client>/data/index-<date>
```

Every priority URL: status 200, no redirect, reachable by an `<a href>` link from another indexed page.

### 2. Check robots

```bash
python scripts/crawling/robots_check.py <url> --test <priority paths...>
```

No priority URL blocked for Googlebot or Bingbot.

### 3. Verify sitemap

```bash
python scripts/sitemap/sitemap_check.py <sitemap> --crawl <crawl.json> --out <dir>
```

Zero URL issues. Every priority URL present. No junk URLs.

### 4. Submit sitemap to Google (ask first)

```bash
python scripts/integrations/gsc.py sitemaps submit --site <prop> --sitemap <sitemap>
```

### 5. Submit sitemap to Bing (ask first)

```bash
python scripts/integrations/bing.py submit-sitemap --site <site> --sitemap <sitemap>
```

Optionally IndexNow for changed URLs (`indexnow.py submit`).

### 6. Inspect important URLs

Keep a list at `<client>/data/priority-urls.txt` (money pages, location pages, new content).

```bash
python scripts/integrations/gsc.py inspect --site <prop> --urls-file <client>/data/priority-urls.txt --out <client>/data/inspect-<date>.json
```

Read `coverage` for each:

| Coverage state | Meaning | Action |
|---|---|---|
| Submitted and indexed | OK | — |
| Crawled - currently not indexed | Google saw it, chose not to index | Improve uniqueness/usefulness, internal links, consolidate thin pages |
| Discovered - currently not indexed | Known, not crawled yet | Internal links from strong pages, sitemap, site speed/crawl capacity; wait |
| Duplicate, Google chose different canonical | Canonical conflict | Compare `google_canonical` vs `user_canonical`; merge or differentiate |
| Excluded by 'noindex' tag | noindex present | Remove if unintended |
| Blocked by robots.txt | robots rule | Fix robots |
| Page with redirect / Not found (404) / Soft 404 / Server error | Technical | Fix URL or remove from sitemap and links |
| URL is unknown to Google | Never seen | Link it internally, sitemap, then manual Request Indexing |

### 7. Fix indexability problems

Log each as an issue with the inspected evidence. Fix (or create user tasks), then re-inspect.

### 8. Manual "Request Indexing" (user task)

For a small number of critical new or fixed URLs, the user clicks **Request Indexing** in Search Console URL Inspection. There is no API for this for normal pages. Create a task listing the exact URLs:

```bash
python scripts/state/client_state.py task add <slug> "Request Indexing in GSC for: <url1>, <url2>" --owner user
```

### 9. Monitor coverage and search data

- Monthly: re-run step 6. Checkpoint `--source gsc --metric priority_indexed --value <n of N>`.
- Monthly: Search Console Pages report indexed count (manual) as `indexed_pages`.
- Performance per page: `search-console.md`.

### 10. Revisit pages still unindexed

After 2–4 weeks with no change: page is probably judged low-value or duplicate. Options in order: improve content and proof, merge into a stronger page (301), strengthen internal links, or noindex/remove if it should not exist. Record the decision.
