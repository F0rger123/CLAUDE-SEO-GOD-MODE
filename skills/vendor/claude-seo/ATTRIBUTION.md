# Attribution: claude-seo

- **Source:** https://github.com/AgriciDaniel/claude-seo
- **Author:** AgriciDaniel and contributors
- **Commit copied:** 6be93f4 (2026-10-23)
- **License:** MIT (`LICENSE`; each skill also ships its own `LICENSE.txt`)
- **Copied:** `skills/seo-audit/` and `skills/seo-geo/` (SKILL.md, LICENSE.txt, `seo-geo/references/`). Files are unmodified.
- **Not copied:** the plugin's scripts, subagents, and other sub-skills.

This is third-party work, not this project's. Keep this note and the license files with the copied files.

## Dependency

Both skills call `${CLAUDE_PLUGIN_ROOT}/scripts/claude-seo ...` and claude-seo subagents. They only run fully when the claude-seo plugin is installed (it is installed on the Agency Zero workstation). Without it, use them as procedure references and fall back to this repo's `scripts/audit.py`.

## Role in the Master SEO Skill Set

- `seo-audit`: **primary site audit** (backbone). This repo's `scripts/audit.py` supplies deterministic crawl data.
- `seo-geo`: **primary qualitative GEO/AEO audit** (citability, entity and brand signals, AI crawler access).
