#!/usr/bin/env python3
"""Competitor and search-demand intelligence for the SEO loop. Free and deterministic (no AI calls, no paid APIs needed).

  compete.py find   --config seo-loop.json    the searches to run to find your top competitors (service x area), plus
                                              what people type into Google for them; save winners with `add`
  compete.py add    --config seo-loop.json --url https://rival.com [--name "Rival Roofing"] [--source "map pack: roofer york pa"]
  compete.py scan   --config seo-loop.json    rate you and every saved competitor with rate_site.py, then list:
                                              where they beat you (check by check), topics/pages they have and you don't,
                                              and customer questions they answer that you don't
  compete.py trends --config seo-loop.json    search demand around your services and areas: Google autocomplete phrasing,
                                              Bing search volumes and trend (if BING_WEBMASTER_API_KEY is set), and your
                                              own rising Search Console queries (if connected)

Config (in seo-loop.json, next to the loop's own settings):
  "market": {"services": ["roof replacement", "roof repair"], "areas": ["York PA", "Hanover PA"], "niche": "residential roofing"},
  "competitors": ["https://rival-one.com", "https://rival-two.com"]      (optional; `add` saves to state_dir too)

Writes to state_dir: competitors.json / competitors.md, trends.json / trends.md. seo_loop.py scan reads both and adds
`competitor_gap` and `trend` opportunities, ranked by what this site has learned works.

Evidence: competitor ratings and page inventories are OBSERVED from public pages; autocomplete phrasing is INFERRED demand
(no volumes); Bing volumes and Search Console numbers are OBSERVED. Learn from competitors' structure, coverage and
signals. Never copy their text, images, reviews or claims (RULES.md).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlparse

S = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(S))
import common  # noqa: E402

STOP = set("a an the and or of for to in on at by with is are be can do does how what why when where which who my i me you your "
           "near best vs our we us about contact home page services service get free from this that it its more new".split())
QUESTION = re.compile(r"^(how|what|why|when|where|which|who|can|do|does|is|are|should|will)\b|\?$", re.I)
MODIFIERS = ["", "cost", "near me", "best", "how much", "how long", "vs"]


def load(path: str) -> dict:
    p = Path(path)
    cfg = json.loads(p.read_text(encoding="utf-8"))
    cfg["_dir"] = p.resolve().parent
    state = Path(cfg.get("state_dir", "seo-loop"))
    cfg["_state"] = state if state.is_absolute() else cfg["_dir"] / state
    cfg["_state"].mkdir(parents=True, exist_ok=True)
    if not cfg.get("site"):
        sys.exit("Config needs 'site'.")
    return cfg


def market(cfg: dict) -> dict:
    m = cfg.get("market") or {}
    return {"services": [s for s in m.get("services", []) if s], "areas": [a for a in m.get("areas", []) if a], "niche": m.get("niche", "")}


def saved(cfg: dict) -> list[dict]:
    p = cfg["_state"] / "competitor-list.json"
    rows = json.loads(p.read_text(encoding="utf-8")) if p.exists() else []
    known = {r["url"] for r in rows}
    rows += [{"url": common.normalize_url(u), "name": "", "source": "seo-loop.json"} for u in cfg.get("competitors", [])
             if common.normalize_url(u) not in known]
    return rows


def words(s: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9]+", (s or "").lower()) if w not in STOP and len(w) > 2 and not w.isdigit()]


def suggest(q: str) -> list[str]:
    """Google autocomplete for a phrase (what people actually type). Unofficial endpoint; empty list on any failure."""
    url = "https://suggestqueries.google.com/complete/search?" + urllib.parse.urlencode({"client": "firefox", "hl": "en", "q": q})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": common.USER_AGENT}), timeout=10) as r:
            data = json.loads(r.read().decode("utf-8", "replace"))
        return [s for s in data[1] if isinstance(s, str)]
    except Exception:
        return []


# ---------------------------------------------------------------- find / add

def seeds(m: dict) -> list[str]:
    out = [f"{s} {a}" for s in m["services"] for a in (m["areas"] or [""])]
    if m["niche"]:
        out += [f"{m['niche']} {a}".strip() for a in (m["areas"] or [""])]
    return list(dict.fromkeys(x.strip() for x in out if x.strip()))


def cmd_find(a):
    cfg = load(a.config)
    m = market(cfg)
    if not m["services"]:
        sys.exit('Add "market": {"services": [...], "areas": [...], "niche": "..."} to the config first.')
    qs = seeds(m)[:12]
    lines = [f"# Find the top competitors for {cfg['site']}", "",
             "Run each search from the service area (or with the area in the query). For each, note the top 3 map-pack businesses and",
             "the top 5 organic results that are real businesses (skip directories like Yelp, Angi, Houzz, Thumbtack, BBB; note them",
             "separately as listing opportunities). Save every business that shows up 2+ times:", "",
             "    python scripts/loop/compete.py add --config seo-loop.json --url <their site> --name \"<name>\" --source \"<search>\"", "",
             "## Searches to run", ""]
    lines += [f"- {q}" for q in qs]
    lines += ["", "## What people type (Google autocomplete, INFERRED demand, no volumes)", ""]
    # Autocomplete rarely has anything for "service + town", so ask for the bare services too.
    for q in list(dict.fromkeys(m["services"] + ([m["niche"]] if m["niche"] else []) + qs))[:8]:
        sug = [s for s in suggest(q) if s.lower() != q.lower()][:6]
        if sug:
            lines.append(f"- **{q}**: " + "; ".join(sug))
        time.sleep(0.3)
    have = saved(cfg)
    lines += ["", f"Saved competitors: {len(have)}" + ("".join(f"\n- {c['url']} {c.get('name', '')}" for c in have) if have else " (none yet)")]
    print("\n".join(lines))


def cmd_add(a):
    cfg = load(a.config)
    p = cfg["_state"] / "competitor-list.json"
    rows = json.loads(p.read_text(encoding="utf-8")) if p.exists() else []
    url = common.normalize_url(a.url if a.url.startswith("http") else "https://" + a.url)
    url = common.normalize_url(urlparse(url)._replace(path="/", query="").geturl())
    if common.same_site(url, cfg["site"]):
        sys.exit("That's your own site.")
    rows = [r for r in rows if not common.same_site(r["url"], url)] + [{"url": url, "name": a.name or "", "source": a.source or "", "added": date.today().isoformat()}]
    p.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Saved {url}. Competitors: {len(rows)}")


# ---------------------------------------------------------------- scan

def rate(url: str, out: Path, max_pages: int, delay: float) -> dict | None:
    out.mkdir(parents=True, exist_ok=True)
    r = subprocess.run([sys.executable, str(S / "rate_site.py"), url, "--no-psi", "--max-pages", str(max_pages), "--delay", str(delay), "--out", str(out)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0 or not (out / "rating.json").exists():
        print(f"  could not rate {url}: {(r.stderr or r.stdout).strip()[-200:]}", file=sys.stderr)
        return None
    rating = common.read_json(out / "rating.json")
    crawl = common.read_json(out / "crawl.json")
    pages = [p for p in crawl["pages"] if p.get("status") == 200 and "title" in p and not p.get("redirect_chain")]
    return {"rating": rating, "pages": pages}


def topic_of(p: dict) -> dict:
    path = urlparse(p["url"]).path
    slug = [w for w in words(path.replace("-", " ").replace("/", " "))]
    head = " ".join([p.get("title", "")] + p.get("h1", []))
    return {"path": path or "/", "title": p.get("title", ""), "terms": slug or words(" ".join(p.get("h1", [])))[:4], "head": head}


def covered(terms: list[str], corpus: list[set[str]]) -> bool:
    if not terms:
        return True
    need = max(1, round(0.75 * len(terms)))
    return any(len(set(terms) & c) >= need for c in corpus)


def questions(pages: list[dict]) -> list[str]:
    out = []
    for p in pages:
        for h in p.get("headings", []):
            lvl, _, text = h.partition(": ")
            if lvl in ("h2", "h3", "h4") and QUESTION.search(text.strip()):
                out.append(text.strip())
    return list(dict.fromkeys(out))


def cmd_scan(a):
    cfg = load(a.config)
    comps = saved(cfg)[: a.max_competitors]
    if not comps:
        sys.exit("No competitors saved yet. Run `compete.py find`, search, then `compete.py add --url ...`.")
    work = cfg["_state"] / "competitors"
    print(f"Rating {cfg['site']} and {len(comps)} competitor(s) (polite: {a.max_pages} pages each, {a.delay}s apart)...", file=sys.stderr)
    me = rate(cfg["site"], work / "_you", a.max_pages, a.delay)
    if not me:
        sys.exit("Could not rate your own site.")
    my_checks = {c["check"]: c for c in me["rating"]["checks"]}
    my_corpus = [set(words(urlparse(p["url"]).path.replace("-", " ") + " " + p.get("title", "") + " " + " ".join(p.get("h1", []))
                           + " " + " ".join(h.partition(": ")[2] for h in p.get("headings", [])))) for p in me["pages"]]
    my_qs = [set(words(q)) for q in questions(me["pages"])]
    my_types = {t for p in me["pages"] for t in p.get("jsonld_types", [])}

    rivals, topic_votes, q_votes = [], {}, {}
    for c in comps:
        host = urlparse(c["url"]).netloc
        print(f"  {host}", file=sys.stderr)
        r = rate(c["url"], work / re.sub(r"[^a-z0-9.-]", "_", host.lower()), a.max_pages, a.delay)
        if not r:
            rivals.append({**c, "error": "could not be rated"})
            continue
        edges = []
        for ch in r["rating"]["checks"]:
            mine = my_checks.get(ch["check"])
            if mine and ch["ratio"] is not None and mine["ratio"] is not None and ch["ratio"] - mine["ratio"] >= 0.2:
                edges.append({"check": ch["check"], "category": ch["category"], "them": round(ch["ratio"], 2), "you": round(mine["ratio"], 2),
                              "tip": mine.get("tip", ""), "gain": mine.get("gain", 0)})
        for p in r["pages"]:
            if not p.get("indexable") or urlparse(p["url"]).path in ("", "/"):
                continue
            t = topic_of(p)
            if len(t["terms"]) < 1 or covered(t["terms"], my_corpus):
                continue
            key = " ".join(sorted(set(t["terms"])))
            topic_votes.setdefault(key, {"terms": t["terms"], "examples": []})["examples"].append({"site": host, "path": t["path"], "title": t["title"]})
        for q in questions(r["pages"]):
            qw = set(words(q))
            if len(qw) >= 2 and not any(len(qw & m) >= max(2, round(0.7 * len(qw))) for m in my_qs):
                q_votes.setdefault(" ".join(sorted(qw)), {"question": q, "sites": set()})["sites"].add(host)
        theirs = {t for p in r["pages"] for t in p.get("jsonld_types", [])}
        rivals.append({**c, "host": host, "scores": r["rating"]["scores"], "pages_rated": len(r["pages"]), "edges": edges,
                       "schema_they_use_you_dont": sorted(theirs - my_types)})

    gaps = sorted(({"topic": " ".join(v["terms"]), "competitors": len({e["site"] for e in v["examples"]}), "examples": v["examples"][:4]}
                   for v in topic_votes.values()), key=lambda g: (-g["competitors"], g["topic"]))
    qgaps = sorted(({"question": v["question"], "competitors": len(v["sites"]), "sites": sorted(v["sites"])} for v in q_votes.values()),
                   key=lambda g: (-g["competitors"], g["question"]))
    out = {"date": date.today().isoformat(), "site": cfg["site"], "you": me["rating"]["scores"], "competitors": rivals,
           "topic_gaps": gaps[:40], "question_gaps": qgaps[:40], "evidence": "OBSERVED (public pages, rate_site.py rubric); gaps are INFERRED from page titles, URLs and headings"}
    (cfg["_state"] / "competitors.json").write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")

    s = lambda d: f"{d['overall']} (SEO {d['seo']}, AEO {d['aeo']}, GEO {d['geo']})"
    lines = [f"# Competitor scan {out['date']}", "", f"**You** ({urlparse(cfg['site']).netloc}): {s(out['you'])}", ""]
    for r in rivals:
        if r.get("error"):
            lines.append(f"- {r['url']}: {r['error']}")
            continue
        lines.append(f"- **{r.get('name') or r['host']}** ({r['host']}): {s(r['scores'])}, {r['pages_rated']} pages")
    beat = sorted({(e["check"], e["tip"], e["gain"]) for r in rivals for e in r.get("edges", [])}, key=lambda x: -x[2])
    lines += ["", "## Where competitors beat you (fix these first)", ""] + ([f"- **{c}** (+{g} pts for you): {t}" for c, t, g in beat] or ["- Nowhere by a clear margin."])
    lines += ["", "## Topics they cover that you don't (pages to add or sections to write, only for services you really offer)", ""]
    lines += [f"- **{g['topic']}**: {g['competitors']} competitor(s), e.g. " + "; ".join(f"{e['site']}{e['path']} \"{e['title'][:60]}\"" for e in g["examples"][:2]) for g in gaps[:15]] or ["- None found."]
    lines += ["", "## Customer questions they answer that you don't", ""]
    lines += [f"- {g['question']} ({', '.join(g['sites'])})" for g in qgaps[:15]] or ["- None found."]
    extra = sorted({t for r in rivals for t in r.get("schema_they_use_you_dont", [])})
    if extra:
        lines += ["", f"Schema types they use and you don't: {', '.join(extra)} (add only where it matches visible content)."]
    lines += ["", "Use their structure and coverage as a checklist. Write your own words from your own facts; never copy their text, photos, reviews or claims."]
    (cfg["_state"] / "competitors.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


# ---------------------------------------------------------------- trends

def bing_keyword(q: str, country="us", language="en-US", days=90):
    key = os.environ.get("BING_WEBMASTER_API_KEY")
    if not key:
        return None
    end = date.today()
    params = urllib.parse.urlencode({"q": q, "country": country, "language": language, "startDate": (end - timedelta(days=days)).isoformat(),
                                     "endDate": end.isoformat(), "apikey": key})
    try:
        with urllib.request.urlopen("https://ssl.bing.com/webmaster/api.svc/json/GetKeyword?" + params, timeout=30) as r:
            d = json.loads(r.read().decode("utf-8") or "{}").get("d")
    except Exception:
        return None
    if not d:
        return None
    rows = d if isinstance(d, list) else [d]
    imps = [int(x.get("Impressions") or 0) for x in rows]
    half = len(imps) // 2
    first, last = sum(imps[:half]) or 0, sum(imps[half:]) or 0
    return {"impressions_90d": sum(imps), "trend": None if not first else round((last - first) / first, 2)}


def gsc_rising(cfg: dict) -> list[dict]:
    if not cfg.get("gsc_property") or not (os.environ.get("GSC_SERVICE_ACCOUNT_FILE") or os.environ.get("GSC_OAUTH_CLIENT_FILE")):
        return []
    sys.path.insert(0, str(S / "loop"))
    sys.path.insert(0, str(S / "integrations"))
    import seo_loop
    c = {**seo_loop.DEFAULTS, **cfg}
    (cs, ce), (ps, pe) = seo_loop.windows(c)
    now = {r["query"]: r for r in seo_loop.gsc_rows(c, cs, ce, ["query"])}
    prev = {r["query"]: r for r in seo_loop.gsc_rows(c, ps, pe, ["query"])}
    out = []
    for q, r in now.items():
        p = prev.get(q, {"impressions": 0})
        if r["impressions"] >= 10 and r["impressions"] >= 1.5 * max(1, p["impressions"]):
            out.append({"query": q, "impressions": r["impressions"], "prev_impressions": p["impressions"], "position": round(r["position"], 1)})
    return sorted(out, key=lambda x: -x["impressions"])[:30]


def cmd_trends(a):
    cfg = load(a.config)
    m = market(cfg)
    if not m["services"]:
        sys.exit('Add "market": {"services": [...], "areas": [...]} to the config first.')
    seed = list(dict.fromkeys(m["services"] + seeds(m)))[: a.max_seeds]
    phrases: dict[str, dict] = {}
    for q in seed:
        for mod in MODIFIERS:
            base = f"{mod} {q}".strip() if mod in ("best", "how much", "how long") else f"{q} {mod}".strip()
            for s in suggest(base) if not a.offline else []:
                phrases.setdefault(s.lower(), {"phrase": s, "seed": q, "source": "google autocomplete"})
            time.sleep(0.2 if not a.offline else 0)
    for q in seed:
        phrases.setdefault(q.lower(), {"phrase": q, "seed": q, "source": "seed"})
    rows = list(phrases.values())
    bing = 0
    for r in rows[: a.max_bing]:
        k = bing_keyword(r["phrase"]) if not a.offline else None
        if k:
            r.update(k)
            bing += 1
    rising = [] if a.offline else gsc_rising(cfg)

    # Which phrases the site already answers (titles/headings of the last scan of your own site, if present).
    mine = cfg["_state"] / "competitors" / "_you" / "crawl.json"
    corpus = []
    if mine.exists():
        for p in common.read_json(mine)["pages"]:
            if p.get("status") == 200:
                corpus.append(set(words(p.get("title", "") + " " + " ".join(p.get("h1", [])) + " " + " ".join(h.partition(": ")[2] for h in p.get("headings", [])))))
    # Place words ("york", "pa") match almost every local page, so judge coverage on the service words only.
    place = {w for ar in m["areas"] for w in words(ar)} | {"near", "me"}
    for r in rows:
        w = [x for x in words(r["phrase"]) if x not in place]
        r["answered"] = None if not corpus else covered(w, corpus)
        r["question"] = bool(QUESTION.search(r["phrase"]))
    rows.sort(key=lambda r: (-(r.get("impressions_90d") or 0), r["answered"] is True, -int(r["question"]), r["phrase"]))
    out = {"date": date.today().isoformat(), "site": cfg["site"], "phrases": rows[:200], "rising_queries": rising,
           "bing_volumes": bing, "evidence": "autocomplete = INFERRED demand (no volume); Bing impressions and Search Console = OBSERVED"}
    (cfg["_state"] / "trends.json").write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    lines = [f"# Search demand {out['date']}", "",
             f"{len(rows)} phrases from {len(seed)} service/area seeds. Bing volumes: {bing or 'not connected (set BING_WEBMASTER_API_KEY)'}. "
             f"Rising Search Console queries: {len(rising) if rising else 'none or not connected'}.", "",
             "## Not answered on your site yet (questions first)", ""]
    todo = [r for r in rows if r["answered"] is False][:20]
    lines += [f"- {r['phrase']}" + (f" ({r['impressions_90d']} Bing impressions/90d" + (f", trend {r['trend']:+.0%}" if r.get("trend") is not None else "") + ")" if r.get("impressions_90d") else "")
              for r in todo] or (["- Run `compete.py scan` first so this can compare against your pages."] if not corpus else ["- Everything found is already covered."])
    if rising:
        lines += ["", "## Rising in your Search Console (last 28 days vs the 28 before)", ""]
        lines += [f"- {r['query']}: {r['prev_impressions']} -> {r['impressions']} impressions, position {r['position']}" for r in rising[:15]]
    (cfg["_state"] / "trends.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


# ---------------------------------------------------------------- loop hook

def loop_opportunities(state: Path, max_age_days: int = 35) -> list[dict]:
    """Opportunities seo_loop.py merges into its scan: competitor gaps and unanswered demand. Stale files are ignored."""
    ops, cutoff = [], (date.today() - timedelta(days=max_age_days)).isoformat()
    cp, tp = state / "competitors.json", state / "trends.json"
    if cp.exists():
        c = json.loads(cp.read_text(encoding="utf-8"))
        if c.get("date", "") >= cutoff:
            for g in c.get("question_gaps", [])[:10]:
                ops.append({"type": "competitor_gap", "page": "/", "query": g["question"], "impressions": 0, "score": 15 * g["competitors"],
                            "suggest": f"{g['competitors']} competitor(s) answer \"{g['question']}\". Answer it on your closest service page "
                                       "(heading + 40-60 word direct answer), in your own words and only with facts you can back."})
            for g in c.get("topic_gaps", [])[:10]:
                ex = g["examples"][0]
                ops.append({"type": "competitor_gap", "page": "/", "query": g["topic"], "impressions": 0, "score": 20 * g["competitors"],
                            "suggest": f"{g['competitors']} competitor(s) have a page on '{g['topic']}' (e.g. {ex['site']}{ex['path']}). "
                                       "If you really offer this, add a section to the closest page, or propose a new page (needs the owner's yes)."})
    if tp.exists():
        t = json.loads(tp.read_text(encoding="utf-8"))
        if t.get("date", "") >= cutoff:
            for r in [r for r in t.get("phrases", []) if r.get("answered") is False][:10]:
                vol = r.get("impressions_90d") or 0
                ops.append({"type": "trend", "page": "/", "query": r["phrase"], "impressions": vol, "score": 10 + vol / 30 + (5 if r.get("question") else 0),
                            "suggest": "People search this and no page answers it. Add a focused section or FAQ on the closest page; use the phrase in a heading."})
    return ops


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("find"); f.add_argument("--config", required=True); f.set_defaults(fn=cmd_find)
    d = sub.add_parser("add"); d.add_argument("--config", required=True); d.add_argument("--url", required=True)
    d.add_argument("--name"); d.add_argument("--source"); d.set_defaults(fn=cmd_add)
    s = sub.add_parser("scan"); s.add_argument("--config", required=True); s.add_argument("--max-pages", type=int, default=25)
    s.add_argument("--max-competitors", type=int, default=5); s.add_argument("--delay", type=float, default=0.5); s.set_defaults(fn=cmd_scan)
    t = sub.add_parser("trends"); t.add_argument("--config", required=True); t.add_argument("--max-seeds", type=int, default=8)
    t.add_argument("--max-bing", type=int, default=40); t.add_argument("--offline", action="store_true", help="no network lookups (tests)")
    t.set_defaults(fn=cmd_trends)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
