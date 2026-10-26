#!/usr/bin/env python3
"""Self-learning SEO loop: find what to improve from Search Console, record what was changed, and learn which kinds of
change actually worked on this site. Deterministic and free (no AI calls), so an agent only spends effort when there is
something worth doing.

  seo_loop.py scan     --config seo-loop.json     find opportunities (prints "ACTIONABLE: n"; 0 means stop)
  seo_loop.py record   --config seo-loop.json --page /path --type title --query "q" --note "what changed"
  seo_loop.py evaluate --config seo-loop.json     score past changes once enough time has passed; update learnings
  seo_loop.py status   --config seo-loop.json     one-screen summary of history and learnings

Opportunity types (each scored by impressions x gap x what this site has learned about that type):
  ctr_gap        page 1 (position <= 10) but clicked far less than expected for its position -> rewrite title/description
  striking       positions 8-20 with real impressions -> strengthen the page for that query (answer, FAQ, links)
  unanswered     searched (impressions) but never clicked and ranking past 20 -> add a section/FAQ, or a new page
  cannibal       one query spread over 2+ of your pages -> make one page the clear answer and link the other to it
  decline        a page's clicks or impressions fell sharply vs the previous period -> check what changed
  competitor_gap a topic or customer question 2+ rivals cover and you don't (from compete.py scan) -> section/FAQ/new page
  trend          a phrase people search around your services that no page answers (from compete.py trends) -> section/FAQ

Files in state_dir (commit them so every session and machine shares the memory):
  latest.md / latest.json   the current opportunity list
  history.jsonl             every change made by the loop, with its before-metrics and later outcome
  learnings.json            wins/losses per change type -> weights used to rank future opportunities

Evidence: Search Console numbers are OBSERVED; expected-CTR curve, scores and "win/loss" are INFERRED.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "integrations"))
sys.path.insert(0, str(ROOT))

# Rough organic CTR by position (INFERRED; varies by query and SERP features). Used only to spot pages that underperform.
EXPECTED_CTR = {1: 0.28, 2: 0.15, 3: 0.10, 4: 0.07, 5: 0.05, 6: 0.04, 7: 0.03, 8: 0.025, 9: 0.02, 10: 0.02}
TYPES = ["ctr_gap", "striking", "unanswered", "cannibal", "decline", "competitor_gap", "trend"]
DEFAULTS = {
    "min_impressions": 20,
    "max_changes_per_run": 3,
    "cooldown_days": 28,
    "evaluate_after_days": 28,
    "window_days": 28,
}


# ---------------------------------------------------------------- config and state

def load_config(path: str) -> dict:
    p = Path(path)
    cfg = {**DEFAULTS, **json.loads(p.read_text(encoding="utf-8"))}
    cfg["_dir"] = p.resolve().parent
    state = Path(cfg.get("state_dir", "seo-loop"))
    cfg["_state"] = state if state.is_absolute() else cfg["_dir"] / state
    cfg["_state"].mkdir(parents=True, exist_ok=True)
    for k in ("site", "gsc_property"):
        if not cfg.get(k):
            sys.exit(f"Config needs '{k}'.")
    return cfg


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")


def load_learnings(cfg: dict) -> dict:
    p = cfg["_state"] / "learnings.json"
    data = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
    for t in TYPES + ["title", "meta_description", "faq", "answer_paragraph", "internal_links", "section", "new_page"]:
        data.setdefault(t, {"wins": 0, "losses": 0, "flat": 0})
    return data


def weight(learn: dict, kind: str) -> float:
    """Laplace-smoothed win rate, centred on 1.0: unknown types start neutral, proven ones rise, failing ones sink."""
    d = learn.get(kind, {"wins": 0, "losses": 0})
    return round(2 * (d["wins"] + 1) / (d["wins"] + d["losses"] + 2), 3)


# ---------------------------------------------------------------- Search Console

def gsc_rows(cfg: dict, start: str, end: str, dims: list[str], limit: int = 5000) -> list[dict]:
    import gsc  # scripts/integrations/gsc.py
    svc = gsc.service(readonly=True)
    raw = gsc.query_all(svc, cfg["gsc_property"], start, end, dims, "web", [], limit)
    out = []
    for r in raw:
        row = dict(zip(dims, r["keys"]))
        row.update(clicks=r.get("clicks", 0), impressions=r.get("impressions", 0), ctr=r.get("ctr", 0.0), position=r.get("position", 0.0))
        out.append(row)
    return out


def windows(cfg: dict, end: date | None = None) -> tuple[tuple[str, str], tuple[str, str]]:
    n = int(cfg["window_days"])
    end = end or (date.today() - timedelta(days=3))
    cur = (end - timedelta(days=n - 1), end)
    prev = (cur[0] - timedelta(days=n), cur[0] - timedelta(days=1))
    return (cur[0].isoformat(), cur[1].isoformat()), (prev[0].isoformat(), prev[1].isoformat())


def path_of(url: str) -> str:
    return urlparse(url).path or "/"


def clean_page(arg: str) -> str:
    """A page given as /path or a full URL. Undoes Git Bash on Windows turning '/path' into 'C:/Program Files/Git/path'."""
    import re
    arg = arg.replace("\\", "/")
    m = re.match(r"^[A-Za-z]:/.*?/Git(/.*)?$", arg)
    if m:
        arg = m.group(1) or "/"
    if arg.startswith("http"):
        arg = path_of(arg)
    return "/" + arg.lstrip("/")


# ---------------------------------------------------------------- scan

def oid(kind: str, page: str, query: str = "") -> str:
    return hashlib.sha1(f"{kind}|{page}|{query}".encode()).hexdigest()[:10]


def find_opportunities(qp: list[dict], pages_now: list[dict], pages_prev: list[dict], cfg: dict, learn: dict, cooling: set[str]) -> list[dict]:
    mi = int(cfg["min_impressions"])
    ops: list[dict] = []
    skip = [s.lower() for s in cfg.get("ignore_queries_containing", [])]
    keep = lambda q: not any(s in q.lower() for s in skip)

    # Page-level CTR gap (title/description).
    for r in pages_now:
        pos = round(r["position"])
        if 1 <= pos <= 10 and r["impressions"] >= mi:
            exp = EXPECTED_CTR.get(pos, 0.02)
            if r["ctr"] < exp * 0.6:
                top = sorted([x for x in qp if x["page"] == r["page"] and keep(x["query"])], key=lambda x: -x["impressions"])[:5]
                gap = exp - r["ctr"]
                ops.append({"type": "ctr_gap", "page": path_of(r["page"]), "query": top[0]["query"] if top else "",
                            "queries": [x["query"] for x in top], "impressions": r["impressions"], "clicks": r["clicks"],
                            "ctr": round(r["ctr"], 4), "expected_ctr": exp, "position": round(r["position"], 1),
                            "score": r["impressions"] * gap * 100, "suggest": "Rewrite the title and meta description to match these searches and promise the answer; keep under 60 / 155 characters."})

    # Query-level: striking distance, unanswered, cannibalization.
    by_query: dict[str, list[dict]] = {}
    for r in qp:
        if keep(r["query"]):
            by_query.setdefault(r["query"], []).append(r)
    for q, rows in by_query.items():
        imp = sum(x["impressions"] for x in rows)
        best = min(rows, key=lambda x: x["position"])
        if len([x for x in rows if x["impressions"] >= max(3, mi // 4)]) >= 2 and imp >= mi:
            ops.append({"type": "cannibal", "page": path_of(best["page"]), "query": q, "pages": [path_of(x["page"]) for x in rows],
                        "impressions": imp, "position": round(best["position"], 1), "score": imp * 0.5,
                        "suggest": f"Make {path_of(best['page'])} the clear answer for this search; link the other page(s) to it with this wording and trim the overlap."})
        if 8 <= best["position"] <= 20 and best["impressions"] >= mi:
            ops.append({"type": "striking", "page": path_of(best["page"]), "query": q, "impressions": best["impressions"],
                        "clicks": best["clicks"], "position": round(best["position"], 1), "score": best["impressions"] * (21 - best["position"]) / 12,
                        "suggest": "Answer this exact question near the top or in an FAQ, use the wording in a heading, and add 1-2 internal links to this page using it."})
        elif best["position"] > 20 and imp >= mi and sum(x["clicks"] for x in rows) == 0:
            ops.append({"type": "unanswered", "page": path_of(best["page"]), "query": q, "impressions": imp,
                        "position": round(best["position"], 1), "score": imp * 0.3,
                        "suggest": "People search this but no page answers it well. Add a focused section or FAQ to the closest page, or plan a new page if it is a distinct topic you really serve."})

    # Declines.
    prev = {r["page"]: r for r in pages_prev}
    for r in pages_now:
        p = prev.get(r["page"])
        if not p or p["impressions"] < mi:
            continue
        di = (r["impressions"] - p["impressions"]) / p["impressions"]
        dc = (r["clicks"] - p["clicks"]) / p["clicks"] if p["clicks"] >= 5 else 0
        if di <= -0.3 or dc <= -0.3:
            ops.append({"type": "decline", "page": path_of(r["page"]), "query": "", "impressions": r["impressions"],
                        "prev_impressions": p["impressions"], "clicks": r["clicks"], "prev_clicks": p["clicks"],
                        "score": abs(min(di, dc)) * p["impressions"],
                        "suggest": "Check index status (URL Inspection), recent edits, and whether a competitor now answers better. Don't rewrite blindly."})

    for o in ops:
        o["id"] = oid(o["type"], o["page"], o.get("query", ""))
        o["weight"] = weight(learn, o["type"])
        o["score"] = round(o["score"] * o["weight"], 2)
        o["cooling"] = o["page"] in cooling
    ops.sort(key=lambda o: (o["cooling"], -o["score"]))
    return ops


def cmd_scan(a):
    cfg = load_config(a.config)
    learn = load_learnings(cfg)
    (cs, ce), (ps, pe) = windows(cfg)
    qp = gsc_rows(cfg, cs, ce, ["query", "page"])
    pages_now = gsc_rows(cfg, cs, ce, ["page"])
    pages_prev = gsc_rows(cfg, ps, pe, ["page"])
    hist = read_jsonl(cfg["_state"] / "history.jsonl")
    since = (date.today() - timedelta(days=int(cfg["cooldown_days"]))).isoformat()
    cooling = {h["page"] for h in hist if h.get("date", "") >= since}
    ops = find_opportunities(qp, pages_now, pages_prev, cfg, learn, cooling)
    # Competitor gaps and search demand from compete.py (if it has run in the last 5 weeks).
    import compete
    for o in compete.loop_opportunities(cfg["_state"]):
        o.update(page="(closest page)", id=oid(o["type"], "", o["query"]), weight=weight(learn, o["type"]), cooling=False)
        o["score"] = round(o["score"] * o["weight"], 2)
        ops.append(o)
    ops.sort(key=lambda o: (o["cooling"], -o["score"]))
    actionable = [o for o in ops if not o["cooling"] and o["type"] != "decline"][: int(cfg["max_changes_per_run"])]
    totals = {"clicks": sum(r["clicks"] for r in pages_now), "impressions": sum(r["impressions"] for r in pages_now)}
    prev_tot = {"clicks": sum(r["clicks"] for r in pages_prev), "impressions": sum(r["impressions"] for r in pages_prev)}
    out = {"date": date.today().isoformat(), "window": [cs, ce], "previous": [ps, pe], "totals": totals, "previous_totals": prev_tot,
           "actionable": actionable, "watch": [o for o in ops if o["type"] == "decline"], "all": ops[:60],
           "weights": {t: weight(learn, t) for t in TYPES}}
    (cfg["_state"] / "latest.json").write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    lines = [f"# SEO loop scan {out['date']}", "",
             f"Search Console {cs} to {ce} (OBSERVED): {totals['clicks']} clicks, {totals['impressions']} impressions "
             f"(previous 28 days: {prev_tot['clicks']} clicks, {prev_tot['impressions']} impressions).", "",
             f"## Do now (max {cfg['max_changes_per_run']}, pages changed in the last {cfg['cooldown_days']} days are cooling down)", ""]
    for i, o in enumerate(actionable, 1):
        if o["type"] in ("competitor_gap", "trend"):
            lines.append(f"{i}. **{o['type']}** \"{o['query']}\". {o['suggest']} (id {o['id']}, weight {o['weight']})")
            continue
        lines.append(f"{i}. **{o['type']}** `{o['page']}`" + (f" for \"{o['query']}\"" if o.get("query") else "") +
                     f": {o.get('impressions', 0)} impressions, position {o.get('position', '?')}" +
                     (f", CTR {o['ctr']:.1%} vs ~{o['expected_ctr']:.0%} expected" if o["type"] == "ctr_gap" else "") +
                     f". {o['suggest']} (id {o['id']}, weight {o['weight']})")
    if not actionable:
        lines.append("Nothing worth changing this week. Stop here.")
    if out["watch"]:
        lines += ["", "## Watch (investigate, don't rewrite)", ""] + [f"- `{o['page']}`: impressions {o['prev_impressions']} -> {o['impressions']}, clicks {o['prev_clicks']} -> {o['clicks']}" for o in out["watch"]]
    lines += ["", "Weights learned from past changes (1.0 = no evidence yet): " + ", ".join(f"{k} {v}" for k, v in out["weights"].items())]
    (cfg["_state"] / "latest.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    print(f"\nACTIONABLE: {len(actionable)}")


# ---------------------------------------------------------------- record and evaluate

def page_metrics(cfg: dict, page_path: str, start: str, end: str, query: str | None = None) -> dict:
    url = cfg["site"].rstrip("/") + page_path
    rows = gsc_rows(cfg, start, end, ["page", "query"] if query else ["page"])
    rows = [r for r in rows if r["page"].rstrip("/") == url.rstrip("/") and (not query or r.get("query") == query)]
    clicks = sum(r["clicks"] for r in rows)
    imp = sum(r["impressions"] for r in rows)
    pos = round(sum(r["position"] * r["impressions"] for r in rows) / imp, 2) if imp else None
    return {"clicks": clicks, "impressions": imp, "ctr": round(clicks / imp, 4) if imp else 0.0, "position": pos}


def cmd_record(a):
    cfg = load_config(a.config)
    a.page = clean_page(a.page)
    (cs, ce), _ = windows(cfg)
    entry = {"id": oid(a.type, a.page, a.query or "") + "-" + date.today().strftime("%Y%m%d"), "date": date.today().isoformat(),
             "page": a.page, "type": a.type, "opportunity": a.opportunity, "query": a.query, "note": a.note,
             "before": page_metrics(cfg, a.page, cs, ce), "before_query": page_metrics(cfg, a.page, cs, ce, a.query) if a.query else None,
             "outcome": None}
    hist = read_jsonl(cfg["_state"] / "history.jsonl")
    hist.append(entry)
    write_jsonl(cfg["_state"] / "history.jsonl", hist)
    print(f"Recorded {entry['id']}: {a.type} on {a.page}. Before (28 days): {entry['before']}")


def judge(before: dict, after: dict) -> str:
    """win / loss / flat, with a noise floor so tiny numbers don't count as learning."""
    if after["impressions"] < 20 and before["impressions"] < 20:
        return "flat"
    ctr_up = after["ctr"] - before["ctr"]
    clicks_ratio = (after["clicks"] + 1) / (before["clicks"] + 1)
    pos_gain = (before["position"] or 99) - (after["position"] or 99)
    if clicks_ratio >= 1.25 or ctr_up >= 0.01 or pos_gain >= 2:
        return "win"
    if clicks_ratio <= 0.75 or ctr_up <= -0.01 or pos_gain <= -3:
        return "loss"
    return "flat"


