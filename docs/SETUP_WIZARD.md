# Setup wizard — for AI agents

Use this when someone pastes a link to this repository into a chat and says anything like *"set this up for me"*, *"what is this?"*, *"help me install this"* or *"use this on my website"*. You are the setup wizard: figure out where you are running, interview the person briefly, install what fits their setup, prove it works, then start their first client.

Rules for every step are in [`AGENTS.md`](../AGENTS.md) and [`RULES.md`](../RULES.md). Never invent data, never ask for or print secrets, and ask before any write to an external system.

---

## Step 0 — Where are you running?

Decide this first. It changes everything after it.

| You are… | You can… | Go to |
|---|---|---|
| **A local coding agent with a shell** (Claude Code, Codex CLI, Cursor, Gemini CLI, OpenCode) | Clone, install, run scripts | Step 1, then Step 2A |
| **A chat app with code execution but no local machine** (claude.ai, Claude Desktop chat) | Upload a skill zip | Step 1, then Step 2B |
| **A chat app with no tools** (or tools are off) | Only explain and guide | Step 1, then Step 2C |

If you can't tell, ask: *"Are you talking to me inside Claude Code / Codex on your computer, or in a browser chat?"*

## Step 1 — Interview (keep it short)

Ask everything in **one grouped message** (owners are usually not technical, so don't drip questions across turns), then reflect the answers back in a line or two. If the person already gave details, don't re-ask.

**A. Goal**
- Do you want a quick rating of one site, or ongoing SEO work for a business (audits, fixes, reports, memory between sessions)?
- One site of your own, or several client sites?

**B. The first site**
- Business name, website URL, and the main city/region it serves (for local SEO).
- Is there a Google Business Profile? Do you control the website's code or CMS?

**C. Data you can connect** (all optional; everything works without them, just with less data)
- Google Search Console access for the site? → unlocks clicks, queries, URL Inspection.
- Bing Webmaster Tools? → Bing data and submissions.
- A Google Cloud API key for PageSpeed/CrUX? → field Core Web Vitals.

**D. Your machine** (local agents only)
- Operating system (Windows, macOS, Linux) and whether Python 3.10+ is installed (`python --version`).

## Step 2A — Install for local coding agents

Pick **one**. Check each step before moving on.

| # | Do | Check it worked |
|---|---|---|
| 1 | **Claude Code (recommended):** `/plugin marketplace add F0rger123/CLAUDE-SEO-GOD-MODE` then `/plugin install seo-god-mode@seo-god-mode` | `/plugin` lists `seo-god-mode` |
| 1′ | **Any agent, plain clone:** `git clone https://github.com/F0rger123/CLAUDE-SEO-GOD-MODE ~/.claude/skills/seo-god-mode` (Windows: `"$HOME\.claude\skills\seo-god-mode"`) | Folder contains `SKILL.md` |
| 2 | Dependencies: `python <repo>/scripts/setup/connect.py deps` (or `pip install -r <repo>/mcp-server/requirements.txt`) | Command exits without errors |
| 3 | Register the MCP server if the plugin didn't: `claude mcp add seo-god-mode --scope user -- python <repo>/mcp-server/server.py`. **Codex:** add `[mcp_servers.seo-god-mode]` with `command = "python"` and `args = ["<repo>/mcp-server/server.py"]` to `~/.codex/config.toml` | The `seo_status` tool answers |
| 4 | Status check: `python <repo>/scripts/setup/connect.py status` | Shows what is connected and the one next step for each source |
| 5 | Client memory folder: default `~/seo-clients`, or set `SEO_CLIENTS_DIR` | `python <repo>/scripts/state/client_state.py list` runs |
| 6 | Smoke test: `python <repo>/scripts/crawling/robots_check.py https://example.com` | Prints a short robots summary |

**Connect data one source at a time** using [`docs/CONNECT.md`](CONNECT.md) word for word, and run the matching `connect.py` command as soon as the person hands something over:

- Search Console: they download a service-account key (never paste it into chat) → `connect.py gsc --find` prints the email to add in Search Console → `connect.py gsc --test`.
- Bing: `connect.py bing --key <key>` (checks the key with Bing before saving).
- PageSpeed: `connect.py pagespeed --key <key>`.

Settings are saved to the user environment, never the repo. Restart Claude Code afterwards so the MCP server sees them. More detail: [`docs/INTEGRATIONS.md`](INTEGRATIONS.md).

## Step 2B — Install in a chat app (claude.ai / Claude Desktop)

1. The person (or you, if you have a shell somewhere) runs `python scripts/build_skill_zip.py` in a clone → `dist/seo-god-mode-skill.zip`.
2. They upload it in Settings → Capabilities → Skills (code execution must be on).
3. If the sandbox can't reach websites, the rating falls back to a manual rubric and says so. Search Console and Bing need a local install (2A).

## Step 2C — No tools at all

Explain what the repo does in three sentences, recommend 2A if they have a computer, and offer to do a manual rating of their site using [`skills/rate-my-site`](../skills/rate-my-site) as a rubric — clearly labelled as approximate, with no invented numbers.

## Step 3 — First run

From here on, [`START_HERE.md`](../START_HERE.md) is the operating guide: the proven order of work on a real client and the known false positives to check before "fixing" anything.

Pick the one that matches their goal:

```text
Rate my website SEO-wise: https://their-site.com
```

```text
Use CLAUDE SEO GOD MODE for this new client.
Business: <name>
Website: <url>
Primary area: <city, state>
Start onboarding.
```

Onboarding follows [`workflows/onboarding.md`](../workflows/onboarding.md) and saves memory with `client_state.py`, so the next session can say *"Resume client <slug>"*.

## Step 4 — Tell them what's next

End with a short message that covers:
- what is installed and verified, and what isn't;
- which data sources are connected (and which would unlock more);
- three example prompts from the README ("Other things to ask");
- how to update later: `git -C <repo> pull` or `/plugin update`.
