# Workflow: Structured data (schema)

Reference for properties and rich-result eligibility: `references/schema-reference.md`.

## Audit

```bash
python scripts/schema/schema_check.py --crawl <crawl.json> --client <slug> --out <dir>
```

Reports types per page, invalid JSON-LD, missing recommended properties, and NAP mismatches against state. Then validate 2–3 key pages manually:

- Google Rich Results Test: https://search.google.com/test/rich-results (Google rich-result eligibility)
- Schema Markup Validator: https://validator.schema.org/ (schema.org syntax)

Neither tool has a public API; this is a manual step or done in a browser by Claude if a browser tool is available.

## Baseline schema set for a local business

| Page | Types |
|---|---|
| Homepage | `Organization` (or the LocalBusiness subtype), `WebSite` |
| Contact / location page | LocalBusiness subtype with NAP, geo, hours, `areaServed` |
| Service pages | `Service` (provider -> business `@id`), `BreadcrumbList`, `FAQPage` if visible FAQs |
| Blog posts | `Article`/`BlogPosting` with author, dates |
| Projects | `BreadcrumbList`; images with good alt text |

Use `@id` to connect entities (`https://site/#organization`, `#localbusiness`) instead of repeating facts.

## Generate

All facts come from `state.json`. Fill gaps in the profile first.

```bash
python scripts/schema/generate_schema.py <slug> localbusiness --subtype GeneralContractor
python scripts/schema/generate_schema.py <slug> organization
python scripts/schema/generate_schema.py <slug> website
python scripts/schema/generate_schema.py <slug> service --service "Kitchen Remodeling" --url https://<host>/kitchen-remodeling/
python scripts/schema/generate_schema.py <slug> faq --faq-file faqs.json
python scripts/schema/generate_schema.py <slug> breadcrumb --crumbs "Home=https://<host>/" "Services=https://<host>/services/"
```

The script lists missing facts on stderr. Do not invent values.

## Rules

- Markup must describe content visible on the page. No hidden FAQs, no fake reviews.
- No self-serving `Review`/`AggregateRating` markup for LocalBusiness/Organization about the business itself; Google ignores it for rich results.
- FAQ rich results are shown only for a narrow set of authoritative sites (government/health), but FAQPage markup is still valid and helps machines read Q&A. Do not promise FAQ rich results.
- One consistent business entity across pages.
- Prefer the platform's SEO plugin output where it is correct (Yoast, Rank Math), and add only what is missing. Avoid duplicate conflicting entities from multiple plugins.

## Deploy and verify

Deploying is a user task unless CMS access is approved. After deploy: re-run `schema_check.py`, check one page in the Rich Results Test, mark issues fixed.
