# Attribution: eGEOagents

- **Source:** https://github.com/mverab/eGEOagents
- **Author:** mverab and contributors
- **Commit copied:** c49b1f6 (2026-10-23)
- **License:** MIT (`LICENSE`)
- **Copied:** `.claude/skills/geo-loop`, `content-scoring`, `validation-doctor`. Files are unmodified.
- **Not copied:** `competitive-analysis` (duplicates open-seo-mcp-skills `competitor-gap`) and `schema-generator` (duplicates this repo's `scripts/schema/generate_schema.py`). Both remain available upstream as alternatives.

This is third-party work, not Agency Zero's.

## Dependency

These skills drive the `egeo` CLI (`pip install egeo`, per the upstream README) and an LLM API key for rewrites. `geo-loop` writes to `$EGEO_HOME` (default `~/.egeo/`), not to this repo.

## Role in the Master SEO Skill Set

- `geo-loop` plus the `egeo optimize` / `egeo fix-gaps` commands: **GEO rewrite engine**. Use after `skills/ai-search-answer-workflow` has identified pages that do not answer their queries. Every rewrite is a draft for human review. Google's guidance says not to rewrite content only for AI systems, so a rewrite must also make the page better for people.
- `content-scoring`: page-level GEO score with evidence (secondary to `ai-search-answer-workflow` grading).
- `validation-doctor`: setup check for eGEO's optional validators.
