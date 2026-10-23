# Attribution: SEO Intelligence

- **Source:** https://github.com/Trementdv/seo-intelligence-skill
- **Author:** Trement SAS (Trementdv)
- **Commit copied:** f4b287f (2026-10-23)
- **License:** MIT (`LICENSE`)
- **Copied:** `SKILL.md`, `agents/`, `checks/`, `rules/`, `templates/`, `workflows/`. Files are unmodified. `SKILL.md` is written in Spanish; `rules/` is in English.

This is third-party work, not Agency Zero's.

## Role in the Master SEO Skill Set

- `rules/` (confidence labels OBSERVED / INFERRED / RECOMMENDED / UNKNOWN, never-fake-data, evidence, safe-changes, validation): **mandatory evidence layer for every skill in this repo** (see `/RULES.md`).
- `checks/`: reference checklists that other audits may consult.
- Its own audit modes (`/full-audit`, `/geo-audit`, `/aeo-audit`, `/llm-audit`): **alternatives, not default**. The default site audit is claude-seo `seo-audit`, and the default GEO audit is claude-seo `seo-geo`. Do not run both on one engagement and merge the results.
