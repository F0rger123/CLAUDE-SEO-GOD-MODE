# Attribution: marketingskills

- **Source:** https://github.com/coreyhaines31/marketingskills
- **Author:** Corey Haines and contributors
- **Commit copied:** e85f3cb (2026-10-26)
- **License:** MIT (`LICENSE`)
- **Copied (unmodified, SKILL.md + references/, no evals):** `programmatic-seo`, `site-architecture`, `link-building`, `directory-submissions`, `copywriting`, `copy-editing`, `cro`, `competitor-profiling`, `ai-seo`.

This is third-party work, not this project's.

## Role here

| Skill | Use it for | Primary here instead (if overlapping) |
|---|---|---|
| `site-architecture` | Page hierarchy, URL structure, nav and internal-link structure for new sites or redesigns | — (new capability) |
| `programmatic-seo` | Template pages at scale (locations × services, integrations, comparisons) | Apply the doorway test in `workflows/local-seo.md` first |
| `link-building` | Earning links: digital PR, resource pages, partnerships | — (new capability) |
| `directory-submissions` | Launch directories for **software products** (e.g. CrewBoss, this extension, the MCP server). Not local citations. | Local citations: `workflows/local-seo.md` |
| `copywriting`, `copy-editing` | Writing or tightening page copy after an audit names the pages | — |
| `cro` | Turning traffic into calls, quotes and sign-ups | — |
| `competitor-profiling` | Deep competitor profiles (positioning, pricing, messaging) | Keyword gaps: Ryze `competitor-gap` |
| `ai-seo` | Multi-platform AI search playbook (ChatGPT, Perplexity, Copilot, AI Overviews) | Google AI features: `skills/ai-search-answer-workflow`; audit: claude-seo `seo-geo` |

Not copied (duplicates): `seo-audit` (claude-seo `seo-audit` is primary), `schema` (`workflows/schema.md` + `generate_schema.py`), `content-strategy` (`workflows/content-strategy.md`), and `ads` (the claude-ads companion plugin).

## Notes

- These skills look for an optional `.agents/product-marketing-context.md` file. In this repo the equivalent is the client profile: `python scripts/state/client_state.py resume <slug>`. Feed them that.
- Some reference third-party data tools (Ahrefs, Semrush, DataForSEO, Exa, Firecrawl, Hunter). Those are optional and paid; say UNKNOWN rather than guessing metrics without them.
- `RULES.md` still applies: no invented statistics, testimonials or results in any copy these skills produce.
