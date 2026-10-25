# Workflow: Apple Maps (Apple Business Connect)

Most local businesses never claim their Apple Maps place card, even though Apple Maps powers Siri, Spotlight, Safari suggestions, CarPlay and the Maps app on every iPhone. That makes it a cheap, overlooked win. Run this for every local client after Google Business Profile.

Facts checked 2026-10-25. Apple is moving Business Connect under the "Apple Business" name; menu labels may differ, so read the current Apple help page when a step doesn't match.

## What can be automated, and what can't

| Task | How | Automated? |
|---|---|---|
| Check whether the business appears on Apple Maps, and with what name, address and category | `scripts/integrations/apple_maps.py check` or MCP `apple_maps_check` (official Apple Maps Server API) | **Yes**, read-only. Needs an Apple Developer membership and a Maps key (`docs/CONNECT.md`, Apple Maps). |
| Claim, verify and edit the place card (hours, phone, website, photos, categories, action links, Showcases) | Apple Business Connect web portal (business.apple.com / businessconnect.apple.com) | **Browser-assisted only:** Claude in Chrome fills forms in the owner's logged-in browser, and the owner approves each submit (`workflows/listings-browser.md`). |
| Bulk or API edits | Apple Business API | **Approved partners only:** listings agencies, data aggregators, SaaS platforms. Apple must verify the partner and the business must delegate access. Not available to a typical owner or small agency. |
| Keep Apple in sync with Google, Bing and Yelp automatically | A listings aggregator with Apple partner access (e.g. BrightLocal Active Sync, Yext, Synup, Uberall) | Yes, paid per location (`references/social-and-listings.md`). |

Don't use unofficial scrapers or bots that log in with the owner's password.

## Steps

### 1. Check (2 minutes, if Apple Maps is connected)

```bash
python scripts/integrations/apple_maps.py check --name "<business name>" --near "<town, ST>" --address "<street if public>" --json <client>/data/apple-maps-<date>.json
```

| Verdict | Meaning | Next |
|---|---|---|
| FOUND | Name matches and so does the address, if one was given | Claim it (step 2) if not already claimed, then complete it (step 3) |
| FOUND_ADDRESS_DIFFERS | A place with the name exists, but at another address | Possibly an old or duplicate listing. Claim it and fix it, or report it in the portal. |
| NOT_FOUND | No confident match near the town | Create the place card (step 2) |

Not connected: search Apple Maps for the business on an iPhone or at maps.apple.com and record what you see as OBSERVED (manual), or UNKNOWN.

Record it: `client_state.py set <slug> integrations.apple_maps '{"status":"found|not_found|claimed","notes":"..."}'`.

### 2. Claim or create (owner, about 10 minutes plus verification)

Tell the owner, word for word:

1. Go to **businessconnect.apple.com** (or business.apple.com) and sign in with an Apple Account. A business-owned Apple Account is better than a personal one.
2. Choose **Claim** if your business shows up in the search, or **Add** if it doesn't.
3. Enter the details exactly as they appear on your Google Business Profile: the same business name, phone number and website.
4. Verify. Apple offers options such as a phone call to the business number or uploading business documents. Use whichever it offers you.
5. When it's verified, tell me and I'll help fill in the rest.

Service-area business without a storefront: follow Apple's current options shown during the claim. If Apple requires a public address and the owner won't show one, record it as a limitation (UNKNOWN), not a failure.

### 3. Complete the place card (browser-assisted or owner)

Use the same facts as Google Business Profile. Inconsistent data hurts trust everywhere. The checklist:

- Primary category, plus extra categories only if they're real services
- Phone, website (with `?utm_source=apple&utm_medium=listing` so GA4 can count Apple visits), and hours, including holiday hours
- Logo, a cover photo, and real photos of the work, team and vehicles
- Action links if the business has them: book, quote, call
- **Showcases** (Apple's promotion cards): a seasonal offer or a featured project, refreshed monthly
- Add the Apple Maps place URL to the website's Organization/LocalBusiness `sameAs` once it's live

### 4. Re-check monthly

Re-run step 1, and look at **Insights** in the portal (how people found the card and what they tapped). Log what you saw with `client_state.py checkpoint <slug> --source apple --metric <name> --value <n>`, using only numbers the portal shows.

## Evidence rules

- An `apple_maps.py` result is OBSERVED for name, address and category only. Phone, hours, photos and ratings aren't returned by that API, so they stay UNKNOWN unless you saw them in the portal or the Maps app.
- Never say a business "ranks" on Apple Maps from a single search.
