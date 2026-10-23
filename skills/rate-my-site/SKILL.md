---
name: rate-my-site
description: Rate any website's SEO from just a URL and return an Overall, SEO, AEO (answer engine) and GEO (generative AI search) score out of 100 with letter grades, a prioritized fix list with point gains, what's working, and what can't be known without account access. Use when someone pastes a site and asks "rate my website", "SEO score", "grade my site", "audit my site", "how's my SEO", "is my site ready for AI search / ChatGPT / AI Overviews", or "GEO/AEO score".
---

# Rate my site

Part of CLAUDE SEO GOD MODE. Follows `RULES.md` (repo root): no invented data; every finding tagged OBSERVED / INFERRED / RECOMMENDED / UNKNOWN.

## Mode A: scripts available (Claude Code, Desktop with this plugin/skill, or the MCP server)

1. Normalize the URL the user gave (add `https://` if missing). Only rate sites the user asked about; the crawl is polite (robots.txt honored, ~30 pages, 0.3 s delay).
2. Run one of:
   - MCP tool `seo_rate_site` (site, max_pages), or
   - `python <repo root>/scripts/rate_site.py <url>`, where the repo root is two folders up from this file (`${CLAUDE_PLUGIN_ROOT}` when installed as a plugin). Use `--max-pages 50` for bigger sites and `--no-psi` to skip PageSpeed.
3. Read the printed scorecard (also saved as `scorecard.md`; raw data in `rating.json`).
4. Reply to the user with:
   - The score table exactly as produced (Overall, SEO, AEO, GEO, grades).
   - **Top 5 fixes** in plain language, each with its point gain and the pages affected. Explain *why* each matters in one sentence.
   - **What's working** (3–5 bullets) so the owner knows what not to break.
   - **UNKNOWN** list, briefly: rankings, traffic, backlinks, index status, AI citations need account access or other tools.
   - One-line offer of next steps: deeper audit (`workflows/initial-audit.md`), connecting Search Console for real query data (`skills/ai-search-answer-workflow`), or drafting the fixes.
5. Keep the reply short and scannable. Don't paste the full "All checks" table unless asked.

Do not change the scores, invent extra numbers, or claim rankings/traffic. Scores measure hygiene and AI-search readiness, not ranking position.

## Mode B: no Python or no network for scripts (e.g. a claude.ai chat)

Rate manually with the same rubric (`references/rating-rubric.md`), using whatever page-fetch tool is available (web fetch / browser). Fetch at least: the homepage, `/robots.txt`, `/sitemap.xml` (or the sitemap named in robots.txt), and 3–5 key pages linked from the main navigation.

- Score each rubric check you could actually verify; mark checks you couldn't verify UNKNOWN and leave them out of the denominator.
- Say clearly at the top: "Manual rating from N fetched pages (no crawler run); treat scores as approximate." Tag scores INFERRED.
- Never guess performance numbers: PageSpeed is UNKNOWN unless you can call it.
- Same reply format as Mode A.

## Interpreting scores

| Score | Grade | Meaning |
|---|---|---|
| 90–100 | A | Strong fundamentals; gains now come from content, links, and real search data |
| 80–89 | B | Solid; a few fixes with clear payoff |
| 70–79 | C | Noticeable gaps that likely cost visibility |
| 60–69 | D | Several fundamentals missing |
| < 60 | F | Basic crawl, on-page, or entity issues; fix these first |

- **SEO** (60% of overall): crawl & index, on-page, content, structured data, mobile performance.
- **AEO** (20%): can answer engines quote you? Snippet eligibility, question headings, direct answers, FAQ match, structure, raw-HTML content.
- **GEO** (20%): can generative AI search find, trust, and cite you? AI crawler access (robots.txt and a live CDN/WAF probe), entity clarity, location, sameAs identity, About/Contact, sourced claims, Bing access.

Google says AI Overviews/AI Mode run on core Search ranking and need no special markup; placement isn't guaranteed. The AEO/GEO checks are readiness signals, not Google requirements (see `skills/ai-search-answer-workflow`).
