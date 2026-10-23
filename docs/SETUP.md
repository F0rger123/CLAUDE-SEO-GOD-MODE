# Setup

## 1. Install

**Option A: Claude Code plugin (skills + MCP server in one step)**

```text
/plugin marketplace add F0rger123/CLAUDE-SEO-GOD-MODE
/plugin install seo-god-mode@seo-god-mode
```

Then install the MCP server's Python dependencies once: `pip install -r <plugin folder>/mcp/requirements.txt` (the folder is shown in `/plugin`). Plugin skills are namespaced (`/seo-god-mode:seo-god-mode`).

**Option B: plain skill (git clone), available in every Claude Code session:**

```bash
git clone https://github.com/F0rger123/CLAUDE-SEO-GOD-MODE ~/.claude/skills/seo-god-mode
```

Windows PowerShell:

```powershell
git clone https://github.com/F0rger123/CLAUDE-SEO-GOD-MODE "$HOME\.claude\skills\seo-god-mode"
```

Update later with `git -C ~/.claude/skills/seo-god-mode pull`.

Project-only install: clone into `<project>/.claude/skills/seo-god-mode` instead.

## 2. Python

Python 3.10 or newer. Core scripts need nothing else.

For Google Search Console:

```bash
pip install -r ~/.claude/skills/seo-god-mode/scripts/requirements.txt
```

## 3. Client data folder

Default: `~/agency-zero-clients`. Override with an environment variable:

```bash
export AZ_SEO_CLIENTS="$HOME/agency-zero-clients"        # macOS/Linux, add to shell profile
```

```powershell
[Environment]::SetEnvironmentVariable("AZ_SEO_CLIENTS", "$HOME\agency-zero-clients", "User")
```

Optional but recommended: back it up as a separate private repository.

```bash
cd ~/agency-zero-clients && git init && gh repo create agency-zero-clients --private --source . --push
```

## 4. Credentials

Set only what you use. Details for each in [INTEGRATIONS.md](INTEGRATIONS.md). Store values in your OS environment or a password manager, never in the repo.

| Variable | Used by | Required for |
|---|---|---|
| `GSC_SERVICE_ACCOUNT_FILE` or `GSC_OAUTH_CLIENT_FILE` | `gsc.py` | Search Console data, sitemaps, URL Inspection |
| `BING_WEBMASTER_API_KEY` | `bing.py` | Bing data and submissions |
| `GOOGLE_API_KEY` | `pagespeed.py` | PageSpeed Insights (keyless quota is shared and often exhausted) and CrUX |

IndexNow needs a per-site key file hosted on the client's site; it is generated per client, not set globally.

## 5. Check it works

```bash
cd ~/.claude/skills/seo-god-mode
python scripts/crawling/robots_check.py https://example.com
python scripts/state/client_state.py list
```

## 6. Start a client

In Claude Code:

```text
Use CLAUDE SEO GOD MODE for this new client.

Business: <name>
Website: <url>
Primary area: <city, state>

Start onboarding.
```
