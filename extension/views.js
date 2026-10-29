/**
 * The Compete, Track and Settings views of the side panel.
 *  Compete:  a home screen (where you rank, suggested keywords) and three tools, each opened on its own with a
 *            "‹ Compete" link back: why the pages on a Google results page outrank you, keyword ideas, and a
 *            Google Business Profile audit (Maps place page or the panel beside search results).
 *  Track:    websites you follow, their score history, keyword positions, hosting and tech; "Track new site" walks
 *            through adding one step by step.
 *  Settings: SEO God Mode on Google results, reminders, updates, and your data (export/import).
 */
import { readGoogle } from "./lib/google.js";
import { auditBusiness, detectTargets, DIRECTORIES, keywordIdeas, sameDomain, whyTheyRank } from "./lib/compete.js";
import { rateSite, siteOrigins } from "./lib/siterate.js";
import { history, saveScan } from "./lib/proof.js";
import { getSettings, overlayRegistered, runDaily, saveSettings, syncOverlay } from "./lib/daily.js";
import { techBlock, techProfile } from "./lib/tech.js";
import { breakdown, OFF_PAGE } from "./lib/breakdown.js";
import * as T from "./lib/track.js";
import * as K from "./lib/kwcheck.js";
import * as U from "./lib/update.js";
import { cloud } from "./lib/sync.js";
import { newCode } from "./lib/cloud.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const when = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const ago = (t) => { const m = Math.round((Date.now() - new Date(t)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const ALL_SITES = ["https://*/*", "http://*/*"];
const GOOGLE = ["https://www.google.com/*", "https://google.com/*", "https://maps.google.com/*"];
const v = { sub: null, google: null, rank: null, ideas: null, biz: null, kw: "", detail: null, detected: {}, wizard: null, focus: null, bd: {} };
let ui; // helpers passed in by sidepanel.js: toast, copy, notice, download, activeTab, setMode

const status = (n) => (n == null ? "" : n >= 85 ? "s-pass" : n >= 65 ? "s-part" : "s-fail");
const posCls = (p) => (!p ? "" : p <= 3 ? "s-pass" : p <= 10 ? "s-part" : "s-fail");
const okCls = (ok) => (ok === true ? "s-pass" : ok === false ? "s-fail" : "");
const busy = (on, label) => { document.body.classList.toggle("busy", on); const b = document.querySelector("#view .run"); if (b) { b.disabled = on; if (label) b.textContent = label; } };

async function access(origins, why) {
  if (await chrome.permissions.contains({ origins })) return true;
  if (await chrome.permissions.request({ origins })) return true;
  ui.notice(esc(why));
  return false;
}

/** The business Compete works for: one you own or manage, never a competitor. */
async function mySite() {
  const list = (await T.trackedSites()).filter(T.isOwned);
  const { mySite: picked } = await chrome.storage.local.get("mySite");
  return list.find((s) => s.origin === picked) || list[0] || null;
}

const siteSelect = async () => {
  const list = (await T.trackedSites()).filter(T.isOwned), me = await mySite();
  if (!list.length) return `<div class="field"><label for="mysite">Your website</label><div class="row2"><input id="mysite" class="search" placeholder="yourbusiness.com"><button id="savesite">Save</button></div></div>`;
  return `<div class="field"><label for="mysel">Working on</label><select id="mysel" class="search">${list.map((s) => `<option value="${esc(s.origin)}" ${s.origin === me?.origin ? "selected" : ""}>${esc(s.name)}${s.role === "client" ? " (client)" : ""}</option>`).join("")}</select></div>`;
};
function bindSite(rerender) {
  const sel = $("mysel");
  if (sel) sel.onchange = async () => { await chrome.storage.local.set({ mySite: sel.value }); rerender(); };
  const save = $("savesite");
  if (save) save.onclick = async () => { const val = $("mysite").value.trim(); if (!val) return; const o = await T.trackSite(val); await chrome.storage.local.set({ mySite: o }); ui.toast("Saved and tracking"); rerender(); };
}

/** Every search recorded for a site, newest reading per search: [{q, pos, prev, t, of}] best first. */
async function rankings(origin) {
  const rows = await T.positionHistory(origin), by = new Map();
  for (const r of rows) { const cur = by.get(r.q); by.set(r.q, { q: r.q, pos: r.pos, of: r.of, t: r.t, prev: cur ? cur.pos : undefined }); }
  return [...by.values()].sort((a, b) => (a.pos ?? 999) - (b.pos ?? 999) || new Date(b.t) - new Date(a.t));
}

// ====================================================================== COMPETE
const TOOLS = { rank: ["Why they rank", "Who ranks for a search, why, and what to change"], ideas: ["Keyword ideas", "How people search it and the questions to answer"], biz: ["Business profile", "Reviews, category, photos and hours on Google"] };

export async function renderCompete(helpers) {
  ui = helpers;
  const el = $("view");
  const tab = await ui.activeTab();
  const onGoogle = /^https:\/\/(www\.)?google\.[a-z.]+\/(search|maps)/.test(tab?.url || "");
  if (onGoogle && (!v.google || v.google.url !== tab.url) && (await chrome.permissions.contains({ origins: GOOGLE }))) {
    try { v.google = (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readGoogle }))[0].result; } catch { v.google = null; }
    if (v.google?.kind === "serp") { T.recordPositions(v.google); v.sub = v.focus ? "result" : "rank"; }
    if (v.google?.kind === "maps") v.sub = "biz";
  }
  // Leaving Google keeps the last search, so you can still open its results (for example after clicking through to #1).
  v.stale = !onGoogle && !!v.google;
  if (!v.sub || (v.sub === "result" && !v.focus)) v.sub = "home";
  if (v.sub === "home") return renderCompeteHome(onGoogle);
  if (v.sub === "result") return renderResult();
  el.innerHTML = `<nav class="crumb"><button class="back" data-sub="home">‹ Compete</button><span>${TOOLS[v.sub][0]}</span></nav><div id="sub"></div>`;
  bindSubs(el);
  if (v.sub === "rank") await renderRank(onGoogle, tab);
  else if (v.sub === "ideas") await renderIdeas();
  else await renderBiz(onGoogle, tab);
}
const bindSubs = (root) => root.querySelectorAll("[data-sub]").forEach((b) => (b.onclick = () => { v.sub = b.dataset.sub; if (v.sub !== "result") v.focus = null; renderCompete(ui); window.scrollTo(0, 0); }));

/** Open the full breakdown of one result (from a hover card's "See full breakdown" or a click in the results list). */
export function focusResult(url) { v.focus = url; v.sub = "result"; }

async function renderCompeteHome(onGoogle) {
  const el = $("view");
  const me = await mySite();
  const serp = v.google?.kind === "serp" ? v.google : null;
  const ranks = me ? await rankings(me.origin) : [];
  const rankRow = (r) => { const d = r.pos && r.prev ? r.prev - r.pos : null;
    return `<tr><td>${esc(r.q)}</td><td class="num ${posCls(r.pos)}">${r.pos ? "#" + r.pos : `<span class="muted">not top ${r.of || 10}</span>`}</td><td class="num ${d > 0 ? "up" : d < 0 ? "down" : ""}">${d ? (d > 0 ? "▲" : "▼") + Math.abs(d) : ""}</td><td class="muted">${ago(r.t)}</td><td><button class="linkish" data-search="${esc(r.q)}">Search</button></td></tr>`; };
  el.innerHTML = `<p class="lede">Choose a tool. Each one opens by itself; “‹ Compete” brings you back here.</p>
    ${await siteSelect()}
    <div class="tiles">${Object.entries(TOOLS).map(([id, [t, d]]) => `<button class="tile" data-sub="${id}"><b>${t}</b><small>${id === "rank" && serp ? `For “${esc(serp.query)}”, open in this tab` : d}</small></button>`).join("")}</div>
    ${me ? `<h2 class="sec">Where ${esc(me.name)} ranks <small>${ranks.length} search${ranks.length === 1 ? "" : "es"}</small></h2>
      ${ranks.length ? `<table class="mini ranks"><tr><th>Search</th><th>Now</th><th></th><th>Checked</th><th></th></tr>${ranks.slice(0, 8).map(rankRow).join("")}</table>
        ${ranks.length > 8 ? `<details class="fold"><summary>All ${ranks.length} searches</summary><table class="mini ranks">${ranks.slice(8).map(rankRow).join("")}</table></details>` : ""}`
        : `<p class="unknowns">No searches recorded yet. Search on Google (with SEO God Mode on in Settings) and each search you make records where ${esc(me.name)} ranks.</p>`}` : ""}
    ${await detectedBlock(me, "rank")}`;
  bindSubs(el); bindSite(() => renderCompete(ui)); bindDetected(me, () => v.sub === "home" && renderCompete(ui));
}

/** Keywords the site seems to target, detected from its own pages, minus the ones you already track or have searched. */
async function detectedBlock(me, mode) {
  if (!me) return `<p class="unknowns">Add your website to get keyword suggestions worked out from its pages.</p>`;
  const d = v.detected[me.origin];
  if (!d) return `<div id="detected" class="detected"><p class="lede">Reading ${esc(me.name)} to work out what it's trying to rank for…</p></div>`;
  if (!d.keywords?.length) return `<div class="detected"><p class="unknowns">Couldn't work out target keywords for ${esc(me.name)}${d.error ? ` (${esc(d.error)})` : ""}.</p></div>`;
  const have = new Set([...me.keywords, ...(await T.positionHistory(me.origin)).map((p) => p.q)].map((k) => k.toLowerCase()));
  const fresh = d.keywords.filter((k) => !have.has(k.keyword.toLowerCase()));
  const hidden = d.keywords.length - fresh.length;
  return `<div class="detected"><h2 class="sec">Suggested keywords <small>new to you</small></h2>
    ${fresh.length ? `<ul class="ideas">${fresh.map((k) => `<li><span title="${esc(k.why)}">${esc(k.keyword)}</span><span class="acts">
      ${mode === "ideas" ? `<button class="linkish" data-use="${esc(k.keyword)}">Ideas</button>` : `<button class="linkish" data-search="${esc(k.keyword)}">Search</button>`}
      <button class="linkish" data-trackkw="${esc(k.keyword)}">+ Track</button></span></li>`).join("")}</ul>` : `<p class="lede">You already track every keyword we found.</p>`}
    <p class="unknowns">From ${d.pagesRead} page${d.pagesRead === 1 ? "" : "s"} of ${esc(me.name)}: titles, headings and schema${d.places.length ? ` (${esc(d.places.join(", "))})` : ""}.${hidden ? ` ${hidden} you already track or have searched ${hidden === 1 ? "is" : "are"} left out.` : ""} No search volumes.</p></div>`;
}
function bindDetected(me, rerender) {
  const box = $("view");
  box.querySelectorAll("[data-use]").forEach((b) => (b.onclick = () => { $("kw").value = b.dataset.use; $("kwf").requestSubmit(); }));
  box.querySelectorAll("[data-search]").forEach((b) => (b.onclick = async () => { const tab = await ui.activeTab(); chrome.tabs.update(tab.id, { url: "https://www.google.com/search?q=" + encodeURIComponent(b.dataset.search) }); }));
  box.querySelectorAll("[data-trackkw]").forEach((b) => (b.onclick = async () => { await T.setKeywords(me.origin, [...me.keywords, b.dataset.trackkw]); me.keywords.push(b.dataset.trackkw); b.closest("li").remove(); ui.toast(`Tracking “${b.dataset.trackkw}”`); }));
  if (me && !v.detected[me.origin] && $("detected")) {
    v.detected[me.origin] = null;
    (async () => {
      if (!(await chrome.permissions.contains({ origins: siteOrigins(me.origin + "/") }))) { v.detected[me.origin] = { keywords: [], error: "no access to the site yet; rescan it once in Track" }; return rerender(); }
      v.detected[me.origin] = await detectTargets(me.origin).catch((e) => ({ keywords: [], error: e.message }));
      rerender();
    })();
  }
}

