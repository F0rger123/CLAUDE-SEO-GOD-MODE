#!/usr/bin/env python3
"""AI-search answer check: crawler access, snippet eligibility, and how clearly each page answers its queries.

Implements the automated parts of skills/ai-search-answer-workflow. Every finding carries an evidence tag:
OBSERVED (measured now), INFERRED (heuristic built on observed data), RECOMMENDED (proposed action),
UNKNOWN (data not available). See RULES.md.

Inputs:
  --urls / --crawl     pages to check
  --queries            Search Console CSV with columns query,page[,clicks,impressions,position]
                       (gsc.py performance --dimensions query,page). Without it, query grading is UNKNOWN.
  --client             client slug; business name, services, and areas come from state.json profile

Usage:
  answer_check.py --site https://example.com --urls https://example.com/ https://example.com/roofing/
  answer_check.py --site https://example.com --crawl crawl.json --queries gsc-query-page.csv --client acme --out ./data/ai-answer
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402

# Search/retrieval crawlers the workflow requires to be allowed. Training bots are a client policy choice.
REQUIRED_BOTS = ["Googlebot", "Bingbot", "OAI-SearchBot", "PerplexityBot", "Claude-SearchBot"]
POLICY_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended", "CCBot"]
STOP = set("a an the and or of for to in on at by with is are be can do does how what why when where which who "
           "my i me you your near best vs".split())
QUESTION_START = re.compile(r"^(how|what|why|when|where|which|who|can|do|does|is|are|should|will|much)\b", re.I)
ANSWER_MIN, ANSWER_MAX = 40, 60   # Agency Zero house heuristic, NOT a Google requirement


class BlockParser(HTMLParser):
    """Ordered list of visible blocks: (kind, text) where kind is h1..h6, p, li."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks, self._cur, self._skip, self.nosnippet_spans = [], None, 0, 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "data-nosnippet" in a:
            self.nosnippet_spans += 1
        if tag in ("script", "style", "noscript", "template", "svg"):
            self._skip += 1
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "dt", "dd", "summary"):
            self._cur = [tag, []]

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "template", "svg") and self._skip:
            self._skip -= 1
        elif self._cur and tag == self._cur[0]:
            text = " ".join(" ".join(self._cur[1]).split())
            if text:
                self.blocks.append((self._cur[0], text))
            self._cur = None

    def handle_data(self, data):
        if self._cur and not self._skip:
            self._cur[1].append(data)


