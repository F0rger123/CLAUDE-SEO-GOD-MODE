# API reference (what each API can and cannot do)

Verified against vendor documentation as of 2026-10. Re-check limits when a call fails.

## Google Search Console API (v1, `searchconsole`)

| Resource | Methods | Notes |
|---|---|---|
| `sites` | list, get, add, delete | `add` adds a property to the account; verification is a separate (Site Verification API / manual) step |
| `searchanalytics` | query | Dimensions: date, query, page, country, device, searchAppearance. Up to 25,000 rows per request; page with `startRow`. ~16 months of data. Data lag ~2–3 days. Types: web, image, video, news, discover, googleNews. Anonymized queries omitted from query-level rows. |
| `sitemaps` | list, get, submit, delete | Submit = tell Google about a sitemap. Delete removes it from the report only. |
| `urlInspection.index` | inspect | Index status, coverage state, Google vs user canonical, last crawl, robots state, fetch state, rich results verdict. **Read-only.** Quota: 2,000/day and 600/min per property. |

Not in the API: Request Indexing for normal pages, Pages/coverage report totals, Core Web Vitals report, Links report, manual actions, removals, settings/users.

Scopes: `webmasters.readonly` (read), `webmasters` (sitemaps submit/delete).

## Google Indexing API

Only for pages with `JobPosting` or `BroadcastEvent` embedded in a `VideoObject` (livestreams). Not for general pages. See `indexing-limitations.md`.

## PageSpeed Insights API v5

`GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=&strategy=mobile|desktop&category=...&key=`
Returns Lighthouse lab results and CrUX field data (`loadingExperience`, `originLoadingExperience`). Use an API key; keyless shared quota is often exhausted.

## Chrome UX Report (CrUX) API

`POST https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=` with `origin` or `url`, optional `formFactor`. 28-day rolling p75 real-user metrics. CrUX History API gives weekly history. No data for low-traffic URLs/origins.

## Google Analytics Data API (GA4)

`runReport` for sessions, users, key events (conversions) by landing page, channel, etc. Use via the official GA MCP or the API. Organic search: `sessionDefaultChannelGroup = Organic Search`.

## Google Business Profile APIs

Family of APIs (Account Management, Business Information, Performance, Reviews via My Business v4, Notifications). Access requires an application and approval from Google. Without approval, GBP work is manual. Q&A and some features have been retired over time; check current docs before planning API work.

## Bing Webmaster API

Base: `https://ssl.bing.com/webmaster/api.svc/json/<Method>?apikey=<KEY>`. GET for reads, POST JSON for writes. Responses wrap data in `{"d": ...}`; dates are `/Date(ms)/`.

| Area | Methods (used by `bing.py`) |
|---|---|
| Sites | GetUserSites, AddSite, VerifySite, RemoveSite |
| Sitemaps | GetFeeds, GetFeedDetails, SubmitFeed, RemoveFeed |
| URL submission | SubmitUrl, SubmitUrlBatch, GetUrlSubmissionQuota, SubmitContent, GetContentSubmissionQuota |
| Performance | GetRankAndTrafficStats, GetQueryStats, GetPageStats, GetQueryPageStats, GetPageQueryStats |
| Crawl | GetCrawlStats, GetCrawlIssues, GetUrlInfo, FetchUrl, GetFetchedUrls |
| Keywords | GetKeyword, GetRelatedKeywords |
| Links | GetLinkCounts, GetUrlLinks |
| Other | GetBlockedUrls, AddBlockedUrl, SubmitSiteMove, GetQueryParameters |

URL submission quota varies per site; always read `GetUrlSubmissionQuota` instead of assuming a number.

## IndexNow

`POST https://api.indexnow.org/indexnow` with `{host, key, keyLocation, urlList}` (up to 10,000 URLs). 200/202 accepted; 403 key invalid; 422 URL/host mismatch; 429 too many requests. Shared across participating engines (Bing, Yandex, Seznam, Naver, Yep). Google does not participate.
