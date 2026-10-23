# Workflow: Keyword research

Goal: a keyword map that assigns one primary intent to each URL, prioritized by business value. Output: `<client>/data/keyword-map.csv`.

## Data sources (use what is available, say which)

| Source | Cost | Gives |
|---|---|---|
| Search Console queries (`gsc.py performance --dimensions query,page`) | free | Real impressions/positions for this site. Best source for existing sites. |
| Bing (`bing.py keyword` / `related`) | free | Bing volume trends, related terms |
| Google Ads Keyword Planner (manual, in Google Ads UI) | free with an Ads account | Google volume ranges (exact volumes need active spend) |
| Google autocomplete, People Also Ask, related searches (manual SERP review) | free | Real phrasing and questions |
| DataForSEO / other paid APIs (optional MCP) | paid | Volumes, difficulty, SERP features at scale |
| Client: sales calls, quote forms, reviews | free | The words customers use |

Never invent search volumes. If no volume source is connected, rank by intent and business value and label volumes "unknown".

## Steps

1. **Seeds** from `profile.services` × `profile.service_area` plus problems the service solves (`leaky shower`, `kitchen layout ideas`).
2. **Expand** with the sources above. Keep: service terms, service + location, "near me", cost/price, comparison (`x vs y`), problem/question terms.
3. **Classify intent**: transactional (hire/buy), commercial investigation (cost, best, reviews), informational (how/why), navigational (brand).
4. **Group** terms that a single page should satisfy (same intent, same SERP). If the top results for two terms are mostly the same URLs, they belong on one page.
5. **Map** each group to an existing URL or a proposed new URL. Flag cannibalization (two URLs on one group).
6. **Prioritize**: business value (money service, margin, area) > intent > opportunity (current position 4–20, weak competitors) > volume.

## Output format

`keyword-map.csv` columns:

```
group,primary_keyword,variants,intent,service,location,volume_source,volume,current_position,target_url,action,priority
```

`action`: keep / optimize / create / merge. Feed `create` rows into `content-strategy.md` and `optimize` rows into `on-page-seo.md`.

Log the top 5–10 actions as recommendations.
