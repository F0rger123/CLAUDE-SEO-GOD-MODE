# Workflow: self-learning SEO loop (continuous, low-usage)

Improves a live site week after week from its own Search Console data. It looks at what gets clicked, what gets seen but not clicked, and what gets searched but isn't answered. It changes a few things, then measures 4 weeks later whether each change helped, and ranks future work by what has actually worked on this site.

Built to be cheap: the scan is a deterministic script with no AI calls. The agent only reads files and edits pages when the script reports something worth doing, and never more than `max_changes_per_run` pages.

## One-time setup per site (about 10 minutes)

1. Connect Search Console (`docs/CONNECT.md` section 1). Check with `python scripts/setup/connect.py status`. Bing Webmaster Tools is optional but adds real search volumes to the demand check.
2. In the site's repo, create `seo-loop.json` (example below) and commit it. It holds the guardrails the loop must obey, plus the `market` (services, areas, niche) the competitor and demand checks use. Ask the owner for the services they really sell and the towns they really serve; never guess them.
3. **Find the top competitors** if `competitors` is empty (see "Competitors and search demand" below). Save 3–5 with `compete.py add`.
4. Seed the memory. For changes made recently by hand, run `seo_loop.py record` once per page, so those pages cool down and get measured too.
5. Schedule the loop (see "Scheduling"). Weekly is enough: Google needs days to re-crawl and weeks to settle.

```json
{
  "site": "https://example.com",
  "gsc_property": "sc-domain:example.com",
  "state_dir": "docs/seo-loop",
  "min_impressions": 15,
  "max_changes_per_run": 3,
  "cooldown_days": 28,
  "evaluate_after_days": 28,
  "auto_deploy": true,
  "allowed_changes": ["title", "meta_description", "answer_paragraph", "faq", "internal_links", "section"],
  "never_change": ["prices", "legal/contract wording", "guarantees, reviews, years in business"],
  "ignore_queries_containing": ["towns you don't serve"],
  "market": { "services": ["roof replacement", "roof repair"], "areas": ["York PA", "Hanover PA"], "niche": "residential roofing" },
  "competitors": [],
  "page_sources": { "/": "src/app/page.tsx" },
  "commands": { "test": "npm test", "build": "npm run build", "deploy": "npm run deploy", "push": "git push", "notify": "node scripts/indexnow.mjs {paths}" }
}
```

## Each run (the agent's whole job)

Run from the site's repo. On Windows Git Bash, prefix with `MSYS_NO_PATHCONV=1` and use the full Windows path to the skill.

1. `python <skill>/scripts/loop/seo_loop.py evaluate --config seo-loop.json`: scores changes that are now 28 days old and updates `learnings.json`.
2. **Once a month** (when `state_dir/competitors.json` or `trends.json` is missing or older than 28 days): `compete.py scan --config seo-loop.json` and `compete.py trends --config seo-loop.json`. Skip on other weeks; they cost nothing to keep.
3. `python <skill>/scripts/loop/seo_loop.py scan --config seo-loop.json`: writes `latest.md` and prints `ACTIONABLE: n`. It now includes competitor gaps and unanswered searches from step 2, ranked against your Search Console opportunities by what has worked on this site.
4. **If `ACTIONABLE: 0`, stop.** Commit the state files and reply in one line. This is most weeks once a site is in good shape, and it costs almost nothing.
5. For each actionable item, top to bottom:
   - Open only the source file for that page (`page_sources`). Don't explore the repo.
   - Make the smallest change of an allowed type:
     - `ctr_gap`: a title of 60 characters or fewer and a description of 155 or fewer. Lead with the searched words and promise the answer the page gives.
     - `striking`: a direct answer to the exact query near the top or as an FAQ, the query's wording in a heading, and 1–2 internal links from related pages using that wording.
     - `unanswered`: a focused section or FAQ on the closest page. Propose a new page only if it is a distinct topic the business really offers; that needs the owner's yes.
     - `cannibal`: make the best page the clear answer and link the other page to it.
     - `decline`: investigate only (index status, recent edits). Never rewrite blindly.
     - `competitor_gap`: 2+ competitors answer a question or cover a topic you don't. If the business really offers it, add a heading plus a 40–60 word direct answer (or a section) to the closest page, in your own words from the owner's facts. A whole new page needs the owner's yes.
     - `trend`: people search this phrase around your services and no page answers it. Same fix as `competitor_gap`; put the phrase in a heading.
   - Never touch anything in `never_change`. Never invent prices, reviews, claims, or facts. Reuse what the site already says.
   - Record it: `seo_loop.py record --config seo-loop.json --page <path> --type <change type> --opportunity <opportunity type> --query "<query>" --note "<what changed>"`.
