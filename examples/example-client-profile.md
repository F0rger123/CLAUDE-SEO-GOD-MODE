# Example client: Summit Ridge Roofing (fictional)

A fictional York, PA roofing company showing what a filled-in client looks like after onboarding and the first audit. Names, numbers, and URLs are invented for illustration.

## Commands that built this state

```bash
python scripts/state/client_state.py init summit-ridge-roofing --name "Summit Ridge Roofing" --website https://summitridgeroofing.example --area "York, PA"
python scripts/state/client_state.py set summit-ridge-roofing profile.industry "Residential roofing"
python scripts/state/client_state.py set summit-ridge-roofing profile.services '["Roof replacement","Roof repair","Storm damage and insurance claims","Gutters"]'
python scripts/state/client_state.py set summit-ridge-roofing profile.service_area '["York, PA","Red Lion, PA","Dover, PA","Hanover, PA","Shrewsbury, PA"]'
python scripts/state/client_state.py set summit-ridge-roofing profile.geographic_focus local
python scripts/state/client_state.py set summit-ridge-roofing profile.locations '[{"name":"Office","street":"","city":"York","region":"PA","postal":"17402","country":"US","phone":"717-555-0142"}]'
python scripts/state/client_state.py set summit-ridge-roofing profile.conversion_goals '["Phone call","Free inspection form"]'
python scripts/state/client_state.py set summit-ridge-roofing profile.cms "WordPress + Astra theme"
python scripts/state/client_state.py set summit-ridge-roofing integrations.gsc '{"status":"pending_user","property":"sc-domain:summitridgeroofing.example","notes":"owner to add service account"}'
python scripts/state/client_state.py task add summit-ridge-roofing "Add seo-reader@agency-zero-seo.iam.gserviceaccount.com as Full user in Search Console" --owner user
python scripts/audit.py --client summit-ridge-roofing --log-issues
python scripts/state/client_state.py rec add summit-ridge-roofing "Create Storm Damage Roof Repair page with insurance claim process" --area content --reason "Service offered, no page; competitors rank with dedicated pages"
python scripts/state/client_state.py rec add summit-ridge-roofing "Create Hanover location page" --area local
python scripts/state/client_state.py rec reject summit-ridge-roofing R-002 --reason "Owner: only 2 jobs in Hanover; not a focus market"
```

## Resulting `state.json` (abridged)

```json
{
  "schema_version": 1,
  "slug": "summit-ridge-roofing",
  "phase": "roadmap",
  "profile": {
    "business_name": "Summit Ridge Roofing",
    "website": "https://summitridgeroofing.example",
    "industry": "Residential roofing",
    "services": ["Roof replacement", "Roof repair", "Storm damage and insurance claims", "Gutters"],
    "locations": [{"name": "Office", "street": "", "city": "York", "region": "PA", "postal": "17402", "country": "US", "phone": "717-555-0142"}],
    "service_area": ["York, PA", "Red Lion, PA", "Dover, PA", "Hanover, PA", "Shrewsbury, PA"],
    "geographic_focus": "local",
    "target_audience": "Homeowners in York County with roofs 15+ years old or recent storm damage",
    "conversion_goals": ["Phone call", "Free inspection form"],
    "competitors": [{"name": "Competitor A Roofing", "url": "https://competitor-a.example"}],
    "cms": "WordPress + Astra theme",
    "analytics": "GA4",
    "sitemap_url": "https://summitridgeroofing.example/sitemap_index.xml",
    "ranking_goals": ["roof replacement york pa", "roofer near me", "storm damage roof repair york"],
    "primary_phone": "717-555-0142",
    "brand_facts": {"founded": "2012", "license": "PA HIC (number on file with owner)", "price_range": "$$"}
  },
  "integrations": {
    "gsc": {"status": "pending_user", "property": "sc-domain:summitridgeroofing.example", "notes": "owner to add service account"},
    "bing": {"status": "not_set_up", "property": "", "notes": "import from GSC once connected"},
    "gbp": {"status": "connected", "property": "Manager access granted", "notes": ""}
  },
  "audit": {"status": "complete", "last_run": "2026-10-20", "runs": [{"date": "2026-10-20", "pages": 41, "issue_groups": 12}]},
  "tasks": [
    {"id": "T-001", "title": "Add seo-reader@... as Full user in Search Console", "owner": "user", "status": "open"}
  ],
  "issues": [
    {"id": "I-001", "title": "Sitemap contains 6 non-indexable URL(s)", "severity": "high", "area": "indexing", "status": "open"},
    {"id": "I-002", "title": "Missing H1", "severity": "medium", "area": "headings", "status": "open"}
  ],
  "recommendations": [
    {"id": "R-001", "title": "Create Storm Damage Roof Repair page with insurance claim process", "status": "proposed"},
    {"id": "R-002", "title": "Create Hanover location page", "status": "rejected", "reason": "Owner: only 2 jobs in Hanover; not a focus market"}
  ],
  "checkpoints": [
    {"date": "2026-10-20", "source": "gbp", "metric": "reviews_total", "value": 38}
  ]
}
```

## What `resume` prints for this client (abridged)

```
# Summit Ridge Roofing  (https://summitridgeroofing.example)
phase: roadmap | audit: complete

## Profile gaps (ask only these)
current_issues, content_availability

## Waiting on user (1)
- T-001 Add seo-reader@... as Full user in Search Console

## Open issues (2)
- I-001 [high] Sitemap contains 6 non-indexable URL(s)
- I-002 [medium] Missing H1

## Recommendations: 1 open, 1 rejected (never re-propose rejected)
```
