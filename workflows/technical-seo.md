# Workflow: Technical SEO

Use for crawlability, indexability, and site health. Run `scripts/audit.py` first; this file explains how to read and fix what it finds.

## Checks and fixes

| Area | Evidence (script) | Fix guidance |
|---|---|---|
| robots.txt | `robots_check.py` | Never block CSS/JS or money pages. A 5xx robots.txt can halt crawling: fix hosting. Add `Sitemap:` line. Decide on AI crawlers deliberately (see `aeo-geo.md`). |
| Sitemap | `sitemap_check.py` | Only 200, indexable, canonical URLs. No redirects, no noindex, no parameters. Accurate `lastmod` only when content changes. Platform generator preferred; else `generate_sitemap.py`. |
| Status codes | crawl `status_counts`, `metadata-issues.json` | 404s with inlinks or backlinks: 301 to closest equivalent. 5xx: escalate to host/dev. Soft 404 (thin "not found" with 200): return real 404/410. |
| Redirects | `redirect_chain`, `links.json` `links_to_redirects` | One hop, 301 (or 308). Update internal links to final URLs. Keep http->https and non-www/www consistent. |
| Canonicals | metadata issues | Self-referencing canonical on every indexable page. Canonical must point to a 200, indexable URL. Never canonical paginated pages to page 1. |
| Duplicates | duplicate titles/descriptions, parameter URLs | Consolidate (301) or canonicalize. Fix trailing slash and case variants at the server. |
| noindex | `noindex` flag | Confirm intent for every noindexed page. Common accident: staging `noindex` left after launch, or WordPress "Discourage search engines" setting. |
| Orphans | `sitemap-check.json` `in_sitemap_zero_inlinks`, `links.json` weakest | Link from relevant hub/service pages. If the page has no value, remove it from the sitemap. |
| Internal links | `links.json` | See `on-page-seo.md` § Internal links. |
| Images | images missing alt, no width/height | Descriptive alt for meaningful images, empty `alt=""` for decorative. Set dimensions. WebP/AVIF, lazy-load below the fold, never lazy-load the LCP image. |
| Mobile | viewport missing | Add viewport meta. Check tap targets and font size on the rendered page. |
| HTTPS/security | crawl final URLs | All pages HTTPS, valid cert, no mixed content. HSTS optional. |
| hreflang | crawl `hreflang` | Only for multi-language/region sites; must be reciprocal with self reference. |
| Open Graph | og missing | `og:title`, `og:description`, `og:image` (1200×630) on key pages: helps shares, not rankings. |

## Core Web Vitals

```bash
python scripts/integrations/pagespeed.py psi <template urls> --strategy mobile
python scripts/integrations/pagespeed.py crux --origin <https://host>
```

Thresholds (p75, field data): LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. Field data beats lab data. If CrUX has no data, use lab scores as directional only.

Common fixes by platform:
- WordPress: page-builder bloat, too many plugins, unoptimized hero images, no page cache. Use a caching plugin + image optimization + remove unused plugins.
- Next.js/React: ship server-rendered HTML, `next/image` with priority on LCP image, reduce client JS, avoid layout shift from late fonts/ads.
- Wix/Squarespace/Shopify: limited control: compress images, cut apps/scripts, simplify hero.

## Rendering (JavaScript sites)

Signal: `js_shell_suspect` pages, or crawl word counts far below what the browser shows.

1. Compare raw HTML (crawl) with rendered DOM (Playwright MCP `browser_snapshot`, or Chrome DevTools MCP).
2. Check that title, meta description, canonical, H1, body copy, and internal links are in the **raw** HTML. Google renders JS, but slower and less reliably; other engines and most AI crawlers do not run JS.
3. Fix with SSR/SSG/prerendering. Links must be `<a href>`, not click handlers.
4. Confirm with `gsc.py inspect` (rendered page is in the Search Console UI "View crawled page").

## Route/indexing issues (SPAs and frameworks)

- Every route returns HTTP 200 with its own HTML at its own URL. Unknown routes return 404, not the app shell with 200.
- No hash (`#/`) routing for indexable content.
- Server redirects (301), not client-side `window.location` redirects.

## Logging

For each confirmed problem:

```bash
python scripts/state/client_state.py issue add <slug> "<problem>" --severity <s> --area technical --urls <url> ...
```

When fixed and verified by re-running the script: `issue fix <slug> I-###`.