function searchBox(label, placeholder, value = "") {
  return `<form id="gsearch" class="field"><label for="gq">${label}</label><div class="row2"><input id="gq" class="search" placeholder="${esc(placeholder)}" value="${esc(value)}"><button class="primary">Search Google</button></div></form>`;
}
function bindSearch(prefix = "") {
  const f = $("gsearch");
  if (f) f.onsubmit = async (e) => { e.preventDefault(); const q = $("gq").value.trim(); if (!q) return;
    const tab = await ui.activeTab(); await chrome.tabs.update(tab.id, { url: (prefix || "https://www.google.com/search?q=") + encodeURIComponent(q) }); };
}

async function renderRank(onGoogle, tab) {
  const s = $("sub");
  const me = await mySite();
  const g = v.google;
  if (!g || g.kind !== "serp") {
    s.innerHTML = `<p class="lede">Search what you want to rank for. This then shows who ranks, why, and what to change. It reads the results page you open; it never searches on its own.</p>
      ${searchBox("What do you want to rank for?", "roof repair york pa", v.kw)}${await siteSelect()}
      ${onGoogle && !(await chrome.permissions.contains({ origins: GOOGLE })) ? `<button id="allowg" class="primary run">Allow reading Google results</button>` : ""}`;
    bindSearch(); bindSite(() => renderCompete(ui));
    const ag = $("allowg"); if (ag) ag.onclick = async () => { if (await access(GOOGLE, "Allow access to google.com so the extension can read the results you open.")) { v.google = null; renderCompete(ui); } };
    return;
  }
  v.kw = g.query;
  const pos = me ? g.organic.find((o) => sameDomain(o.url, me.origin)) : null;
  const r = v.rank?.query === g.query && v.rank?.site === me?.origin ? v.rank : null;
  s.innerHTML = `<div class="serphead"><div><span>${v.stale ? "Last search you opened" : "Search"}</span><b>${esc(g.query)}</b></div>
      <div class="pos ${pos ? posCls(pos.position) : me ? "s-fail" : ""}"><span>${me ? esc(me.name) : "Your site"}</span><b>${pos ? "#" + pos.position : me ? "Not in top " + g.organic.length : "–"}</b></div></div>
    ${g.blocked ? `<p class="notice">Google is showing a robot check. Solve it in the tab, then press Compare again.</p>` : ""}
    ${await siteSelect()}
    <p class="lede">Tap a result to see why it ranks there and what it does differently from the pages above it.</p>
    <ol class="serplist">${g.organic.slice(0, 10).map((o) => `<li class="${me && sameDomain(o.url, me.origin) ? "me" : DIRECTORIES.test(hostOf(o.url)) ? "dir" : ""}"><span>${o.position}</span><button class="rowbtn" data-focus="${esc(o.url)}"><b>${esc(o.title)}</b><small>${esc(hostOf(o.url))}${me && sameDomain(o.url, me.origin) ? " · you" : ""}${DIRECTORIES.test(hostOf(o.url)) ? " · directory" : ""} · why it ranks ›</small></button>${me && !sameDomain(o.url, me.origin) && !DIRECTORIES.test(hostOf(o.url)) ? `<button class="linkish addcomp" data-comp="${esc(new URL(o.url).origin)}" title="Track as a competitor of ${esc(me.name)}">+ Track</button>` : ""}</li>`).join("")}</ol>
    ${g.local?.length ? `<details class="fold"><summary>Map pack <small>${g.local.length}</small></summary><table class="mini"><tr><th>Business</th><th>Rating</th><th>Reviews</th></tr>${g.local.map((l) => `<tr><td>${esc(l.name)}</td><td>${l.rating ?? "–"}</td><td>${l.reviews ?? "–"}</td></tr>`).join("")}</table></details>` : ""}
    <div class="stack"><button id="cmp" class="primary run">${r ? "Compare again" : `Compare the top ${Math.min(8, g.organic.filter((o) => !DIRECTORIES.test(hostOf(o.url))).length)} pages with mine`}</button></div>
    <div id="rankout"></div>`;
  bindSite(() => renderCompete(ui));
  s.querySelectorAll("[data-focus]").forEach((b) => (b.onclick = () => { focusResult(b.dataset.focus); renderCompete(ui); window.scrollTo(0, 0); }));
  const tracked = new Set((await T.trackedSites()).map((x) => x.origin));
  s.querySelectorAll("[data-comp]").forEach((b) => {
    if (tracked.has(b.dataset.comp)) { b.textContent = "Tracked"; b.disabled = true; return; }
    b.onclick = async () => {
      await T.trackSite(b.dataset.comp, hostOf(b.dataset.comp), "competitor", me.origin);
      b.textContent = "Tracked"; b.disabled = true; ui.toast(`Tracking ${hostOf(b.dataset.comp)} as a competitor of ${me.name}; scanning it now`);
      rescan([b.dataset.comp], { quiet: true });
    };
  });
  $("cmp").onclick = async () => {
    if (!me) return ui.notice("Add your website first (the box above), so there's something to compare.");
    if (!(await access(ALL_SITES, "Comparing needs permission to read the ranking websites. Press Compare again and choose Allow."))) return;
    busy(true, "Reading the ranking pages…");
    try { v.rank = { ...(await whyTheyRank(g, me.origin + "/", { onProgress: (t) => busy(true, t) })), site: me.origin }; }
    catch (e) { ui.notice(esc(e.message || e)); }
    busy(false); renderRank(onGoogle, tab);
  };
  if (r) $("rankout").innerHTML = rankReport(r);
  $("rankout").querySelectorAll("[data-copy]").forEach((b) => (b.onclick = () => ui.copy(b.dataset.copy === "brief" ? briefPrompt(r) : rankPrompt(r), b.dataset.copy === "brief" ? "Brief copied" : "Fix prompt copied")));
}

