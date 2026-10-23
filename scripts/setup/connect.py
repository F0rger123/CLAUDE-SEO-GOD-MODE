#!/usr/bin/env python3
"""Connect the data sources with as few questions to the owner as possible.

Every command prints plain-language next steps an agent can relay word for word. Nothing here prints a secret.

  connect.py status                    what is connected, what is missing, and the one next step for each
  connect.py deps                      install the Python packages the scripts and MCP server need
  connect.py gsc --find                find the downloaded service-account JSON, move it to a safe place, save the
                                       setting, and print the email to add in Search Console
  connect.py gsc --file <path>         same, for a file you name
  connect.py gsc --test                list the Search Console properties the service account can read
  connect.py bing --key <key>          check the key against Bing and save it
  connect.py pagespeed --key <key>     save a Google API key for PageSpeed/CrUX

Settings are saved for the current user (Windows: user environment variables; macOS/Linux: ~/.config/seo-god-mode/env,
which you source from your shell profile). New terminals and new Claude sessions pick them up; restart Claude Code so the
MCP server sees them.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = Path.home() / ".config" / "seo-god-mode"
SA_TARGET = CONFIG_DIR / "gsc-sa.json"
ENV_FILE = CONFIG_DIR / "env"
KEYS = ["GSC_SERVICE_ACCOUNT_FILE", "GSC_OAUTH_CLIENT_FILE", "BING_WEBMASTER_API_KEY", "GOOGLE_API_KEY"]


def save_setting(name: str, value: str) -> str:
    """Persist NAME=value for this user and set it for this process. Returns where it was saved."""
    os.environ[name] = value
    if os.name == "nt":
        # setx writes HKCU\Environment, which new processes inherit. Values here are paths or short keys (< 1024 chars).
        subprocess.run(["setx", name, value], check=True, capture_output=True)
        return "your Windows user settings"
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    lines = [l for l in (ENV_FILE.read_text().splitlines() if ENV_FILE.exists() else []) if not l.startswith(f"export {name}=")]
    lines.append(f"export {name}='{value}'")
    ENV_FILE.write_text("\n".join(lines) + "\n")
    os.chmod(ENV_FILE, 0o600)
    return f"{ENV_FILE} (add `source {ENV_FILE}` to your shell profile once)"


def have(module: str) -> bool:
    try:
        __import__(module)
        return True
    except Exception:
        return False


def cmd_status(_a) -> None:
    print("Python packages:")
    for mod, why in (("mcp", "MCP server (without it the server fails to start: 'Connection closed')"), ("googleapiclient", "Search Console")):
        print(f"  {'OK ' if have(mod) else 'MISSING'} {mod}: {why}")
    if not have("mcp") or not have("googleapiclient"):
        print("  -> run: python scripts/setup/connect.py deps")
    print("Connections:")
    sa = os.environ.get("GSC_SERVICE_ACCOUNT_FILE")
    if sa and Path(sa).exists():
        email = json.loads(Path(sa).read_text(encoding="utf-8")).get("client_email", "?")
        print(f"  OK  Search Console service account: {email}")
        print("      If Search Console shows no data, add that email in Search Console > Settings > Users and permissions > Add user (Full).")
    elif os.environ.get("GSC_OAUTH_CLIENT_FILE"):
        print("  OK  Search Console OAuth client file set")
    else:
        print("  --  Search Console: not connected. See docs/CONNECT.md section 1.")
    print(f"  {'OK ' if os.environ.get('BING_WEBMASTER_API_KEY') else '-- '} Bing Webmaster API key" + ("" if os.environ.get("BING_WEBMASTER_API_KEY") else ": see docs/CONNECT.md section 2"))
    print(f"  {'OK ' if os.environ.get('GOOGLE_API_KEY') else '-- '} PageSpeed/CrUX API key (optional)" + ("" if os.environ.get("GOOGLE_API_KEY") else ": see docs/CONNECT.md section 3"))


def cmd_deps(_a) -> None:
    reqs = [ROOT / "mcp-server" / "requirements.txt", ROOT / "scripts" / "requirements.txt"]
    args = [sys.executable, "-m", "pip", "install", "-q"] + sum([["-r", str(r)] for r in reqs if r.exists()], [])
    print("Installing:", " ".join(str(r.relative_to(ROOT)) for r in reqs if r.exists()))
    subprocess.run(args, check=True)
    print("Done. Restart Claude Code (or run /mcp and reconnect seo-god-mode) so the MCP server starts with the new packages.")


def looks_like_sa(p: Path) -> dict | None:
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
        return d if d.get("type") == "service_account" and d.get("client_email") and d.get("private_key") else None
    except Exception:
        return None


def find_sa() -> Path | None:
    places = [Path.home() / "Downloads", Path.home() / "Desktop", Path.home() / "OneDrive" / "Desktop", Path.cwd()]
    found = []
    for d in places:
        if d.is_dir():
            for f in d.glob("*.json"):
                if f.stat().st_size < 10_000 and looks_like_sa(f):
                    found.append(f)
    return max(found, key=lambda f: f.stat().st_mtime) if found else None


def cmd_gsc(a) -> None:
    if a.test:
        r = subprocess.run([sys.executable, str(ROOT / "scripts" / "integrations" / "gsc.py"), "sites"], capture_output=True, text=True)
        out = (r.stdout + r.stderr).strip()
        print(out or "No properties visible yet. Add the service-account email in Search Console (Users and permissions > Add user > Full), wait a minute, and test again.")
        return
    src = Path(a.file).expanduser() if a.file else (SA_TARGET if SA_TARGET.exists() and not a.find else find_sa())
    if not src or not src.exists():
        sys.exit("No service-account key file found in Downloads or Desktop. In Google Cloud: IAM & Admin > Service Accounts > (account) > Keys > Add key > JSON, then run this again.")
    data = looks_like_sa(src)
    if not data:
        sys.exit(f"{src.name} is not a service-account key (it needs \"type\": \"service_account\").")
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if src.resolve() != SA_TARGET.resolve():
        shutil.move(str(src), SA_TARGET)
    if os.name != "nt":
        os.chmod(SA_TARGET, 0o600)
    where = save_setting("GSC_SERVICE_ACCOUNT_FILE", str(SA_TARGET))
    print(f"Key file stored at {SA_TARGET} (moved out of {src.parent.name}); setting saved to {where}.")
    print()
    print("Tell the owner exactly this:")
    print("  In Google Search Console, open the site, then Settings > Users and permissions > Add user.")
    print(f"  Email address: {data['client_email']}")
    print("  Permission: Full. Then press Add.")
    print("  (That email is the service account's address. Google shows it on the Service Accounts page, not when the key downloads.)")
    print()
    print("Then run: python scripts/setup/connect.py gsc --test")


def cmd_bing(a) -> None:
    key = a.key.strip()
    try:
        with urllib.request.urlopen(f"https://ssl.bing.com/webmaster/api.svc/json/GetUserSites?apikey={key}", timeout=20) as r:
            sites = json.loads(r.read().decode()).get("d") or []
    except urllib.error.HTTPError as e:
        sys.exit(f"Bing refused the key (HTTP {e.code}). Generate a new one: Bing Webmaster Tools > Settings (gear) > API access > API Key.")
    where = save_setting("BING_WEBMASTER_API_KEY", key)
    print(f"Key works; saved to {where}. Sites on this account: " + (", ".join(f"{s.get('Url')} ({'verified' if s.get('IsVerified') else 'NOT verified'})" for s in sites) or "none"))


def cmd_pagespeed(a) -> None:
    where = save_setting("GOOGLE_API_KEY", a.key.strip())
    print(f"Saved to {where}. In Google Cloud, enable 'PageSpeed Insights API' (and 'Chrome UX Report API' for field data) on the same project.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    sub.add_parser("deps").set_defaults(fn=cmd_deps)
    g = sub.add_parser("gsc")
    g.add_argument("--find", action="store_true", help="look in Downloads/Desktop for the newest service-account key")
    g.add_argument("--file")
    g.add_argument("--test", action="store_true")
    g.set_defaults(fn=cmd_gsc)
    b = sub.add_parser("bing")
    b.add_argument("--key", required=True)
    b.set_defaults(fn=cmd_bing)
    p = sub.add_parser("pagespeed")
    p.add_argument("--key", required=True)
    p.set_defaults(fn=cmd_pagespeed)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
