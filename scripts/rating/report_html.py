"""Render rate_site.py results as a self-contained, shareable HTML report (no external assets, light/dark aware)."""
from __future__ import annotations

from html import escape as e

NAMES = {"crawl": "Crawl & index", "onpage": "On-page", "content": "Content", "schema": "Structured data",
         "performance": "Performance", "aeo": "AEO", "geo": "GEO", "info": "Info"}


def _grade(n):
    if n is None:
        return "?"
    return "A" if n >= 90 else "B" if n >= 80 else "C" if n >= 70 else "D" if n >= 60 else "F"


def _tone(n):
    if n is None:
        return "muted"
    return "good" if n >= 85 else "ok" if n >= 70 else "warn" if n >= 55 else "bad"


def _ring(label: str, value, sub: str, big=False) -> str:
    size, stroke = (168, 14) if big else (128, 11)
    r = (size - stroke) / 2
    circ = 2 * 3.14159265 * r
    pct = 0 if value is None else value / 100
    return f"""
    <div class="ring {'big' if big else ''} t-{_tone(value)}">
      <svg viewBox="0 0 {size} {size}" width="{size}" height="{size}" aria-hidden="true">
        <circle cx="{size/2}" cy="{size/2}" r="{r}" class="track" stroke-width="{stroke}"/>
        <circle cx="{size/2}" cy="{size/2}" r="{r}" class="val" stroke-width="{stroke}"
          stroke-dasharray="{circ * pct:.1f} {circ:.1f}" transform="rotate(-90 {size/2} {size/2})"/>
      </svg>
      <div class="ring-text"><b>{'?' if value is None else value}</b><span>{_grade(value)}</span></div>
      <div class="ring-label">{e(label)}</div><div class="ring-sub">{e(sub)}</div>
    </div>"""


def _status(ratio):
    if ratio is None:
        return '<span class="dot muted" title="Unknown">●</span>'
    return f'<span class="dot {"good" if ratio >= 0.999 else "warn" if ratio >= 0.6 else "bad"}">●</span>'


