#!/usr/bin/env python3
"""Compare two Search Console (or Bing) CSV exports of the same dimension. No network calls.

Input CSVs need a key column (query or page) plus clicks, impressions, position.
Outputs totals, biggest winners/losers, new and lost keys.

Usage:
  compare_periods.py previous.csv current.csv [--key query] [--top 15] [--out compare.json]
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402


def load(path: str, key: str | None):
    with open(path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return {}, key
    cols = {c.lower(): c for c in rows[0]}
    key = key or next((cols[c] for c in ("query", "page", "url", "keys") if c in cols), list(rows[0])[0])
    def num(r, *names):
        for n in names:
            if n in cols:
                try:
                    return float(r[cols[n]] or 0)
                except ValueError:
                    return 0.0
        return 0.0
    return {r[key]: {"clicks": num(r, "clicks"), "impressions": num(r, "impressions"),
                     "position": num(r, "position", "avgimpressionposition", "avgclickposition")} for r in rows}, key


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("previous"); ap.add_argument("current")
    ap.add_argument("--key"); ap.add_argument("--top", type=int, default=15); ap.add_argument("--out")
    a = ap.parse_args()
    prev, key = load(a.previous, a.key)
    cur, _ = load(a.current, key)

    def tot(d, m):
        return sum(v[m] for v in d.values())
    totals = {m: {"previous": tot(prev, m), "current": tot(cur, m), "change": tot(cur, m) - tot(prev, m)}
              for m in ("clicks", "impressions")}
    rows = []
    for k in set(prev) | set(cur):
        p, c = prev.get(k, {}), cur.get(k, {})
        rows.append({key: k, "clicks_prev": p.get("clicks", 0), "clicks_cur": c.get("clicks", 0),
                     "clicks_change": c.get("clicks", 0) - p.get("clicks", 0),
                     "impr_change": c.get("impressions", 0) - p.get("impressions", 0),
                     "pos_prev": round(p["position"], 1) if p else "", "pos_cur": round(c["position"], 1) if c else ""})
    winners = sorted(rows, key=lambda r: -r["clicks_change"])[: a.top]
    losers = sorted(rows, key=lambda r: r["clicks_change"])[: a.top]
    new = sorted((r for r in rows if r[key] not in prev), key=lambda r: -r["impr_change"])[: a.top]
    lost = sorted((r for r in rows if r[key] not in cur), key=lambda r: r["impr_change"])[: a.top]

    cols = [key, "clicks_prev", "clicks_cur", "clicks_change", "impr_change", "pos_prev", "pos_cur"]
    print(f"Totals (row sums; anonymized queries excluded): {totals}\n")
    for title, data in (("Winners", winners), ("Losers", losers), ("New", new), ("Lost", lost)):
        print(f"## {title}\n{common.md_table(data, cols)}")
    if a.out:
        common.write_json(Path(a.out), {"totals": totals, "winners": winners, "losers": losers, "new": new, "lost": lost})


if __name__ == "__main__":
    main()
