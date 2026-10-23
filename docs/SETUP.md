# Setup

## 1. Install the skill

Global install (available in every Claude Code session):

```bash
git clone https://github.com/F0rger123/master-seo-skill-set-for-claude ~/.claude/skills/master-seo-skill-set
```

Windows PowerShell:

```powershell
git clone https://github.com/F0rger123/master-seo-skill-set-for-claude "$HOME\.claude\skills\master-seo-skill-set"
```

Update later with `git -C ~/.claude/skills/master-seo-skill-set pull`.

Project-only install: clone into `<project>/.claude/skills/master-seo-skill-set` instead.

## 2. Python

Python 3.10 or newer. Core scripts need nothing else.

For Google Search Console:

```bash
pip install -r ~/.claude/skills/master-seo-skill-set/scripts/requirements.txt
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
cd ~/.claude/skills/master-seo-skill-set
python scripts/crawling/robots_check.py https://example.com
python scripts/state/client_state.py list
```

## 6. Start a client

In Claude Code:

```text
Use the Master SEO Skill Set for this new client.

Business: <name>
Website: <url>
Primary area: <city, state>

Start onboarding.
```
