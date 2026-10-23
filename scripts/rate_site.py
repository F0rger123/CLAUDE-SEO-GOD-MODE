#!/usr/bin/env python3
"""Rate any website: Overall, SEO, AEO, and GEO scores out of 100, prioritized fixes, and ready-to-use fix kits.

One command, no credentials needed. Crawls a sample of the site politely, runs this repo's deterministic checks,
and scores them with a published rubric (references/rating-rubric.md). Every point comes from something measured
on the live site (OBSERVED) or a stated heuristic (INFERRED). Things a public crawl cannot see (rankings, traffic,
backlinks, Search Console data) are listed as UNKNOWN, never guessed.

Usage:
  rate_site.py https://example.com
  rate_site.py example.com --max-pages 50 --out ./rating-example
  rate_site.py https://example.com --no-psi          (skip PageSpeed; an estimated performance proxy is used)

Writes to <out>/: report.html (visual report), scorecard.md (chat-friendly), rating.json (machine-readable).

Adding a check: see CONTRIBUTING.md § "Add a rating check" (code here + rubric row + fixture test).
"""
from __future__ import annotations

import argparse
import html as htmllib
import importlib.util
import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

S = Path(__file__).resolve().parent
RUBRIC_VERSION = "2.0"
SEARCH_BOTS = {  # robots token -> user-agent string used for the live CDN/WAF probe
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
NON_LOCAL = {"Organization", "Corporation", "Person", "NGO", "SoftwareApplication", "OnlineBusiness", "EducationalOrganization"}
CATEGORY_NAMES = {"crawl": "Crawl & index", "onpage": "On-page", "content": "Content", "schema": "Structured data",
                  "performance": "Performance", "aeo": "AEO", "geo": "GEO", "info": "Info"}
SEO_CATS = ["crawl", "onpage", "content", "schema", "performance"]
WEIGHTS = {"seo": 0.6, "aeo": 0.2, "geo": 0.2}


def run(rel: str, *args: str) -> str:
    r = subprocess.run([sys.executable, str(S / rel), *args], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return r.stdout


class Card:
    """Scored checks: category, name, ratio 0..1 (None = UNKNOWN), weight, evidence tag, detail, tip, impact."""

    def __init__(self):
        self.checks: list[dict] = []

    def add(self, cat, name, ratio, weight, detail, tip="", tag="OBSERVED", impact=None, pages=None):
        ratio = None if ratio is None else max(0.0, min(1.0, ratio))
        self.checks.append({"category": cat, "check": name, "ratio": ratio, "weight": weight,
                            "points": None if ratio is None else round(ratio * weight, 2),
                            "tag": tag if ratio is not None else "UNKNOWN", "detail": " ".join(str(detail).split()),
                            "tip": tip, "impact": impact, "pages": pages or []})

    def score(self, cats) -> int | None:
        scored = [c for c in self.checks if c["category"] in cats and c["ratio"] is not None]
        total = sum(c["weight"] for c in scored)
        return round(100 * sum(c["points"] for c in scored) / total) if total else None


def share(items, pred):
    return (sum(1 for p in items if pred(p)) / len(items)) if items else None


def path_of(url: str) -> str:
    return urlparse(url).path or "/"


def failing(items, pred, key="url") -> list[str]:
    return [path_of(p[key]) for p in items if not pred(p)]


def eg(paths: list[str], n=3) -> str:
    if not paths:
        return ""
    return f"; e.g. {', '.join(paths[:n])}" + (f" (+{len(paths) - n} more)" if len(paths) > n else "")


def grade(n):
    if n is None:
        return "?"
    return "A" if n >= 90 else "B" if n >= 80 else "C" if n >= 70 else "D" if n >= 60 else "F"


def bar(n, width=20):
    if n is None:
        return "·" * width
    filled = round(width * n / 100)
    return "█" * filled + "░" * (width - filled)


def icon(ratio):
    return "⚪" if ratio is None else "✅" if ratio >= 0.999 else "🟡" if ratio >= 0.6 else "🔴"


def skipped_levels(levels):
    seq = [1] + list(levels)  # a page is expected to start at H1; an H3 before any H1/H2 is a skip
    return [f"{'start' if i == 0 else f'H{a}'}→H{b}" for i, (a, b) in enumerate(zip(seq, seq[1:])) if b - a > 1]


# ---------------------------------------------------------------------------------------------- performance

def psi_score(site: str, enabled: bool):
    if not enabled:
        return None, "skipped (--no-psi)"
    try:
        spec = importlib.util.spec_from_file_location("pagespeed", S / "integrations/pagespeed.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        r = mod.psi(site, "mobile", os.environ.get("GOOGLE_API_KEY"))
    except Exception as e:  # network / quota
        return None, str(e)
    if "error" in r:
        msg = "quota exhausted (set GOOGLE_API_KEY)" if "429" in r["error"] else r["error"][:100]
        return None, msg
    return r, ""


def perf_proxy(home_html: str, pages: list[dict]) -> tuple[float, list[str]]:
    """Estimated performance from page structure when PageSpeed isn't available. INFERRED, not Core Web Vitals."""
    head = (re.search(r"<head[^>]*>(.*?)</head>", home_html, re.S | re.I) or [None, ""])[1]
    blocking = [s for s in re.findall(r"<script\b[^>]*\bsrc=[^>]*>", head, re.I)
                if not re.search(r"\b(async|defer)\b|type=[\"']module", s, re.I)]
    css = re.findall(r"<link\b[^>]*rel=[\"']?stylesheet[^>]*>", head, re.I)
    kb = len(home_html.encode("utf-8")) / 1024
    imgs = [i for p in pages for i in p.get("images", []) if i.get("src")]
    sized = share(imgs, lambda i: i.get("width") and i.get("height"))
    modern = share(imgs, lambda i: re.search(r"\.(webp|avif|svg)(\?|$)", i["src"], re.I) or "/_next/image" in i["src"])
    parts = {
        "render-blocking scripts in <head> (≤2)": 1.0 if len(blocking) <= 2 else max(0, 1 - (len(blocking) - 2) / 8),
        "stylesheets in <head> (≤4)": 1.0 if len(css) <= 4 else max(0, 1 - (len(css) - 4) / 8),
        "homepage HTML weight (≤150 KB)": 1.0 if kb <= 150 else max(0, 1 - (kb - 150) / 450),
        "images with width/height": 1.0 if sized is None else sized,
        "modern image formats (WebP/AVIF/SVG)": 1.0 if modern is None else modern,
    }
    notes = [f"{len(blocking)} blocking script(s)", f"{len(css)} stylesheet(s)", f"{kb:.0f} KB HTML",
             f"{'n/a' if sized is None else f'{sized:.0%}'} sized images", f"{'n/a' if modern is None else f'{modern:.0%}'} modern formats"]
    return sum(parts.values()) / len(parts), notes


# ---------------------------------------------------------------------------------------------- main

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
    run("crawling/crawl.py", site, "--max-pages", str(a.max_pages), "--delay", str(a.delay), "--out", str(out),
        *(["--seed-sitemap", sitemap] if sm_ok else []))
    crawl = common.read_json(out / "crawl.json")
    run("sitemap/sitemap_check.py", sitemap, "--crawl", str(out / "crawl.json"), "--check-limit", "60", "--out", str(out))
    run("links/link_check.py", str(out / "crawl.json"), "--out", str(out))
    run("ai_answer/answer_check.py", "--site", site, "--crawl", str(out / "crawl.json"),
        "--max-pages", str(a.max_pages), "--out", str(out))
    smc = common.read_json(out / "sitemap-check.json")
    links = common.read_json(out / "links.json")
    ans = common.read_json(out / "answer-check.json")

    pages = [p for p in crawl["pages"] if p.get("status") == 200 and "title" in p and not p.get("redirect_chain")]
    idx = [p for p in pages if p.get("indexable")]
    reached = [p for p in crawl["pages"] if p.get("status") is not None]
    rows = ans["pages"]
    home_meta = common.parse_html(home["body"])
    items, _ = common.parse_jsonld(home_meta.jsonld)
    all_types = {t for p in pages for t in p.get("jsonld_types", [])}
    entity = next((i for i in items if set(common.schema_types(i)) & ENTITY_TYPES), None)
    is_local = bool(entity) and bool(set(common.schema_types(entity)) - NON_LOCAL)
    c = Card()
    kits: list[dict] = []

    # ================================================================ SEO: crawl & index
    rb = common.Robots.fetch(site)
    c.add("crawl", "Homepage crawlable by Googlebot and Bingbot", 1.0 if rb.can_fetch("Googlebot", site) and rb.can_fetch("Bingbot", site) else 0.0, 6,
          f"robots.txt HTTP {robots.get('status')}", "Remove robots.txt rules that block Googlebot/Bingbot from the homepage.", impact="High")
    c.add("crawl", "HTTPS", 1.0 if site.startswith("https://") else 0.0, 3, site, "Serve the whole site over HTTPS and 301 http to https.", impact="High")
    variants = {"http://" + host + "/"}
    variants.add(("https://" + host[4:] if host.startswith("www.") else "https://www." + host) + "/")
    variants.discard(site)
    consolidated = []
    for v in variants:
        r = common.fetch(v, timeout=15)
        if r["status"] is not None:  # an unresolvable www/non-www variant isn't a duplicate
            consolidated.append((v, common.normalize_url(r["final_url"]) == site and len(r["chain"]) > 1))
    c.add("crawl", "One canonical host (http and www variants redirect)", share(consolidated, lambda x: x[1]) if consolidated else 1.0, 3,
          "; ".join(f"{v} → {'redirects' if ok else 'does not redirect to ' + site}" for v, ok in consolidated) or "variants don't resolve",
          "301-redirect http:// and the other www/non-www variant to one canonical https host.", impact="High")
    c.add("crawl", "XML sitemap reachable and clean", (0.5 if sm_ok else 0.0) + (0.5 if sm_ok and not smc["url_issues"] and not smc["problems"] else 0.0), 5,
          f"{path_of(sitemap)}: {'200' if sm_ok else 'missing'}; {len(smc['url_issues'])} non-indexable URL(s) listed",
          "Publish an XML sitemap with only 200, indexable, canonical URLs and list it in robots.txt.", impact="High",
          pages=[path_of(u['url']) for u in smc["url_issues"]])
    if not sm_ok:
        kits.append({"title": "Generate a sitemap from this crawl", "lang": "bash",
                     "body": f"python scripts/sitemap/generate_sitemap.py {out / 'crawl.json'} --out sitemap.xml\n"
                             f"# then add to robots.txt:\nSitemap: {common.normalize_url('/sitemap.xml', site)}"})
    bad200 = failing(reached, lambda p: p["status"] == 200)
    c.add("crawl", "Pages return 200", share(reached, lambda p: p["status"] == 200), 5,
          f"{len(reached) - len(bad200)}/{len(reached)} crawled URLs returned 200{eg(bad200)}",
          "Fix or 301-redirect URLs that return 4xx/5xx, and update links pointing to them.", impact="High", pages=bad200)
    notidx = failing(pages, lambda p: p.get("indexable"))
    c.add("crawl", "Pages are indexable", share(pages, lambda p: p.get("indexable")), 6,
          f"{len(idx)}/{len(pages)} HTML pages indexable{eg(notidx)}", "Remove unintended noindex tags and make canonicals self-referencing.",
          impact="High", pages=notidx)
    bogus = common.fetch(common.normalize_url(f"/zz-{secrets.token_hex(5)}-not-a-page", site), timeout=15)
    c.add("crawl", "Missing pages return a real 404", 1.0 if bogus["status"] in (404, 410) else 0.0, 3,
          f"random URL returned HTTP {bogus['status']}" + (" (soft 404)" if bogus["status"] == 200 else ""),
          "Make unknown URLs return HTTP 404/410 instead of 200, so junk URLs don't get indexed.", impact="Medium")
    nocanon = failing(pages, lambda p: p.get("canonical"))
    c.add("crawl", "Canonical tag on every page", share(pages, lambda p: p.get("canonical")), 2,
          f"{len(pages) - len(nocanon)}/{len(pages)} pages{eg(nocanon)}", "Add a self-referencing <link rel=canonical> to every indexable page.",
          impact="Low", pages=nocanon)
    broken = len(links["broken_internal"]) + len(links["links_to_redirects"])
    c.add("crawl", "No broken or redirected internal links", 1.0 if broken == 0 else max(0, 1 - broken / 10), 3,
          f"{len(links['broken_internal'])} broken, {len(links['links_to_redirects'])} pointing at redirects",
          "Update internal links to point straight at final 200 URLs.", impact="Medium",
          pages=[path_of(b["target"]) for b in links["broken_internal"] + links["links_to_redirects"]])
    js = failing(pages, lambda p: not p.get("js_shell_suspect"))
    c.add("crawl", "Server-rendered content (not JS-only)", share(pages, lambda p: not p.get("js_shell_suspect")), 2,
          f"{len(js)} page(s) look JS-rendered{eg(js)}",
          "Server-render or prerender main content; many crawlers and AI bots don't run JavaScript.", impact="High", pages=js)

    # ================================================================ SEO: on-page
    title_ok = lambda p: 25 <= len(p.get("title", "")) <= 60
    titles = [p.get("title", "").lower() for p in pages if p.get("title")]
    dup_titles = {t for t in titles if titles.count(t) > 1}
    uniq = len(set(titles)) / max(1, len(pages))
    bad = failing(pages, title_ok)
    c.add("onpage", "Titles 25–60 chars and unique", (share(pages, title_ok) or 0) * uniq, 7,
          f"{len(pages) - len(bad)}/{len(pages)} in range; {len(dup_titles)} duplicated{eg(bad)}",
          "Give every page a unique, descriptive title of ~50–60 characters: topic first, brand last.", impact="High", pages=bad)
    if bad:
        kits.append({"title": "Titles to rewrite (current → length)", "lang": "text",
                     "body": "\n".join(f"{path_of(p['url'])}  [{len(p.get('title', ''))} chars]  {p.get('title', '') or '(missing)'}"
                                       for p in pages if not title_ok(p))[:3000]})
    desc_ok = lambda p: 70 <= len(p.get("meta_description", "")) <= 170
    bad = failing(pages, desc_ok)
    c.add("onpage", "Meta descriptions 70–170 chars", share(pages, desc_ok), 4,
          f"{len(pages) - len(bad)}/{len(pages)} in range{eg(bad)}",
          "Write a unique 120–160 character description per page: benefit, proof, call to action.", impact="Medium", pages=bad)
    if bad:
        kits.append({"title": "Meta descriptions to rewrite (current → length)", "lang": "text",
                     "body": "\n".join(f"{path_of(p['url'])}  [{len(p.get('meta_description', ''))} chars]  {p.get('meta_description', '') or '(missing)'}"
                                       for p in pages if not desc_ok(p))[:3000]})
    bad = failing(pages, lambda p: len(p.get("h1", [])) == 1)
    c.add("onpage", "Exactly one H1", share(pages, lambda p: len(p.get("h1", [])) == 1), 4,
          f"{len(pages) - len(bad)}/{len(pages)} pages{eg(bad)}", "Use one clear H1 per page that says what the page is about.",
          impact="Medium", pages=bad)
    skips = [(path_of(p["url"]), skipped_levels(p.get("heading_levels", []))) for p in pages]
    bad = [u for u, s in skips if s]
    c.add("onpage", "Logical heading order", share(skips, lambda x: not x[1]), 2,
          (f"skips: " + "; ".join(f"{u} ({', '.join(sorted(set(s)))})" for u, s in skips if s)[:300]) if bad else "no skipped levels",
          "Don't skip heading levels (H2 then H4); use headings as an outline.", impact="Low", pages=bad)
    imgs = [i for p in pages for i in p.get("images", []) if i.get("src")]
    c.add("onpage", "Images have alt text", (sum(1 for i in imgs if i.get("alt") is not None) / len(imgs)) if imgs else 1.0, 3,
          f"{sum(1 for i in imgs if i.get('alt') is not None)}/{len(imgs)} images",
          "Add descriptive alt text to meaningful images (alt=\"\" for decorative ones).", impact="Medium")
    bad = failing(pages, lambda p: bool(p.get("viewport")) and bool(p.get("lang")))
    c.add("onpage", "Mobile viewport + html lang", share(pages, lambda p: bool(p.get("viewport")) and bool(p.get("lang"))), 3,
          f"{len(pages) - len(bad)}/{len(pages)} pages{eg(bad)}", "Add <meta name=viewport> and <html lang> on every page.", impact="High", pages=bad)
    social = lambda p: all(p.get("og", {}).get(k) for k in ("og:title", "og:description", "og:image"))
    bad = failing(pages, social)
    c.add("onpage", "Social cards (og:title, og:description, og:image)", share(pages, social), 2,
          f"{len(pages) - len(bad)}/{len(pages)} complete{eg(bad)}",
          "Add og:title, og:description, og:image (1200×630) and twitter:card to every page.", impact="Low", pages=bad)
    if bad:
        p0 = next(p for p in pages if not social(p))
        kits.append({"title": f"Social card tags (example for {path_of(p0['url'])})", "lang": "html",
                     "body": f'<meta property="og:title" content="{htmllib.escape(p0.get("title", ""))}">\n'
                             f'<meta property="og:description" content="{htmllib.escape(p0.get("meta_description", "") or "[CONFIRM: 120-160 char summary]")}">\n'
                             f'<meta property="og:image" content="{common.normalize_url("/og-image.png", site)}">  <!-- [CONFIRM] 1200x630 image -->\n'
                             f'<meta property="og:url" content="{p0["url"]}">\n<meta name="twitter:card" content="summary_large_image">'})

    # ================================================================ SEO: content
    bad = failing(idx, lambda p: p.get("word_count", 0) >= 250)
    c.add("content", "Pages have substantial text (250+ words)", share(idx, lambda p: p.get("word_count", 0) >= 250), 8,
          f"{len(idx) - len(bad)}/{len(idx)} indexable pages{eg(bad)}", tag="INFERRED",
          tip="Expand thin pages with specifics customers need (process, pricing factors, proof, FAQs) or merge them.", impact="Medium", pages=bad)
    others = [p for p in idx if p["url"] != site]
    bad = failing(others, lambda p: p.get("inlinks", 0) >= 2)
    c.add("content", "Pages are internally linked (2+ inlinks)", 1.0 if not others else share(others, lambda p: p.get("inlinks", 0) >= 2), 4,
          f"{len(others) - len(bad)}/{len(others)} pages{eg(bad)}",
          "Link every important page from the nav or 2–3 related pages with descriptive anchors.", impact="Medium", pages=bad)
    times = sorted(p.get("elapsed_ms", 0) for p in pages)
    bad = failing(pages, lambda p: p.get("elapsed_ms", 9999) < 1000)
    c.add("content", "Server responds fast (HTML < 1 s)", share(pages, lambda p: p.get("elapsed_ms", 9999) < 1000), 3,
          f"median {times[len(times) // 2] if times else '?'} ms{eg(bad)}", "Add page caching/CDN; slow HTML hurts crawling and users.",
          impact="Medium", pages=bad)

    # ================================================================ SEO: structured data
    home_types = sorted({t for i in items for t in common.schema_types(i)})
    c.add("schema", "Organization/LocalBusiness schema on homepage", 1.0 if entity else 0.0, 5,
          f"homepage types: {', '.join(home_types) or 'none'}",
          "Add Organization or LocalBusiness JSON-LD (name, url, logo, phone, address/areaServed, sameAs).", impact="High")
    if not entity:
        name = home_meta.og.get("og:site_name") or home_meta.title.split("|")[-1].split("–")[-1].strip()
        kits.append({"title": "Starter Organization JSON-LD (fill every [CONFIRM])", "lang": "html",
                     "body": '<script type="application/ld+json">\n' + json.dumps({
                         "@context": "https://schema.org", "@type": "Organization", "@id": site + "#organization",
                         "name": name or "[CONFIRM: business name]", "url": site, "logo": "[CONFIRM: logo URL]",
                         "telephone": "[CONFIRM]", "sameAs": ["[CONFIRM: Google Business Profile URL]", "[CONFIRM: LinkedIn/Facebook URL]"]},
                         indent=2) + "\n</script>"})
    bad = failing(pages, lambda p: not p.get("jsonld_errors"))
    c.add("schema", "JSON-LD is valid", share(pages, lambda p: not p.get("jsonld_errors")), 3,
          f"{len(bad)} page(s) with invalid JSON-LD{eg(bad)}", "Fix JSON syntax errors in structured data.", impact="Medium", pages=bad)
    c.add("schema", "Page-level schema (Breadcrumb, Service, Article…)", 1.0 if all_types & {"BreadcrumbList", "Service", "Product", "Article", "BlogPosting", "FAQPage", "WebPage"} else 0.0, 2,
          f"site-wide types: {', '.join(sorted(all_types)) or 'none'}",
          "Add BreadcrumbList and page-type schema (Service, Product, Article) that matches visible content.", impact="Low")

    # ================================================================ Performance
    psi, psi_note = psi_score(site, not a.no_psi)
    perf = psi.get("scores", {}).get("performance") if psi else None
    if perf is not None:
        field = (psi.get("field") or {}).get("loadingExperience") or (psi.get("field") or {}).get("originLoadingExperience") or {}
        fdesc = ", ".join(f"{k} {v.get('p75')} ({v.get('category', '').lower()})" for k, v in field.items() if k.split()[0] in ("LCP", "INP", "CLS")) or "no field data"
        c.add("performance", "Mobile performance (PageSpeed Insights)", perf / 100, 10, f"PSI mobile {perf}/100; field: {fdesc}",
              "Compress/resize images, defer non-critical JS, preload the hero image, cache static assets.", impact="High")
    else:
        ratio, notes = perf_proxy(home["body"], pages)
        c.add("performance", "Performance (estimated; PageSpeed unavailable)", ratio, 10, f"PageSpeed {psi_note}. Proxy: {', '.join(notes)}",
              "Defer non-critical scripts, size and compress images (WebP/AVIF), keep HTML light. Verify with PageSpeed Insights.",
              tag="INFERRED", impact="High")

    # ================================================================ AEO
    blockers = [f for f in ans["findings"] if f["area"] == "eligibility" and f["tag"] == "OBSERVED"]
    c.add("aeo", "Pages eligible for snippets (no nosnippet/noindex)", max(0.0, (share(rows, lambda r: r.get("status") == 200) or 0) - len(blockers) / max(1, len(rows))), 25,
          f"{len(blockers)} snippet/index blocker(s)", "Remove nosnippet / max-snippet:0 / noindex from pages you want quoted.", impact="High",
          pages=[path_of(f["url"]) for f in blockers if f.get("url")])
    bad = failing(rows, lambda r: r.get("question_headings", 0) >= 1)
    c.add("aeo", "Question-style headings (what/how/why/cost…)", share(rows, lambda r: r.get("question_headings", 0) >= 1), 20,
          f"{len(rows) - len(bad)}/{len(rows)} pages{eg(bad)}", tag="INFERRED",
          tip="Add the real questions customers ask as H2/H3 headings on key pages.", impact="Medium", pages=bad)
    lead_ok = lambda r: 25 <= r.get("lead_words", 0) <= 90
    bad = failing(rows, lead_ok)
    c.add("aeo", "Direct answer near the top (25–90 word opener)", share(rows, lead_ok), 20,
          f"{len(rows) - len(bad)}/{len(rows)} pages{eg(bad)}", tag="INFERRED",
          tip="Open key pages with a plain 1–3 sentence answer to the page's main question, then the detail.", impact="Medium", pages=bad)
    faq_bad = [f for f in ans["findings"] if "FAQPage question not in visible text" in f["finding"]]
    has_faq = "FAQPage" in all_types
    c.add("aeo", "FAQ content (and FAQ schema matches visible text)", (1.0 if has_faq and not faq_bad else 0.5 if has_faq else
          (0.6 if any(r.get("question_headings", 0) >= 3 for r in rows) else 0.0)), 15,
          f"FAQPage schema: {'yes' if has_faq else 'no'}; mismatches: {len(faq_bad)}",
          "Add an FAQ section with real customer questions; FAQ schema only if it matches the visible Q&A.", impact="Low")
    two_h2 = lambda p: sum(1 for l in p.get("heading_levels", []) if l == 2) >= 2
    bad = failing(pages, two_h2)
    c.add("aeo", "Scannable structure (2+ H2 sections)", share(pages, two_h2), 10,
          f"{len(pages) - len(bad)}/{len(pages)} pages{eg(bad)}", "Break long pages into sections with H2s, lists, and tables.",
          tag="INFERRED", impact="Low", pages=bad)
    c.add("aeo", "Content in raw HTML (no JS-only rendering)", share(pages, lambda p: not p.get("js_shell_suspect")), 10,
          "raw HTML text present", "Server-render content so answer engines can read it without JavaScript.", impact="High", pages=js)

    # ================================================================ GEO
    acc = ans["crawler_access"]
    allowed = [b for b in SEARCH_BOTS if acc.get(b)]
    blocked = [b for b in SEARCH_BOTS if not acc.get(b)]
    c.add("geo", "AI search crawlers allowed in robots.txt", len(allowed) / len(SEARCH_BOTS), 20,
          f"allowed: {', '.join(allowed) or 'none'}; blocked: {', '.join(blocked) or 'none'}",
          "Allow Googlebot, Bingbot, OAI-SearchBot, PerplexityBot, and Claude-SearchBot in robots.txt.", impact="High")
    if blocked:
        kits.append({"title": "robots.txt groups to allow AI search crawlers", "lang": "text",
                     "body": "\n\n".join(f"User-agent: {b}\nAllow: /" for b in blocked)})
    probe = {b: common.fetch(site, user_agent=ua, timeout=15)["status"] for b, ua in SEARCH_BOTS.items()}
    waf_blocked = [b for b, s in probe.items() if s in (401, 403, 429, 503) and home["status"] == 200]
    c.add("geo", "No CDN/WAF blocking of AI crawler user-agents", 1 - len(waf_blocked) / len(SEARCH_BOTS), 15,
          f"homepage HTTP by user-agent: {', '.join(f'{b} {s}' for b, s in probe.items())}", tag="INFERRED",
          tip=f"Check CDN/WAF bot settings: {', '.join(waf_blocked) or 'a crawler'} got an error status.", impact="High")
    name = (entity or {}).get("name") or home_meta.og.get("og:site_name") or ""
    text = home_meta.text.lower()
    c.add("geo", "Clear entity: business name stated in homepage text", 1.0 if name and name.lower() in text else 0.0, 15,
          f"entity name: {name or 'not found'}", "State the business name, what it does, and for whom in the first lines of the homepage.", impact="High")
    addr = (entity or {}).get("address") or {}
    loc = (addr.get("addressLocality") if isinstance(addr, dict) else "") or ""
    area = (entity or {}).get("areaServed")
    has_where = bool(loc or area)
    c.add("geo", "Location/service area declared (schema)", (1.0 if has_where else 0.0) if (is_local or has_where) else None, 10,
          f"addressLocality: {loc or '-'}; areaServed: {'yes' if area else '-'}" if (is_local or has_where) else "not a local-business entity",
          "Declare address or areaServed in schema and say where you operate on the homepage.", impact="Medium")
    same_as = (entity or {}).get("sameAs") or []
    same_as = same_as if isinstance(same_as, list) else [same_as]
    c.add("geo", "Consistent identity across the web (sameAs)", min(1.0, len(same_as) / 3), 10,
          f"{len(same_as)} sameAs link(s){': ' + ', '.join(urlparse(s).netloc for s in same_as[:4]) if same_as else ''}",
          "List your real profiles (Google Business Profile, LinkedIn, Facebook, industry directories) in sameAs.", impact="Medium")
    if len(same_as) < 3 and entity:
        kits.append({"title": "sameAs to add to your existing Organization/LocalBusiness JSON-LD", "lang": "json",
                     "body": json.dumps({"sameAs": same_as + ["[CONFIRM: Google Business Profile / Maps URL]", "[CONFIRM: LinkedIn URL]",
                                                              "[CONFIRM: Facebook or industry directory URL]"][:max(0, 4 - len(same_as))]}, indent=2)})
    urls_l = " ".join(p["url"].lower() for p in pages)
    # A URL with the word, or the matching schema type (a contact page can live at /quote or /get-in-touch).
    trust = int("about" in urls_l or "AboutPage" in all_types) + int("contact" in urls_l or "ContactPage" in all_types)
    c.add("geo", "About and Contact pages exist", trust / 2, 10, f"found {trust}/2",
          "Publish About (who, credentials, history) and Contact (how to reach you) pages.", impact="Medium")
    contact = bool(re.search(r'href=["\'](tel:|mailto:)', home["body"], re.I)) or bool((entity or {}).get("telephone") or (entity or {}).get("email"))
    c.add("geo", "Contact details findable (tel/mailto link or schema)", 1.0 if contact else 0.0, 5,
          "found on homepage" if contact else "no tel:/mailto: link or schema telephone/email on homepage",
          "Show a clickable phone number or email on the homepage and in schema.", impact="Medium")
    cited = share(rows, lambda r: r.get("external_links", 0) >= 1)
    bad = failing(rows, lambda r: r.get("external_links", 0) >= 1)
    c.add("geo", "Cites sources (outbound links to evidence)", cited, 10, f"{len(rows) - len(bad)}/{len(rows)} pages link out{eg(bad)}",
          tag="INFERRED", tip="Back claims and statistics with links to their sources; never publish unsourced numbers.", impact="Low", pages=bad)
    c.add("geo", "Bing access (ChatGPT search and Copilot use Bing's index)", 1.0 if acc.get("Bingbot") else 0.0, 5,
          "Bingbot allowed" if acc.get("Bingbot") else "Bingbot blocked", "Allow Bingbot and register the site in Bing Webmaster Tools.", impact="Medium")
    llms = common.fetch(common.normalize_url("/llms.txt", site))["status"] == 200
    c.add("info", "llms.txt (optional, not scored)", None, 0, f"/llms.txt {'present' if llms else 'absent'}; Google Search does not use it")

    # ================================================================ scoring
    seo = c.score(set(SEO_CATS))
    aeo, geo = c.score({"aeo"}), c.score({"geo"})
    overall = round(WEIGHTS["seo"] * seo + WEIGHTS["aeo"] * aeo + WEIGHTS["geo"] * geo) if None not in (seo, aeo, geo) else seo
    cats = {k: c.score({k}) for k in SEO_CATS}
    groups = [(set(SEO_CATS), WEIGHTS["seo"]), ({"aeo"}, WEIGHTS["aeo"]), ({"geo"}, WEIGHTS["geo"])]
    for x in c.checks:
        for cats_, w in groups:
            if x["category"] in cats_ and x["ratio"] is not None:
                tot = sum(y["weight"] for y in c.checks if y["category"] in cats_ and y["ratio"] is not None)
                x["gain"] = round(100 * w * x["weight"] * (1 - x["ratio"]) / tot, 1)
    mult = {"High": 1.5, "Medium": 1.0, "Low": 0.6}
    tips = sorted([x for x in c.checks if x["ratio"] is not None and x["ratio"] < 0.999 and x["tip"]],
                  key=lambda x: -(x.get("gain", 0) * mult.get(x["impact"], 1) * (0.8 if x["tag"] == "INFERRED" else 1)))
    potential = min(100, overall + round(sum(t.get("gain", 0) for t in tips[:5])))
    unknown = ["Rankings, clicks, impressions, and queries (needs Google Search Console)",
               "Whether pages are actually indexed (needs Search Console URL Inspection)",
               "Bing index coverage and Copilot/ChatGPT search traffic (needs Bing Webmaster Tools)",
               "Backlinks and brand mentions (needs a backlink data source)",
               "Whether AI assistants cite the site today (needs prompt checks or a tracker)",
               "Google Business Profile completeness (manual check)"]
    if perf is None:
        unknown.insert(0, f"Real Core Web Vitals: PageSpeed {psi_note}; performance shown is an estimate")
    page_rows = [{"path": path_of(p["url"]), "title_len": len(p.get("title", "")), "desc_len": len(p.get("meta_description", "")),
                  "h1": len(p.get("h1", [])), "words": p.get("word_count", 0), "indexable": bool(p.get("indexable")),
                  "schema": ", ".join(p.get("jsonld_types", [])[:4]), "issues": sum(1 for x in c.checks if path_of(p["url"]) in x["pages"])}
                 for p in pages]
    result = {"site": site, "host": host, "date": common.today(), "rubric_version": RUBRIC_VERSION, "pages_rated": len(pages),
              "hit_page_limit": crawl["summary"]["hit_page_limit"],
              "scores": {"overall": overall, "seo": seo, "aeo": aeo, "geo": geo, "potential_after_top5": potential,
                         **{f"seo_{k}": v for k, v in cats.items()}},
              "checks": c.checks, "top_fixes": tips[:10], "fix_kits": kits, "pages": page_rows, "psi": psi, "unknown": unknown}
    common.write_json(out / "rating.json", result)

    md = render_markdown(result, cats, tips)
    (out / "scorecard.md").write_text(md, encoding="utf-8")
    sys.path.insert(0, str(S / "rating"))
    from report_html import render  # noqa: E402
    (out / "report.html").write_text(render(result), encoding="utf-8")
    print(md)
    print(f"\n[files] report: {out / 'report.html'} · scorecard: {out / 'scorecard.md'} · data: {out / 'rating.json'}", file=sys.stderr)


def render_markdown(r: dict, cats: dict, tips: list) -> str:
    s = r["scores"]
    md = [f"# SEO rating: {r['host']}", "",
          f"_{r['date']} · {r['pages_rated']} pages checked{' (sample)' if r['hit_page_limit'] else ''} · rubric v{r['rubric_version']} (references/rating-rubric.md)_", "",
          "| Score | | Grade |", "|---|---|---|",
          f"| **Overall** | `{bar(s['overall'])}` **{s['overall']}/100** | **{grade(s['overall'])}** |",
          f"| SEO | `{bar(s['seo'])}` {s['seo']}/100 | {grade(s['seo'])} |",
          f"| AEO (answer engines) | `{bar(s['aeo'])}` {s['aeo']}/100 | {grade(s['aeo'])} |",
          f"| GEO (generative AI search) | `{bar(s['geo'])}` {s['geo']}/100 | {grade(s['geo'])} |", "",
          "SEO breakdown: " + " · ".join(f"{CATEGORY_NAMES[k]} {v if v is not None else '?'}" for k, v in cats.items()), "",
          f"**Potential:** fixing the top 5 items could lift the overall score to about **{s['potential_after_top5']}**.", "",
          "## Top fixes", ""]
    for i, t in enumerate(tips[:8], 1):
        md.append(f"{i}. {icon(t['ratio'])} **{t['tip']}** `+{t.get('gain', 0)} pts`  \n   _{t['impact']} impact · {t['check']} · {t['tag']}: {t['detail']}_")
    if not tips:
        md.append("No failed checks. Next gains come from data a public crawl can't see (below).")
    md += ["", "## What's working", ""]
    md += [f"- ✅ {x['check']}: {x['detail']}" for x in r["checks"] if x["ratio"] is not None and x["ratio"] >= 0.999][:12]
    if r["fix_kits"]:
        md += ["", "## Fix kits (copy, fill every [CONFIRM], then apply)", ""]
        for k in r["fix_kits"]:
            md += [f"**{k['title']}**", f"```{k['lang']}", k["body"], "```", ""]
    md += ["", "## All checks", "", "| | Area | Check | Score | Evidence | Detail |", "|---|---|---|---|---|---|"]
    for x in r["checks"]:
        sc = "n/a" if x["ratio"] is None else f"{round(x['ratio'] * 100)}%"
        md.append(f"| {icon(x['ratio'])} | {CATEGORY_NAMES[x['category']]} | {x['check']} | {sc} | {x['tag']} | {x['detail'].replace('|', '/')} |")
    md += ["", "## UNKNOWN (a public crawl can't see these)", ""] + [f"- {u}" for u in r["unknown"]]
    md += ["", "_Scores measure SEO hygiene and AI-search readiness from the live site. They are not rankings and don't predict "
           "traffic. Google states that appearing in AI Overviews/AI Mode isn't guaranteed._"]
    return "\n".join(md) + "\n"


if __name__ == "__main__":
    main()
