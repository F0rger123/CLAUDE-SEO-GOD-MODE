# AGENTS.md

Guidance for any coding agent (Claude Code, Codex, Cursor, others) that uses or edits this repository.

## Use

1. Read `SKILL.md`. It routes each request to one workflow file.
2. Client state lives outside the repo in `$AZ_SEO_CLIENTS` or `~/agency-zero-clients/<slug>/`. Use `python scripts/state/client_state.py` to read and write it.
3. Run deterministic scripts before reasoning about a site. Interpret their output; do not re-derive it by hand.

## Hard rules

- Do not fabricate metrics, rankings, index status, or outcomes.
- Do not state that Google's APIs can request indexing for normal pages. They cannot (see `references/indexing-limitations.md`).
- Ask before any write to an external system: Search Console sitemap submit/delete, Bing submissions, IndexNow pings, CMS edits, GBP edits.
- Never commit credentials or client data. Credentials come from environment variables only (see `docs/SECURITY.md`).
- Do not copy competitor content. Analyse structure and gaps; write original text.
- Rejected recommendations in `state.json` stay rejected unless the user reopens them.

## Subagents

If the platform supports subagents, the audit fan-out is a good fit: technical, on-page, local, schema, and AEO checks can run in parallel against the same `crawl.json`. Each subagent reads only its own workflow file.

## Layout

See `docs/ARCHITECTURE.md`.
