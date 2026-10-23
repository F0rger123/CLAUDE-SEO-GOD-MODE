# Workflow: Content strategy

Goal: a prioritized content plan tied to business value. Output: `<client>/content-plan.md` from `templates/content-plan.md`.

Inputs: `keyword-map.csv` (`keyword-research.md`), competitor gaps, Search Console data, `profile.content_availability`.

## Priority order

1. **Fix and expand existing money pages** (fastest return; they already have history).
2. **Missing core service pages.**
3. **Location pages with real local substance** (`local-seo.md` doorway test).
4. **Proof content**: projects/case studies, before/after galleries, reviews page.
5. **FAQ content**: on service pages first; a separate FAQ page only if questions span services.
6. **Supporting articles** (blog) that answer pre-purchase questions and link to service pages.
7. **Refresh** of decaying pages (Search Console losers).

## Topic clusters

```
Pillar: /kitchen-remodeling/          (service page, commercial intent)
  ├─ /blog/kitchen-remodel-cost-york-pa/       cost factors (commercial investigation)
  ├─ /blog/kitchen-layout-ideas-small-homes/   inspiration (informational)
  ├─ /projects/<town>-kitchen-remodel/         proof
  └─ FAQ block on pillar: permits, timeline, financing
```

Every cluster page links to the pillar; the pillar links to the best cluster pages.

## Page brief format

For each planned page:

```
URL / title / H1:
Primary intent + keyword group:
Audience and their question:
Outline (H2s):
Facts needed from client: [CONFIRM: ...]
Proof to include: photos, project, review, credential
Internal links in: (pages that will link here)
Internal links out:
Schema: Service / FAQPage / Article / BreadcrumbList
CTA:
```

## Refresh priorities

From `compare_periods.py` losers and pages with high impressions + falling CTR/position: update facts, add missing subtopics, improve title, add proof, refresh date only when content really changed.

## Rules

- People first. Each page must help a real customer decide or act.
- No mass-produced near-duplicate pages. No AI filler paragraphs.
- Use only facts the client confirms. Mark unknowns `[CONFIRM]`.
- Drafts are proposals until the user approves publishing.

Log planned pages as recommendations; on approval, add tasks.
