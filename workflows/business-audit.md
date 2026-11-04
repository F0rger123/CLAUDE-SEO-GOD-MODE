# Complete business audit

The whole business, not only the website: website SEO/AEO/GEO, the Google Business Profile, listings on the sites customers and AI assistants read, the same details everywhere, reviews, and competitors. It ends with a **Business Score** (0–100) and a fix list where every item has steps.

The Chrome extension (Compete › Complete business audit) and the Android app (a business › Business audit) run the same audit automatically, using `extension/lib/business.js`. In a Claude session, follow the steps below.

## Ask first

Start from the website when there is one: read its LocalBusiness schema and pages for the name, the trade (schema type or main service), every address, the areas served, the services and the phone. Show what you found and let the person correct it. The extension and app do this automatically (`detectBusiness` in `extension/lib/business.js`).

1. The business name exactly as customers see it, every location (town and state), the services it sells, the areas it serves, and what it does in plain words ("roofing contractor", "permanent lighting installer").
2. Whether it serves customers at its address or travels to them (service-area business). This decides whether a missing address counts as a problem.
3. The main phone number and the website.

## Run it

1. **Website.** Run `seo_rate_site` on the site and record the Overall score.
2. **Competitors.** Search the web for "<what it does> <town>" for each location (up to 3), and "<service> <main town>" for the top 2 services. Note where the business itself ranks in each. Note the map pack, if shown, and the ranking business websites, skipping directories. Run `seo_competitor_scan` with up to 4 of them. Record how they score against the business and the services their sites list that it doesn't.
3. **Google Business Profile.** Search "<name> <town>".
   - No business panel: the profile is missing (`"found": false`).
   - Panel found: check it as `workflows/local-seo.md` describes, covering claimed, primary category, rating, review count against the map pack, website link, phone, hours, photos, description, posts and Q&A.
4. **Listings.** First open every profile the website links to (schema `sameAs`/`hasMap`, footer links) and confirm each names the business: those are listed. Use the `hasMap` Google Maps link to read the Google profile directly. Then run `business_directories` with the trade for the rest. For each directory that has a domain, search `"<name>" <town> site:<domain>`. A result naming the business means `listed`; none means `missing`.
   - For Apple Maps, run `apple_maps_check` if it's configured. Otherwise mark it `unknown` and give the check steps.
   - Bing Places: search bing.com/maps for the business, or mark it `unknown`.
5. **Consistent details.** Compare the phone and address on the website, its LocalBusiness schema (`seo_schema_check`), the Google profile and any listing snippets. Check that hours are set on Google and in the site's schema.
6. **Reviews.** Rating 4.5+ (`rating_ok`), and a review count at or above the map pack median (`count_ok`).
7. **Score.** Put the findings in the JSON shape in `scripts/business/business_audit.py` and run `business_score`.

## Report

- Lead with the Business Score and the five parts. A part that wasn't checked is "not checked", never a pass.
- Then the fix list, biggest first. Each item gets its steps, the free sign-up link, and why it matters, in plain words.
- Then the competitor comparison: their scores against the business, what they offer that it doesn't, and their review counts.

## Rules

- **Free only.** List only places with a free listing. Never recommend paid listings, lead-gen subscriptions, review gating or buying reviews.
- **Not found is a strong hint, not proof.** "Not found" from a search means the search didn't show a listing. Say so, and give the steps to check and claim.
- **No invented facts.** Never invent hours, addresses or categories; write `[CONFIRM: ...]`.
- **Owner does the claiming.** Claiming and editing profiles is done by the owner, or browser-assisted with their approval (`workflows/listings-browser.md`).
