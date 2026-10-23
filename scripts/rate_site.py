#!/usr/bin/env python3
"""Rate any website: SEO, GEO, and AEO scores out of 100 with prioritized tips.

One command, no credentials needed. Crawls a sample of the site politely, runs the deterministic checks in
this repo, and scores them with a fixed, published rubric (references/rating-rubric.md). Every point comes
from something measured on the live site (OBSERVED) or a stated heuristic (INFERRED). Things a public crawl
cannot see (rankings, traffic, backlinks, Search Console data) are listed as UNKNOWN, never guessed.

Usage:
  rate_site.py https://example.com
  rate_site.py example.com --max-pages 40 --out ./rating-example
  rate_site.py https://example.com --no-psi          (skip PageSpeed; performance becomes UNKNOWN)

Writes <out>/scorecard.md (human report) and <out>/rating.json (machine-readable).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

S = Path(__file__).resolve().parent
SEARCH_BOTS = {  # robots token -> user-agent string used for the live WAF probe
    "Googlebot": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Bingbot": "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "OAI-SearchBot": "Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
    "PerplexityBot": "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
    "Claude-SearchBot": "Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +https://www.anthropic.com)",
}
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
ENTITY_TYPES = {"Organization", "LocalBusiness", "Corporation", "ProfessionalService", "Store", "Restaurant",
                "MedicalBusiness", "LegalService", "HomeAndConstructionBusiness", "GeneralContractor", "Plumber",
                "Electrician", "RoofingContractor", "HVACBusiness", "AutoRepair", "Dentist", "Person", "NGO",
                "EducationalOrganization", "SoftwareApplication", "OnlineStore", "OnlineBusiness"}


def run(rel: str, *args: str) -> str:
    r = subprocess.run([sys.executable, str(S / rel), *args], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return r.stdout


class Card:
    """Collects scored checks: (category, name, points earned, max points, evidence tag, detail, tip)."""

    def __init__(self):
        self.checks: list[dict] = []

    def add(self, cat, name, ratio, weight, detail, tip="", tag="OBSERVED", impact=None):
        ratio = None if ratio is None else max(0.0, min(1.0, ratio))
        self.checks.append({"category": cat, "check": name, "ratio": ratio, "weight": weight,
                            "points": None if ratio is None else round(ratio * weight, 2),
                            "tag": tag if ratio is not None else "UNKNOWN", "detail": " ".join(str(detail).split()), "tip": tip,
                            "impact": impact})

    def score(self, cats) -> int | None:
        scored = [c for c in self.checks if c["category"] in cats and c["ratio"] is not None]
        total = sum(c["weight"] for c in scored)
        return round(100 * sum(c["points"] for c in scored) / total) if total else None


def share(pages, pred):
    return (sum(1 for p in pages if pred(p)) / len(pages)) if pages else None


def fails(pages, pred, key="url", n=3) -> str:
    """Short list of pages failing a check, for actionable tips."""
    bad = [p[key] for p in pages if not pred(p)]
    if not bad:
        return ""
    paths = [urlparse(u).path or "/" for u in bad[:n]]
    return f"; e.g. {', '.join(paths)}" + (f" (+{len(bad) - n} more)" if len(bad) > n else "")


def grade(n):
    if n is None:
        return "?"
    return "A" if n >= 90 else "B" if n >= 80 else "C" if n >= 70 else "D" if n >= 60 else "F"


def bar(n, width=20):
    if n is None:
        return "·" * width
    filled = round(width * n / 100)
    return "█" * filled + "░" * (width - filled)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("site")
    ap.add_argument("--max-pages", type=int, default=30)
    ap.add_argument("--delay", type=float, default=0.3)
    ap.add_argument("--no-psi", action="store_true")
    ap.add_argument("--out")
    a = ap.parse_args()

    site = a.site if a.site.startswith("http") else "https://" + a.site
    site = common.normalize_url(site)
    home = common.fetch(site, user_agent=BROWSER_UA)
    if home["status"] is None:
        sys.exit(f"Cannot reach {site}: {home['error']}")
    site = common.normalize_url(urlparse(home["final_url"])._replace(path="/", query="").geturl())
    host = urlparse(site).netloc
    out = Path(a.out or Path(tempfile.gettempdir()) / f"rating-{host}-{common.today()}")
    out.mkdir(parents=True, exist_ok=True)
    print(f"Rating {site} -> {out}", file=sys.stderr)

    # ---- data collection (deterministic scripts)
    run("crawling/robots_check.py", site, "--json", str(out / "robots.json"))
    robots = common.read_json(out / "robots.json")
    sitemap = robots["sitemaps"][0] if robots.get("sitemaps") else common.normalize_url("/sitemap.xml", site)
    sm_ok = common.fetch(sitemap)["status"] == 200
    crawl_args = ["crawling/crawl.py", site, "--max-pages", str(a.max_pages), "--delay", str(a.delay), "--out", str(out)]
    run(*crawl_args, *(["--seed-sitemap", sitemap] if sm_ok else []))
    crawl = common.read_json(out / "crawl.json")
    run("sitemap/sitemap_check.py", sitemap, "--crawl", str(out / "crawl.json"), "--check-limit", "60", "--out", str(out))
    run("metadata/metadata_audit.py", str(out / "crawl.json"), "--out", str(out))
    run("links/link_check.py", str(out / "crawl.json"), "--out", str(out))
    run("ai_answer/answer_check.py", "--site", site, "--crawl", str(out / "crawl.json"),
        "--max-pages", str(a.max_pages), "--out", str(out))
    smc = common.read_json(out / "sitemap-check.json")
    links = common.read_json(out / "links.json")
    ans = common.read_json(out / "answer-check.json")

    pages = [p for p in crawl["pages"] if p.get("status") == 200 and "title" in p and not p.get("redirect_chain")]
    idx = [p for p in pages if p.get("indexable")]
    reached = [p for p in crawl["pages"] if p.get("status") is not None]
    c = Card()

    # ---- SEO: crawl & index (30)
    rb = common.Robots.fetch(site)
    c.add("crawl", "Homepage crawlable by Googlebot and Bingbot", 1.0 if rb.can_fetch("Googlebot", site) and rb.can_fetch("Bingbot", site) else 0.0, 6,
          f"robots.txt HTTP {robots.get('status')}", "Remove robots.txt rules that block Googlebot/Bingbot from the homepage.", impact="High")
    c.add("crawl", "HTTPS", 1.0 if site.startswith("https://") else 0.0, 3, site, "Serve the whole site over HTTPS and 301 http to https.", impact="High")
    c.add("crawl", "XML sitemap reachable and clean", (0.5 if sm_ok else 0.0) + (0.5 if sm_ok and not smc["url_issues"] and not smc["problems"] else 0.0), 5,
          f"{sitemap}: {'200' if sm_ok else 'missing'}; {len(smc['url_issues'])} non-indexable URL(s) in it",
          "Publish an XML sitemap with only 200, indexable, canonical URLs and list it in robots.txt.", impact="High")
    c.add("crawl", "Pages return 200", share(reached, lambda p: p["status"] == 200), 5,
          f"{sum(1 for p in reached if p['status'] == 200)}/{len(reached)} crawled URLs returned 200",
          "Fix or 301-redirect URLs that return 4xx/5xx, and update links pointing to them.", impact="High")
    c.add("crawl", "Pages are indexable (no stray noindex/canonical conflicts)", share(pages, lambda p: p.get("indexable")), 6,
          f"{len(idx)}/{len(pages)} HTML pages indexable", "Remove unintended noindex tags and make canonicals self-referencing.", impact="High")
    broken = len(links["broken_internal"]) + len(links["links_to_redirects"])
    c.add("crawl", "No broken or redirected internal links", 1.0 if broken == 0 else max(0, 1 - broken / 10), 3,
          f"{len(links['broken_internal'])} broken, {len(links['links_to_redirects'])} pointing at redirects",
          "Update internal links to point straight at final 200 URLs.", impact="Medium")
    c.add("crawl", "Server-rendered content (not JS-only)", share(pages, lambda p: not p.get("js_shell_suspect")), 2,
          f"{sum(1 for p in pages if p.get('js_shell_suspect'))} page(s) look JS-rendered",
          "Server-render or prerender main content; many crawlers and AI bots don't run JavaScript.", impact="High")

    # ---- SEO: on-page (25)
    title_ok = lambda p: 25 <= len(p.get("title", "")) <= 60
    uniq = len({p["title"].lower() for p in pages if p.get("title")}) / max(1, len(pages))
    c.add("onpage", "Titles present, unique, 25-60 chars", (share(pages, title_ok) or 0) * uniq, 7,
          f"{sum(1 for p in pages if title_ok(p))}/{len(pages)} in range; {round(uniq * len(pages))} unique{fails(pages, title_ok)}",
          "Give every page a unique, descriptive title of ~50-60 characters: topic first, brand last.", impact="High")
    c.add("onpage", "Meta descriptions present and unique", share(pages, lambda p: 70 <= len(p.get("meta_description", "")) <= 170), 4,
          f"{sum(1 for p in pages if 70 <= len(p.get('meta_description', '')) <= 170)}/{len(pages)} in 70-170 chars"
          f"{fails(pages, lambda p: 70 <= len(p.get('meta_description', '')) <= 170)}",
          "Write a unique 120-160 character description per page (benefit + proof + call to action).", impact="Medium")
    c.add("onpage", "Exactly one H1", share(pages, lambda p: len(p.get("h1", [])) == 1), 4,
          f"{sum(1 for p in pages if len(p.get('h1', [])) == 1)}/{len(pages)} pages{fails(pages, lambda p: len(p.get('h1', [])) == 1)}", "Use one clear H1 per page that says what the page is about.", impact="Medium")
    c.add("onpage", "Logical heading order", share(pages, lambda p: not any(b - x > 1 for x, b in zip(p.get("heading_levels", []), p.get("heading_levels", [])[1:]))), 2,
          f"pages skipping levels{fails(pages, lambda p: not any(b - x > 1 for x, b in zip(p.get('heading_levels', []), p.get('heading_levels', [])[1:]))) or ': none'}", "Don't skip heading levels (H2 then H4); use headings as an outline.", impact="Low")
    imgs = [i for p in pages for i in p.get("images", []) if i.get("src")]
    c.add("onpage", "Images have alt text", (sum(1 for i in imgs if i.get("alt") is not None) / len(imgs)) if imgs else 1.0, 3,
          f"{sum(1 for i in imgs if i.get('alt') is not None)}/{len(imgs)} images", "Add descriptive alt text to meaningful images (alt=\"\" for decorative ones).", impact="Medium")
    c.add("onpage", "Mobile viewport + html lang", share(pages, lambda p: bool(p.get("viewport")) and bool(p.get("lang"))), 3,
          f"{sum(1 for p in pages if p.get('viewport'))}/{len(pages)} viewport, {sum(1 for p in pages if p.get('lang'))}/{len(pages)} lang",
          "Add <meta name=viewport> and <html lang> on every page.", impact="High")
    c.add("onpage", "Open Graph tags for sharing", share(pages, lambda p: p.get("og", {}).get("og:title") and p.get("og", {}).get("og:image")), 2,
          f"{sum(1 for p in pages if p.get('og', {}).get('og:title') and p.get('og', {}).get('og:image'))}/{len(pages)} have og:title + og:image"
          f"{fails(pages, lambda p: p.get('og', {}).get('og:title') and p.get('og', {}).get('og:image'))}", "Add og:title, og:description and a 1200x630 og:image.", impact="Low")

    # ---- SEO: content (15)
    c.add("content", "Pages have substantial text (250+ words)", share(idx, lambda p: p.get("word_count", 0) >= 250), 8,
          f"{sum(1 for p in idx if p.get('word_count', 0) >= 250)}/{len(idx)} indexable pages{fails(idx, lambda p: p.get('word_count', 0) >= 250)}", tag="INFERRED",
          tip="Expand thin pages with specifics customers need (process, pricing factors, proof, FAQs) or merge them.", impact="Medium")
    linked = share([p for p in idx if p["url"] != site], lambda p: p.get("inlinks", 0) >= 2)
    c.add("content", "Pages are internally linked (2+ inlinks)", 1.0 if linked is None else linked, 4,
          "internal inlink counts from crawl", "Link every important page from the nav or 2-3 related pages with descriptive anchors.", impact="Medium")
    c.add("content", "Server responds fast (HTML < 1s)", share(pages, lambda p: p.get("elapsed_ms", 9999) < 1000), 3,
          f"median {sorted(p.get('elapsed_ms', 0) for p in pages)[len(pages)//2] if pages else '?'} ms{fails(pages, lambda p: p.get('elapsed_ms', 9999) < 1000)}", "Add page caching/CDN; slow HTML hurts crawl and users.", impact="Medium")

    # ---- SEO: structured data (10)
    home_meta = common.parse_html(home["body"])
    items, errs = common.parse_jsonld(home_meta.jsonld)
    all_types = {t for p in pages for t in p.get("jsonld_types", [])}
    entity = next((i for i in items if set(common.schema_types(i)) & ENTITY_TYPES), None)
    c.add("schema", "Organization/LocalBusiness schema on homepage", 1.0 if entity else 0.0, 5,
          f"homepage types: {sorted({t for i in items for t in common.schema_types(i)}) or 'none'}",
          "Add Organization or LocalBusiness JSON-LD (name, url, logo, phone, address/areaServed, sameAs).", impact="High")
    c.add("schema", "JSON-LD is valid", share(pages, lambda p: not p.get("jsonld_errors")), 3,
          f"{sum(1 for p in pages if p.get('jsonld_errors'))} page(s) with invalid JSON-LD", "Fix JSON syntax errors in structured data.", impact="Medium")
    c.add("schema", "Breadcrumb / page-level schema", 1.0 if all_types & {"BreadcrumbList", "Service", "Product", "Article", "BlogPosting", "FAQPage", "WebPage"} else 0.0, 2,
          f"site-wide types: {sorted(all_types) or 'none'}", "Add BreadcrumbList and page-type schema (Service, Product, Article) that matches visible content.", impact="Low")

    # ---- Performance (scored into SEO when available)
    psi = None
    if not a.no_psi:
        try:
            import importlib.util
            spec = importlib.util.spec_from_file_location("pagespeed", S / "integrations/pagespeed.py")
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            psi = mod.psi(site, "mobile", os.environ.get("GOOGLE_API_KEY"))
        except Exception as e:  # network / quota
            psi = {"error": str(e)}
    perf = (psi or {}).get("scores", {}).get("performance") if psi and "error" not in psi else None
    c.add("performance", "Mobile performance (PageSpeed Insights)", None if perf is None else perf / 100, 10,
          f"PSI mobile performance {perf}" if perf is not None else f"PageSpeed unavailable ({(psi or {}).get('error', 'skipped')[:80]})",
          "Compress/resize images, defer non-critical JS, preload the hero image, cache static assets.", impact="High")

    # ---- AEO: answer engine readiness (100 within its own scale)
    rows = ans["pages"]
    eligible = share(rows, lambda r: r.get("status") == 200) or 0
    blockers = [f for f in ans["findings"] if f["area"] == "eligibility" and f["tag"] == "OBSERVED"]
    c.add("aeo", "Pages eligible for snippets (no nosnippet/noindex)", max(0.0, eligible - len(blockers) / max(1, len(rows))), 25,
          f"{len(blockers)} snippet/index blocker(s)", "Remove nosnippet / max-snippet:0 / noindex from pages you want quoted.", impact="High")
    c.add("aeo", "Question-style headings (what/how/why/cost...)", share(rows, lambda r: r.get("question_headings", 0) >= 1), 20,
          f"{sum(1 for r in rows if r.get('question_headings', 0) >= 1)}/{len(rows)} pages{fails(rows, lambda r: r.get('question_headings', 0) >= 1)}", tag="INFERRED",
          tip="Add the real questions customers ask as H2/H3 headings on key pages.", impact="Medium")
    c.add("aeo", "Direct answer near the top (opening paragraph 25-90 words)", share(rows, lambda r: 25 <= r.get("lead_words", 0) <= 90), 20,
          f"{sum(1 for r in rows if 25 <= r.get('lead_words', 0) <= 90)}/{len(rows)} pages{fails(rows, lambda r: 25 <= r.get('lead_words', 0) <= 90)}", tag="INFERRED",
          tip="Open key pages with a plain 1-3 sentence answer to the page's main question, then the detail.", impact="Medium")
    faq_bad = [f for f in ans["findings"] if "FAQPage question not in visible text" in f["finding"]]
    has_faq = "FAQPage" in all_types
    c.add("aeo", "FAQ content (and FAQ schema matches visible text)", (1.0 if has_faq and not faq_bad else 0.5 if has_faq else
          (0.6 if any(r.get("question_headings", 0) >= 3 for r in rows) else 0.0)), 15,
          f"FAQPage schema: {'yes' if has_faq else 'no'}; mismatches: {len(faq_bad)}",
          "Add an FAQ section with real customer questions; FAQ schema only if it matches the visible Q&A.", impact="Low")
    c.add("aeo", "Readable structure (lists/tables, multiple H2s)", share(pages, lambda p: sum(1 for l in p.get("heading_levels", []) if l == 2) >= 2), 10,
          f"{sum(1 for p in pages if sum(1 for l in p.get('heading_levels', []) if l == 2) >= 2)}/{len(pages)} pages with 2+ H2s"
          f"{fails(pages, lambda p: sum(1 for l in p.get('heading_levels', []) if l == 2) >= 2)}", "Break long pages into scannable sections with H2s, lists and tables.", tag="INFERRED", impact="Low")
    c.add("aeo", "Content in raw HTML (no JS-only rendering)", share(pages, lambda p: not p.get("js_shell_suspect")), 10,
          "raw HTML text present", "Server-render content so answer engines can read it without JavaScript.", impact="High")

    # ---- GEO: generative engine readiness
    acc = ans["crawler_access"]
    allowed = [b for b in SEARCH_BOTS if acc.get(b)]
    c.add("geo", "AI search crawlers allowed in robots.txt", len(allowed) / len(SEARCH_BOTS), 20,
          f"allowed: {', '.join(allowed) or 'none'}; blocked: {', '.join(b for b in SEARCH_BOTS if not acc.get(b)) or 'none'}",
          "Allow Googlebot, Bingbot, OAI-SearchBot, PerplexityBot and Claude-SearchBot in robots.txt.", impact="High")
    probe = {}
    base_status = home["status"]
    for bot, ua in SEARCH_BOTS.items():
        probe[bot] = common.fetch(site, user_agent=ua, timeout=15)["status"]
    waf_blocked = [b for b, s in probe.items() if s in (401, 403, 429, 503) and base_status == 200]
    c.add("geo", "No CDN/WAF blocking of AI crawler user-agents", 1 - len(waf_blocked) / len(SEARCH_BOTS), 15,
          f"homepage status by UA: {probe} (browser: {base_status})", tag="INFERRED",
          tip="Check Cloudflare/CDN bot settings: something returns 4xx to search/AI crawler user-agents.", impact="High")
    name = (entity or {}).get("name") or home_meta.og.get("og:site_name") or ""
    text = home_meta.text.lower()
    c.add("geo", "Clear entity: business name stated in homepage text", 1.0 if name and name.lower() in text else 0.0, 15,
          f"entity name: {name or 'not found'}", "State the business name, what it does, and for whom in the first lines of the homepage.", impact="High")
    addr = (entity or {}).get("address") or {}
    loc = (addr.get("addressLocality") if isinstance(addr, dict) else "") or ""
    area = (entity or {}).get("areaServed")
    has_where = bool(loc or area)
    local = bool(entity) and bool(set(common.schema_types(entity)) - {"Organization", "Corporation", "Person", "NGO",
                                                                        "SoftwareApplication", "OnlineBusiness", "EducationalOrganization"})
    c.add("geo", "Location/service area declared (schema)", (1.0 if has_where else 0.0) if (local or has_where) else None, 10,
          f"addressLocality: {loc or '-'}; areaServed: {'yes' if area else '-'}",
          "Declare address or areaServed in schema and say where you operate on the homepage.", impact="Medium")
    same_as = (entity or {}).get("sameAs") or []
    c.add("geo", "Consistent identity across the web (sameAs profiles)", min(1.0, len(same_as if isinstance(same_as, list) else [same_as]) / 3), 10,
          f"{len(same_as) if isinstance(same_as, list) else 1} sameAs link(s)", "List your real profiles (GBP/Maps, LinkedIn, Facebook, industry directories) in sameAs.", impact="Medium")
    urls_l = " ".join(p["url"].lower() for p in pages)
    trust = sum(1 for k in ("about", "contact") if k in urls_l)
    c.add("geo", "About and Contact pages exist", trust / 2, 10, f"found {trust}/2", "Publish About (who, credentials, history) and Contact (NAP) pages.", impact="Medium")
    cited = share(rows, lambda r: r.get("external_links", 0) >= 1)
    c.add("geo", "Cites sources (outbound links to evidence)", cited, 10,
          f"{sum(1 for r in rows if r.get('external_links', 0) >= 1)}/{len(rows)} pages link out{fails(rows, lambda r: r.get('external_links', 0) >= 1)}", tag="INFERRED",
          tip="Back claims and statistics with links to their sources; never publish unsourced numbers.", impact="Low")
    c.add("geo", "Bing visibility prerequisite (Bingbot allowed)", 1.0 if acc.get("Bingbot") else 0.0, 10,
          "ChatGPT search and Copilot draw on Bing's index", "Allow Bingbot and register the site in Bing Webmaster Tools.", impact="Medium")
    llms = common.fetch(common.normalize_url("/llms.txt", site))["status"] == 200
    c.add("info", "llms.txt (optional, not scored)", None, 0, f"/llms.txt {'present' if llms else 'absent'}; Google Search does not use it")

    seo = c.score({"crawl", "onpage", "content", "schema", "performance"})
    aeo = c.score({"aeo"})
    geo = c.score({"geo"})
    overall = round(0.6 * seo + 0.2 * aeo + 0.2 * geo) if None not in (seo, aeo, geo) else seo
    cats = {k: c.score({k}) for k in ("crawl", "onpage", "content", "schema", "performance")}

    groups = [({"crawl", "onpage", "content", "schema", "performance"}, 0.6), ({"aeo"}, 0.2), ({"geo"}, 0.2)]
    for x in c.checks:
        for cats_, share_ in groups:
            if x["category"] in cats_ and x["ratio"] is not None:
                tot = sum(y["weight"] for y in c.checks if y["category"] in cats_ and y["ratio"] is not None)
                x["gain"] = round(100 * share_ * x["weight"] * (1 - x["ratio"]) / tot, 1)  # overall points if fixed
    mult = {"High": 1.5, "Medium": 1.0, "Low": 0.6}
    tips = sorted([x for x in c.checks if x["ratio"] is not None and x["ratio"] < 0.999 and x["tip"]],
                  key=lambda x: -(x.get("gain", 0) * mult.get(x["impact"], 1) * (0.8 if x["tag"] == "INFERRED" else 1)))
    unknown = ["Rankings, clicks, impressions and queries (needs Google Search Console access)",
               "Bing index coverage and Bing/Copilot traffic (needs Bing Webmaster Tools)",
               "Backlinks and brand mentions (needs a backlink data source)",
               "Real-user Core Web Vitals beyond PageSpeed's CrUX sample",
               "Whether pages are actually indexed (needs Search Console URL Inspection)",
               "Whether AI assistants currently cite the site (needs manual prompt checks or a tracker)",
               "Google Business Profile completeness (manual check)"]
    if perf is None:
        unknown.insert(0, "Mobile performance (PageSpeed Insights unavailable this run; set GOOGLE_API_KEY)")

    result = {"site": site, "date": common.today(), "pages_rated": len(pages), "hit_page_limit": crawl["summary"]["hit_page_limit"],
              "scores": {"overall": overall, "seo": seo, "aeo": aeo, "geo": geo, **{f"seo_{k}": v for k, v in cats.items()}},
              "checks": c.checks, "psi": psi, "unknown": unknown}
    common.write_json(out / "rating.json", result)

    names = {"crawl": "Crawl & index", "onpage": "On-page", "content": "Content", "schema": "Structured data", "performance": "Performance"}
    md = [f"# Website rating: {host}", "",
          f"_{common.today()} · {len(pages)} pages checked{' (sample; site is larger)' if result['hit_page_limit'] else ''} · rubric: references/rating-rubric.md_", "",
          "| Score | | Grade |", "|---|---|---|",
          f"| **Overall** | `{bar(overall)}` **{overall}/100** | **{grade(overall)}** |",
          f"| SEO | `{bar(seo)}` {seo}/100 | {grade(seo)} |",
          f"| AEO (answer engines) | `{bar(aeo)}` {aeo}/100 | {grade(aeo)} |",
          f"| GEO (generative AI search) | `{bar(geo)}` {geo}/100 | {grade(geo)} |", "",
          "SEO breakdown: " + " · ".join(f"{names[k]} {v if v is not None else '?'}" for k, v in cats.items()), "",
          "## Top fixes (highest impact first)", ""]
    for i, t in enumerate(tips[:10], 1):
        md.append(f"{i}. **{t['tip']}** (+{t.get('gain', 0)} pts)  \n   _{t['impact']} impact · {t['check']} · {t['tag']}: {t['detail']}_")
    if not tips:
        md.append("No failed checks. Next gains come from data this crawl can't see (below).")
    md += ["", "## What's working", ""]
    md += [f"- {x['check']} ({x['detail']})" for x in c.checks if x["ratio"] is not None and x["ratio"] >= 0.999][:12]
    md += ["", "## All checks", "", "| Area | Check | Score | Evidence | Detail |", "|---|---|---|---|---|"]
    label = {**names, "aeo": "AEO", "geo": "GEO", "info": "Info"}
    for x in c.checks:
        sc = "n/a" if x["ratio"] is None else f"{round(x['ratio'] * 100)}%"
        md.append(f"| {label[x['category']]} | {x['check']} | {sc} | {x['tag']} | {str(x['detail']).replace('|', '/')} |")
    md += ["", "## UNKNOWN (a public crawl can't see these)", ""] + [f"- {u}" for u in unknown]
    md += ["", "_Scores measure SEO hygiene and AI-search readiness from the live site. They are not rankings and don't "
           "predict traffic. Google states that appearing in AI Overviews/AI Mode isn't guaranteed._"]
    (out / "scorecard.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))
    print(f"\n[files] {out / 'scorecard.md'} · {out / 'rating.json'}", file=sys.stderr)


if __name__ == "__main__":
    main()
