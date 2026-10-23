# Workflow: Onboarding

Goal: a complete client profile, a known integration status, a list of manual tasks for the user, and a scheduled first audit. Ends by moving `phase` to `audit`.

## Step 0: Create or load state

```bash
python scripts/state/client_state.py list
```

- Client exists: `python scripts/state/client_state.py resume <slug>` and ask only the fields under "Profile gaps".
- New client: pick a slug from the business name (lowercase, hyphens), then:

```bash
python scripts/state/client_state.py init <slug> --name "<Business>" --website <url> --area "<City, ST>"
```

## Step 1: Look before asking

Spend one quick pass learning what the site already says, so questions are confirmations, not blank prompts:

```bash
python scripts/crawling/robots_check.py <url>
python scripts/crawling/crawl.py <url> --max-pages 25 --out <client>/data/onboarding
```

From the crawl, draft: services (nav + service pages), phone, address, service areas mentioned, CMS hints (`wp-content`, `cdn.shopify.com`, `_next/`, `wixstatic`, `squarespace`), analytics tags present (`gtag`, `GTM-`), existing schema types. Present these as "here is what I found, correct me".

## Step 2: Ask in small groups

Ask one group per message. Skip any field already in state. Save answers right away with `client_state.py set` (lists as JSON).

**Group A: Business basics**
1. Industry, and the 3–8 core services in the client's own words. -> `profile.industry`, `profile.services`
2. Which services make the most money or are the priority? -> `profile.notes` or order `services` by priority
3. Who is the ideal customer (homeowners, businesses, age, budget, urgency)? -> `profile.target_audience`

**Group B: Geography**
4. Physical address(es) customers visit? Or a service-area business that hides its address? -> `profile.locations` (`[{"name","street","city","region","postal","country","phone","gbp_url","hours_spec"}]`; leave `street` empty if hidden)
5. Towns/counties served, and the drive-time limit. -> `profile.service_area`
6. Focus: local, regional, national, or remote/online? -> `profile.geographic_focus`

**Group C: Goals**
7. What counts as a conversion (call, form, booking, quote request, purchase)? -> `profile.conversion_goals`
8. Searches they want to show up for, and any they rank for today. -> `profile.ranking_goals`
9. Main competitors (names or sites), including who shows in the map pack. -> `profile.competitors`

**Group D: Platform and access**
10. CMS/framework and who can edit the site (you, client, developer)? -> `profile.cms`, `integrations.cms_access`
11. Analytics in use (GA4, other)? -> `profile.analytics`, `integrations.ga4`
12. Search Console set up? Who owns it? -> `integrations.gsc`
13. Bing Webmaster Tools? -> `integrations.bing`
14. Google Business Profile: exists, verified, who has access? -> `integrations.gbp`, `locations[].gbp_url`

**Group E: Content and history**
15. Known SEO problems, past penalties, recent redesign or domain change? -> `profile.current_issues`
16. Content they can supply: photos, project galleries, reviews, team bios, licenses, certifications, years in business. -> `profile.content_availability`, `profile.brand_facts`
17. Social and directory profiles. -> `profile.social_profiles`

Stop asking once enough is known to audit. Unknowns can be filled later; record them as tasks.

## Step 3: Integration plan

Read `docs/INTEGRATIONS.md` only for integrations whose status is not `connected`. For each missing one, create a user task with exact steps:

```bash
python scripts/state/client_state.py task add <slug> "Add <service-account-email> as Full user in Search Console for <property>" --owner user --workflow workflows/search-console.md
python scripts/state/client_state.py task add <slug> "Generate Bing Webmaster API key or add site to agency Bing account (import from GSC)" --owner user
python scripts/state/client_state.py task add <slug> "Grant Manager access on Google Business Profile to <agency email>" --owner user
```

Then give the user one consolidated checklist:

```
Manual steps for you (I can't do these):
1. ...
I can do now without access: crawl audit, schema check, competitor review, keyword ideas.
Waiting on access: Search Console data, URL inspection, Bing data.
```

## Step 4: Finish

```bash
python scripts/state/client_state.py set <slug> phase audit
python scripts/state/client_state.py log <slug> "Onboarding complete; N user tasks open"
```

Activate recurring items that apply (`client_state.py recurring activate <slug> RC-00X`).

Next: `workflows/initial-audit.md`.
