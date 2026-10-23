#!/usr/bin/env python3
"""Rate a fixed set of sites and compare with a saved baseline, to catch scoring regressions after changing checks.

Usage:
  benchmark.py --sites example.com python.org theagencyzero.com --save baseline.json
  benchmark.py --compare baseline.json                 (re-rates the same sites, prints per-check differences)

Keep baseline files outside the repo (site content changes over time, so scores drift for real reasons too).
Explain every difference before shipping: is it a site change, a bug fix, or a regression?
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import common  # noqa: E402


def rate(site: str, max_pages: int) -> dict:
    with tempfile.TemporaryDirectory() as d:
        subprocess.run([sys.executable, str(ROOT / "scripts/rate_site.py"), site, "--no-psi", "--max-pages", str(max_pages),
                        "--out", d], capture_output=True, text=True, encoding="utf-8", errors="replace")
        r = json.loads((Path(d) / "rating.json").read_text(encoding="utf-8"))
    return {"scores": r["scores"], "rubric_version": r["rubric_version"],
            "checks": {c["check"]: c["ratio"] for c in r["checks"]}}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sites", nargs="*")
    ap.add_argument("--save"); ap.add_argument("--compare")
    ap.add_argument("--max-pages", type=int, default=15)
    a = ap.parse_args()

    base = common.read_json(Path(a.compare)) if a.compare else {}
    sites = a.sites or list(base)
    if not sites:
        sys.exit("Give --sites or --compare <baseline.json>")
    now = {s: rate(s, a.max_pages) for s in sites}
    for s, r in now.items():
        sc = r["scores"]
        print(f"{s:<30} overall {sc['overall']:>3}  seo {sc['seo']:>3}  aeo {sc['aeo']:>3}  geo {sc['geo']:>3}")
        if s in base:
            old = base[s]
            for k in ("overall", "seo", "aeo", "geo"):
                if old["scores"][k] != sc[k]:
                    print(f"   {k}: {old['scores'][k]} -> {sc[k]}")
            for chk in sorted(set(old["checks"]) | set(r["checks"])):
                o, n = old["checks"].get(chk, "absent"), r["checks"].get(chk, "absent")
                if o != n:
                    print(f"   · {chk}: {o} -> {n}")
    if a.save:
        common.write_json(Path(a.save), now)
        print(f"Saved {a.save}")


if __name__ == "__main__":
    main()
