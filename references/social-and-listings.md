# Social profiles and business listings: what Claude can connect to

Checked 2026-10-23. Re-check before relying on it; these change often. "Verified" means the vendor publishes it. Every community server listed is unreviewed: read its code and license before installing, and keep it read-only or dry-run until the owner approves posting.

Why it matters for SEO/GEO: consistent profiles (`sameAs`), matching name/phone/town (NAP), fresh posts, and reviews are local and entity signals. Posting itself is a user-approved external action (RULES.md): draft, show, then post only on a clear yes.

| Platform | API for a normal small business? | Claude connector | Recommendation |
|---|---|---|---|
| Facebook Pages | Yes (Meta Graph API, Pages only; personal profiles can't post via API) | Community MCP servers, for example `oliverames/meta-mcp-server` (Pages, Instagram, Threads, scheduling), `hagaihen` facebook-mcp-server (Python), Social Broadcast MCP (MIT, FB + IG + YouTube). Unverified. | Owner creates a Meta developer app and a Page access token. Use a server with a dry-run default. |
| Instagram | Yes, for Business/Creator accounts linked to a Facebook Page (Graph API) | Same Meta servers | Convert to a Business account linked to the Page first. |
| Buffer (schedules FB, IG, GBP, others) | Yes: public GraphQL API at `https://api.buffer.com` (posts, scheduling, channels, ideas); see developers.buffer.com | No official MCP found. A small wrapper over the GraphQL API is easy to write. | Best single route to schedule across FB, IG and Google Business Profile with one token. |
| Google Business Profile | Yes, but API access requires an application and approval | (Buffer can post to GBP) | Use Buffer for GBP posts; use the GBP UI for edits. |
| Yelp | Read only (Fusion API: search, business details, up to 3 review excerpts); no posting or listing edits | Official `Yelp/yelp-mcp` (Fusion AI) plus community `yelp-mcp-min` (Fusion v3) | Use to read your listing and competitors. Edit the listing in Yelp for Business. |
| Nextdoor | Partner-only (application required): ads, publishing and display APIs | None public | Manage in the Nextdoor business app. Not automatable for a typical owner. |
| Bing Places | Restricted to trusted partners managing many listings | None | Manage at bingplaces.com (import from Google Business Profile). Bing Webmaster (`scripts/integrations/bing.py`) covers the website side. |
| Apple Business Connect | Listings edits: Apple Business API for approved partners only. Presence checks: official Apple Maps Server API (read-only, needs an Apple Developer key) | `scripts/integrations/apple_maps.py`, MCP `apple_maps_check`; community MCPs `romanvrable/apple-maps-mcp`, `johnisanerd/apple-maps-mcp` (search only) | Claim and manage at businessconnect.apple.com: `workflows/apple-business-connect.md`. |

## What an agent should do

1. Ask the owner for each profile URL once (one message). Add them to the site's Organization/LocalBusiness `sameAs` and check that name, phone and town match the Google Business Profile.
2. For posting, propose the lowest-effort route: Buffer (one token covers FB, IG and GBP), or a Meta MCP server for FB and IG only. Explain the owner steps (developer app or Buffer token) in plain words, like `docs/CONNECT.md`.
3. Draft posts from real jobs only (photo, town, what was installed). No invented results or reviews. Post only after the owner approves each one.
4. Yelp, Nextdoor, Bing Places and Apple: give the owner the exact listing checklist (same name, phone, category, hours, website with UTM `?utm_source=<platform>&utm_medium=listing`) rather than promising automation that doesn't exist.

## Beyond the APIs: legitimate ways to cover the gaps

Checked 2026-10-23.

| Route | Covers | Cost | Notes |
|---|---|---|---|
| **Browser-assisted management** (Claude in Chrome, in the owner's own logged-in browser) | Nextdoor, Bing Places, Apple Business Connect, Yelp for Business, the Google Business Profile UI, Facebook | Free | Claude fills forms and drafts replies on the real dashboards; the owner signs in and approves every submit. Workflow: `workflows/listings-browser.md`. |
| **Listing aggregator with official partner APIs**: BrightLocal Active Sync, Yext, Synup, Uberall | Pushes name, phone, hours and categories to Google, Apple Maps, Bing Places, Facebook and Yelp from one place | Paid per location | The real fix for "partner-only" platforms. BrightLocal is the small-business option; Yext and Synup target agencies. |
| **Google Business Profile API** | Review replies, posts, profile edits | Free; needs an access application to Google | Worth applying for one owned profile. Until approved, Buffer can post to GBP. |
| **Review data**: OpenSEO `get_business_reviews`, Yelp official MCP, Outscraper MCP (paid scraping service) | Read reviews and track competitors | Credits | Read only. Replies happen on the platform. |
| **Nextdoor Ads**: hosted MCP on Pipedream | Ad campaigns only | Nextdoor ad spend | Not for organic posts. |

### Not recommended

Unofficial or reverse-engineered APIs, scraping logged-in pages, or bots that post with a stored password on Nextdoor, Yelp, Google or Facebook. They break those platforms' terms and can get the listing suspended. A suspended Google Business Profile costs far more than any automation saves. Don't install or build them for a client.
