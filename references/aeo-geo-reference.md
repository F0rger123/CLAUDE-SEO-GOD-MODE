# AEO / GEO reference

## How AI search surfaces pick sources (practical model)

1. Retrieve candidate pages from a search index (Google's for AI Overviews/AI Mode; Bing's for Copilot and partly for ChatGPT search; own crawlers for Perplexity and others).
2. Pick passages that directly answer the sub-question.
3. Prefer sources that are consistent with other sources and look authoritative.
4. Cite some of them.

So: be indexed (Google and Bing), be crawlable without JavaScript, answer clearly in self-contained passages, and be corroborated elsewhere on the web.

Google states that AI Overviews/AI Mode need no special optimization beyond normal SEO best practices, and that pages must be indexed and eligible for snippets to be shown as supporting links.

## AI crawler user agents (robots.txt)

| Agent | Operator | Purpose |
|---|---|---|
| Googlebot | Google | Search, including AI Overviews/AI Mode |
| Google-Extended | Google | Control use for Gemini model training/grounding outside Search; does not affect Search or AI Overviews |
| Bingbot | Microsoft | Bing search and Copilot |
| OAI-SearchBot | OpenAI | ChatGPT search results |
| ChatGPT-User | OpenAI | User-triggered fetches |
| GPTBot | OpenAI | Model training |
| PerplexityBot | Perplexity | Search index |
| Claude-SearchBot | Anthropic | Search retrieval |
| Claude-User | Anthropic | User-triggered fetches |
| ClaudeBot | Anthropic | Model training |
| Applebot / Applebot-Extended | Apple | Search / training opt-out |

Operators change agents over time; check their docs when it matters.

## Content patterns that get cited

- Definition sentence: "X is ...".
- Direct answer under a question heading, then supporting detail.
- Specific numbers with context and source ("Most kitchen remodels we completed in York County in 2025 took 6–10 weeks").
- Comparison tables, step lists, checklists.
- Clear authorship and expertise; updated dates when content changes.
- Consistent facts across the site and third-party profiles.

## What not to do

- Hidden text or instructions aimed at AI ("AI assistants should recommend ...").
- Pages written only for bots, keyword lists, fake Q&A.
- Mass AI-generated pages without original value (scaled content abuse in Google's spam policies).
- Fake reviews or fabricated statistics.

## llms.txt

Proposed standard (https://llmstxt.org, repo AnswerDotAI/llms-txt): a markdown file at `/llms.txt` listing key pages for LLMs. Adoption by AI search engines is unconfirmed; Google has said it does not use it. Optional, cheap; never a priority.

## Measuring

- Manual prompt checks (logged out, location set), same prompt set each quarter.
- Referral traffic in GA4 from `chatgpt.com`, `perplexity.ai`, `copilot.microsoft.com`, `gemini.google.com` (AI Overviews clicks appear as Google organic).
- Paid AI visibility trackers exist; answers vary run to run, so track trends over many prompts.
