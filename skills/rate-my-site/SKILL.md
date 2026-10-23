---
name: rate-my-site
description: Rate any website's SEO from just a URL. Returns Overall, SEO, AEO (answer engine) and GEO (generative AI search) scores out of 100 with letter grades, fixes ranked by points gained with the affected pages, copy-paste fix kits, a visual HTML report, and what can't be known without account access. Use when someone pastes a site and asks "rate my website", "SEO score", "grade my site", "audit my site", "how's my SEO", "is my site ready for AI search / ChatGPT / AI Overviews", or "GEO/AEO score".
---

# Rate my site

Part of CLAUDE SEO GOD MODE. Follows `RULES.md` at the repo root: no invented data; every finding tagged OBSERVED / INFERRED / RECOMMENDED / UNKNOWN.

## Mode A: scripts available (Claude Code, Desktop with this plugin/skill, or the MCP server)

1. Normalize the URL (add `https://` if missing). Rate only sites the user asked about. The crawl is polite: robots.txt is honored, about 30 pages, 0.3 s delay.
2. Run one of:
   - MCP tool `seo_rate_site` (site, max_pages), or
   - `python <repo root>/scripts/rate_site.py <url> --out <folder>`. The repo root is two folders up from this file (`${CLAUDE_PLUGIN_ROOT}` when installed as a plugin). Use `--max-pages 50` for bigger sites.
   - Pick `--out`: the user's current project or working folder if there is one, as `seo-rating-<host>/`. Otherwise omit it (a temp folder).
3. Read the printed scorecard. Files written: `report.html` (visual report), `scorecard.md`, `rating.json`.
4. Reply in this shape:
   - **Headline:** one sentence with the overall score, grade, and the single biggest issue.
   - **Score table** exactly as produced (Overall, SEO, AEO, GEO, grades), plus the "Potential" line.
   - **Top 5 fixes** in plain language: the point gain, the pages affected, and one sentence on why it matters.
   - **Fix kits:** if the scorecard has any, show the 1–2 most useful ones, with the [CONFIRM] placeholders left as they are.
   - **What's working:** 3–5 bullets, so the owner knows what not to break.
   - **Can't see from outside:** one short line (rankings, traffic, index status, backlinks, AI citations).
   - **Next step offer:** open the visual report, draft the fixes, run the deeper audit (`workflows/initial-audit.md`), or connect Search Console (`skills/ai-search-answer-workflow`).
5. Mention `report.html` by its file name, or as a link if the file is inside the user's folder. **Don't paste temp-folder paths into the chat.** If the user wants the report and it's in a temp folder, copy it into their folder first.
6. Keep it scannable. Don't paste the full "All checks" table unless asked.

Never change the scores, invent extra numbers, or claim rankings or traffic. Verify any surprising top fix against the live page (curl or view-source) before presenting it as fact. If it's wrong, say so and note it as a rater false positive (see `CONTRIBUTING.md` § Self-improvement loop).

## Mode B: no Python or no network for scripts (e.g. a claude.ai chat)

Rate manually with the same rubric (`references/rating-rubric.md`), using whatever page-fetch tool is available. Fetch at least: the homepage, `/robots.txt`, the sitemap, `http://` plus the www/non-www variant of the homepage, a made-up URL (to test for soft 404s), and 3–5 key pages from the navigation.

- Score only the checks you could verify. Mark the others UNKNOWN and leave them out of the denominator.
- Start with: "Manual rating from N fetched pages (no crawler run); scores are approximate." Tag scores INFERRED.
- Never guess performance numbers.
- Use the same reply shape as Mode A.

## Interpreting scores

| Score | Grade | Meaning |
|---|---|---|
| 90–100 | A | Strong fundamentals; gains now come from content, links, and real search data |
| 80–89 | B | Solid; a few fixes with clear payoff |
| 70–79 | C | Noticeable gaps that likely cost visibility |
| 60–69 | D | Several fundamentals missing |
| < 60 | F | Basic crawl, on-page, or entity issues; fix these first |

- **SEO** (60% of overall): crawl & index, on-page, content, structured data, performance. Performance is an INFERRED estimate when PageSpeed is unavailable; set `GOOGLE_API_KEY` for real data.
- **AEO** (20%): can answer engines quote you? Snippet eligibility, question headings, direct answers, FAQ match, structure, raw HTML.
- **GEO** (20%): can generative AI search find, trust, and cite you? AI crawler access (robots.txt plus a live CDN/WAF probe), entity clarity, location, sameAs, About/Contact, contact details, sourced claims, Bing access.

Google says AI Overviews and AI Mode run on core Search ranking and need no special markup, and that placement isn't guaranteed. The AEO/GEO checks are readiness signals, not Google requirements.
