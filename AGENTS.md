# AGENTS.md

Guidance for any coding agent (Claude Code, Codex, Cursor, others) that uses or edits this repository.

## 0. First thing

Someone pasted this repo's link and said *"use this for my website"*, *"set this up"*, *"install it"* or *"what is this"*? Read [`docs/SETUP_WIZARD.md`](docs/SETUP_WIZARD.md) now and follow it without being asked twice:

1. Work out where you're running (local agent, chat app, or no tools).
2. Ask the grouped interview in one message: goal, their site, the services they sell and towns they serve, who they lose jobs to, and which accounts they can connect.
3. Tell them what to set up and why, in plain words (Search Console, Bing, a PageSpeed key; all optional).
4. Give the short "how it works" breakdown from the wizard (rating, fixes, competitor and demand checks, the weekly loop, the Chrome extension).
5. Install, verify, then run their first rating and offer onboarding.

Everything below applies throughout.

## Use

0. Read `START_HERE.md` first: setup check, how to talk to the owner, the order that works, known false positives.
1. Read `SKILL.md`. It routes each request to one workflow file.
2. Client state lives outside the repo in `$SEO_CLIENTS_DIR` or `~/seo-clients/<slug>/`. Use `python scripts/state/client_state.py` to read and write it.
3. Run deterministic scripts before reasoning about a site. Interpret their output; do not re-derive it by hand.

## Hard rules

Full text: `RULES.md`.

- Do not fabricate metrics, rankings, reviews, clients, certifications, index status, or outcomes.
- Tag every finding OBSERVED / INFERRED / RECOMMENDED / UNKNOWN.
- Third-party skills in `skills/vendor/` keep their LICENSE and ATTRIBUTION.md; never present them as this project's work.
- Do not state that Google's APIs can request indexing for normal pages. They cannot (see `references/indexing-limitations.md`).
- Ask before any write to an external system: Search Console sitemap submit/delete, Bing submissions, IndexNow pings, CMS edits, GBP edits.
- Never commit credentials or client data. Credentials come from environment variables only (see `docs/SECURITY.md`).
- Do not copy competitor content. Analyse structure and gaps; write original text.
- Rejected recommendations in `state.json` stay rejected unless the user reopens them.

## Subagents

If the platform supports subagents, the audit fan-out is a good fit: technical, on-page, local, schema, and AEO checks can run in parallel against the same `crawl.json`. Each subagent reads only its own workflow file.

## Layout

See `docs/ARCHITECTURE.md`.