/** Full breakdown of one result: same engine and numbers as the Google hover card. */
async function renderResult() {
  const el = $("view"), g = v.google?.kind === "serp" ? v.google : null;
  if (!g) { v.sub = "home"; v.focus = null; return renderCompete(ui); }
  const url = v.focus, hit = g.organic.find((o) => o.url === url) || g.organic.find((o) => sameDomain(o.url, url));
  const key = g.query + "|" + url;
  el.innerHTML = `<nav class="crumb"><button class="back" data-sub="rank">‹ Why they rank</button><span>${hit ? "#" + hit.position + " " : ""}${esc(hostOf(url))}</span></nav><div id="sub"></div>`;
  bindSubs(el);
  const s = $("sub");
  const b = v.bd[key];
  if (!b) {
    if (!(await chrome.permissions.contains({ origins: ALL_SITES }))) {
      s.innerHTML = `<p class="lede">The breakdown reads this page and the pages above it.</p><button id="allowall" class="primary run">Allow reading websites</button>`;
      $("allowall").onclick = async () => { if (await access(ALL_SITES, "The breakdown needs permission to read the ranking websites.")) renderResult(); };
      return;
    }
    s.innerHTML = `<p class="lede">Reading ${esc(hostOf(url))} and the pages ranking above it for “${esc(g.query)}”…</p>`;
    v.bd[key] = await breakdown(g, url).catch((e) => ({ error: String(e.message || e) }));
    if (v.focus === url && v.sub === "result" && document.body.dataset.mode === "compete") renderResult();
    return;
  }
  if (b.error) { s.innerHTML = `<p class="notice">Couldn't read ${esc(b.host || hostOf(url))}: ${esc(b.error)}.</p>`; return; }
  const me = await mySite();
  const tracked = await T.trackedFor(b.url);
  const scan = (await history(new URL(b.url).origin + "/", "site")).list[0];
  const vs = b.relation === "above" ? `the ${b.rivals.length === 1 ? "page" : b.rivals.length + " pages"} ranking above it` : "the next results";
  const diff = b.gaps.filter((x) => x.behind), other = b.gaps.filter((x) => !x.behind);
  if (!s.isConnected) return; // a newer redraw replaced this one while it was loading
  s.innerHTML = `<div class="bizhead"><div class="ring ${status(b.score)}"><b>${b.score}</b><span>on-page</span></div><div><b>${esc(b.host)}</b>
      <small>${b.position ? `#${b.position}` : "Not in the results"} for “${esc(g.query)}”</small><small>${esc(b.title.slice(0, 90))}</small>${b.tech?.line ? `<small>${esc(b.tech.line)}</small>` : ""}</div></div>
    ${b.verdict ? `<p class="verdict">${esc(b.verdict)}</p>` : ""}
    <p class="lede">On-page score ${b.score}/100 for this search, on the same yardstick as ${vs}: ${b.rivals.map((r, i) => `#${r.position} ${esc(r.host)} ${b.others?.[i] ?? "?"}`).join(", ") || "none readable"}. The hover card on Google shows the same numbers.</p>
    <div class="upd"><p>${scan ? `<b>Full site rating ${scan.scores.overall}/100</b> (SEO ${scan.scores.seo}, AEO ${scan.scores.aeo}, GEO ${scan.scores.geo}), scanned ${when(scan.page.scannedAt)}.` : "<b>No full site rating yet.</b> It crawls the site and runs all 39 checks."}</p>
      <div class="btns"><button id="ratesite">${scan ? "Rate the whole site again" : "Rate the whole site"}</button>${!tracked && me && !sameDomain(b.url, me.origin) ? `<button id="trackcomp">Track as competitor</button>` : ""}</div></div>
    <h2 class="sec">Why it ranks here</h2>
    ${b.why.length ? `<ul class="qs">${b.why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : `<p class="lede">Nothing on the page stands out against the others. ${OFF_PAGE}</p>`}
    ${diff.length || other.length ? `<h2 class="sec">${diff.length ? "What the pages above it do differently" : "To rank higher"} <small>most important first</small></h2>
      <div class="list">${(diff.length ? diff : other).slice(0, 8).map((x) => `<div class="factor"><span class="dot s-fail"></span><div><b>${esc(x.label)}</b><small>This page: ${esc(x.mine)} · ${b.relation === "above" ? "above it" : "others"}: ${esc(x.them.join(" / ") || "–")}</small><p>${esc(x.fix)}</p></div></div>`).join("")}</div>` : `<p class="lede">It matches the others on every on-page factor measured. ${OFF_PAGE}</p>`}
    <div class="btns stack"><button id="bdcopy" class="primary">Copy fix prompt</button></div>
    ${fold("Every factor side by side", b.rows.length, `<table class="mini"><tr><th>Factor</th><th>This</th>${b.rivals.map((r) => `<th title="${esc(r.host)}">#${r.position}</th>`).join("")}</tr>${b.rows.map((r) => `<tr class="${r.behind ? "bad" : ""}"><td>${esc(r.label)}</td><td class="num">${esc(r.mine)}</td>${r.them.map((t) => `<td>${esc(t)}</td>`).join("")}</tr>`).join("")}</table>`, true)}
    ${diff.length && other.length ? fold("Other improvements", other.length, `<div class="list">${other.map((x) => `<div class="factor"><span class="dot s-part"></span><div><b>${esc(x.label)}</b><p>${esc(x.fix)}</p></div></div>`).join("")}</div>`) : ""}
    <p class="unknowns">Not measured: ${b.notMeasured.map(esc).join("; ")}.</p>`;
  s.querySelector("#bdcopy").onclick = () => ui.copy(b.prompt, "Fix prompt copied");
  s.querySelector("#ratesite").onclick = () => rateWholeSite(b.url);
  const tc = s.querySelector("#trackcomp"); if (tc) tc.onclick = async () => { const o = await T.trackSite(b.url, "", "competitor", me.origin); tc.replaceWith(Object.assign(document.createElement("small"), { textContent: "Tracked" })); ui.toast(`Tracking ${hostOf(o)}; scanning it now`); rescan([o], { quiet: true }); };
}

/** Open the site in a new tab and run the whole-site rating there (access is asked while the click still counts). */
async function rateWholeSite(url) {
  const origin = new URL(url).origin;
  if (!(await chrome.permissions.request({ origins: siteOrigins(origin + "/") }))) return ui.notice("Rating the site needs access to it. Press the button again and choose Allow.");
  const tab = await chrome.tabs.create({ url: origin + "/", active: true });
  await new Promise((res) => { const l = (id, info) => { if (id === tab.id && info.status === "complete") { chrome.tabs.onUpdated.removeListener(l); res(); } }; chrome.tabs.onUpdated.addListener(l); setTimeout(res, 20000); });
  await ui.setMode("site");
  document.getElementById("scan").click();
}

const fold = (title, n, body, open = false) => body ? `<details class="fold" ${open ? "open" : ""}><summary>${title}${n != null ? ` <small>${n}</small>` : ""}</summary>${body}</details>` : "";

function rankReport(r) {
  const me = r.me;
  if (!me) return `<p class="notice">Couldn't read your page (${esc(r.myUrl)}). Check the address and that the site is up.</p>`;
  const qs = [...r.paa.map((q) => [q, "People also ask"]), ...r.rivalQuestions.map((q) => [q, "competitor heading"])].slice(0, 12);
  return `<h2 class="sec">Where they're ahead <small>${r.rivals.length} pages compared</small></h2>
    ${r.behind.length ? `<div class="list">${r.behind.map((f) => `<div class="factor"><span class="dot s-fail"></span><div><b>${esc(f.label)}</b><small>Top pages: ${esc(f.display[0])} · You: ${esc(f.display[1])}</small><p>${esc(f.fix)}</p></div></div>`).join("")}</div>` : `<p class="lede">You match or beat the top pages on every on-page factor measured. The gap is likely off-page (links, reviews, brand). See "Not measured".</p>`}
    <div class="btns stack"><button data-copy="fix" class="primary">Copy fix prompt</button><button data-copy="brief">Copy content brief</button></div>
    ${fold("Questions to answer", qs.length, qs.length ? `<ul class="qs">${qs.map(([q, src]) => `<li>${esc(q)} <small>${src}</small></li>`).join("")}</ul>` : "")}
    ${fold("Topics they cover, you don't", r.topicGaps.length, r.topicGaps.length ? `<div class="chips">${r.topicGaps.map((t) => `<span class="chip">${esc(t.topic)} <b>${t.rivals}</b></span>`).join("")}</div>` : "")}
    ${fold("Content brief", null, `<div class="brief"><p>Aim for about <b>${r.brief.targetWords ?? "?"}</b> words in <b>${r.brief.sections ?? "?"}</b> sections (the median of the top pages).</p>
      ${r.brief.outline.length ? `<p>Cover: ${r.brief.outline.map(esc).join(", ")}.</p>` : ""}${r.brief.schema.length ? `<p>Schema they use that you don't: ${r.brief.schema.map(esc).join(", ")}.</p>` : ""}</div>`)}
    ${fold("Every factor", r.rows.length, `<table class="mini"><tr><th>Factor</th><th>Top pages</th><th>You</th></tr>${r.rows.map((f) => `<tr class="${f.behind ? "bad" : ""}"><td>${esc(f.label)}</td><td>${esc(f.display[0])}</td><td>${esc(f.display[1])}</td></tr>`).join("")}</table>`)}
    ${fold("Top pages", r.rivals.length, `<table class="mini"><tr><th>#</th><th>Site</th><th>Words</th><th>Title</th></tr>${r.rivals.map((x) => `<tr><td>${x.position}</td><td>${esc(x.host)}</td><td>${x.words}</td><td>${esc(x.title.slice(0, 60))}</td></tr>`).join("")}
      <tr class="me"><td>${r.myPosition ?? "–"}</td><td>you</td><td>${me.words}</td><td>${esc(me.title.slice(0, 60))}</td></tr></table>`)}
    ${r.failed.length ? `<p class="unknowns">Couldn't read: ${r.failed.map(esc).join(", ")}.</p>` : ""}
    <p class="unknowns">Not measured: ${r.notMeasured.map(esc).join("; ")}.</p>`;
}

const RULES = `Rules: use only facts that are on the site or that I confirm, and write [CONFIRM: ...] for anything you'd have to guess. Don't copy competitors' text, photos, reviews or claims; use their coverage as a checklist and write original content. Keep the design. Verify the live page after deploying. Don't promise rankings.`;

function rankPrompt(r) {
  return `Help my page rank for "${r.query}". My page: ${r.myUrl} (currently ${r.myPosition ? "#" + r.myPosition : "not in the top " + (r.rivals.length + r.skipped.length)}).
I compared it with the ${r.rivals.length} pages ranking above it (SEO God Mode, ${new Date().toISOString().slice(0, 10)}). On-page factors where they're ahead (OBSERVED):
${r.behind.map((f, i) => `${i + 1}. ${f.label}: top pages ${f.display[0]}, mine ${f.display[1]}. ${f.fix}`).join("\n") || "- None on the page. " + OFF_PAGE}
${r.topicGaps.length ? `\nTopics the top pages cover that mine doesn't (only add what we really offer): ${r.topicGaps.map((t) => t.topic).join(", ")}.` : ""}
${r.paa.length || r.rivalQuestions.length ? `\nQuestions to answer as headings with a 40–60 word direct answer: ${[...r.paa, ...r.rivalQuestions].slice(0, 8).map((q) => `"${q}"`).join(", ")}.` : ""}
Target depth: about ${r.brief.targetWords ?? "?"} words in ${r.brief.sections ?? "?"} sections.${r.brief.schema.length ? ` Schema the top pages use: ${r.brief.schema.join(", ")} (add only where it matches visible content).` : ""}

${RULES}
Not measured here: ${r.notMeasured.join("; ")}. Tell me which of those to work on next.`;
}

function briefPrompt(r) {
  return `Content brief for "${r.query}" (from the top ${r.rivals.length} ranking pages, SEO God Mode)
Length: about ${r.brief.targetWords ?? "?"} words, ${r.brief.sections ?? "?"} H2 sections.
Title examples ranking now (don't copy): ${r.brief.titleIdeas.map((t) => `"${t}"`).join("; ")}
Sections to cover: ${r.brief.outline.join(", ") || "(none shared by 2+ pages)"}
Questions to answer: ${r.brief.questions.map((q) => `"${q}"`).join(", ") || "(none found)"}
Schema to consider: ${r.brief.schema.join(", ") || "none"}
Write it in our own words from our real services, prices and proof. ${RULES}`;
}

async function renderIdeas() {
  const s = $("sub");
  const me = await mySite();
  const g = v.google?.kind === "serp" ? v.google : null;
  const kw = v.kw || g?.query || "";
  const r = v.ideas;
  s.innerHTML = `<p class="lede">Type what you want to rank for. You get the ways people search it, questions to answer, and the changes your page needs.</p>
    <form id="kwf" class="field"><label for="kw">Keyword</label><input id="kw" class="search" placeholder="roof repair york pa" value="${esc(kw)}">
    <label for="kwpage">Your page for it</label><input id="kwpage" class="search" placeholder="https://yoursite.com/roof-repair/" value="${esc(r?.myUrl || (me ? me.origin + "/" : ""))}">
    <button class="primary run">Find keyword ideas</button></form>${r ? "" : await detectedBlock(me, "ideas")}<div id="ideasout"></div>`;
  bindDetected(me, () => v.sub === "ideas" && renderCompete(ui));
  $("kwf").onsubmit = async (e) => {
    e.preventDefault();
    const k = $("kw").value.trim(), page = $("kwpage").value.trim();
    if (!k) return;
    if (!(await access(ALL_SITES, "Keyword ideas need permission to ask Google autocomplete and read your page. Press the button again and choose Allow."))) return;
    v.kw = k; busy(true, "Finding ideas…");
    const extra = g && g.query.toLowerCase() === k.toLowerCase() ? [...g.paa.map((q) => ({ phrase: q, source: "People also ask" })), ...g.related.map((q) => ({ phrase: q, source: "related searches" }))] : [];
    try { v.ideas = await keywordIdeas(k, page ? (/^https?:/.test(page) ? page : "https://" + page) : "", { extra, onProgress: (t) => busy(true, t) }); }
    catch (err) { ui.notice(esc(err.message || err)); }
    busy(false); renderIdeas();
  };
  if (!r) return;
  // Leave out what you already track or have searched, so every idea is new.
  const have = new Set(me ? [...me.keywords, ...(await T.positionHistory(me.origin)).map((p) => p.q)].map((k) => k.toLowerCase()) : []);
  const ideas = r.ideas.filter((i) => !have.has(i.phrase.toLowerCase()));
  const hidden = r.ideas.length - ideas.length;
  const dot = (on) => `<i class="cov ${on == null ? "" : on ? "s-pass" : "s-fail"}"></i>`;
  const group = (kind, title) => { const xs = ideas.filter((i) => i.kind === kind); return xs.length ? fold(title, xs.length, `<ul class="ideas">${xs.slice(0, 15).map((i) =>
    `<li><a href="https://www.google.com/search?q=${encodeURIComponent(i.phrase)}" target="_blank" rel="noopener">${esc(i.phrase)}</a><span class="acts">${i.on ? `<span title="title / headings / body">${dot(i.on.title)}${dot(i.on.headings)}${dot(i.on.body)}</span>` : ""}${me ? `<button class="linkish" data-trackidea="${esc(i.phrase)}">+ Track</button>` : ""}</span></li>`).join("")}</ul>`, kind === "question") : ""; };
  $("ideasout").innerHTML = `${r.me ? "" : `<p class="notice">Couldn't read your page, so coverage isn't shown.</p>`}
    ${r.changes.length ? `<h2 class="sec">Changes for “${esc(r.keyword)}”</h2><div class="list">${r.changes.map((c) => `<div class="factor"><span class="dot s-part"></span><div><b>${esc(c.what)}</b><small>Now: ${esc(c.now)}</small><p>${esc(c.do)}</p></div></div>`).join("")}</div>` : r.me ? `<p class="lede">Your page already targets “${esc(r.keyword)}” well. Work on the questions below.</p>` : ""}
    <div class="btns stack"><button id="kwcopy" class="primary">Copy fix prompt</button>${me && !have.has(r.keyword.toLowerCase()) ? `<button id="kwtrack">Track “${esc(r.keyword)}”</button>` : ""}</div>
    ${group("question", "Questions people ask")}${group("buyer", "Buyer searches")}${group("comparison", "Comparisons")}${group("related", "Related")}
    <p class="unknowns">Dots: in your title, headings, body. Ideas come from Google autocomplete${r.sources.extra ? " and the results page" : ""}; they show what people type, not how often (no volumes).${hidden ? ` ${hidden} you already track or have searched ${hidden === 1 ? "is" : "are"} left out.` : ""}</p>`;
  $("kwcopy").onclick = () => ui.copy(ideasPrompt(r), "Fix prompt copied");
  const tk = $("kwtrack"); if (tk) tk.onclick = async () => { const site = await mySite(); await T.setKeywords(site.origin, [...site.keywords, r.keyword]); tk.remove(); ui.toast("Keyword tracked"); };
  $("ideasout").querySelectorAll("[data-trackidea]").forEach((b) => (b.onclick = async () => { const site = await mySite(); await T.setKeywords(site.origin, [...site.keywords, b.dataset.trackidea]); b.closest("li").remove(); ui.toast(`Tracking “${b.dataset.trackidea}”`); }));
}

function ideasPrompt(r) {
  const qs = r.ideas.filter((i) => i.kind === "question" && !i.on?.headings).slice(0, 8).map((i) => `"${i.phrase}"`);
  const buy = r.ideas.filter((i) => i.kind === "buyer" && !i.on?.body).slice(0, 8).map((i) => i.phrase);
  return `Optimize ${r.myUrl || "my page"} for "${r.keyword}" (SEO God Mode keyword ideas, ${new Date().toISOString().slice(0, 10)}).
${r.changes.length ? "Changes:\n" + r.changes.map((c, i) => `${i + 1}. ${c.what} (now: ${c.now}): ${c.do}`).join("\n") : "The basics already target this keyword."}
${qs.length ? `\nAdd these questions as H2/H3 headings with a 40–60 word direct answer each: ${qs.join(", ")}.` : ""}
${buy.length ? `\nBuyer searches not covered yet (cover only what's true for us): ${buy.join(", ")}.` : ""}
Use the keyword naturally; no stuffing. ${RULES}`;
}

async function renderBiz(onGoogle, tab) {
  const s = $("sub");
  const g = v.google;
  const me = await mySite();
  const b = g?.business || null;
  if (!b) {
    s.innerHTML = `<p class="lede">Open your business on Google Maps, or search its name on Google so the business panel shows on the right. Then this checks your reviews, category, description, photos, hours and more.</p>
      ${searchBox("Business name and town", "Summit Ridge Roofing York PA", me?.name || "")}
      ${onGoogle ? `<p class="notice">${await chrome.permissions.contains({ origins: GOOGLE }) ? "No business panel found on this page. Open the business itself on Maps, or search its exact name." : ""}</p>` : ""}
      ${onGoogle && !(await chrome.permissions.contains({ origins: GOOGLE })) ? `<button id="allowg" class="primary run">Allow reading Google</button>` : ""}`;
    bindSearch("https://www.google.com/maps/search/");
    const ag = $("allowg"); if (ag) ag.onclick = async () => { if (await access(GOOGLE, "Allow access to Google so the extension can read the business panel.")) { v.google = null; renderCompete(ui); } };
    return;
  }
  const a = auditBusiness(b, { keyword: v.kw || b.category || "", mySite: me?.origin || "", local: g.local || [] });
  v.biz = a;
  s.innerHTML = `<div class="bizhead"><div class="ring ${status(a.score)}"><b>${a.score ?? "?"}</b><span>profile</span></div><div><b>${esc(b.name)}</b>
      <small>${[b.category, b.rating != null ? `${b.rating}★` : "", b.reviews != null ? `${b.reviews} reviews` : ""].filter(Boolean).map(esc).join(" · ")}</small>
      <small>${a.measured} of ${a.total} things visible on this page</small></div></div>
    <div class="list">${a.checks.map((c) => `<div class="factor"><span class="dot ${okCls(c.ok)}"></span><div><b>${esc(c.label)}</b><small>${esc(c.detail)}</small>${c.ok === false ? `<p>${esc(c.fix)}</p>` : ""}</div></div>`).join("")}</div>
    <div class="btns stack"><button id="bizcopy" class="primary">Copy fix prompt</button></div>
    ${a.peers.length ? fold("Map pack on this search", a.peers.length, `<table class="mini"><tr><th>Business</th><th>Rating</th><th>Reviews</th></tr>${a.peers.map((l) => `<tr><td>${esc(l.name)}</td><td>${l.rating ?? "–"}</td><td>${l.reviews ?? "–"}</td></tr>`).join("")}</table>`) : ""}
    <p class="unknowns">Read from what Google shows on screen. Grey marks weren't visible here (for example the description sits on the About tab). Profile edits happen at business.google.com.</p>`;
  $("bizcopy").onclick = () => ui.copy(`Improve the Google Business Profile for ${b.name} (SEO God Mode audit, ${new Date().toISOString().slice(0, 10)}; score ${a.score}/100 from what's visible).
${a.checks.filter((c) => c.ok === false).map((c, i) => `${i + 1}. ${c.label}: ${c.detail}. ${c.fix}`).join("\n") || "Nothing failing among what was visible."}
${a.checks.filter((c) => c.ok == null).length ? `\nCouldn't see (check by hand): ${a.checks.filter((c) => c.ok == null).map((c) => c.label).join(", ")}.` : ""}
Write the profile description and posts for me to paste (I make the edits at business.google.com). Never invent reviews, awards, years or prices; use [CONFIRM: ...]. Keep the business name exactly as it is legally.`, "Fix prompt copied");
}

// ====================================================================== TRACK
const roleSelect = (id, role, owned, competitorOf) => `<div class="field"><label for="${id}">This site is</label>
  <select id="${id}" class="search">${Object.entries(T.ROLES).map(([k, l]) => `<option value="${k}" ${k === role ? "selected" : ""}>${l}</option>`).join("")}</select>
  <div class="field vs" ${role === "competitor" ? "" : "hidden"}><label for="${id}-of">Competitor of</label><select id="${id}-of" class="search">
  <option value="">(not linked)</option>${owned.map((o) => `<option value="${esc(o.origin)}" ${o.origin === competitorOf ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select></div></div>`;
const bindRole = (id) => { const sel = $(id); if (sel) sel.addEventListener("change", () => (sel.parentElement.querySelector(".vs").hidden = sel.value !== "competitor")); };

async function card(s, list) {
  const h = await T.scoreHistory(s.origin);
  const last = h[h.length - 1], prev = h[h.length - 2];
  const d = last && prev ? last.overall - prev.overall : null;
  const rivals = T.competitorsOf(s.origin, list).length;
  const of = s.competitorOf && list.find((x) => x.origin === s.competitorOf);
  return `<div class="tcard"><button class="topen" data-open="${esc(s.origin)}"><div class="thead"><div><b>${esc(s.name)}</b><small>${last ? "Scanned " + when(last.t) : "Not scanned yet"} · ${s.keywords.length} keyword${s.keywords.length === 1 ? "" : "s"}${rivals ? ` · ${rivals} competitor${rivals === 1 ? "" : "s"}` : ""}${of ? ` · vs ${esc(of.name)}` : ""}</small></div>
    <div class="tscore ${status(last?.overall)}">${last ? last.overall : "–"}${d ? `<i class="${d > 0 ? "up" : "down"}">${d > 0 ? "+" : ""}${d}</i>` : ""}</div></div>
    ${h.length > 1 ? T.lineChart([{ name: "Overall", cls: "main", points: h.map((p) => ({ t: p.t, v: p.overall })) }], { height: 54, label: s.name + " score history" }) : ""}</button>
    <button class="tdel" data-del="${esc(s.origin)}" data-name="${esc(s.name)}" title="Stop tracking ${esc(s.name)}" aria-label="Stop tracking ${esc(s.name)}">×</button></div>`;
}

export async function renderTrack(helpers) {
  ui = helpers;
  const el = $("view");
  const list = await T.trackedSites();
  if (v.wizard) return renderWizard();
  if (v.detail && list.some((s) => s.origin === v.detail)) return renderSiteDetail(v.detail);
  const groups = [["mine", "Your businesses"], ["client", "Clients you manage"], ["competitor", "Competitors"]];
  const sections = (await Promise.all(groups.map(async ([role, title]) => {
    const xs = list.filter((s) => s.role === role);
    return xs.length ? `<h2 class="sec">${title} <small>${xs.length}</small></h2><div class="tlist">${(await Promise.all(xs.map((s) => card(s, list)))).join("")}</div>` : "";
  }))).join("");
  const { phoneAdded = [] } = await chrome.storage.local.get("phoneAdded");
  const fromPhone = list.filter((s) => phoneAdded.includes(s.origin));
  el.innerHTML = `${fromPhone.length ? `<div class="upd"><p><b>Added on your phone:</b> ${fromPhone.map((s) => esc(s.name)).join(", ")}.</p><div class="btns"><button id="scanphone" class="primary run">Scan ${fromPhone.length === 1 ? "it" : `all ${fromPhone.length}`} now</button><button id="skipphone">Later</button></div></div>` : ""}<div class="trackhead"><p class="lede">Your businesses, the clients you manage, and their competitors. Each scan adds a point to the chart; each Google search records where they rank.</p>
      <button id="tracknew" class="primary">Track new site</button></div>
    ${list.length ? sections + `<div class="btns stack"><button id="rescanall" class="run">Rescan all ${list.length}</button></div>`
      : `<div class="emptybox"><b>Nothing tracked yet</b><p>Add your own site first, then its competitors. History, rankings and hosting details build up from there.</p></div>`}`;
  $("tracknew").onclick = () => startWizard();
  el.querySelectorAll("[data-open]").forEach((c) => (c.onclick = () => { v.detail = c.dataset.open; renderTrack(ui); }));
  el.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => confirmRemove(b.closest(".tcard"), b.dataset.del, b.dataset.name, () => renderTrack(ui))));
  const ra = $("rescanall"); if (ra) ra.onclick = () => rescan(list.map((s) => s.origin));
  const sp = $("scanphone"); if (sp) sp.onclick = async () => { await chrome.storage.local.set({ phoneAdded: [] }); rescan(fromPhone.map((s) => s.origin)); };
  const kp = $("skipphone"); if (kp) kp.onclick = async () => { await chrome.storage.local.set({ phoneAdded: [] }); renderTrack(ui); };
}

/** Redraw Track when the phone added or changed sites (only if nothing is being typed). */
export function trackChanged() { if (document.body.dataset.mode === "track" && !v.wizard && !v.editing && ui) v.detail ? renderSiteDetail(v.detail) : renderTrack(ui); }

// ---------------------------------------------------------------------- Track new: step by step
/** opts.role / opts.of fix those answers (for "Add competitor" on a business). back: where Cancel returns. */
function startWizard(opts = {}) {
  v.wizard = newWizard(opts);
  renderTrack(ui);
}
const newWizard = (opts) => ({ step: 0, url: opts.url || "", role: opts.role || null, of: opts.of ?? null, fixed: !!opts.role, kws: new Set(), detected: null, back: opts.back || null });

/** Header "Quick add": track the site in the current tab as a client, your own website or a competitor (asks whose). */
export async function quickAdd(role, helpers) {
  ui = helpers;
  const tab = await helpers.activeTab().catch(() => null);
  const url = /^https?:/i.test(tab?.url || "") ? new URL(tab.url).origin : "";
  v.detail = null;
  v.wizard = newWizard({ role, url });
  await helpers.setMode("track");
}
async function wizardSteps() {
  const w = v.wizard, owned = (await T.trackedSites()).filter(T.isOwned);
  return ["url", ...(w.fixed ? [] : ["role"]), ...(w.role === "competitor" && owned.length && !(w.fixed && w.of) ? ["of"] : []), ...(w.role && w.role !== "competitor" ? ["kw"] : [])];
}
async function renderWizard() {
  const el = $("view"), w = v.wizard;
  const steps = await wizardSteps(), step = steps[w.step] || "url";
  const last = w.step === steps.length - 1 && (step !== "role" || w.role === "competitor") && !(step === "role" && !w.role);
  const owned = (await T.trackedSites()).filter(T.isOwned);
  const head = `<nav class="crumb"><button class="back" id="wz-cancel">‹ ${w.back ? "Back to site" : "Track"}</button><span>Track new site</span></nav>
    <div class="steps" aria-label="Step ${w.step + 1} of ${steps.length}">${steps.map((_, i) => `<i class="${i < w.step ? "done" : i === w.step ? "on" : ""}"></i>`).join("")}</div>
    <p class="stepno">Step ${w.step + 1} of ${steps.length}</p>`;
  const opt = (attr, val, title, desc, on) => `<button class="tile ${on ? "on" : ""}" ${attr}="${esc(val)}" aria-pressed="${on}"><b>${title}</b><small>${desc}</small></button>`;
  let body = "";
  if (step === "url") body = `<h2 class="q">Which website?</h2><form id="wz-form" class="field"><label for="wz-url">Website address</label><input id="wz-url" class="search big" placeholder="example.com" value="${esc(w.url)}" autocomplete="off" autofocus></form>`;
  if (step === "role") body = `<h2 class="q">What is ${esc(hostOf(w.url))} to you?</h2><div class="tiles">
    ${opt("data-role", "mine", "My business", "A site you own. Compete and the charts work for it.", w.role === "mine")}
    ${opt("data-role", "client", "A client I manage", "You do its SEO. Same tools, listed under Clients.", w.role === "client")}
    ${opt("data-role", "competitor", "A competitor", "Compared side by side with one of your businesses.", w.role === "competitor")}</div>`;
  if (step === "of") body = `<h2 class="q">Whose competitor is it?</h2><div class="tiles">${owned.map((o) => opt("data-of", o.origin, esc(o.name), o.role === "client" ? "Client" : "Your business", w.of === o.origin)).join("")}
    ${opt("data-of", "", "Not linked", "Track it on its own.", w.of === "")}</div>`;
  if (step === "kw") {
    const d = w.detected;
    body = `<h2 class="q">Which searches should it rank for?</h2>
      ${d === null ? `<p class="lede" id="wz-reading">Reading ${esc(hostOf(w.url))} to suggest keywords…</p>` : d.keywords?.length
        ? `<p class="lede">Worked out from its titles, headings and schema. Tick the ones that matter.</p><div class="checks">${d.keywords.map((k) => `<label class="check"><input type="checkbox" data-kw="${esc(k.keyword)}" ${w.kws.has(k.keyword) ? "checked" : ""}><span>${esc(k.keyword)}</span></label>`).join("")}</div>`
        : `<p class="lede">Couldn't suggest any${d.error ? ` (${esc(d.error)})` : ""}. Type some below, or skip.</p>`}
      <div class="field"><label for="wz-kw">Add your own (comma separated)</label><input id="wz-kw" class="search" placeholder="roof repair york pa, metal roofing" value="${esc(w.typed || "")}"></div>`;
  }
  el.innerHTML = `${head}<div class="wizard">${body}</div>
    <div class="wznav">${w.step ? `<button id="wz-prev">Back</button>` : "<span></span>"}<button id="wz-next" class="primary run" ${step === "role" && !w.role || step === "of" && w.of == null ? "disabled" : ""}>${last ? "Track and scan" : "Next"}</button></div>`;
  $("wz-cancel").onclick = () => { const back = w.back; v.wizard = null; v.detail = back; renderTrack(ui); };
  const prev = $("wz-prev"); if (prev) prev.onclick = () => { w.step--; renderWizard(); };
  el.querySelectorAll("[data-role]").forEach((b) => (b.onclick = () => { w.role = b.dataset.role; if (w.role !== "competitor") w.of = null; renderWizard(); }));
  el.querySelectorAll("[data-of]").forEach((b) => (b.onclick = () => { w.of = b.dataset.of; renderWizard(); }));
  el.querySelectorAll("[data-kw]").forEach((c) => (c.onchange = () => c.checked ? w.kws.add(c.dataset.kw) : w.kws.delete(c.dataset.kw)));
  // Kept in the wizard's state, so suggestions arriving mid-typing (which redraws this step) don't erase it.
  const typedBox = $("wz-kw"); if (typedBox) { typedBox.oninput = () => (w.typed = typedBox.value); if (document.activeElement === document.body && w.typed) typedBox.focus(); }
  const form = $("wz-form"); if (form) form.onsubmit = (e) => { e.preventDefault(); $("wz-next").click(); };
  if (step === "kw" && d0()) detectForWizard();
  $("wz-next").onclick = async () => {
    if (step === "url") {
      const raw = $("wz-url").value.trim();
      let o; try { o = new URL(/^https?:/i.test(raw) ? raw : "https://" + raw); if (!o.hostname.includes(".")) throw 0; } catch { return ui.notice("That doesn't look like a website address. Try something like example.com."); }
      const exists = (await T.trackedSites()).find((s) => s.origin === o.origin);
      if (exists) { ui.notice(`${esc(exists.name)} is already tracked. Opening it.`); v.wizard = null; v.detail = exists.origin; return renderTrack(ui); }
      w.url = o.origin; ui.notice("");
    }
    // Ask for access to the site while the click still counts, so the scan and keyword suggestions can read it.
    if (step === "role" && w.role !== "competitor") await chrome.permissions.request({ origins: siteOrigins(w.url + "/") }).catch(() => false);
    if (!last) { w.step++; return renderWizard(); }
    await chrome.permissions.request({ origins: siteOrigins(w.url + "/") }).catch(() => false);
    await finishWizard();
  };
}
const d0 = () => v.wizard?.detected === null && !v.wizard.reading;
async function detectForWizard() {
  const w = v.wizard; w.reading = true;
  if (!(await chrome.permissions.contains({ origins: siteOrigins(w.url + "/") }))) w.detected = { keywords: [], error: "no access to the site" };
  else w.detected = await detectTargets(w.url).catch((e) => ({ keywords: [], error: e.message }));
  // Pre-tick the three strongest phrases; single words are too vague to track by default.
  w.detected.keywords?.filter((k) => k.keyword.includes(" ")).slice(0, 3).forEach((k) => w.kws.add(k.keyword));
  w.reading = false;
  if (v.wizard === w && document.body.dataset.mode === "track") renderWizard();
}
async function finishWizard() {
  const w = v.wizard;
  const typed = ($("wz-kw")?.value ?? w.typed ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const o = await T.trackSite(w.url, "", w.role, w.role === "competitor" ? w.of || null : null);
  await T.setRole(o, w.role, w.role === "competitor" ? w.of || null : null);
  const site = (await T.trackedSites()).find((s) => s.origin === o);
  if (w.kws.size || typed.length) await T.setKeywords(o, [...site.keywords, ...w.kws, ...typed]);
  if (w.role !== "competitor" && !(await chrome.storage.local.get("mySite")).mySite) await chrome.storage.local.set({ mySite: o });
  v.wizard = null; v.detail = w.back;
  ui.toast(`Tracking ${hostOf(o)} as ${T.ROLES[w.role].toLowerCase()}; scanning it now`);
  await renderTrack(ui);
  rescan([o]);
}

/** Rescan tracked sites. quiet: run in the background without redrawing the view (used right after adding a site elsewhere). */
async function rescan(origins, { quiet = false } = {}) {
  if (!(await access(origins.flatMap((o) => siteOrigins(o + "/")), "Scanning needs access to these sites. Press the button again and choose Allow."))) return;
  const show = (on, t) => !quiet && busy(on, t);
  for (const [i, o] of origins.entries()) {
    show(true, `Scanning ${hostOf(o)} (${i + 1}/${origins.length})…`);
    try {
      const { psiKey = "" } = await chrome.storage.local.get("psiKey");
      const r = await rateSite(o + "/", { psiKey, onProgress: (t) => show(true, `${hostOf(o)}: ${t}`) });
      const page = { url: r.site, origin: new URL(r.site).origin, platform: "Unknown", scannedAt: new Date().toISOString(), jsonld: [], pageless: true };
      const scan = await saveScan({ mode: "site", page, site: null, scores: r.scores, results: r.checks, priority: r.priority, kits: r.kits, unknown: r.unknown,
        pagesRated: r.pages_rated, hitLimit: r.hit_page_limit, rubricVersion: r.rubric_version, pages: r.pages });
      await T.addScorePoint(o, scan);
    } catch (e) { ui.notice(`${esc(hostOf(o))}: ${esc(e.message || e)}`); }
  }
  if (quiet) return ui.toast(`Scanned ${origins.map(hostOf).join(", ")}`);
  busy(false); ui.toast("Rescan done");
  if (document.body.dataset.mode === "track" && !v.wizard && !v.editing) v.detail ? renderSiteDetail(v.detail) : renderTrack(ui);
}

/** Latest full whole-site scan saved for an origin (from a Site scan or a Track rescan). */
const latestScan = async (origin) => (await history(origin + "/", "site")).list[0] || null;

/** A business next to its competitors: scores, history, keyword positions, and the checks where they're ahead. */
async function compareBlock(s, list) {
  const rivals = T.competitorsOf(s.origin, list);
  const all = [s, ...rivals];
  const hist = await Promise.all(all.map((x) => T.scoreHistory(x.origin)));
  const scans = await Promise.all(all.map((x) => latestScan(x.origin)));
  const pos = await Promise.all(all.map((x) => T.positionHistory(x.origin)));
  const last = (h) => h[h.length - 1];
  const rows = all.map((x, i) => ({ x, p: last(hist[i]) })).sort((a, b) => (b.p?.overall ?? -1) - (a.p?.overall ?? -1));
  const cell = (n, mine) => `<td class="${n == null || mine == null ? "" : n > mine ? "down" : ""}">${n ?? "–"}</td>`;
  const me = last(hist[0]);
  const cls = ["main", "k1", "k2", "k3", "k4"];
  const chart = T.lineChart(all.slice(0, 5).map((x, i) => ({ name: x.name, cls: cls[i], points: hist[i].map((p) => ({ t: p.t, v: p.overall })) })), { label: "Overall score: you and competitors" });
  const kws = [...new Set([...s.keywords, ...pos[0].map((p) => p.q)])].slice(0, 15);
  const posOf = (i, q) => { const r = [...pos[i]].reverse().find((p) => p.q === q); return r ? (r.pos ? "#" + r.pos : "–") : "?"; };
  // Check-level gaps from the latest full scans: where a competitor scores 20+ points higher on a check.
  const mine = scans[0] ? Object.fromEntries(scans[0].results.map((r) => [r.id, r])) : {};
  const gaps = [];
  scans.slice(1).forEach((sc, i) => sc && sc.results.forEach((r) => { const m = mine[r.id];
    if (m && r.ratio != null && m.ratio != null && r.ratio - m.ratio >= 0.2) gaps.push({ id: r.id, name: r.name, who: rivals[i].name, them: r.ratio, you: m.ratio, gain: m.gain || 0, tip: m.tip }); }));
  const byCheck = Object.values(gaps.reduce((a, g) => { (a[g.id] ||= { ...g, who: [] }).who.push(g.who); return a; }, {})).sort((a, b) => b.who.length - a.who.length || b.gain - a.gain);
  v.cmp = { s, rivals, byCheck, me };
  const theirs = rows.filter(({ x }) => x.origin !== s.origin).map(({ p }) => p?.overall).filter((n) => n != null);
  const ahead = me?.overall != null && theirs.length && theirs.every((n) => n <= me.overall);
  return `<h2 class="sec">You vs competitors <small>${rivals.length}</small></h2>
    ${ahead ? `<p class="verdict">${esc(s.name)} scores ${me.overall}, at or above every tracked competitor (best of theirs ${Math.max(...theirs)}). ${OFF_PAGE}</p>` : ""}
    ${rivals.length ? `<table class="mini"><tr><th>Site</th><th>Overall</th><th>SEO</th><th>AEO</th><th>GEO</th></tr>${rows.map(({ x, p }) => `<tr class="${x.origin === s.origin ? "me" : ""}"><td>${esc(x.name)}</td>${x.origin === s.origin ? `<td>${p?.overall ?? "–"}</td><td>${p?.seo ?? "–"}</td><td>${p?.aeo ?? "–"}</td><td>${p?.geo ?? "–"}</td>` : cell(p?.overall, me?.overall) + cell(p?.seo, me?.seo) + cell(p?.aeo, me?.aeo) + cell(p?.geo, me?.geo)}</tr>`).join("")}</table>
      ${hist.some((h) => h.length) ? chart : ""}
      ${byCheck.length ? `<h2 class="sec">Where they're ahead</h2><div class="list">${byCheck.slice(0, 10).map((g) => `<div class="factor"><span class="dot s-fail"></span><div><b>${esc(g.name)}</b><small>${esc(g.who.join(", "))} ${g.who.length === 1 ? "beats" : "beat"} you here${g.gain ? ` · +${g.gain} pts for you` : ""}</small>${g.tip ? `<p>${esc(g.tip)}</p>` : ""}</div></div>`).join("")}</div>
        <div class="btns stack"><button id="cmpcopy" class="primary">Copy fix prompt</button></div>` : scans.slice(1).some(Boolean) ? `<p class="lede">No check where a competitor is clearly ahead. Compare search positions below and use Compete for single searches.</p>` : `<p class="lede">Rescan to compare check by check.</p>`}
      ${kws.length ? fold("Search positions side by side", kws.length, `<table class="mini"><tr><th>Keyword</th>${all.map((x) => `<th>${esc(x.name.slice(0, 14))}</th>`).join("")}</tr>${kws.map((q) => `<tr><td>${esc(q)}</td>${all.map((_, i) => `<td>${posOf(i, q)}</td>`).join("")}</tr>`).join("")}</table>`) : ""}
      <div class="btns stack"><button id="rescangroup" class="run">Rescan ${esc(s.name)} and ${rivals.length} competitor${rivals.length === 1 ? "" : "s"}</button></div>`
    : `<p class="lede">No competitors linked yet. Add one, or use “+ Track” on a Google results page in Compete.</p>`}
    <div class="btns"><button id="addcomp">Add a competitor</button></div>`;
}

function comparePrompt(c) {
  return `Help ${c.s.name} (${c.s.origin}) catch up with its competitors: ${c.rivals.map((r) => `${r.name} (${r.origin})`).join(", ")}.
Latest SEO God Mode whole-site scores: ${c.s.name} ${c.me?.overall ?? "?"}/100. Checks where competitors score clearly higher (OBSERVED):
${c.byCheck.map((g, i) => `${i + 1}. ${g.name}: ${g.who.join(", ")} ahead; worth about +${g.gain} pts. ${g.tip || ""}`).join("\n")}
Once these are done, the website side is as strong as theirs; the next biggest wins are more Google reviews, a stronger Google Business Profile and links from other websites.
Learn from what they do, but write our own content from our real facts; never copy their text, photos, reviews or claims. Use [CONFIRM: ...] for anything you'd have to guess. Verify the live site after each change.`;
}

async function renderSiteDetail(origin) {
  const el = $("view");
  const list = await T.trackedSites();
  const s = list.find((x) => x.origin === origin);
  const owned = list.filter((x) => T.isOwned(x) && x.origin !== origin);
  const h = await T.scoreHistory(origin), pos = await T.positionHistory(origin);
  const ranks = await rankings(origin);
  const kws = [...new Set([...ranks.map((r) => r.q), ...s.keywords])];
  const byQ = Object.fromEntries(ranks.map((r) => [r.q, r]));
  const maxPos = Math.max(10, ...pos.map((p) => p.pos || 0));
  const topK = ranks.filter((r) => r.pos).slice(0, 5).map((r) => r.q);
  const cls = ["main", "k1", "k2", "k3", "k4"];
  const of = s.competitorOf && list.find((x) => x.origin === s.competitorOf);
  const lastScan = h[h.length - 1];
  el.innerHTML = `<nav class="crumb"><button class="back" id="back">‹ Track</button><span>${esc(s.name)}</span></nav>
    <div class="hero"><div><b>${esc(s.name)}</b><small>${esc(T.ROLES[s.role])}${of ? ` of <button class="linkish" id="goof">${esc(of.name)}</button>` : ""} · since ${when(s.addedAt)}</small>
      <small><a href="${esc(origin)}/" target="_blank" rel="noopener">${esc(hostOf(origin))}</a></small></div>
      <div class="bignum ${status(lastScan?.overall)}"><b>${lastScan?.overall ?? "–"}</b><span>${lastScan ? "overall, " + ago(lastScan.t) : "not scanned"}</span></div></div>
    <div class="btns"><button id="rescan1" class="primary run">Rescan now</button><button id="opensite">Open site</button><button id="editbtn">Edit</button><button id="removesite" class="danger">Stop tracking</button></div>
    <div id="removebox"></div>
    <div id="editbox" ${v.editing === origin ? "" : "hidden"}><div class="field"><label for="rename">Name</label><input id="rename" class="search" value="${esc(s.name)}"></div>
      ${roleSelect("editrole", s.role, owned, s.competitorOf)}<div class="btns"><button id="saverole" class="primary">Save</button></div></div>
    <h2 class="sec">Score history <small>${h.length} scan${h.length === 1 ? "" : "s"}</small></h2>
    ${T.lineChart([{ name: "Overall", cls: "main", points: h.map((p) => ({ t: p.t, v: p.overall })) }, { name: "SEO", cls: "k1", points: h.map((p) => ({ t: p.t, v: p.seo })) },
      { name: "AEO", cls: "k2", points: h.map((p) => ({ t: p.t, v: p.aeo })) }, { name: "GEO", cls: "k3", points: h.map((p) => ({ t: p.t, v: p.geo })) }], { label: "Score history" })}
    <h2 class="sec">What it ranks for <small>lower is better</small></h2>
    ${topK.length ? T.lineChart(topK.map((q, i) => ({ name: q, cls: cls[i], points: pos.filter((p) => p.q === q).map((p) => ({ t: p.t, v: p.pos })) })), { min: 1, max: maxPos, invert: true, label: "Keyword positions" }) : ""}
    ${kws.length ? `<div class="btns"><button id="checkall" class="primary">Check ${kws.length > 1 ? `all ${Math.min(kws.length, CHECK_MAX)} keywords` : "this keyword"} on Google</button></div><p id="kwstatus" class="lede" hidden></p>` : ""}
    ${kws.length ? `<table class="mini ranks"><tr><th>Search</th><th>Now</th><th></th><th></th><th></th></tr>${kws.map((q) => { const r = byQ[q]; const d = r?.pos && r?.prev ? r.prev - r.pos : null;
      return `<tr><td>${esc(q)}</td><td class="num ${posCls(r?.pos)}">${r ? (r.pos ? "#" + r.pos : "–") : "?"}</td><td class="num ${d > 0 ? "up" : d < 0 ? "down" : ""}">${d ? (d > 0 ? "▲" : "▼") + Math.abs(d) : ""}</td><td><button class="linkish" data-checkkw="${esc(q)}" title="Search “${esc(q)}” on Google now and update the position">Check</button></td><td><button class="kwdel" data-delkw="${esc(q)}" title="Stop tracking “${esc(q)}”" aria-label="Stop tracking ${esc(q)}">×</button></td></tr>`; }).join("")}</table>`
      : `<p class="lede">No searches yet. Search one on Google, or add keywords below.</p>`}
    <form id="kwadd" class="field"><label for="kwnew">Add keywords (comma separated)</label><div class="row2"><input id="kwnew" class="search" placeholder="roof repair york pa, metal roofing"><button>Add</button></div></form>
    <p class="unknowns">“?” not checked yet, “–” not in the results shown. Check searches Google in a background tab, one keyword every few seconds, only when you press it. Searching on Google yourself updates positions too. Results vary by location.</p>
    ${await kwReportBlock(origin)}
    <h2 class="sec">Hosting and tech</h2><div id="techout"><p class="lede">Looking it up…</p></div>
    ${T.isOwned(s) ? await compareBlock(s, list) : ""}
    ${h.length ? fold("All scans", h.length, `<table class="mini"><tr><th>Date</th><th>Overall</th><th>SEO</th><th>AEO</th><th>GEO</th><th>Pages</th></tr>${[...h].reverse().slice(0, 30).map((p) => `<tr><td>${when(p.t)}</td><td>${p.overall}</td><td>${p.seo}</td><td>${p.aeo}</td><td>${p.geo}</td><td>${p.pages ?? ""}</td></tr>`).join("")}</table>`) : ""}`;
  bindRole("editrole");
  $("back").onclick = () => { v.detail = null; renderTrack(ui); };
  // Remembered, so a scan finishing in the background (which redraws this page) doesn't close it.
  $("editbtn").onclick = () => { v.editing = v.editing === origin ? null : origin; $("editbox").hidden = v.editing !== origin; };
  const go = $("goof"); if (go) go.onclick = () => { v.detail = of.origin; renderSiteDetail(of.origin); };
  $("saverole").onclick = async () => { const role = $("editrole").value;
    await T.renameSite(origin, $("rename").value); await T.setRole(origin, role, role === "competitor" ? $("editrole-of").value || null : null); v.editing = null; ui.toast("Saved"); renderSiteDetail(origin); };
  $("rescan1").onclick = () => rescan([origin]);
  const rg = $("rescangroup"); if (rg) rg.onclick = () => rescan([origin, ...T.competitorsOf(origin, list).map((r) => r.origin)]);
  const cc = $("cmpcopy"); if (cc) cc.onclick = () => ui.copy(comparePrompt(v.cmp), "Fix prompt copied");
  const ac = $("addcomp"); if (ac) ac.onclick = () => startWizard({ role: "competitor", of: origin, back: origin });
  $("opensite").onclick = () => chrome.tabs.create({ url: origin + "/" });
  $("kwadd").onsubmit = async (e) => { e.preventDefault(); await T.setKeywords(origin, [...s.keywords, ...$("kwnew").value.split(",")]); renderSiteDetail(origin); };
  $("removesite").onclick = () => confirmRemove($("removebox"), origin, s.name, () => { v.detail = null; renderTrack(ui); });
  const ca = $("checkall"); if (ca) ca.onclick = () => checkKeywords(origin, kws.slice(0, CHECK_MAX));
  el.querySelectorAll("[data-checkkw]").forEach((b) => (b.onclick = () => checkKeywords(origin, [b.dataset.checkkw])));
  el.querySelectorAll("[data-checknew]").forEach((b) => (b.onclick = async () => { const q = b.dataset.checknew; await T.setKeywords(origin, [...s.keywords, q]); checkKeywords(origin, [q]); }));
  el.querySelectorAll("[data-trackkw]").forEach((b) => (b.onclick = async () => { await T.setKeywords(origin, [...s.keywords, b.dataset.trackkw]); ui.toast(`Tracking “${b.dataset.trackkw}”`); renderSiteDetail(origin); }));
  const kp = $("kwprompt"); if (kp) kp.onclick = async () => ui.copy(K.keywordPrompt(origin, await K.getReport(origin)), "Fix prompt copied");
  el.querySelectorAll("[data-delkw]").forEach((b) => (b.onclick = async () => { await T.removeKeyword(origin, b.dataset.delkw); ui.toast(`Stopped tracking “${b.dataset.delkw}”`); renderSiteDetail(origin); }));
  showTech($("techout"), origin);
}

const CHECK_MAX = 15;

/**
 * Press Check: search the keywords on Google (background tab), record the positions, then compare the pages for the
 * keywords not in the top 3 and suggest new ones. Asks for Google (to search) and other sites (to compare) in one go.
 */
async function checkKeywords(origin, qs) {
  if (v.checking) return;
  const want = [...GOOGLE, "https://*/*", "http://*/*"];
  if (!(await chrome.permissions.contains({ origins: want }))) await chrome.permissions.request({ origins: want }).catch(() => false);
  if (!(await chrome.permissions.contains({ origins: GOOGLE }))) return ui.notice("Checking needs access to google.com to read the results. Press Check again and choose Allow.");
  const canRead = await chrome.permissions.contains({ origins: ["https://*/*", "http://*/*"] });
  v.checking = true;
  const say = (t) => { const st = $("kwstatus"); if (st) { st.hidden = false; st.textContent = t; } };
  document.querySelectorAll("#checkall, [data-checkkw], [data-checknew]").forEach((b) => (b.disabled = true));
  document.body.classList.add("busy");
  try {
    const { results, blocked } = await K.searchKeywords(qs, { origin, onProgress: say });
    if (results.some((r) => !r.error)) await K.buildReport(origin, results, { canRead, onProgress: say });
    if (blocked) ui.notice("Google is showing a robot check in the tab that just opened. Solve it there, then press Check again.");
    const done = results.filter((r) => !r.error);
    ui.toast(done.length === 1 ? `“${done[0].q}”: ${done[0].pos ? "#" + done[0].pos : "not in the top " + done[0].of}` : `Checked ${done.length} keyword${done.length === 1 ? "" : "s"}`);
  } catch (e) { ui.notice(esc(e.message || e)); }
  finally {
    v.checking = false; document.body.classList.remove("busy");
    if (document.body.dataset.mode === "track" && v.detail === origin && !v.editing) renderSiteDetail(origin);
  }
}

/** The saved keyword report: where the site is top 3 and where it isn't, why, a fix prompt, and new keywords to try. */
async function kwReportBlock(origin) {
  const r = await K.getReport(origin);
  if (!r?.rows.length) return "";
  const by = { top: [], close: [], behind: [] };
  r.rows.forEach((x) => by[K.group(x.pos)].push(x));
  const sortPos = (a, b) => (a.pos ?? 99) - (b.pos ?? 99);
  const tops = (x) => x.top.map((t) => `#${t.position} ${esc(t.host)}`).join(", ");
  const weak = [...by.close, ...by.behind].sort(sortPos);
  const cls = { close: "s-part", behind: "s-fail" };
  return `<h2 class="sec">Keyword report <small>checked ${esc(when(r.t))}</small></h2>
    <div class="kwsum"><span class="s-pass"><b>${by.top.length}</b> top 3</span><span class="s-part"><b>${by.close.length}</b> page 1</span><span class="s-fail"><b>${by.behind.length}</b> not on page 1</span></div>
    ${by.top.length ? `<p class="lede"><b>Ranking well:</b> ${by.top.sort(sortPos).map((x) => `“${esc(x.q)}” #${x.pos}`).join(", ")}.</p>` : ""}
    ${weak.length ? `<div class="list">${weak.map((x) => `<div class="factor"><span class="dot ${cls[K.group(x.pos)]}"></span><div>
      <b>${esc(x.q)} · ${x.pos ? "#" + x.pos : "not in the top " + (x.of || 10)}</b>
      <small>Top: ${tops(x)}${x.score != null ? ` · on-page ${x.score} vs ${(x.others || []).join(", ") || "–"}` : ""}</small>
      ${x.verdict ? `<p>${esc(x.verdict)}</p>` : ""}
      ${x.gaps?.length ? `<ul class="kwgaps">${x.gaps.map((g) => `<li><b>${esc(g.label)}</b> (you ${esc(g.mine)}, them ${esc(g.them.join(" / ") || "–")}): ${esc(g.fix)}</li>`).join("")}</ul>`
        : x.error ? `<p>Couldn't compare the pages (${esc(x.error)}).</p>` : x.score == null ? `<p>Allow reading other websites (press Check again and choose Allow) to see what the top pages do differently.</p>` : ""}
    </div></div>`).join("")}</div>` : `<p class="lede">Every checked keyword is in the top 3.</p>`}
    <div class="btns stack"><button id="kwprompt" class="primary">Copy fix prompt</button></div>
    ${r.ideas.length ? `<h2 class="sec">New keywords to try <small>from Google's questions and related searches</small></h2>
      <ul class="ideas">${r.ideas.map((x) => `<li><span>${esc(x.q)} <small>${x.kind === "question" ? "question" : "related"}</small></span><span class="acts">
        <button class="linkish" data-checknew="${esc(x.q)}">Check</button><button class="linkish" data-trackkw="${esc(x.q)}">+ Track</button></span></li>`).join("")}</ul>` : ""}`;
}

/** Hosting and tech for a site, into el. Asks for access only when the user presses the button. */
export async function showTech(el, origin) {
  if (!el) return;
  if (!(await chrome.permissions.contains({ origins: siteOrigins(origin + "/") }))) {
    el.innerHTML = `<button id="techgo">Look up hosting and tech</button>`;
    el.querySelector("#techgo").onclick = async () => { if (await chrome.permissions.request({ origins: siteOrigins(origin + "/") })) showTech(el, origin); };
    return;
  }
  const t = await techProfile(origin + "/");
  if (!el.isConnected) return;
  el.innerHTML = techBlock(t, esc) + `<p class="unknowns">From the homepage's headers and code, and public DNS records (looked up at dns.google). “Probably” is inferred.</p>`;
}

// ====================================================================== SETTINGS (On Google, reminders, updates, data)
export async function renderGoogle(helpers) {
  ui = helpers;
  const el = $("view");
  const s = await getSettings();
  const registered = await overlayRegistered();
  const notifyOk = await chrome.permissions.contains({ permissions: ["notifications"] });
  const tog = (id, on, title, desc, disabled = false) => `<label class="settog"><span><b>${title}</b><small>${desc}</small></span><input type="checkbox" role="switch" id="${id}" ${on ? "checked" : ""} ${disabled ? "disabled" : ""}></label>`;
  el.innerHTML = `<h2 class="sec first">On Google</h2>
    <p class="lede">Search anything and each result gets a hover card: a quick rating, the keywords that page targets, why it shows up, and its hosting. Your businesses, clients and competitors are labelled with their position.</p>
    <div class="settings">
      ${tog("s-overlay", s.overlay && registered, "Show on Google results", "Labels, hover cards and a button that opens the full comparison. Needs access to google.com and the sites you hover.")}
      ${tog("s-hover", s.hover, "Hover cards", "Quick rating, keywords, why it shows, hosting and gaps for the result under your mouse.", !s.overlay)}
      ${tog("s-pos", s.autoPositions, "Record my positions", "Every Google search saves where your tracked sites rank.", !s.overlay)}
    </div>
    <div class="btns"><button id="trygoogle">Try it on Google</button></div>
    <h2 class="sec">Reminders</h2>
    <div class="settings">
      ${tog("s-notify", s.notify && notifyOk, "Notify me", "When a new version is out or tracked sites are due a rescan. The icon shows a badge too.")}
      <label class="settog"><span><b>Rescan reminder</b><small>When a tracked site hasn't been scanned for</small></span>
        <select id="s-days" class="search">${[3, 7, 14, 30].map((d) => `<option value="${d}" ${d === s.rescanDays ? "selected" : ""}>${d} days</option>`).join("")}</select></label>
    </div>
    <h2 class="sec">Sync with your phone</h2><div id="syncbox"></div>
    <div id="updatecard"></div>
    <h2 class="sec">Your data</h2><div class="btns"><button id="export">Export history</button><label class="btn">Import history<input id="import" type="file" accept="application/json" hidden></label></div>
    <p class="unknowns">History is saved in Chrome on this computer and survives updates. Export it to back it up or move it to another computer.</p>
    <div class="btns"><button id="deleteall" class="danger">Delete all tracked sites and history</button></div><div id="deletebox"></div>`;
  $("s-overlay").onchange = async (e) => {
    if (e.target.checked && !(await access([...GOOGLE, ...ALL_SITES], "Turning this on needs access to Google and the sites you hover. Turn it on again and choose Allow."))) { e.target.checked = false; return; }
    await saveSettings({ overlay: e.target.checked });
    const on = await syncOverlay(e.target.checked).catch((err) => { ui.notice(esc(err.message || err)); return false; });
    ui.toast(on ? "On. Search on Google to see it" : "Off");
    renderGoogle(ui);
  };
  $("s-hover").onchange = (e) => saveSettings({ hover: e.target.checked });
  $("s-pos").onchange = (e) => saveSettings({ autoPositions: e.target.checked });
  $("s-notify").onchange = async (e) => {
    if (e.target.checked && !(await chrome.permissions.request({ permissions: ["notifications"] }))) { e.target.checked = false; return; }
    await saveSettings({ notify: e.target.checked });
  };
  $("s-days").onchange = (e) => saveSettings({ rescanDays: Number(e.target.value) });
  $("trygoogle").onclick = async () => { const me = await mySite(); const kw = me?.keywords?.[0] || v.detected[me?.origin]?.keywords?.[0]?.keyword || "seo audit";
    const tab = await ui.activeTab(); chrome.tabs.update(tab.id, { url: "https://www.google.com/search?q=" + encodeURIComponent(kw) }); };
  $("export").onclick = async () => ui.download(await T.exportAll(), `seo-god-mode-history-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
  $("import").onchange = async (e) => { const f = e.target.files[0]; if (!f) return;
    try { const n = await T.importAll(await f.text()); ui.toast(`Imported ${n} item${n === 1 ? "" : "s"}`); } catch (err) { ui.notice(esc(err.message)); } };
  $("deleteall").onclick = () => {
    const box = $("deletebox");
    box.innerHTML = `<div class="confirm"><p><b>Delete every tracked site and all history?</b> Scores, positions and saved scans go. Settings stay. Export first if you might want it back.</p><div class="btns"><button id="delyes" class="danger solid">Delete everything</button><button id="delno">Cancel</button></div></div>`;
    box.querySelector("#delno").onclick = () => (box.innerHTML = "");
    box.querySelector("#delyes").onclick = async () => { await T.deleteAll(); v.detail = null; ui.toast("Deleted all tracking data"); box.innerHTML = ""; };
  };
  renderUpdateCard($("updatecard"));
  renderSync($("syncbox"));
}

/** Two-step remove for a tracked site: the first click shows what goes, the second deletes it. */
function confirmRemove(box, origin, name, done) {
  const keep = box.innerHTML;
  const panel = document.createElement("div");
  panel.className = "confirm";
  panel.innerHTML = `<p><b>Stop tracking ${esc(name)}?</b> Its score history, keyword positions and saved scans are deleted. Competitors linked to it stay, unlinked.</p><div class="btns"><button class="danger solid" data-yes>Stop tracking and delete</button><button data-no>Cancel</button></div>`;
  if (box.classList.contains("tcard")) { box.innerHTML = ""; box.append(panel); } else box.replaceChildren(panel);
  panel.querySelector("[data-no]").onclick = () => { if (box.classList.contains("tcard")) done(); else box.innerHTML = keep; };
  panel.querySelector("[data-yes]").onclick = async () => { await T.untrackSite(origin); ui.toast(`Stopped tracking ${name}`); done(); };
}

// ====================================================================== updates
/** Update status. "Check again" asks GitHub (skipping the cache) and recounts sites due a rescan, right here in the panel. */
export const APP_DL = "https://github.com/F0rger123/CLAUDE-SEO-GOD-MODE/releases/download/android-app/SEO-God-Mode.apk";

/** Settings: sync with the Android app using a sync code (no account, no email). */
async function renderSync(el, joining = false) {
  if (!el) return;
  const s = await cloud.current();
  const { syncStatus: st } = await chrome.storage.local.get("syncStatus");
  if (s?.code) {
    el.innerHTML = `<div class="upd on"><p><b>On.</b> ${st?.error ? `Last try failed: ${esc(st.error)}.` : st ? `Last synced ${ago(st.at)}.` : "Syncing…"}</p>
      <p>Your sync code:</p><p class="synccode" id="code">${esc(s.code)}</p>
      <p class="unknowns">Type it into the Android app (or another computer's extension) to see the same sites there. Anyone with the code can see and change your tracked sites, so keep it private, and write it down: it's how you get your data back on a new computer.</p>
      <div class="btns"><button id="copycode" class="primary">Copy code</button><a class="btn" id="mailcode" href="mailto:?subject=${encodeURIComponent("SEO God Mode sync code")}&body=${encodeURIComponent(`My SEO God Mode sync code: ${s.code}\n\nAndroid app: ${APP_DL}`)}">Email it to myself</a><a class="btn" href="${APP_DL}" target="_blank" rel="noopener">Get the Android app</a></div>
      <div class="btns"><button id="syncnow">Sync now</button><button id="syncoff">Turn off sync on this computer</button></div>
      <p class="unknowns">Your tracked sites, competitors, keywords, scores, positions, keyword reports and newest whole-site scans are kept in SEO God Mode's online database under this code. Changes go both ways about once a minute.</p></div>`;
    $("copycode").onclick = () => ui.copy(s.code, "Sync code copied");
    $("syncnow").onclick = async () => { const r = await chrome.runtime.sendMessage({ type: "syncNow" }); ui.toast(r?.ok ? "Synced" : "Sync failed"); renderSync(el); };
    $("syncoff").onclick = async () => { await chrome.runtime.sendMessage({ type: "syncStop" }); ui.toast("Sync is off here. Your data stays on this computer"); renderSync(el); };
    return;
  }
  el.innerHTML = `<p class="lede">See your businesses, clients, competitors, scores and positions on your phone, and add sites from it. No account or email: turning sync on gives you a code to type into the app.</p>
    ${joining ? `<form id="syncform" class="field"><label for="synccode">Sync code from your phone or other computer</label><input id="synccode" class="search big" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"></form>
      <div class="btns"><button id="syncjoin" class="primary">Use this code</button><button id="syncback">Back</button></div>`
    : `<div class="btns"><button id="syncnew" class="primary">Turn on sync</button><button id="syncjoin">I have a code</button><a class="btn" href="${APP_DL}" target="_blank" rel="noopener">Get the Android app</a></div>`}
    <p class="unknowns">Off until you turn it on. Nothing leaves this computer while it's off.</p>`;
  const go = async (code) => {
    try {
      await cloud.use(code);
      ui.toast("Sync is on. Sending your sites…");
      const r = await chrome.runtime.sendMessage({ type: "syncStart" });
      if (!r?.ok) ui.notice(esc(r?.error || "Sync failed"));
      renderSync(el);
    } catch (e) { ui.notice(esc(e.message || e)); }
  };
  if (!joining) {
    $("syncnew").onclick = () => go(newCode());
    $("syncjoin").onclick = () => renderSync(el, true);
    return;
  }
  $("syncback").onclick = () => renderSync(el);
  $("syncform").onsubmit = (e) => { e.preventDefault(); $("syncjoin").click(); };
  $("syncjoin").onclick = () => go($("synccode").value);
}

export async function renderUpdateCard(el, force = false) {
  if (!el) return;
  let due = null;
  if (force) {
    const b = el.querySelector("#upcheck"); if (b) { b.disabled = true; b.textContent = "Checking GitHub…"; }
    const r = await runDaily(true).catch((e) => ({ error: String(e.message || e) }));
    due = r.due || null;
  } else due = (await chrome.storage.local.get("lastDaily")).lastDaily?.due || null;
  const u = await U.checkUpdate(false);
  const checked = u.at ? `Checked ${ago(u.at)}${u.latest ? ` · newest release on GitHub: ${esc(u.latest)}` : ""}.` : "";
  const dueLine = due ? (due.length ? `${due.length} tracked site${due.length === 1 ? " is" : "s are"} due a rescan: ${due.map(esc).join(", ")}.` : "No tracked site is due a rescan.") : "";
  const store = u.installType === "normal";
  if (store) { el.innerHTML = `<h2 class="sec">Updates <small>version ${esc(u.current)}</small></h2><div class="upd"><p>Installed from the Chrome Web Store, so Chrome updates it automatically.${dueLine ? `<br>${dueLine}` : ""}</p></div>`; return; }
  const helper = await U.helperStatus();
  el.innerHTML = `<h2 class="sec">Updates <small>version ${esc(u.current)}</small></h2>
    <div class="upd ${u.available ? "on" : ""}" aria-live="polite"><p>${u.available ? `<b>Version ${esc(u.latest)} is out.</b>` : u.error ? `<b>${esc(u.error)}</b>` : `<b>You're up to date (${esc(u.current)}).</b>`}<br><small class="muted">${checked}</small>${dueLine ? `<br><small class="muted">${dueLine}</small>` : ""}</p>
    <div class="btns">${u.available && helper.installed ? `<button id="upnow" class="primary">Update now</button>` : ""}
      ${u.available && !helper.installed ? `<a class="btn primary" href="${U.ZIP}" target="_blank" rel="noopener">Download update</a>` : ""}
      <button id="upcheck">Check again</button><button id="reload">Reload extension</button></div>
    ${u.available && !helper.installed ? `<p class="unknowns">Manual update: unzip the download over your extension folder (replace files), then press Reload extension. Your history is kept.</p>` : ""}
    ${!helper.installed ? `<details class="fold"><summary>Turn on one-click updates</summary><div class="pad"><p class="lede">One time: ${helper.permission ? "" : "allow the updater, then "}paste this into a terminal (needs Python 3). After that, “Update now” downloads, checks and installs new versions for you.</p>
      ${helper.permission ? `<pre>${esc(U.installCommand())}</pre><button id="copycmd">Copy command</button>` : `<button id="allowhelper" class="primary">Allow the updater</button>`}</div></details>` : `<p class="unknowns">One-click updates are on (${esc(helper.folder || "")}).</p>`}</div>`;
  const b = (id, fn) => { const x = el.querySelector("#" + id); if (x) x.onclick = fn; };
  b("upcheck", async () => { await renderUpdateCard(el, true); ui.toast("Checked for updates"); });
  b("reload", () => chrome.runtime.reload());
  b("copycmd", () => ui.copy(U.installCommand(), "Command copied"));
  b("allowhelper", async () => { if (await U.askHelperPermission()) renderUpdateCard(el); });
  b("upnow", async (ev) => { ev.target.disabled = true; ev.target.textContent = "Downloading and checking…";
    try { const r = await U.runOneClickUpdate(); ui.toast(r.updated ? `Updated to ${r.version}${r.verified ? " (checksum verified)" : ""}. Reloading…` : "Already up to date"); }
    catch (e) { ui.notice(esc(e.message)); ev.target.disabled = false; ev.target.textContent = "Update now"; } });
}

/** Small header banner when an update is out (checked at most once a day). */
export async function updateBanner(el, helpers) {
  ui = ui || helpers;
  const u = await U.checkUpdate().catch(() => null);
  if (!u?.available || u.installType === "normal") { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `Version ${esc(u.latest)} is out. <button class="linkish" id="goupd">Update</button>`;
  el.querySelector("#goupd").onclick = () => helpers.setMode("google").then(() => document.getElementById("updatecard")?.scrollIntoView({ behavior: "smooth" }));
}