def cmd_evaluate(a):
    cfg = load_config(a.config)
    hist = read_jsonl(cfg["_state"] / "history.jsonl")
    learn = load_learnings(cfg)
    wait = int(cfg["evaluate_after_days"])
    n = 0
    for h in hist:
        if h.get("outcome"):
            continue
        changed = date.fromisoformat(h["date"])
        end = changed + timedelta(days=wait + 3)
        if end > date.today() - timedelta(days=3):
            continue
        start = (changed + timedelta(days=4)).isoformat()
        after = page_metrics(cfg, h["page"], start, (changed + timedelta(days=wait + 3)).isoformat())
        verdict = judge(h["before"], after)
        h["after"], h["outcome"], h["evaluated"] = after, verdict, date.today().isoformat()
        for key in {h["type"], h.get("opportunity") or h["type"]}:
            learn.setdefault(key, {"wins": 0, "losses": 0, "flat": 0})
            learn[key][{"win": "wins", "loss": "losses", "flat": "flat"}[verdict]] += 1
        n += 1
        print(f"{h['id']}: {h['type']} on {h['page']} -> {verdict.upper()} (before {h['before']}, after {after})")
    write_jsonl(cfg["_state"] / "history.jsonl", hist)
    (cfg["_state"] / "learnings.json").write_text(json.dumps(learn, indent=2), encoding="utf-8")
    pending = sum(1 for h in hist if not h.get("outcome"))
    print(f"Evaluated {n} change(s); {pending} still waiting for {wait} days of data.")


