# Workflow: AEO / GEO (AI search visibility)

Answer Engine Optimization and Generative Engine Optimization: making the business easy for AI systems (Google AI Overviews and AI Mode, ChatGPT search, Perplexity, Microsoft Copilot, Gemini, Claude) to understand, trust, and cite. Reference: `references/aeo-geo-reference.md`.

**For Google AI Overviews / AI Mode, start with `skills/ai-search-answer-workflow`** (grounded in Google's own guide: core ranking, indexed + snippet-eligible, no special schema or AI files). This workflow covers the wider entity, citability, and multi-engine picture. Deep audit: `skills/vendor/claude-seo/seo-geo`. Score: `skills/vendor/geo-optimizer`. All findings tagged per `RULES.md`.

Principle: the same things that help people help AI systems. Clear facts, consistent identity, real expertise, well-structured answers. **No hidden text, no AI-targeted keyword lists, no "prompt injection" content for bots.** Humans first.

## Audit

### 1. Access

```bash
python scripts/crawling/robots_check.py <url> --test / /services/
```

The script reports GPTBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, ClaudeBot, Claude-SearchBot, Google-Extended, Applebot. Decide with the client:
- **Search/retrieval bots** (OAI-SearchBot, PerplexityBot, Claude-SearchBot, ChatGPT-User): allow if the client wants to be cited in AI answers.
- **Training bots** (GPTBot, ClaudeBot, Google-Extended): business choice; blocking does not remove the site from Google Search or AI Overviews (Google-Extended does not control AI Overviews).
- Check WAF/CDN bot settings (Cloudflare "Block AI bots" etc.) as well as robots.txt.
- Content in raw HTML (see `technical-seo.md` § Rendering): most AI crawlers do not execute JavaScript.

### 2. Entity clarity

Can a stranger, from the homepage and about page alone, answer: who is this business, what exactly does it do, where, for whom, since when, and why trust it?

- Business name used consistently everywhere (site, GBP, socials, directories).
- One-sentence definition near the top of the homepage: `<Name> is a <type> in <City, ST> that <does what> for <whom>.`
- About page: founding year, owner/team, licenses, certifications, memberships, awards (only real ones).
- Organization/LocalBusiness schema with `sameAs` to real profiles (`schema.md`).
- Same facts (phone, address, hours, service area, years) everywhere. Inconsistent facts reduce confidence and get cited wrongly.

### 3. Answer-ready content

On money pages and FAQs:
- Each question as a heading, answered directly in the first 1–3 sentences, then detail.
- Service definitions: what it is, what's included, typical timeline, cost factors (ranges only if the client provides them).
- Specifics beat adjectives: numbers, materials, process steps, local conditions.
- Lists and tables for steps, options, comparisons.
- Author/reviewer and date on informational content; real credentials.

### 4. Citability and authority

- Original material others cite: project data, local cost guides with real numbers, photos, checklists.
- Mentions on trusted third-party sites: local news, associations, supplier pages, review platforms. AI systems lean on these.
- Reviews on major platforms with descriptive text.
- Bing indexing (Copilot and others use the Bing index): `bing-webmaster.md`.

### 5. Visibility check (manual or paid)

- Manual: ask 5–10 real customer questions in ChatGPT, Perplexity, Google AI Mode/Overviews, Copilot (logged out where possible, location set). Record whether the client is mentioned or cited, who is cited instead, and which sources appear. Save to `<client>/data/ai-visibility-<date>.md`.
- Paid trackers exist (see `references/tools.md`); results vary by run, so compare trends, not single answers.
- Checkpoint: `--source ai_manual --metric prompts_mentioned --value "3/10"`.

## Actions (typical)

1. Add/repair the one-sentence entity definition and About facts.
2. Organization + LocalBusiness + Service + FAQPage schema matching visible content.
3. Rewrite key FAQ answers to be direct and factual.
4. Fix inconsistent NAP/facts across profiles.
5. Earn 2–3 credible third-party mentions per quarter.
6. Unblock retrieval bots if blocked unintentionally.

`llms.txt` (`references/aeo-geo-reference.md`): optional, low effort, unproven benefit; Google states it does not use it. Do not prioritize over the items above.

Log issues (`--area aeo`) and recommendations.
