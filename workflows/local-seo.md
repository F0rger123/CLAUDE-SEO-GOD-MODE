# Workflow: Local SEO

Use for any business that serves customers in a defined area: storefronts, service-area businesses (SABs), and multi-location brands. Reference: `references/local-seo-reference.md`.

## Inputs (from state)

`profile.locations`, `profile.service_area`, `profile.services`, `profile.competitors`, `integrations.gbp`. Ask only for gaps.

## Audit

### 1. Google Business Profile (manual review or screenshots from the user)

Checklist; record each gap as an issue (`--area local`):

- Verified, owned by the business (not a former agency or web designer).
- Primary category is the most specific match for the main money service. Secondary categories cover other real services. (Primary category is among the strongest local ranking signals.)
- Business name matches real-world signage. **No keyword stuffing** in the name: it violates GBP guidelines and risks suspension.
- Address: shown for storefronts, hidden for SABs. Service areas set (cities/counties, not a huge radius).
- Phone: local number, matches website.
- Website link points to the homepage or the matching location page; consider UTM tags (`?utm_source=google&utm_medium=organic&utm_campaign=gbp`) so GA4 can separate GBP traffic.
- Hours, holiday hours, attributes, services list with descriptions, products if relevant.
- Description: plain, accurate, 750 characters max, no URLs or promos.
- Photos: real work, team, vehicles, storefront; recent uploads.
- Reviews: count, rating, velocity (last 90 days), owner response rate.
- Posts: recent activity (updates, offers, projects).

### 2. NAP consistency

Collect the canonical Name / Address / Phone from state. Compare against: website footer and contact page, LocalBusiness schema (`schema_check.py --client <slug>` flags mismatches), GBP, Bing Places, Apple Business Connect, Facebook, Yelp, BBB, Angi/HomeAdvisor/Houzz (home services), industry directories, chamber of commerce.

Record mismatches in a table in the audit report. Fixing citations is mostly manual (user task) or via a paid aggregator; the user decides.

### 3. Website local relevance

- Homepage and contact page show full NAP (or city + phone for SABs) as text, not only an image.
- Embedded map on contact/location pages.
- LocalBusiness schema with the most specific subtype (`schema.md`).
- Service pages mention the real service area naturally (projects, neighborhoods, local regulations, climate), not a list of 40 towns in the footer.
- Location pages, if any: check each for unique, useful content (see below).

### 4. Map pack and competitor check

For 3–5 core "service + city" terms:
- Manual: search from the area (or use a location-set browser) in a private window; record top 3 map-pack businesses, their primary category, review count, rating.
- Paid tools (optional): DataForSEO local pack / Maps endpoints, or a geo-grid tool. See `references/tools.md`.
- Compare against the client. Typical gaps: category, review count/velocity, proximity (cannot change), website relevance.

## Strategy

### Service-area strategy

Rank order for what to build:

1. **One strong page per core service** (e.g. Kitchen Remodeling), mentioning the primary market.
2. **Location pages only where the business really works and can say something specific**: projects completed there, local permits/codes, neighborhoods, travel time, testimonials from that town, photos. Target: 1 page per meaningful town, not per zip code.
3. **Service × city pages** only for high-value combinations with real search demand and real local proof.

**Doorway-page test** (Google spam policy). Do not build a page if:
- its content would be the same as another page with the town name swapped;
- the business has no projects, customers, or presence there;
- the only purpose is to funnel visitors to the same page.

### Keyword mapping

Build a map in `<client>/data/keyword-map.csv`: `keyword, intent, service, location, target_url, status`. One primary intent per URL. See `keyword-research.md`.

### Reviews

- Ask every happy customer; send a direct review link (GBP > Ask for reviews).
- Do not gate reviews (only asking happy customers through a filter page) and never offer incentives; both break Google's policies.
- Respond to every review: thank, mention the service and town naturally, resolve complaints.
- Track: `client_state.py checkpoint <slug> --source gbp --metric reviews_total --value N` monthly.

### Citations

Which platforms have APIs or Claude connectors (and which are manual only): `references/social-and-listings.md`.


Priority: data aggregators and the platforms above first, then industry and local (chamber, BBB, local news sponsorships). Quality over volume. Paid listing services are optional; the user decides.

### Local links and mentions

Sponsorships, local associations, supplier/manufacturer dealer locators, local news (projects, community work), partner businesses. Log ideas as recommendations.

## Outputs

- Issues and recommendations in state.
- Location/service page plan in `content-plan.md` (`content-strategy.md`).
- User tasks for GBP edits and citation work.
- `client_state.py log <slug> "Local audit done"`.
