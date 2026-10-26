/**
 * Tracked websites and their history, kept in chrome.storage.local on this device (unlimitedStorage, so years of
 * history fit). Every whole-site scan of a tracked site adds a score point; every Google results page you analyze
 * records where each tracked site ranks for that search. Export/import moves history between computers.
 */
const LIST = "tracked";
const trendKey = (origin) => "trend:" + origin;
const posKey = (origin) => "kwpos:" + origin;
const MAX_POINTS = 1000;
const originOf = (url) => new URL(/^https?:/i.test(url) ? url : "https://" + url).origin;
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

export async function trackedSites() { return (await chrome.storage.local.get(LIST))[LIST] || []; }

export async function trackSite(url, name = "") {
  const origin = originOf(url);
  const list = await trackedSites();
  if (!list.some((s) => s.origin === origin)) list.push({ origin, name: name || hostOf(origin), addedAt: new Date().toISOString(), keywords: [] });
  await chrome.storage.local.set({ [LIST]: list });
  return origin;
}

export async function untrackSite(origin) {
  await chrome.storage.local.set({ [LIST]: (await trackedSites()).filter((s) => s.origin !== origin) });
}

export async function setKeywords(origin, keywords) {
  const list = await trackedSites();
  const s = list.find((x) => x.origin === origin);
  if (s) s.keywords = [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, 50);
  await chrome.storage.local.set({ [LIST]: list });
}

/** Tracked site that matches a URL (same host, ignoring www), if any. */
export async function trackedFor(url) {
  const h = hostOf(url);
  return (await trackedSites()).find((s) => hostOf(s.origin) === h) || null;
}

export async function addScorePoint(origin, scan) {
  const k = trendKey(origin);
  const pts = (await chrome.storage.local.get(k))[k] || [];
  const s = scan.scores;
  pts.push({ t: scan.page.scannedAt, overall: s.overall, seo: s.seo, aeo: s.aeo, geo: s.geo, potential: s.potential_after_top5 ?? null,
    pages: scan.pagesRated ?? null, failing: scan.results.filter((r) => r.ratio != null && r.ratio < 0.999).length });
  await chrome.storage.local.set({ [k]: pts.slice(-MAX_POINTS) });
}

export async function scoreHistory(origin) { return (await chrome.storage.local.get(trendKey(origin)))[trendKey(origin)] || []; }

/** Record each tracked site's position on a results page; the keyword is added to that site's list. */
export async function recordPositions(serp) {
  if (!serp?.query || !serp.organic?.length) return [];
  const q = serp.query.trim().toLowerCase(), t = serp.readAt || new Date().toISOString();
  const list = await trackedSites(), out = [];
  for (const s of list) {
    const hit = serp.organic.find((o) => hostOf(o.url) === hostOf(s.origin));
    const k = posKey(s.origin);
    const rows = (await chrome.storage.local.get(k))[k] || [];
    // One reading per keyword per hour is plenty; re-opening the panel shouldn't add duplicates.
    if (!rows.some((r) => r.q === q && Math.abs(new Date(r.t) - new Date(t)) < 3600e3)) {
      rows.push({ t, q, pos: hit ? hit.position : null, of: serp.organic.length, url: hit?.url || null,
        top: serp.organic.slice(0, 3).map((o) => hostOf(o.url)) });
      await chrome.storage.local.set({ [k]: rows.slice(-MAX_POINTS * 5) });
    }
    if (s.keywords.includes(q) || hit) await setKeywords(s.origin, [...s.keywords, q]);
    out.push({ origin: s.origin, name: s.name, pos: hit ? hit.position : null });
  }
  return out;
}

export async function positionHistory(origin) { return (await chrome.storage.local.get(posKey(origin)))[posKey(origin)] || []; }

