#!/usr/bin/env python3
"""Collect the facts for a client report from state.json and log.md for a date range. No network calls.

Prints a markdown data pack (work done, issues fixed/opened, checkpoints, open manual tasks,
latest audit) for Claude to turn into a report with templates/monthly-report.md.
Every number in the report must trace to this pack or to a data file in <client>/data/.

Usage:
  report_data.py d-hauss --start 2026-10-01 --end 2026-10-31
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402


def within(d, start, end):
    return bool(d) and start <= d[:10] <= end


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug"); ap.add_argument("--start", required=True); ap.add_argument("--end", required=True)
    a = ap.parse_args()
    d = common.client_dir(a.slug)
    s = common.read_json(d / "state.json")
    S, E = a.start, a.end
    print(f"# Report data — {s['profile'].get('business_name')} — {S} to {E}\n")

    done = [t for t in s["tasks"] if t["status"] == "done" and within(t.get("done"), S, E)]
    print(f"## Tasks completed ({len(done)})")
    for t in done:
        print(f"- {t['done']} {t['title']} ({t['owner']})")

    fixed = [i for i in s["issues"] if i["status"] == "fixed" and within(i.get("fixed"), S, E)]
    opened = [i for i in s["issues"] if within(i.get("found"), S, E)]
    still = [i for i in s["issues"] if i["status"] == "open"]
    print(f"\n## Issues fixed ({len(fixed)})")
    for i in fixed:
        print(f"- [{i['severity']}] {i['title']}")
    print(f"\n## Issues found this period ({len(opened)}); open overall: {len(still)}")
    for i in opened:
        print(f"- [{i['severity']}] {i['title']} ({i['status']})")

    print("\n## Checkpoints in period (compare with earlier values of the same metric)")
    by_metric = {}
    for c in sorted(s["checkpoints"], key=lambda c: c["date"]):
        by_metric.setdefault((c["source"], c["metric"]), []).append(c)
    for (src, m), cs in by_metric.items():
        inside = [c for c in cs if within(c["date"], S, E)]
        before = [c for c in cs if c["date"] < S]
        if inside:
            base = f" (previous: {before[-1]['value']} on {before[-1]['date']})" if before else " (no earlier baseline)"
            print(f"- {src}.{m}: {inside[-1]['value']} on {inside[-1]['date']}{base}")

    recs = [r for r in s["recommendations"] if within(r.get("date"), S, E)]
    print(f"\n## Recommendation changes ({len(recs)})")
    for r in recs:
        print(f"- {r['id']} {r['status']}: {r['title']}")

    manual = [t for t in s["tasks"] if t["owner"] == "user" and t["status"] != "done"]
    print(f"\n## Waiting on client/user ({len(manual)})")
    for t in manual:
        print(f"- {t['title']}")

    runs = [r for r in s["audit"].get("runs", []) if within(r["date"], S, E)]
    print(f"\n## Audit runs in period ({len(runs)})")
    for r in runs:
        print(f"- {r['date']}: {r['pages']} pages, {r['issue_groups']} issue groups ({r['dir']})")

    files = sorted(p.relative_to(d) for p in (d / "data").rglob("*") if p.is_file()
                   and re.search(r"\d{4}-\d{2}-\d{2}", p.as_posix()) and
                   any(S <= x <= E for x in re.findall(r"\d{4}-\d{2}-\d{2}", p.as_posix())))
    print(f"\n## Data files dated in period ({len(files)})")
    for f in files[:40]:
        print(f"- {f}")

    log = d / "log.md"
    if log.exists():
        lines = [l for l in log.read_text(encoding="utf-8").splitlines() if l.startswith("- ") and S <= l[2:12] <= E]
        print(f"\n## Log entries ({len(lines)})")
        print("\n".join(lines[-40:]))


if __name__ == "__main__":
    main()
