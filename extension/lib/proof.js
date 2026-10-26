import { checkById, grade } from "./rubric.js";

/** Scans are kept per page (origin + path), newest first, in chrome.storage.local on this device only. */
const keyFor = (url) => { const u = new URL(url); return "scans:" + u.origin + u.pathname; };
const MAX = 25;

export async function saveScan(scan) {
  const k = keyFor(scan.page.url);
  const { [k]: list = [] } = await chrome.storage.local.get(k);
  const entry = { id: scan.page.scannedAt, ...scan };
  await chrome.storage.local.set({ [k]: [entry, ...list].slice(0, MAX) });
  return entry;
}

export async function history(url) {
  const k = keyFor(url);
  const { [k]: list = [], ["baseline:" + k]: baselineId = null } = await chrome.storage.local.get([k, "baseline:" + k]);
  return { list, baseline: list.find((s) => s.id === baselineId) || null };
}

export async function setBaseline(url, id) {
  await chrome.storage.local.set({ ["baseline:" + keyFor(url)]: id });
}

export function compare(before, after) {
  const b = Object.fromEntries(before.results.map((r) => [r.id, r]));
  const rows = after.results.map((a) => {
    const o = b[a.id] || { ratio: null, detail: "not measured" };
    const status = a.ratio == null || o.ratio == null ? "unknown"
      : a.ratio > o.ratio + 0.001 ? (a.ratio >= 0.999 ? "fixed" : "improved")
      : a.ratio < o.ratio - 0.001 ? "regressed" : a.ratio >= 0.999 ? "passing" : "still failing";
    return { id: a.id, name: checkById[a.id]?.name || a.id, cat: a.cat, before: o, after: a, status };
  });
  const delta = Object.fromEntries(["overall", "seo", "aeo", "geo"].map((k) => [k, (after.scores[k] ?? 0) - (before.scores[k] ?? 0)]));
  return { rows, delta };
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (r) => (r == null ? "n/a" : Math.round(r * 100) + "%");

/** Self-contained HTML proof report for a client: before vs after, with timestamps and evidence. */
export function proofReport(before, after) {
  const { rows, delta } = compare(before, after);
  const changed = rows.filter((r) => ["fixed", "improved", "regressed"].includes(r.status));
  const sign = (n) => (n > 0 ? "+" + n : String(n));
  const card = (label, k) => `<div class="card"><div class="lbl">${label}</div><div class="nums"><span>${before.scores[k]}</span><span class="arrow">→</span><b>${after.scores[k]}</b></div><div class="d ${delta[k] >= 0 ? "up" : "down"}">${sign(delta[k])} · ${grade(before.scores[k])} → ${grade(after.scores[k])}</div></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Before / after · ${esc(new URL(after.page.url).host)}</title><style>
:root{--bg:#f6f5f2;--panel:#fff;--ink:#16151a;--muted:#6b6876;--line:#e6e3dc;--good:#1f9d57;--bad:#d6452f;--accent:#ff6a3d}
@media (prefers-color-scheme:dark){:root{--bg:#0d0c11;--panel:#16141c;--ink:#f1eff6;--muted:#9a96a8;--line:#2a2733}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 Inter,"Segoe UI",system-ui,sans-serif}.w{max-width:960px;margin:0 auto;padding:32px 16px}
.e{font:600 12px ui-monospace,Consolas,monospace;letter-spacing:.16em;color:var(--accent);text-transform:uppercase}h1{margin:6px 0 4px;overflow-wrap:anywhere}
.m{color:var(--muted);font-size:13px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:20px 0}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px}.lbl{color:var(--muted);font-weight:600}.nums{font-size:28px}.arrow{color:var(--muted);margin:0 6px}
.d{font-weight:700}.up{color:var(--good)}.down{color:var(--bad)}section{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;margin:14px 0}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{text-align:left;padding:7px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted)}
.fixed,.improved{color:var(--good);font-weight:700}.regressed{color:var(--bad);font-weight:700}.tag{font-size:11px;color:var(--muted)}</style></head><body><div class="w">
<div class="e">CLAUDE SEO GOD MODE · Before / after proof</div><h1>${esc(after.page.url)}</h1>
<div class="m">Before: ${esc(before.page.scannedAt.replace("T", " ").slice(0, 16))} UTC · After: ${esc(after.page.scannedAt.replace("T", " ").slice(0, 16))} UTC · measured in the browser on the live page</div>
<div class="cards">${card("Overall", "overall")}${card("SEO", "seo")}${card("AEO (answer engines)", "aeo")}${card("GEO (AI search)", "geo")}</div>
<section><h2>What changed (${changed.length})</h2>${changed.length ? `<table><tr><th>Check</th><th>Status</th><th>Before</th><th>After</th></tr>${changed.map((r) =>
  `<tr><td>${esc(r.name)}</td><td class="${r.status}">${r.status}</td><td>${pct(r.before.ratio)}<br><span class="tag">${esc(r.before.detail)}</span></td><td>${pct(r.after.ratio)}<br><span class="tag">${esc(r.after.detail)}</span></td></tr>`).join("")}</table>` : "<p>No measured check changed between these scans.</p>"}</section>
<section><h2>All checks</h2><table><tr><th>Area</th><th>Check</th><th>Before</th><th>After</th><th>Evidence</th></tr>${rows.map((r) =>
  `<tr><td>${r.cat.toUpperCase()}</td><td>${esc(r.name)}</td><td>${pct(r.before.ratio)}</td><td>${pct(r.after.ratio)}</td><td class="tag">${esc(r.after.tag)}: ${esc(r.after.detail)}</td></tr>`).join("")}</table></section>
<p class="m">Scores measure page-level SEO hygiene and AI-search readiness, not rankings or traffic. Speed figures come from single visits in the scanning browser. Google states AI Overviews placement isn't guaranteed.</p>
</div></body></html>`;
}
