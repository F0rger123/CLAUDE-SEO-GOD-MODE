---
name: ai-search-answer-workflow
description: Make a client's pages clearly answer the real questions people search, so they are eligible for Google AI Overviews / AI Mode and citable by ChatGPT, Perplexity, and Claude search. Grounded in Google's "Optimizing your website for generative AI features on Google Search" (Search Central, May 15, 2026). Use for AI Overviews, AI Mode, AI answers, "answer engine", or "get cited by AI" requests.
---

# AI search answer workflow

Agency Zero original skill. Follows `/RULES.md`: every finding is tagged OBSERVED, INFERRED, RECOMMENDED, or UNKNOWN, and no data is invented.

## What Google actually says (source of truth)

Source: Google Search Central, "Optimizing your website for generative AI features on Google Search", https://developers.google.com/search/docs/fundamentals/ai-optimization-guide (published 2026-05-15; page last updated 2026-07-10 when checked on 2026-10-23). Re-read it before quoting it to a client.

- AI Overviews and AI Mode are rooted in Google's **core Search ranking and quality systems**. They use **retrieval-augmented generation (RAG)** to ground answers in indexed pages, and **query fan-out** (the model issues several related queries at once).
- **Eligibility:** a page must be **indexed and eligible to be shown in Search with a snippet**. The guide also says the site must be included in Search Console's **"Search generative AI features"** setting.
- **No extra requirements:** no special schema.org markup, no AI text files, no Markdown versions. Structured data is not required for generative AI search (still useful for rich results).
- **No guarantee:** "Indexing and serving aren't guaranteed." Never promise a client AI Overview placement or citation.
- **Things Google says to skip:** llms.txt and "special" markup (Google Search does not use them), "chunking" content into tiny pieces, rewriting content just for AI systems, seeking inauthentic mentions, overfocusing on structured data. There is "no ideal page length".
- **Spam warning:** creating pages for fan-out queries primarily to manipulate rankings violates Google's scaled content abuse policy.
- **Local:** Google Business Profiles help products and services show in AI responses and other Search results.
- **Measurement:** Search Console's **Generative AI performance report**.

### Where this workflow goes beyond Google's text

These are Agency Zero practices, labeled as such. Do not present them as Google requirements.

| Practice | Status |
|---|---|
| Lead with a direct ~40–60 word answer | House heuristic for readability and quotability. Google names no ideal length and warns against rewriting just for AI, so make the change only where it also helps a human reader. |
| FAQ schema | Optional. Only when the page shows those exact Q&As. Google says it's not needed for AI features. |
| One page per sub-question | Only when the sub-question is substantial and people need it on its own. Default to a section on an existing page (scaled-content warning above). |
| Allowing OAI-SearchBot, PerplexityBot, Claude-SearchBot | For ChatGPT, Perplexity, and Claude search visibility; Google's guide does not cover other engines. |
| llms.txt | Optional, for non-Google systems. Never describe it as a Google requirement. |

## Workflow

### 1. Pull real questions (Search Console)

```bash
python scripts/integrations/gsc.py performance --site <prop> --dimensions query,page --days 90 --out <client>/data/ai-answer/gsc-query-page-<date>.csv
```

These are the exact queries people typed before landing on each page (OBSERVED). Keep question-like and long-tail queries. No Search Console access means query grading is UNKNOWN. Do not substitute invented questions. You may add questions from `workflows/customer-journey.md` sources, tagged INFERRED.

Also check, in Search Console (manual unless an API exposes it): the "Search generative AI features" setting and the Generative AI performance report. Record what you see, or UNKNOWN.

### 2. Grade every page against its questions

```bash
python scripts/ai_answer/answer_check.py --site <url> --crawl <crawl.json> --queries <gsc csv> --client <slug> --out <client>/data/ai-answer
```

It reports, with tags: robots access for Googlebot, Bingbot, OAI-SearchBot, PerplexityBot, Claude-SearchBot (plus training bots as a policy note); snippet blockers (noindex, nosnippet, max-snippet:0, data-nosnippet); who/what/where clarity; the opening paragraph; question headings that bury the answer; numeric claims without sources; FAQ schema that doesn't match visible text; and a per-query grade (clearly / partly / not clearly addressed — a heuristic, INFERRED). Read `answer-check.md`, not the JSON.

### 3. Rewrite pages that don't clearly answer (drafts only)

For each flagged page, draft changes in `<client>/data/ai-answer/rewrites-<date>.md` as `URL | element | current | proposed | evidence tag`:

- Open with a direct answer to the main question, in plain words (house heuristic ~40–60 words).
- Then the specifics: process, what's included, cost factors, timelines, materials, local conditions.
- Statistics only if real and sourced: the client's own records (say so) or a linked source. Mark anything unconfirmed `[CONFIRM]`. Never invent numbers, reviews, clients, or certifications.
- FAQ section only with real customer questions; FAQPage JSON-LD only if it matches the visible text (`scripts/schema/generate_schema.py <slug> faq`).
- Improve for people first. If a change only serves an AI system, drop it.

Optional engine: `skills/vendor/egeoagents` (`egeo optimize` / `fix-gaps`) can propose rewrites. Treat its output as a draft and apply the same rules.

### 4. Cover the fan-out subtopics

List the sub-questions behind each main query (from the GSC export, People Also Ask, and the customer journey map). For each one, choose:

- **Section** on the main page (default), or
- **Separate page**, only if the subtopic is substantial, distinct, and useful on its own.

Link sub-pages and the main page to each other with descriptive anchors. Never mass-produce near-identical pages.

### 5. Re-check weekly

```bash
python scripts/integrations/gsc.py performance --site <prop> --dimensions page --days 7 --compare-previous --out-dir <client>/data/ai-answer
python scripts/reporting/compare_periods.py <prev.csv> <cur.csv>
```

Track clicks and impressions for the changed pages (OBSERVED) plus the Generative AI performance report (manual). Any link between a change and movement is INFERRED. Allow several weeks before judging.

## Crawler allowlist (robots.txt)

Required allowed: `Googlebot`, `Bingbot`, `OAI-SearchBot`, `PerplexityBot`, `Claude-SearchBot`. Training bots (`GPTBot`, `ClaudeBot`, `Google-Extended`, `CCBot`) are the client's choice. `Google-Extended` does not affect Search or AI Overviews. Also check CDN/WAF bot blocking (robots.txt cannot show it).

## Local businesses

- Every service page states plainly **who** the business is, **what** it does, and **where** it operates (town/county), in the title, H1, or first paragraph.
- Keep Google Business Profile current: categories, services, hours, phone, service area, photos (user task; `workflows/local-seo.md`).
- Same name, phone, and service area on the site, GBP, and schema.

## Done when

All required bots allowed (or the client chose otherwise, recorded), every money page snippet-eligible and clearly answering its top queries, rewrites approved by the user, and weekly tracking set up with `client_state.py recurring add`.