def cmd_status(a):
    cfg = load_config(a.config)
    hist = read_jsonl(cfg["_state"] / "history.jsonl")
    learn = load_learnings(cfg)
    print(f"Changes recorded: {len(hist)} ({sum(1 for h in hist if h.get('outcome') == 'win')} wins, "
          f"{sum(1 for h in hist if h.get('outcome') == 'loss')} losses, {sum(1 for h in hist if not h.get('outcome'))} pending)")
    for k, v in learn.items():
        if v["wins"] or v["losses"] or v["flat"]:
            print(f"  {k}: {v['wins']} wins / {v['losses']} losses / {v['flat']} flat -> weight {weight(learn, k)}")
    latest = cfg["_state"] / "latest.md"
    if latest.exists():
        print("\n" + latest.read_text(encoding="utf-8"))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name, fn in (("scan", cmd_scan), ("evaluate", cmd_evaluate), ("status", cmd_status)):
        p = sub.add_parser(name)
        p.add_argument("--config", required=True)
        p.set_defaults(fn=fn)
    r = sub.add_parser("record")
    r.add_argument("--config", required=True)
    r.add_argument("--page", required=True, help="path, e.g. /guides/cost")
    r.add_argument("--type", required=True, help="title | meta_description | faq | answer_paragraph | internal_links | section | new_page")
    r.add_argument("--opportunity", default=None, help="the opportunity type it answered (ctr_gap, striking, ...)")
    r.add_argument("--query", default=None)
    r.add_argument("--note", default="")
    r.set_defaults(fn=cmd_record)
    a = ap.parse_args()
    if not os.environ.get("GSC_SERVICE_ACCOUNT_FILE") and not os.environ.get("GSC_OAUTH_CLIENT_FILE"):
        sys.exit("Search Console isn't connected. Run: python scripts/setup/connect.py status")
    a.fn(a)


if __name__ == "__main__":
    main()
