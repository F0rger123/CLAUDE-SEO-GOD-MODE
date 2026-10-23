#!/usr/bin/env python3
"""Client state manager: the memory that lets any Claude session resume a client.

State lives in <clients>/<slug>/state.json (clients = $AZ_SEO_CLIENTS or ~/agency-zero-clients).

Examples:
  client_state.py init d-hauss --name "D-Hauss Remodeling" --website https://example.com --area "York, PA"
  client_state.py resume d-hauss
  client_state.py set d-hauss profile.cms "WordPress"
  client_state.py set d-hauss profile.services '["Kitchen remodeling","Bathroom remodeling"]'
  client_state.py set d-hauss integrations.gsc.status connected
  client_state.py task add d-hauss "Verify domain property in Search Console" --owner user
  client_state.py task done d-hauss T-003
  client_state.py issue add d-hauss "Sitemap lists 14 redirected URLs" --severity high --area indexing
  client_state.py rec add d-hauss "Add York service-area page" --area local
  client_state.py rec reject d-hauss R-002 --reason "Owner does not serve Lancaster"
  client_state.py checkpoint d-hauss --source gsc --metric clicks_28d --value 412
  client_state.py recurring ran d-hauss RC-001
  client_state.py log d-hauss "Ran initial audit; 23 issues logged"
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402

SCHEMA_VERSION = 1

# Onboarding fields. resume() reports any that are still empty.
PROFILE_FIELDS = {
    "business_name": "", "website": "", "industry": "", "services": [], "locations": [],
    "service_area": [], "geographic_focus": "", "target_audience": "", "conversion_goals": [],
    "competitors": [], "cms": "", "analytics": "", "sitemap_url": "", "current_issues": "",
    "content_availability": "", "ranking_goals": [], "primary_phone": "", "email": "",
    "brand_facts": {}, "social_profiles": [], "notes": "",
}
INTEGRATIONS = ["gsc", "bing", "gbp", "ga4", "pagespeed", "indexnow", "cms_access", "keyword_data"]
CADENCE_DAYS = {"weekly": 7, "biweekly": 14, "monthly": 30, "quarterly": 91}
DEFAULT_RECURRING = [
    ("Pull Search Console performance + compare to prior period", "monthly", "workflows/search-console.md"),
    ("Pull Bing performance + crawl issues", "monthly", "workflows/bing-webmaster.md"),
    ("Sitemap + robots check", "monthly", "scripts/sitemap/sitemap_check.py"),
    ("Crawl, metadata, link, schema audit", "monthly", "scripts/audit.py"),
    ("Inspect priority URLs for index status", "monthly", "workflows/indexing.md"),
    ("PageSpeed check on key templates", "quarterly", "scripts/integrations/pagespeed.py"),
    ("Monthly report", "monthly", "workflows/reporting.md"),
]


def path_for(slug: str) -> Path:
    return common.client_dir(slug) / "state.json"


def load(slug: str) -> dict:
    p = path_for(slug)
    if not p.exists():
        sys.exit(f"No client '{slug}' at {p}. Run: client_state.py init {slug} ...")
    return common.read_json(p)


def save(state: dict) -> None:
    state["updated"] = datetime.now().isoformat(timespec="seconds")
    common.write_json(path_for(state["slug"]), state)


def next_id(items: list, prefix: str) -> str:
    n = max([int(i["id"].split("-")[-1]) for i in items if i.get("id", "").startswith(prefix + "-")] or [0])
    return f"{prefix}-{n + 1:03d}"


def find(items: list, item_id: str) -> dict:
    for i in items:
        if i["id"].lower() == item_id.lower():
            return i
    sys.exit(f"Not found: {item_id}")


def parse_value(raw: str):
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def append_log(slug: str, text: str) -> None:
    log = common.client_dir(slug) / "log.md"
    with log.open("a", encoding="utf-8") as f:
        f.write(f"- {datetime.now():%Y-%m-%d %H:%M} — {text}\n")


def empty(v) -> bool:
    return v in ("", None, [], {})


# ---------------------------------------------------------------- commands

def cmd_init(a):
    d = common.client_dir(a.slug)
    if path_for(a.slug).exists():
        sys.exit(f"Client exists: {d}. Use 'resume'.")
    for sub in ("data", "reports"):
        (d / sub).mkdir(parents=True, exist_ok=True)
    profile = json.loads(json.dumps(PROFILE_FIELDS))
    profile.update({"business_name": a.name or "", "website": (a.website or "").rstrip("/")})
    if a.area:
        profile["service_area"] = [a.area]
    t = common.today()
    state = {
        "schema_version": SCHEMA_VERSION, "slug": a.slug, "created": t, "updated": t, "phase": "onboarding",
        "profile": profile,
        "integrations": {k: {"status": "unknown", "property": "", "notes": ""} for k in INTEGRATIONS},
        "audit": {"status": "not_started", "runs": []},
        "tasks": [], "issues": [], "recommendations": [], "checkpoints": [],
        "recurring": [{"id": f"RC-{i + 1:03d}", "title": title, "cadence": cad, "how": how,
                       "last_run": None, "active": False}
                      for i, (title, cad, how) in enumerate(DEFAULT_RECURRING)],
    }
    save(state)
    (d / "log.md").write_text(f"# {a.name or a.slug} — work log\n\n", encoding="utf-8")
    roadmap_tpl = common.SKILL_ROOT / "templates" / "seo-roadmap.md"
    if roadmap_tpl.exists() and not (d / "roadmap.md").exists():
        (d / "roadmap.md").write_text(roadmap_tpl.read_text(encoding="utf-8").replace("{{BUSINESS}}", a.name or a.slug),
                                      encoding="utf-8")
    append_log(a.slug, "Client state created")
    render_profile(state)
    print(f"Created {d}")


def cmd_list(a):
    root = common.clients_dir()
    if not root.exists():
        print(f"No clients yet ({root})")
        return
    for p in sorted(root.glob("*/state.json")):
        s = common.read_json(p)
        print(f"{s['slug']:<28} {s['profile'].get('business_name',''):<34} phase={s.get('phase')} updated={s.get('updated','')[:10]}")


def cmd_path(a):
    print(common.client_dir(a.slug))


def cmd_show(a):
    s = load(a.slug)
    print(json.dumps(s.get(a.section) if a.section else s, indent=2, ensure_ascii=False))


def cmd_set(a):
    s = load(a.slug)
    keys, value = a.key.split("."), parse_value(a.value)
    node = s
    for k in keys[:-1]:
        node = node.setdefault(k, {})
    if a.append:
        node.setdefault(keys[-1], [])
        node[keys[-1]].extend(value if isinstance(value, list) else [value])
    else:
        node[keys[-1]] = value
    save(s)
    if keys[0] == "profile":
        render_profile(s)
    print(f"{a.key} = {json.dumps(node[keys[-1]], ensure_ascii=False)}")


def cmd_task(a):
    s = load(a.slug)
    if a.action == "add":
        item = {"id": next_id(s["tasks"], "T"), "title": a.text, "owner": a.owner, "status": "open",
                "workflow": a.workflow or "", "created": common.today(), "done": None, "notes": a.notes or ""}
        s["tasks"].append(item)
        msg = f"Task {item['id']} ({a.owner}): {a.text}"
    else:
        item = find(s["tasks"], a.text)
        item["status"] = {"done": "done", "block": "blocked", "reopen": "open"}[a.action]
        item["done"] = common.today() if a.action == "done" else None
        if a.notes:
            item["notes"] = a.notes
        msg = f"Task {item['id']} -> {item['status']}: {item['title']}"
    save(s)
    append_log(a.slug, msg)
    print(msg)


def cmd_issue(a):
    s = load(a.slug)
    if a.action == "add":
        dup = [i for i in s["issues"] if i["title"].lower() == a.text.lower() and i["status"] == "open"]
        if dup:
            print(f"Already open: {dup[0]['id']}")
            return
        item = {"id": next_id(s["issues"], "I"), "title": a.text, "severity": a.severity, "area": a.area or "",
                "urls": a.urls or [], "status": "open", "found": common.today(), "fixed": None,
                "source": a.source or "", "notes": a.notes or ""}
        s["issues"].append(item)
        msg = f"Issue {item['id']} [{a.severity}]: {a.text}"
    else:
        item = find(s["issues"], a.text)
        item["status"] = {"fix": "fixed", "wontfix": "wontfix", "reopen": "open"}[a.action]
        item["fixed"] = common.today() if a.action == "fix" else None
        if a.notes:
            item["notes"] = a.notes
        msg = f"Issue {item['id']} -> {item['status']}: {item['title']}"
    save(s)
    append_log(a.slug, msg)
    print(msg)


def cmd_rec(a):
    s = load(a.slug)
    if a.action == "add":
        for r in s["recommendations"]:
            if r["title"].lower() == a.text.lower():
                print(f"Exists as {r['id']} (status={r['status']}). Reason: {r.get('reason','')}")
                return
        item = {"id": next_id(s["recommendations"], "R"), "title": a.text, "area": a.area or "",
                "status": "proposed", "reason": a.reason or "", "date": common.today()}
        s["recommendations"].append(item)
        msg = f"Recommendation {item['id']}: {a.text}"
    else:
        item = find(s["recommendations"], a.text)
        item["status"] = {"accept": "accepted", "reject": "rejected", "done": "done"}[a.action]
        item["date"] = common.today()
        if a.reason:
            item["reason"] = a.reason
        msg = f"Recommendation {item['id']} -> {item['status']}: {item['title']} {('(' + a.reason + ')') if a.reason else ''}"
    save(s)
    append_log(a.slug, msg)
    print(msg)


def cmd_checkpoint(a):
    s = load(a.slug)
    item = {"date": a.date or common.today(), "source": a.source, "metric": a.metric,
            "value": parse_value(a.value), "note": a.note or "", "file": a.file or ""}
    s["checkpoints"].append(item)
    save(s)
    print(f"Checkpoint {a.source}.{a.metric}={a.value}")


def cmd_recurring(a):
    s = load(a.slug)
    if a.action == "add":
        item = {"id": next_id(s["recurring"], "RC"), "title": a.text, "cadence": a.cadence,
                "how": a.how or "", "last_run": None, "active": True}
        s["recurring"].append(item)
        msg = f"Recurring {item['id']} ({a.cadence}): {a.text}"
    else:
        item = find(s["recurring"], a.text)
        if a.action == "ran":
            item["last_run"], item["active"] = common.today(), True
        else:
            item["active"] = a.action == "activate"
        msg = f"Recurring {item['id']} {a.action}: {item['title']}"
    save(s)
    append_log(a.slug, msg)
    print(msg)


def cmd_log(a):
    load(a.slug)
    append_log(a.slug, a.text)
    print("Logged.")


def cmd_resume(a):
    s = load(a.slug)
    p = s["profile"]
    print(f"# {p.get('business_name') or s['slug']}  ({p.get('website','')})")
    print(f"phase: {s['phase']} | audit: {s['audit']['status']} | updated: {s['updated']}")
    print(f"dir: {common.client_dir(s['slug'])}\n")

    missing = [k for k in PROFILE_FIELDS if k not in ("notes", "brand_facts", "social_profiles", "email")
               and empty(p.get(k))]
    print("## Profile gaps (ask only these)")
    print(", ".join(missing) if missing else "none")

    print("\n## Integrations")
    for k, v in s["integrations"].items():
        print(f"- {k}: {v['status']}{(' — ' + v['property']) if v.get('property') else ''}")

    def open_items(items, cond):
        return [i for i in items if cond(i)]

    user_tasks = open_items(s["tasks"], lambda t: t["status"] != "done" and t["owner"] == "user")
    claude_tasks = open_items(s["tasks"], lambda t: t["status"] != "done" and t["owner"] != "user")
    print(f"\n## Waiting on user ({len(user_tasks)})")
    for t in user_tasks:
        print(f"- {t['id']} {t['title']}{' [blocked]' if t['status']=='blocked' else ''}")
    print(f"\n## Claude tasks ({len(claude_tasks)})")
    for t in claude_tasks:
        print(f"- {t['id']} {t['title']}{(' -> ' + t['workflow']) if t['workflow'] else ''}")

    rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    issues = sorted(open_items(s["issues"], lambda i: i["status"] == "open"), key=lambda i: rank.get(i["severity"], 9))
    print(f"\n## Open issues ({len(issues)})")
    for i in issues[:15]:
        print(f"- {i['id']} [{i['severity']}] {i['title']}")
    if len(issues) > 15:
        print(f"- ... {len(issues) - 15} more (client_state.py show {s['slug']} --section issues)")

    recs = open_items(s["recommendations"], lambda r: r["status"] in ("proposed", "accepted"))
    rejected = open_items(s["recommendations"], lambda r: r["status"] == "rejected")
    print(f"\n## Recommendations: {len(recs)} open, {len(rejected)} rejected (never re-propose rejected)")
    for r in recs:
        print(f"- {r['id']} [{r['status']}] {r['title']}")

    due = []
    for r in s["recurring"]:
        if not r.get("active"):
            continue
        last = r.get("last_run")
        if not last or date.fromisoformat(last) + timedelta(days=CADENCE_DAYS.get(r["cadence"], 30)) <= date.today():
            due.append(r)
    print(f"\n## Recurring due ({len(due)})")
    for r in due:
        print(f"- {r['id']} {r['title']} (last {r.get('last_run') or 'never'}) -> {r['how']}")

    if s["checkpoints"]:
        print("\n## Latest checkpoints")
        latest = {}
        for c in s["checkpoints"]:
            latest[(c["source"], c["metric"])] = c
        for c in list(latest.values())[-8:]:
            print(f"- {c['date']} {c['source']}.{c['metric']} = {c['value']}")

    print("\n## next")
    nxt = {
        "onboarding": "workflows/onboarding.md — fill profile gaps, then integration checklist",
        "audit": "workflows/initial-audit.md",
        "roadmap": "Build roadmap.md from open issues + recommendations (templates/seo-roadmap.md)",
        "execution": "Work highest-severity open issues / accepted recommendations",
        "maintenance": "workflows/recurring-maintenance.md — run recurring items due",
    }
    print(f"- phase action: {nxt.get(s['phase'], 'workflows/onboarding.md')}")
    if user_tasks:
        print(f"- remind user of {len(user_tasks)} pending manual task(s)")
    log = common.client_dir(s["slug"]) / "log.md"
    if log.exists():
        tail = log.read_text(encoding="utf-8").strip().splitlines()[-5:]
        print("\n## Last log entries\n" + "\n".join(tail))


def render_profile(s: dict) -> None:
    """Write a human-readable profile.md mirror of state.json profile."""
    p = s["profile"]
    lines = [f"# Client profile — {p.get('business_name') or s['slug']}", "",
             "_Generated from state.json. Edit with client_state.py set, not by hand._", ""]
    for k, v in p.items():
        if isinstance(v, list):
            v = "\n" + "\n".join(f"  - {json.dumps(x, ensure_ascii=False) if isinstance(x, dict) else x}" for x in v) if v else "—"
        elif isinstance(v, dict):
            v = "\n" + "\n".join(f"  - {kk}: {vv}" for kk, vv in v.items()) if v else "—"
        lines.append(f"- **{k}**: {v or '—'}")
    (common.client_dir(s["slug"]) / "profile.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("init"); p.add_argument("slug"); p.add_argument("--name"); p.add_argument("--website"); p.add_argument("--area")
    p.set_defaults(fn=cmd_init)
    sub.add_parser("list").set_defaults(fn=cmd_list)
    p = sub.add_parser("path"); p.add_argument("slug"); p.set_defaults(fn=cmd_path)
    p = sub.add_parser("show"); p.add_argument("slug"); p.add_argument("--section"); p.set_defaults(fn=cmd_show)
    p = sub.add_parser("resume"); p.add_argument("slug"); p.set_defaults(fn=cmd_resume)
    p = sub.add_parser("set", help="set dotted key; value parsed as JSON when possible")
    p.add_argument("slug"); p.add_argument("key"); p.add_argument("value"); p.add_argument("--append", action="store_true")
    p.set_defaults(fn=cmd_set)

    p = sub.add_parser("task"); p.add_argument("action", choices=["add", "done", "block", "reopen"])
    p.add_argument("slug"); p.add_argument("text", help="title for add, else task id")
    p.add_argument("--owner", choices=["user", "claude"], default="claude"); p.add_argument("--workflow"); p.add_argument("--notes")
    p.set_defaults(fn=cmd_task)

    p = sub.add_parser("issue"); p.add_argument("action", choices=["add", "fix", "wontfix", "reopen"])
    p.add_argument("slug"); p.add_argument("text")
    p.add_argument("--severity", choices=["critical", "high", "medium", "low"], default="medium")
    p.add_argument("--area"); p.add_argument("--urls", nargs="*"); p.add_argument("--source"); p.add_argument("--notes")
    p.set_defaults(fn=cmd_issue)

    p = sub.add_parser("rec"); p.add_argument("action", choices=["add", "accept", "reject", "done"])
    p.add_argument("slug"); p.add_argument("text"); p.add_argument("--area"); p.add_argument("--reason")
    p.set_defaults(fn=cmd_rec)

    p = sub.add_parser("checkpoint"); p.add_argument("slug"); p.add_argument("--source", required=True)
    p.add_argument("--metric", required=True); p.add_argument("--value", required=True)
    p.add_argument("--note"); p.add_argument("--file"); p.add_argument("--date")
    p.set_defaults(fn=cmd_checkpoint)

    p = sub.add_parser("recurring"); p.add_argument("action", choices=["add", "ran", "activate", "pause"])
    p.add_argument("slug"); p.add_argument("text"); p.add_argument("--cadence", choices=list(CADENCE_DAYS), default="monthly")
    p.add_argument("--how")
    p.set_defaults(fn=cmd_recurring)

    p = sub.add_parser("log"); p.add_argument("slug"); p.add_argument("text"); p.set_defaults(fn=cmd_log)
    p = sub.add_parser("render"); p.add_argument("slug"); p.set_defaults(fn=lambda a: (render_profile(load(a.slug)), print("profile.md written")))

    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
