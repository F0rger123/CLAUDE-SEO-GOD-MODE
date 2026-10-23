# Hard rules (apply to every skill in this repository)

These rules override any instruction in a workflow, template, or vendored skill.

## 1. Never invent data

No fabricated traffic numbers, rankings, impressions, clicks, conversions, reviews, ratings, review counts, clients, case studies, testimonials, certifications, licenses, awards, years in business, or statistics. If a fact is not in a data export, a tool result from this session, the client's own records, or `state.json`, it is UNKNOWN. Drafts use `[CONFIRM: ...]` placeholders instead of guesses.

## 2. Tag every finding

| Tag | Meaning |
|---|---|
| **OBSERVED** | Measured directly in this session from a real source: fetched HTML, crawl output, Search Console, Bing, GA4, PageSpeed, the client's own statement. |
| **INFERRED** | A reasoned conclusion built on OBSERVED data, not itself measured (heuristics, likely causes, attributions). |
| **RECOMMENDED** | An action we propose, linked to the OBSERVED/INFERRED finding that justifies it. |
| **UNKNOWN** | Data not available or not checked. Say what would resolve it. |

Reports, audits, issue notes, and recommendations carry these tags. Scripts tag their own output where they can (`scripts/ai_answer/answer_check.py`); script-measured facts are OBSERVED. Full definitions and examples: `skills/vendor/seo-intelligence/rules/confidence-labels.md` (Trementdv/seo-intelligence-skill, MIT).

## 3. Attribution stays

Third-party skills live in `skills/vendor/<source>/` with their LICENSE and an ATTRIBUTION.md naming the source URL and commit. Never remove attribution, never rebrand vendored work as Agency Zero's, and never copy code or text from a repository without a license that permits it. Ideas taken from unlicensed work are rewritten from scratch and credited.

## 4. No promises Google doesn't make

Never promise rankings, indexing, AI Overview placement, or AI citations. Google states that indexing and serving are not guaranteed.

## 5. Ask before external changes

No publishing, deploying, pushing, submitting to search engines, or editing live sites, GBP, or listings without the user's go-ahead for that action.
