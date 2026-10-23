# Workflow: browser-assisted listings and reviews

For platforms with no usable API (Nextdoor, Bing Places, Apple Business Connect, Yelp for Business) and for Google Business Profile edits before API approval. Uses a browser tool (Claude in Chrome or the built-in browser) in the owner's own session.

## Rules

- The owner signs in themselves. Never ask for or type their password, and never store cookies or tokens.
- Show the owner exactly what will be submitted (text, fields, photos) and get a yes before every **Save, Post, Publish or Reply** click.
- Use only real facts: the same name, phone, town, hours, categories and website as the Google Business Profile. No invented reviews or claims.
- One platform per sitting. Log what changed (platform, field, old value, new value, date) in the client's report.

## Steps per platform

1. **Bing Places** (bingplaces.com): use "Import from Google Business Profile", then check categories, hours, website (add `?utm_source=bing&utm_medium=listing`), and photos.
2. **Apple Business Connect** (businessconnect.apple.com): claim the place card, set category, hours, phone, website (UTM `apple`), and logo; for a service-area business, set the service area instead of a street address.
3. **Yelp for Business** (biz.yelp.com): claim, match name/phone/hours, set "Serves customers at their location", add services and photos. Never ask customers for Yelp reviews (Yelp forbids soliciting them).
4. **Nextdoor** (business.nextdoor.com): claim the business page, match the details, add photos. Owner-approved neighborhood posts only, about real recent work.
5. **Google Business Profile** (business.google.com): services with descriptions, weekly posts with a real job photo, and replies to every review that name the service and town naturally.
6. **Facebook / Instagram**: about info matching the profile, website link with UTM; posts via Buffer or a Meta connector if set up (`references/social-and-listings.md`).

## After

Add each claimed profile URL to the site's `sameAs`. Re-check name, phone and town consistency across all of them, and note the date for the next monthly check.