def render(r: dict) -> str:
    s = r["scores"]
    cats = [(k, s.get(f"seo_{k}")) for k in ("crawl", "onpage", "content", "schema", "performance")]
    fixes = "".join(f"""
      <li class="fix imp-{(t['impact'] or 'Low').lower()}">
        <div class="fix-head"><span class="num">{i}</span><span class="fix-title">{e(t['tip'])}</span>
          <span class="gain">+{t.get('gain', 0)} pts</span></div>
        <div class="fix-meta"><span class="chip">{e(t['impact'] or '')} impact</span><span class="chip">{e(NAMES[t['category']])}</span>
          <span class="chip tag-{t['tag'].lower()}">{e(t['tag'])}</span> {e(t['check'])}</div>
        <div class="fix-detail">{e(t['detail'])}</div>
      </li>""" for i, t in enumerate(r["top_fixes"][:8], 1)) or "<p>No failed checks.</p>"
    passed = [x for x in r["checks"] if x["ratio"] is not None and x["ratio"] >= 0.999]
    working = "".join(f"<li>{e(x['check'])}</li>" for x in passed[:9])
    if len(passed) > 9:
        working += f"<li class='meta'>+{len(passed) - 9} more passing checks (see All checks)</li>"
    kits = "".join(f"<details class='kit'><summary>{e(k['title'])}</summary><pre><code>{e(k['body'])}</code></pre></details>"
                   for k in r["fix_kits"])
    checks = "".join(f"<tr><td>{_status(x['ratio'])}</td><td>{e(NAMES[x['category']])}</td><td>{e(x['check'])}</td>"
                     f"<td class='n'>{'n/a' if x['ratio'] is None else str(round(x['ratio'] * 100)) + '%'}</td>"
                     f"<td><span class='chip tag-{x['tag'].lower()}'>{e(x['tag'])}</span></td><td class='det'>{e(x['detail'])}</td></tr>"
                     for x in r["checks"])
    pages = "".join(f"<tr><td class='path'>{e(p['path'])}</td><td class='n {'' if 25 <= p['title_len'] <= 60 else 'flag'}'>{p['title_len']}</td>"
                    f"<td class='n {'' if 70 <= p['desc_len'] <= 170 else 'flag'}'>{p['desc_len']}</td>"
                    f"<td class='n {'' if p['h1'] == 1 else 'flag'}'>{p['h1']}</td><td class='n'>{p['words']}</td>"
                    f"<td>{'✓' if p['indexable'] else '<span class=flag>no</span>'}</td><td class='det'>{e(p['schema'])}</td>"
                    f"<td class='n {'flag' if p['issues'] else ''}'>{p['issues']}</td></tr>" for p in r["pages"])
    unknown = "".join(f"<li>{e(u)}</li>" for u in r["unknown"])
    bars = "".join(f"""<div class="cbar"><span>{e(NAMES[k])}</span><div class="track"><div class="fill t-{_tone(v)}" style="width:{v or 0}%"></div></div>
                      <b>{'?' if v is None else v}</b></div>""" for k, v in cats)
    gap = s["potential_after_top5"] - s["overall"]

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SEO rating · {e(r['host'])}</title>
<style>
:root {{ --bg:#f6f5f2; --panel:#fff; --ink:#16151a; --muted:#6b6876; --line:#e6e3dc; --good:#1f9d57; --ok:#7a9d1f; --warn:#d98b0b; --bad:#d6452f; --accent:#ff6a3d; --code:#f1efe9; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#0d0c11; --panel:#16141c; --ink:#f1eff6; --muted:#9a96a8; --line:#2a2733; --code:#1e1b26; }} }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--ink); font:15px/1.55 Inter,"Segoe UI",system-ui,-apple-system,sans-serif; }}
.wrap {{ max-width:1080px; margin:0 auto; padding:32px 16px 64px; }}
header {{ display:flex; flex-wrap:wrap; justify-content:space-between; align-items:flex-end; gap:12px; margin-bottom:24px; }}
.eyebrow {{ font:600 12px/1 ui-monospace,Consolas,monospace; letter-spacing:.18em; color:var(--accent); text-transform:uppercase; }}
h1 {{ margin:6px 0 0; font-size:clamp(26px,4vw,40px); letter-spacing:-.02em; overflow-wrap:anywhere; }}
.meta {{ color:var(--muted); font-size:13px; }}
.panel {{ background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:22px; margin-bottom:18px; }}
h2 {{ font-size:17px; margin:0 0 14px; }}
.rings {{ display:flex; flex-wrap:wrap; gap:18px; justify-content:space-around; align-items:center; }}
.ring {{ position:relative; text-align:center; width:150px; }} .ring.big {{ width:190px; }}
.ring svg {{ display:block; margin:0 auto; }} .ring .track {{ fill:none; stroke:var(--line); }} .ring .val {{ fill:none; stroke-linecap:round; }}
.ring-text {{ position:absolute; top:0; left:0; right:0; height:128px; display:flex; flex-direction:column; justify-content:center; }}
.ring.big .ring-text {{ height:168px; }}
.ring-text b {{ font-size:34px; line-height:1; }} .ring.big .ring-text b {{ font-size:46px; }} .ring-text span {{ color:var(--muted); font-weight:600; }}
.ring-label {{ font-weight:700; margin-top:8px; }} .ring-sub {{ color:var(--muted); font-size:12px; }}
.t-good .val, .fill.t-good {{ stroke:var(--good); background:var(--good); }} .t-ok .val, .fill.t-ok {{ stroke:var(--ok); background:var(--ok); }}
.t-warn .val, .fill.t-warn {{ stroke:var(--warn); background:var(--warn); }} .t-bad .val, .fill.t-bad {{ stroke:var(--bad); background:var(--bad); }}
.t-muted .val {{ stroke:var(--muted); }}
.cbar {{ display:grid; grid-template-columns:130px 1fr 36px; gap:10px; align-items:center; margin:8px 0; font-size:14px; }}
.cbar .track {{ height:10px; background:var(--line); border-radius:99px; overflow:hidden; }} .cbar .fill {{ height:100%; border-radius:99px; }}
.cbar b {{ text-align:right; }}
.callout {{ border-left:4px solid var(--accent); padding:10px 14px; background:var(--code); border-radius:8px; margin-top:14px; }}
ol.fixes {{ list-style:none; padding:0; margin:0; display:grid; gap:10px; }}
.fix {{ border:1px solid var(--line); border-left:4px solid var(--muted); border-radius:12px; padding:12px 14px; }}
.fix.imp-high {{ border-left-color:var(--bad); }} .fix.imp-medium {{ border-left-color:var(--warn); }} .fix.imp-low {{ border-left-color:var(--ok); }}
.fix-head {{ display:flex; gap:10px; align-items:baseline; }} .num {{ color:var(--muted); font-weight:700; }}
.fix-title {{ font-weight:650; flex:1; }} .gain {{ font:700 13px ui-monospace,Consolas,monospace; color:var(--good); white-space:nowrap; }}
.fix-meta {{ margin:6px 0 4px; font-size:12.5px; color:var(--muted); display:flex; flex-wrap:wrap; gap:6px; align-items:center; }}
.fix-detail {{ font-size:13px; color:var(--muted); overflow-wrap:anywhere; }}
.chip {{ display:inline-block; padding:1px 8px; border-radius:99px; background:var(--code); font-size:11.5px; font-weight:600; color:var(--ink); }}
.tag-observed {{ color:var(--good); }} .tag-inferred {{ color:var(--warn); }} .tag-unknown {{ color:var(--muted); }}
.cols {{ display:grid; grid-template-columns:1fr 1fr; gap:18px; }} @media (max-width:760px) {{ .cols {{ grid-template-columns:1fr; }} }}
ul.clean {{ margin:0; padding-left:18px; }} ul.clean li {{ margin:3px 0; }}
.kit {{ border:1px solid var(--line); border-radius:10px; margin:8px 0; }} .kit summary {{ cursor:pointer; padding:10px 12px; font-weight:600; }}
pre {{ margin:0; padding:12px; background:var(--code); overflow-x:auto; border-radius:0 0 10px 10px; font-size:12.5px; }}
.tablewrap {{ overflow-x:auto; }} table {{ width:100%; border-collapse:collapse; font-size:13px; }}
th, td {{ text-align:left; padding:7px 8px; border-bottom:1px solid var(--line); vertical-align:top; }} th {{ color:var(--muted); font-weight:600; }}
td.n {{ text-align:right; font-variant-numeric:tabular-nums; }} td.det {{ color:var(--muted); overflow-wrap:anywhere; }} td.path {{ font-family:ui-monospace,Consolas,monospace; }}
.flag {{ color:var(--bad); font-weight:700; }} .dot.good {{ color:var(--good); }} .dot.warn {{ color:var(--warn); }} .dot.bad {{ color:var(--bad); }} .dot.muted {{ color:var(--muted); }}
details.more > summary {{ cursor:pointer; font-weight:700; font-size:17px; }}
footer {{ color:var(--muted); font-size:12px; text-align:center; margin-top:28px; }}
</style></head>
<body><div class="wrap">
<header><div><div class="eyebrow">CLAUDE SEO GOD MODE · Site rating</div><h1>{e(r['host'])}</h1></div>
<div class="meta">{e(r['date'])} · {r['pages_rated']} pages checked{' (sample)' if r['hit_page_limit'] else ''} · rubric v{e(r['rubric_version'])}</div></header>

<section class="panel"><div class="rings">
{_ring('Overall', s['overall'], 'SEO 60% · AEO 20% · GEO 20%', big=True)}
{_ring('SEO', s['seo'], 'Search engine fundamentals')}
{_ring('AEO', s['aeo'], 'Answer engines')}
{_ring('GEO', s['geo'], 'Generative AI search')}
</div>
<div class="callout">Fixing the top 5 items could lift the overall score to about <b>{s['potential_after_top5']}</b>{f' (+{gap})' if gap > 0 else ''}.</div></section>

<div class="cols">
<section class="panel"><h2>SEO breakdown</h2>{bars}</section>
<section class="panel"><h2>What's working</h2><ul class="clean">{working or '<li>Nothing fully passed yet.</li>'}</ul></section>
</div>

<section class="panel"><h2>Top fixes, ranked by points gained</h2><ol class="fixes">{fixes}</ol></section>

{f'<section class="panel"><h2>Fix kits</h2><p class="meta">Copy, fill every [CONFIRM] with real facts, then apply. Nothing here is invented.</p>{kits}</section>' if kits else ''}

<section class="panel"><h2>Page by page</h2><div class="tablewrap"><table>
<tr><th>Page</th><th>Title</th><th>Desc.</th><th>H1</th><th>Words</th><th>Indexable</th><th>Schema</th><th>Issues</th></tr>{pages}</table></div>
<p class="meta">Title target 25–60 characters, description 70–170, exactly one H1. Red = outside target.</p></section>

<section class="panel"><details class="more"><summary>All {len(r['checks'])} checks</summary><div class="tablewrap"><table>
<tr><th></th><th>Area</th><th>Check</th><th>Score</th><th>Evidence</th><th>Detail</th></tr>{checks}</table></div></details></section>

<section class="panel"><h2>What a public crawl can't see</h2><ul class="clean">{unknown}</ul></section>

<footer>Scores measure SEO hygiene and AI-search readiness from the live site, not rankings or traffic. Google states appearing in AI Overviews/AI Mode isn't guaranteed.<br>
OBSERVED = measured · INFERRED = heuristic from measured data · UNKNOWN = not visible without account access.</footer>
</div></body></html>
"""
