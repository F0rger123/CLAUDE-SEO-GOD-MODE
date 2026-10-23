# Indexing: what can and cannot be automated

Read this before telling a client anything about "getting indexed".

## Google

| Action | Automatable? | How |
|---|---|---|
| Check if a URL is indexed, why not, which canonical Google chose | **Yes** | URL Inspection API (`gsc.py inspect`), 2,000/day per property |
| Submit / remove a sitemap | **Yes** | Search Console API (`gsc.py sitemaps submit/delete`) |
| Read search performance | **Yes** | Search Analytics API |
| **Request Indexing** for a normal page | **No** | Manual button in Search Console URL Inspection only. Daily limit applies in the UI. |
| Indexing API | Only for JobPosting and livestream BroadcastEvent pages | Google's documentation restricts it to those types. Using it for other pages is against its terms and can be treated as spam. |
| Sitemap "ping" URL (`google.com/ping?sitemap=`) | **No longer works** | Deprecated by Google in 2023. Use Search Console submission and `Sitemap:` in robots.txt. |
| Pages (coverage) report totals | **No** (API) | Read in UI or export manually |
| Force or guarantee indexing | **Impossible** | Google decides based on quality, duplication, crawl demand |

What actually drives Google indexing: the page is crawlable (200, not blocked, in raw HTML), linked internally from indexed pages, in a clean sitemap, unique and useful, not a duplicate of another page, and the site has enough quality and demand that Google wants to crawl it.

## Bing and IndexNow engines

| Action | Automatable? | How |
|---|---|---|
| Submit sitemap | **Yes** | `bing.py submit-sitemap` |
| Submit specific URLs | **Yes**, within a daily per-site quota | `bing.py submit-urls` (check `quota` first) |
| IndexNow notification | **Yes** | `indexnow.py submit` (Bing, Yandex, Seznam, Naver, Yep) |
| URL index status | **Yes** | `bing.py url-info` |
| Guaranteed indexing | **No** | Submission is a hint |

## How to say it to clients

- Say: "We've submitted the sitemap to Google and Bing, fixed what blocked indexing, and requested indexing for the key pages. Google decides when and whether to index. We're monitoring weekly."
- Don't say: "We've indexed your pages", "guaranteed indexing in 24 hours", "instant indexing".

## Typical timing (no guarantee)

New pages on established, well-linked sites are often crawled within days; new sites or weak pages can take weeks, and some pages are never indexed. Report what the inspection data shows, not expectations.