6. Run `commands.test` and `commands.build`. If either fails, revert this run's edits and report. Never deploy a failing build.
7. If `auto_deploy` is true, deploy, push, and notify (IndexNow) with the changed paths. Otherwise leave a branch and ask the owner.
8. Commit `state_dir` (history, learnings, latest). Reply in 3–5 lines: what changed, why (the numbers), and what's pending evaluation.

## Competitors and search demand

The loop stays competitive: once a month it re-rates your top local competitors with the same rubric, finds what they do better, and checks what people are searching around your services.

**Find them (first run, or when the owner says the competition changed):**

1. `python <skill>/scripts/loop/compete.py find --config seo-loop.json` prints the searches to run (each service × each area, plus the niche) and what people type into Google for them.
2. Run those searches with your web search tool (or the owner runs them from the service area). Note the top 3 map-pack businesses and the top 5 organic results that are real businesses. Skip directories (Yelp, Angi, Houzz, Thumbtack, BBB) but list them as places the business should be listed.
3. Save every business that shows up for 2 or more searches: `compete.py add --config seo-loop.json --url https://rival.com --name "Rival" --source "map pack: roofer york pa"`. Also ask the owner who they lose jobs to; those count too.

**Each month:**

- `compete.py scan` rates you and each competitor (25 pages each, polite delay) and writes `competitors.md`: their scores next to yours, every check where they beat you by 20+ points (with the fix and points it's worth to you), topics and pages they have that you don't, customer questions they answer that you don't, and schema types they use.
- `compete.py trends` writes `trends.md`: Google autocomplete phrasing for each service (INFERRED demand), Bing search volumes and their 90-day trend when `BING_WEBMASTER_API_KEY` is set, your rising Search Console queries, and which of those phrases no page on your site answers yet.

**Use, don't copy.** Treat competitors' structure, coverage and signals as a checklist. Write original text from the owner's real facts. Never copy their wording, photos, reviews, prices or claims, and never add a service the business doesn't offer just because a competitor does.

## How it learns

- Every change is stored with its page's 28-day before-numbers.
- After `evaluate_after_days`, it's compared with the 28 days that follow. It counts as a **win** if clicks are up 25% or more, CTR is up 1 point or more, or average position improves by 2 or more. It's a **loss** for the mirror-image drops; otherwise it's **flat**. Tiny-traffic pages count as flat (noise).
- `learnings.json` keeps wins and losses per change type and per opportunity type. Scores are multiplied by a smoothed win rate, so the kinds of change that work on this site float to the top and the ones that don't sink.
- Pages changed within `cooldown_days` are skipped, so each change can be measured cleanly and the site isn't churned.

## Scheduling (pick one)

- **Claude desktop app (local; it has the keys and can deploy):** create a weekly scheduled task with this prompt: "Run the SEO loop for <site> per <skill>/workflows/seo-loop.md. Stop early if ACTIONABLE is 0."
- **Claude Code `/schedule` (cloud):** only if the cloud environment has the Search Console key and deploy access. Otherwise use the local option.
- **Manual:** say "run the SEO loop" any time, or "check my competitors" for just the monthly competitor and demand step.

## Usage budget

A typical week is one script run plus a one-line reply. A busy week is up to 3 small page edits, one build, and one deploy. Monthly, the evaluate step adds no AI work. Keep `max_changes_per_run` at 3 or fewer; raise it only for big sites with lots of data.