def words(s: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", s.lower())


def finding(tag: str, area: str, text: str, url: str = "") -> dict:
    return {"tag": tag, "area": area, "finding": text, "url": url}


def load_queries(path: str | None) -> dict[str, list[dict]]:
    if not path:
        return {}
    out: dict[str, list[dict]] = {}
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            page = common.normalize_url(r.get("page", ""))
            out.setdefault(page, []).append({"query": r.get("query", ""), "clicks": float(r.get("clicks") or 0),
                                             "impressions": float(r.get("impressions") or 0),
                                             "position": float(r.get("position") or 0)})
    for v in out.values():
        v.sort(key=lambda q: -q["impressions"])
    return out


def grade_query(q: str, title: str, blocks: list[tuple[str, str]]) -> tuple[str, float]:
    """Share of meaningful query words found in title, headings, and the first paragraph."""
    terms = [w for w in words(q) if w not in STOP]
    if not terms:
        return "UNKNOWN", 0.0
    lead = next((t for k, t in blocks if k == "p" and len(t.split()) >= 8), "")
    zone = set(words(title + " " + " ".join(t for k, t in blocks if k.startswith("h")) + " " + lead))
    cov = sum(1 for t in terms if t in zone) / len(terms)
    return ("clearly addressed" if cov >= 0.8 else "partly addressed" if cov >= 0.5 else "not clearly addressed"), cov


def check_page(url: str, profile: dict, queries: list[dict]) -> tuple[dict, list[dict]]:
    r = common.fetch(url)
    fs: list[dict] = []
    row = {"url": url, "status": r["status"]}
    if r["status"] != 200:
        fs.append(finding("OBSERVED", "indexability", f"HTTP {r['status'] or r['error']} — page cannot be shown in Search", url))
        return row, fs
    meta = common.parse_html(r["body"])
    bp = BlockParser()
    try:
        bp.feed(r["body"])
    except Exception:
        pass
    blocks = bp.blocks
    robots = (meta.robots_meta + "," + r["headers"].get("x-robots-tag", "")).lower()

    # Eligibility: indexed + snippet-eligible (Google's stated requirement).
    if "noindex" in robots:
        fs.append(finding("OBSERVED", "eligibility", "noindex present — not eligible for Search or AI features", url))
    if "nosnippet" in robots or re.search(r"max-snippet\s*:\s*0\b", robots):
        fs.append(finding("OBSERVED", "eligibility", "nosnippet / max-snippet:0 — page cannot appear with a snippet, so not eligible for AI features", url))
    if bp.nosnippet_spans:
        fs.append(finding("OBSERVED", "eligibility", f"{bp.nosnippet_spans} data-nosnippet element(s) — that text is excluded from snippets/AI features; confirm intended", url))
    if meta.canonical and common.normalize_url(meta.canonical, url) != common.normalize_url(r["final_url"]):
        fs.append(finding("OBSERVED", "eligibility", f"canonical points elsewhere ({meta.canonical})", url))

    # Who / what / where (local business clarity).
    text = meta.text
    intro = " ".join(text.split()[:200]).lower()
    head = (meta.title + " " + " ".join(h[1] for h in meta.headings if h[0] == 1)).lower()
    name = (profile.get("business_name") or "").lower()
    services = [s.lower() for s in profile.get("services", [])]
    places = {p.split(",")[0].strip().lower() for p in profile.get("service_area", [])} | \
             {(l.get("city") or "").lower() for l in profile.get("locations", []) if isinstance(l, dict)}
    places.discard("")
    if not profile:
        fs.append(finding("UNKNOWN", "who-what-where", "no client profile given; cannot test business name/service/location", url))
    else:
        row["names_business"] = bool(name) and name in (head + " " + intro)
        row["names_service"] = any(s in (head + " " + intro) or all(w in (head + " " + intro) for w in words(s) if w not in STOP)
                                   for s in services) if services else None
        row["names_location"] = any(p in (head + " " + intro) for p in places) if places else None
        for key, label in (("names_business", "business name"), ("names_service", "a listed service"),
                           ("names_location", "a served location")):
            if row[key] is None:
                fs.append(finding("UNKNOWN", "who-what-where", f"cannot test {label}: not in client profile", url))
            elif not row[key]:
                fs.append(finding("OBSERVED", "who-what-where", f"{label} not stated in title/H1/first 200 words", url))

    # Direct answer near the top.
    lead = next((t for k, t in blocks if k == "p" and len(t.split()) >= 8), "")
    row["lead_words"] = len(lead.split())
    if not lead:
        fs.append(finding("OBSERVED", "direct-answer", "no opening paragraph found in raw HTML (content may be JS-rendered or image-only)", url))
    elif not (ANSWER_MIN - 15 <= row["lead_words"] <= ANSWER_MAX + 30):
        fs.append(finding("INFERRED", "direct-answer", f"opening paragraph is {row['lead_words']} words; house heuristic is a direct answer of ~{ANSWER_MIN}-{ANSWER_MAX} words (not a Google rule)", url))

    # Question headings and their answers.
    qh = [(i, t) for i, (k, t) in enumerate(blocks) if k in ("h2", "h3", "h4", "summary", "dt") and (t.endswith("?") or QUESTION_START.match(t))]
    row["question_headings"] = len(qh)
    long_answers = []
    for i, t in qh:
        nxt = next((bt for bk, bt in blocks[i + 1:i + 4] if bk in ("p", "dd", "li")), "")
        if nxt and len(nxt.split()) > ANSWER_MAX + 40:
            long_answers.append(t[:60])
    if long_answers:
        fs.append(finding("INFERRED", "direct-answer", f"{len(long_answers)} question heading(s) open with a long paragraph before answering, e.g. '{long_answers[0]}'", url))

    # Stats with sources.
    stats = re.findall(r"\b\d[\d,.]*\s?(%|percent|years?|homes?|projects?|customers?)", text, re.I)
    ext = [l for l in meta.links if l["href"].startswith("http") and not common.same_site(l["href"], url)]
    row["stat_mentions"], row["external_links"] = len(stats), len(ext)
    if stats and not ext:
        fs.append(finding("INFERRED", "evidence", f"{len(stats)} numeric claim(s) and no outbound source links — confirm each number is real and cite where it comes from", url))

    # FAQ schema must match visible text.
    items, errors = common.parse_jsonld(meta.jsonld)
    for e in errors:
        fs.append(finding("OBSERVED", "schema", e, url))
    visible = " ".join(text.lower().split())
    for it in items:
        if "FAQPage" in common.schema_types(it):
            for q in it.get("mainEntity", []) if isinstance(it.get("mainEntity"), list) else []:
                qn = " ".join(str(q.get("name", "")).lower().split())
                if qn and qn not in visible:
                    fs.append(finding("OBSERVED", "schema", f"FAQPage question not in visible text: '{qn[:70]}'", url))
    row["schema_types"] = sorted({t for it in items for t in common.schema_types(it) if t})

    # Query grading.
    if queries:
        graded = []
        for q in queries[:10]:
            grade, cov = grade_query(q["query"], meta.title, blocks)
            graded.append({**q, "grade": grade, "coverage": round(cov, 2)})
            if grade == "not clearly addressed":
                fs.append(finding("INFERRED", "query-answer", f"'{q['query']}' ({int(q['impressions'])} impr, pos {q['position']:.1f}) not clearly addressed in title/headings/opening", url))
        row["queries"] = graded
    else:
        row["queries"] = None
    return row, fs


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site", required=True)
    ap.add_argument("--urls", nargs="*", default=[])
    ap.add_argument("--crawl"); ap.add_argument("--max-pages", type=int, default=40)
    ap.add_argument("--queries"); ap.add_argument("--client"); ap.add_argument("--out", default=".")
    a = ap.parse_args()

    site = common.normalize_url(a.site)
    profile = common.read_json(common.client_dir(a.client) / "state.json")["profile"] if a.client else {}
    urls = [common.normalize_url(u) for u in a.urls]
    if a.crawl:
        urls += [p["url"] for p in common.read_json(Path(a.crawl))["pages"] if p.get("indexable")]
    queries = load_queries(a.queries)
    if not urls:
        urls = list(queries)[: a.max_pages] or [site]
    urls = list(dict.fromkeys(urls))[: a.max_pages]

    findings: list[dict] = []
    # Site level: crawler allowlist.
    rr = common.fetch(common.normalize_url("/robots.txt", site))
    rp = common.Robots(rr["body"]) if rr["status"] == 200 else common.Robots.fetch(site)
    access = {}
    for bot in REQUIRED_BOTS + POLICY_BOTS:
        access[bot] = all(rp.can_fetch(bot, u) for u in [site] + urls[:5])
    for bot in REQUIRED_BOTS:
        findings.append(finding("OBSERVED", "crawler-access", f"{bot}: {'allowed' if access[bot] else 'BLOCKED'} by robots.txt (HTTP {rr['status']})"))
    for bot in POLICY_BOTS:
        findings.append(finding("OBSERVED", "crawler-access", f"{bot} (training/other, client policy choice): {'allowed' if access[bot] else 'blocked'}"))
    findings.append(finding("UNKNOWN", "crawler-access", "CDN/WAF bot rules (e.g. Cloudflare AI-bot blocking) cannot be seen from robots.txt; check the host dashboard"))
    lt = common.fetch(common.normalize_url("/llms.txt", site))
    findings.append(finding("OBSERVED", "llms-txt", f"/llms.txt HTTP {lt['status']} — optional; Google Search does not use it"))

    rows = []
    for u in urls:
        row, fs = check_page(u, profile, queries.get(u, []))
        rows.append(row)
        findings.extend(fs)
        print(f"checked {u}", file=sys.stderr)

    if not queries:
        findings.append(finding("UNKNOWN", "query-answer", "no Search Console query export supplied; cannot grade pages against real queries"))
    findings += [
        finding("UNKNOWN", "eligibility", "whether the site is included in Search Console's 'Search generative AI features' setting (check in Search Console)"),
        finding("UNKNOWN", "measurement", "Generative AI performance report data (Search Console UI) not read by this script"),
    ]
    if profile and not any(isinstance(l, dict) and l.get("gbp_url") for l in profile.get("locations", [])):
        findings.append(finding("UNKNOWN", "local", "Google Business Profile URL not in profile; cannot confirm GBP info is current"))

    out = Path(a.out)
    common.write_json(out / "answer-check.json", {"site": site, "date": common.today(), "crawler_access": access,
                                                 "pages": rows, "findings": findings})
    order = {"OBSERVED": 0, "INFERRED": 1, "RECOMMENDED": 2, "UNKNOWN": 3}
    findings.sort(key=lambda f: (order[f["tag"]], f["area"]))
    md = [f"# AI-search answer check — {site}", f"Date: {common.today()} · pages checked: {len(rows)} · queries: "
          f"{'from ' + a.queries if queries else 'UNKNOWN (no GSC export)'}", "",
          "## Findings", common.md_table(findings, ["tag", "area", "finding", "url"]),
          "## Pages", common.md_table([{**r, "queries": len(r["queries"]) if r.get("queries") else "UNKNOWN"} for r in rows],
                                      ["url", "status", "lead_words", "question_headings", "names_business", "names_service",
                                       "names_location", "stat_mentions", "external_links", "schema_types", "queries"])]
    (out / "answer-check.md").write_text("\n".join(md), encoding="utf-8")
    counts = {t: sum(1 for f in findings if f["tag"] == t) for t in order}
    print(f"Findings: {counts}\nWrote {out / 'answer-check.md'}")


if __name__ == "__main__":
    main()
