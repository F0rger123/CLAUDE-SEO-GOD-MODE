# Workflow: Customer-journey query mapping

Original Agency Zero workflow. Concept credit: the "customer journey" idea in Illyism/seo-skills (https://github.com/Illyism/seo-skills). That repository has no license, so none of its text is used here.

Goal: map the questions a local customer asks at each stage, on Google and in AI assistants, to pages that answer them. Output: `<client>/data/journey-map.csv`. Findings follow `RULES.md`.

## Stages (local service example: roof replacement)

| Stage | What the customer is thinking | Typical queries / prompts | Page that should answer |
|---|---|---|---|
| 1. Problem | "Something is wrong" | "roof leaking after rain", "missing shingles what to do" | Help article or FAQ on the service page |
| 2. Options | "What are my choices?" | "repair vs replace roof", "metal vs asphalt roof" | Comparison section or article |
| 3. Cost and risk | "What will it cost, what can go wrong?" | "roof replacement cost york pa", "does insurance cover hail damage" | Cost-factors section, insurance page |
| 4. Choose a provider | "Who should I hire?" | "best roofer near me", "roofing companies york pa reviews" | Service page, reviews page, GBP |
| 5. Act | "Contact them" | brand + "phone", "free estimate" | Contact/booking page, GBP |

AI assistants get longer, conversational versions ("I live in Dover PA and my roof is 20 years old, should I replace it?"). The same pages answer them when the content is clear and specific.

## Sources (say which you used)

- OBSERVED: Search Console queries (`gsc.py performance --dimensions query,page`), client's call notes and quote forms, review text, GBP questions customers ask.
- INFERRED: People Also Ask and autocomplete from a manual SERP check; prompts you test in AI assistants.
- Never invent volumes. Mark volume UNKNOWN unless a data source provides it.

## Steps

1. List 5–15 real questions per stage from the sources.
2. Map each question to an existing URL, or mark "gap".
3. For gaps, decide: add a section to an existing page (default), or create a page only if the topic is substantial and people need it on its own. Google warns that creating pages for fan-out queries mainly to manipulate rankings is scaled content abuse.
4. Feed gaps into `content-strategy.md` and the internal-link plan (stage 1–3 pages link to stage 4–5 pages).

`journey-map.csv` columns: `stage,question,source,evidence_tag,current_url,status,action`.