export async function exportAll() {
  const all = await chrome.storage.local.get(null);
  const keep = Object.fromEntries(Object.entries(all).filter(([k]) => k === LIST || /^(trend|kwpos|scans|sitescans|baseline):/.test(k)));
  return JSON.stringify({ app: "seo-god-mode", version: chrome.runtime.getManifest().version, exportedAt: new Date().toISOString(), data: keep }, null, 1);
}

/** Merge an export into this device: tracked sites are unioned, histories merged by timestamp. */
export async function importAll(text) {
  const parsed = JSON.parse(text);
  if (parsed.app !== "seo-god-mode" || typeof parsed.data !== "object") throw new Error("That file isn't an SEO God Mode export.");
  const cur = await chrome.storage.local.get(Object.keys(parsed.data));
  const merged = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (!/^(tracked|trend:|kwpos:|scans:|sitescans:|baseline:)/.test(k)) continue;
    if (k === LIST) { const m = new Map((cur[k] || []).map((s) => [s.origin, s])); v.forEach((s) => m.set(s.origin, { ...s, ...(m.get(s.origin) || {}), keywords: [...new Set([...(m.get(s.origin)?.keywords || []), ...(s.keywords || [])])] })); merged[k] = [...m.values()]; }
    else if (Array.isArray(v)) { const m = new Map([...(cur[k] || []), ...v].map((x) => [x.t || x.id || JSON.stringify(x), x])); merged[k] = [...m.values()].sort((a, b) => String(a.t || a.id).localeCompare(String(b.t || b.id))); }
    else if (!(k in cur)) merged[k] = v;
  }
  await chrome.storage.local.set(merged);
  return Object.keys(merged).length;
}

// ---------------------------------------------------------------- charts (inline SVG, no libraries)

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const day = (t) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * Line chart. series: [{name, cls, points: [{t, v}]}]. invert = lower is better (rank positions).
 */
export function lineChart(series, { height = 150, min = 0, max = 100, invert = false, label = "" } = {}) {
  const pts = series.flatMap((s) => s.points);
  if (!pts.length) return `<p class="lede">No history yet.</p>`;
  const W = 380, H = height, L = 28, R = 8, T = 10, B = 22;
  const t0 = Math.min(...pts.map((p) => +new Date(p.t))), t1 = Math.max(...pts.map((p) => +new Date(p.t)));
  const x = (t) => (t1 === t0 ? L + (W - L - R) / 2 : L + ((+new Date(t) - t0) / (t1 - t0)) * (W - L - R));
  const y = (v) => { const k = (v - min) / (max - min || 1); return T + (invert ? k : 1 - k) * (H - T - B); };
  const grid = [0, 0.5, 1].map((k) => { const v = Math.round(min + k * (max - min)); return `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 4}" y="${y(v) + 3}" class="ax" text-anchor="end">${invert && v === 0 ? 1 : v}</text>`; }).join("");
  const lines = series.map((s) => {
    const p = s.points.filter((q) => q.v != null);
    if (!p.length) return "";
    const d = p.map((q, i) => `${i ? "L" : "M"}${x(q.t).toFixed(1)},${y(q.v).toFixed(1)}`).join(" ");
    return `<path d="${d}" class="ln ${s.cls}"/>${p.map((q) => `<circle cx="${x(q.t).toFixed(1)}" cy="${y(q.v).toFixed(1)}" r="${s.cls === "main" ? 3 : 2}" class="pt ${s.cls}"><title>${esc(s.name)}: ${q.v} (${day(q.t)})</title></circle>`).join("")}`;
  }).join("");
  const axis = `<text x="${L}" y="${H - 6}" class="ax">${day(t0)}</text><text x="${W - R}" y="${H - 6}" class="ax" text-anchor="end">${day(t1)}</text>`;
  const legend = series.length > 1 ? `<div class="legend">${series.map((s) => `<span class="${s.cls}"><i></i>${esc(s.name)}</span>`).join("")}</div>` : "";
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}${lines}${axis}</svg>${legend}`;
}
