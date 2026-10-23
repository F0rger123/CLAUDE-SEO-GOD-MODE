#!/usr/bin/env python3
"""One-command deterministic site audit. Runs robots -> crawl -> sitemap -> metadata -> links -> schema.

Writes everything to <client>/data/audit-YYYY-MM-DD/ and a summary.md Claude can read instead of raw JSON.
With --client, records the run in state.json and (with --log-issues) adds grouped issues to state.

Usage:
  audit.py --client d-hauss --max-pages 300 --log-issues
  audit.py --url https://example.com --out ./audit-out          (no client state)
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

S = Path(__file__).resolve().parent


def run(args: list[str]) -> str:
    print(f"- running {Path(args[0]).parent.name}/{Path(args[0]).name}", flush=True)
    r = subprocess.run([sys.executable] + args, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print(r.stderr[-2000:])
    return r.stdout


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--client"); ap.add_argument("--url"); ap.add_argument("--out")
    ap.add_argument("--sitemap", help="defaults to profile.sitemap_url, robots.txt Sitemap:, or /sitemap.xml")
    ap.add_argument("--max-pages", type=int, default=300)
    ap.add_argument("--delay", type=float, default=0.5)
    ap.add_argument("--external", action="store_true", help="check outbound links too")
    ap.add_argument("--log-issues", action="store_true", help="add grouped issues to state.json")
    a = ap.parse_args()

    state = None
    if a.client:
        state = common.read_json(common.client_dir(a.client) / "state.json")
        url = a.url or state["profile"]["website"]
        out = Path(a.out) if a.out else common.client_dir(a.client) / "data" / f"audit-{common.today()}"
    else:
        if not a.url:
            sys.exit("--client or --url required")
        url, out = a.url, Path(a.out or f"audit-{common.today()}")
    out.mkdir(parents=True, exist_ok=True)
    url = common.normalize_url(url)

    robots_txt = run([str(S / "crawling/robots_check.py"), url, "--json", str(out / "robots.json")])
    robots = common.read_json(out / "robots.json")
    sitemap = a.sitemap or (state and state["profile"].get("sitemap_url")) or \
        (robots["sitemaps"][0] if robots["sitemaps"] else common.normalize_url("/sitemap.xml", url))

    crawl_args = [str(S / "crawling/crawl.py"), url, "--max-pages", str(a.max_pages), "--delay", str(a.delay),
                  "--out", str(out)]
    if common.fetch(sitemap)["status"] == 200:
        crawl_args += ["--seed-sitemap", sitemap]
    crawl_txt = run(crawl_args)
    crawl_json = out / "crawl.json"
    sm_txt = run([str(S / "sitemap/sitemap_check.py"), sitemap, "--crawl", str(crawl_json), "--out", str(out)])
    md_txt = run([str(S / "metadata/metadata_audit.py"), str(crawl_json), "--out", str(out)])
    link_args = [str(S / "links/link_check.py"), str(crawl_json), "--out", str(out)] + (["--external"] if a.external else [])
    link_txt = run(link_args)
    schema_args = [str(S / "schema/schema_check.py"), "--crawl", str(crawl_json), "--out", str(out)] + \
        (["--client", a.client] if a.client else [])
    schema_txt = run(schema_args)

    crawl = common.read_json(crawl_json)
    issues = common.read_json(out / "metadata-issues.json")
    summary = [f"# Technical audit — {url}", f"Date: {common.today()}  |  Output: {out}", "",
               "_Evidence: everything in this file is OBSERVED by automated checks on this date. "
               "Interpretations added later must be tagged INFERRED / RECOMMENDED / UNKNOWN (RULES.md)._", "",
               "## Crawl", "```", json.dumps(crawl["summary"], indent=1), "```",
               "## robots.txt", "```", robots_txt.strip(), "```",
               "## Sitemap", "```", sm_txt.strip()[-3000:], "```",
               "## On-page / technical issues (grouped)",
               common.md_table([{**i, "example": i["urls"][0]} for i in issues], ["severity", "area", "title", "count", "example"]),
               "## Links", "```", link_txt.strip()[-3000:], "```",
               "## Structured data", "```", schema_txt.strip()[-3000:], "```",
               "## Not covered by this script",
               "- Core Web Vitals: run scripts/integrations/pagespeed.py on key templates",
               "- Google index status: scripts/integrations/gsc.py inspect (needs GSC access)",
               "- JS rendering: if js_shell_suspect pages exist, compare rendered DOM (Playwright MCP / Chrome DevTools MCP)",
               "- Pages beyond --max-pages" + (" (limit was hit)" if crawl["summary"]["hit_page_limit"] else "")]
    (out / "summary.md").write_text("\n".join(summary) + "\n", encoding="utf-8")
    print(f"\nSummary: {out / 'summary.md'}")

    if state is not None:
        sm = common.read_json(out / "sitemap-check.json")
        state["audit"]["status"] = "complete"
        state["audit"]["last_run"] = common.today()
        state["audit"]["runs"].append({"date": common.today(), "dir": str(out), "pages": crawl["summary"]["pages_crawled"],
                                       "issue_groups": len(issues), "sitemap": sitemap,
                                       "sitemap_problems": len(sm["problems"]) + len(sm["url_issues"])})
        common.write_json(common.client_dir(a.client) / "state.json", state)
        cs = [sys.executable, str(S / "state/client_state.py")]
        if a.log_issues:
            for i in issues:
                if i["severity"] in ("critical", "high", "medium"):
                    subprocess.run(cs + ["issue", "add", a.client, i["title"], "--severity", i["severity"], "--area", i["area"],
                                         "--source", f"audit {common.today()}", "--urls", *i["urls"][:20]],
                                   capture_output=True)
            sitemap_issues = sm["problems"] + ([f"Sitemap contains {len(sm['url_issues'])} non-indexable URL(s)"]
                                               if sm["url_issues"] else [])
            for title in sitemap_issues:
                subprocess.run(cs + ["issue", "add", a.client, title, "--severity", "high", "--area", "indexing",
                                     "--source", f"audit {common.today()}"], capture_output=True)
        subprocess.run(cs + ["log", a.client, f"Audit run: {crawl['summary']['pages_crawled']} pages, {len(issues)} issue groups -> {out}"],
                       capture_output=True)


if __name__ == "__main__":
    main()
