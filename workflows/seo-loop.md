# Workflow: self-learning SEO loop (continuous, low-usage)

Improves a live site week after week from its own Search Console data. It looks at what gets clicked, what gets seen but not clicked, and what gets searched but isn't answered. It changes a few things, then measures 4 weeks later whether each change helped, and ranks future work by what has actually worked on this site.

Built to be cheap: the scan is a deterministic script with no AI calls. The agent only reads files and edits pages when the script reports something worth doing, and never more than `max_changes_per_run` pages.

## One-time setup per site (about 10 minutes)

1. Connect Search Console (`docs/CONNECT.md` section 1). Check with `python scripts/setup/connect.py status`.
2. In the site's repo, create `seo-loop.json` (example below) and commit it. It holds the guardrails the loop must obey.
3. Seed the memory. For changes made recently by hand, run `seo_loop.py record` once per page, so those pages cool down and get measured too.
4. Schedule the loop (see "Scheduling"). Weekly is enough: Google needs days to re-crawl and weeks to settle.

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
  "page_sources": { "/": "src/app/page.tsx" },
  "commands": { "test": "npm test", "build": "npm run build", "deploy": "npm run deploy", "push": "git push", "notify": "node scripts/indexnow.mjs {paths}" }
}
```

## Each run (the agent's whole job)

Run from the site's repo. On Windows Git Bash, prefix with `MSYS_NO_PATHCONV=1` and use the full Windows path to the skill.

1. `python <skill>/scripts/loop/seo_loop.py evaluate --config seo-loop.json`: scores changes that are now 28 days old and updates `learnings.json`.
2. `python <skill>/scripts/loop/seo_loop.py scan --config seo-loop.json`: writes `latest.md` and prints `ACTIONABLE: n`.
3. **If `ACTIONABLE: 0`, stop.** Commit the state files and reply in one line. This is most weeks once a site is in good shape, and it costs almost nothing.
4. For each actionable item, top to bottom:
   - Open only the source file for that page (`page_sources`). Don't explore the repo.
   - Make the smallest change of an allowed type:
     - `ctr_gap`: a title of 60 characters or fewer and a description of 155 or fewer. Lead with the searched words and promise the answer the page gives.
     - `striking`: a direct answer to the exact query near the top or as an FAQ, the query's wording in a heading, and 1–2 internal links from related pages using that wording.
     - `unanswered`: a focused section or FAQ on the closest page. Propose a new page only if it is a distinct topic the business really offers; that needs the owner's yes.
     - `cannibal`: make the best page the clear answer and link the other page to it.
     - `decline`: investigate only (index status, recent edits). Never rewrite blindly.
   - Never touch anything in `never_change`. Never invent prices, reviews, claims, or facts. Reuse what the site already says.
   - Record it: `seo_loop.py record --config seo-loop.json --page <path> --type <change type> --opportunity <opportunity type> --query "<query>" --note "<what changed>"`.
5. Run `commands.test` and `commands.build`. If either fails, revert this run's edits and report. Never deploy a failing build.
6. If `auto_deploy` is true, deploy, push, and notify (IndexNow) with the changed paths. Otherwise leave a branch and ask the owner.
7. Commit `state_dir` (history, learnings, latest). Reply in 3–5 lines: what changed, why (the numbers), and what's pending evaluation.

## How it learns

- Every change is stored with its page's 28-day before-numbers.
- After `evaluate_after_days`, it's compared with the 28 days that follow. It counts as a **win** if clicks are up 25% or more, CTR is up 1 point or more, or average position improves by 2 or more. It's a **loss** for the mirror-image drops; otherwise it's **flat**. Tiny-traffic pages count as flat (noise).
- `learnings.json` keeps wins and losses per change type and per opportunity type. Scores are multiplied by a smoothed win rate, so the kinds of change that work on this site float to the top and the ones that don't sink.
- Pages changed within `cooldown_days` are skipped, so each change can be measured cleanly and the site isn't churned.

## Scheduling (pick one)

- **Claude desktop app (local; it has the keys and can deploy):** create a weekly scheduled task with this prompt: "Run the SEO loop for <site> per <skill>/workflows/seo-loop.md. Stop early if ACTIONABLE is 0."
- **Claude Code `/schedule` (cloud):** only if the cloud environment has the Search Console key and deploy access. Otherwise use the local option.
- **Manual:** say "run the SEO loop" any time.

## Usage budget

A typical week is one script run plus a one-line reply. A busy week is up to 3 small page edits, one build, and one deploy. Monthly, the evaluate step adds no AI work. Keep `max_changes_per_run` at 3 or fewer; raise it only for big sites with lots of data.
