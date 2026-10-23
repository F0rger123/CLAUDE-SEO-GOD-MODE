# Workflow: On-page SEO

Use for titles, descriptions, headings, service-page structure, FAQs, internal links, and conversion clarity.

## Audit (top 10–20 money pages)

Pick pages from: the services list, Search Console top pages (if connected), and pages with commercial intent. Use `crawl.json` fields (`title`, `meta_description`, `h1`, `headings`, `word_count`, `internal_links`, `images`) and `metadata-issues.json`. Fetch the page only when you need the body text.

For each page, check:

| Element | Good |
|---|---|
| Intent | One primary topic/intent per page. No two pages competing for the same intent (cannibalization). |
| Title | Unique, ~50–60 chars, primary topic first, location if local, brand last. E.g. `Kitchen Remodeling in York, PA | D-Hauss Remodeling`. |
| Meta description | Unique, ~120–160 chars, specific benefit + proof + call to action. Not a ranking factor; it drives clicks. |
| H1 | One, matches the page topic in plain words. |
| H2/H3 | Logical outline: what it is, who it's for, process, pricing factors, areas served, proof, FAQ. No skipped levels for styling. |
| Intro | First 2–3 sentences say what the service is, where, and for whom. |
| Entity clarity | Business name, service, location, and credentials stated in text. |
| Proof | Photos of real work, project examples, reviews, licenses, warranties, years in business. |
| Conversion | Phone (click-to-call), form, or booking above the fold and at the end. One clear primary action. |
| FAQs | Real customer questions with direct answers (from sales calls, reviews, People Also Ask). |
| Images | Descriptive file names and alt text, compressed, dimensions set. |
| Internal links | Links to related services, the location page, and from the homepage/nav. Descriptive anchors. |
| Keywords | Main term and natural variants used where they fit. Never repeated for density. |

## Service-page architecture

```
/services/                     hub: brief summary of each service, links down
/services/<service>/           one page per core service
/service-areas/                hub listing real areas (optional)
/service-areas/<town>/         only with unique local content (see local-seo.md)
/projects/ or /portfolio/      proof; link projects to service + town pages
/about/ /contact/ /reviews/    trust + NAP
```

Flat is fine for small sites (`/kitchen-remodeling/`). Keep URLs short, lowercase, hyphenated, permanent.

## Rewrites

Claude can draft: titles, descriptions, H1/H2 outlines, intros, FAQ blocks, alt text, internal-link suggestions. Rules:

- Use the client's facts only (state profile, their site, what they tell you). Mark unknowns as `[CONFIRM: ...]` instead of guessing prices, years, licenses, or guarantees.
- Write for the customer first: plain language, specific, scannable.
- Deliver as a table: `URL | element | current | proposed | reason`. Save to `<client>/data/onpage-rewrites-<date>.md`.
- Publishing is a user task unless Claude has CMS access approved for this action.

## Internal links

From `links.json` `weakest_inlinks` and the content plan:

1. Every money page gets links from the homepage or main nav plus at least 2–3 contextual links from related pages.
2. Hubs link down; children link up and across to siblings where useful.
3. Blog/supporting posts link to the service page they support.
4. Anchors describe the target (`bathroom remodeling services`), not `click here`. Vary naturally.
5. Fix internal links that hit redirects or 404s (from `links.json`).

Output a link plan: `source URL | anchor text | target URL | placement`.

## Logging

Issues per page or per template (`--area on-page`). Recommendations for rewrites, merges (cannibalization), and new pages. Re-run `metadata_audit.py` after publishing to verify, then `issue fix`.
