# CLAUDE.md

Instructions for Claude when this repository is the working directory or is loaded as a skill.

## When using the skill for a client

Start at `SKILL.md`. Follow its load rules: one workflow at a time, references only on demand, scripts via `--help` before reading source.

## When editing this repository

- Keep `SKILL.md` short. It is loaded on every use. Put detail in `workflows/` or `references/`.
- One workflow per job. A workflow says: inputs, steps, what is automated, what is manual, outputs, and state updates.
- References hold facts that change (API limits, tool status). Date-stamp claims ("verified 2026-10").
- Scripts: Python 3.10+, standard library only unless the script talks to a Google client library. Every script has a docstring with usage, `--help`, writes JSON for machines, and prints a short summary for Claude.
- Scripts never read or print secrets beyond checking that an environment variable is set.
- Never add client data, credentials, or crawl output to this repository. `.gitignore` blocks the usual paths.
- When adding an external tool, update `references/tools.md` with: URL, purpose, official/community, maintenance state on the date checked, credentials, why, security notes. Do not invent stars or adoption numbers.

## Efficiency

- Prefer a script run plus a short summary over reading raw JSON. `scripts/audit.py` writes `summary.md` for this reason.
- Do not load more than one workflow unless the task spans both.
- Use `client_state.py resume <slug>` instead of reading `state.json` in full.
