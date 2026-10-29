/**
 * SEO God Mode for Android: your tracked sites, scores, positions and competitors, synced with the Chrome extension.
 *  - Sign in with an emailed link (same email as the extension).
 *  - Sites: everything you track, grouped like the extension's Track view. Paste a link to look it up or add it.
 *  - A site: scores, history, summary and fix prompt from its newest whole-site scan, keyword positions and report,
 *    and its competitors side by side. Add or remove keywords and competitors; change what it is to you.
 *  - Compare: a business next to its competitors, scores and positions.
 *  - Quick add: a client, a website of yours, or a competitor (then whose). The extension lists sites added here so
 *    you can scan them on the computer.
 * Scanning websites and checking Google stay in the extension. Data is cached on the phone, so it opens offline.
 */
import { EPOCH, makeCloud, siteFromRow, siteRow } from "./lib/cloud.js";
import { lineChart } from "./lib/track.js";
import { summaryText } from "./lib/summary.js";
import { fixAllPrompt } from "./lib/prompts.js";
import { group, keywordPrompt } from "./lib/kwcheck.js";
import { OFF_PAGE } from "./lib/breakdown.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const when = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : when(new Date(t).toISOString()); };
const status = (n) => (n == null ? "" : n >= 85 ? "s-pass" : n >= 65 ? "s-part" : "s-fail");
const posStatus = (p) => (p == null ? "s-fail" : p <= 3 ? "s-pass" : p <= 10 ? "s-part" : "s-fail");
const ROLES = { mine: "My business", client: "Client", competitor: "Competitor" };
const owned = () => [...S.sites.values()].filter((s) => s.role !== "competitor");
const competitorsOf = (o) => [...S.sites.values()].filter((s) => s.role === "competitor" && s.competitorOf === o);
const originOf = (raw) => { const u = new URL(/^https?:/i.test(raw.trim()) ? raw.trim() : "https://" + raw.trim()); if (!u.hostname.includes(".")) throw new Error(); return u.origin; };

// ------------------------------------------------------------------ storage: session in localStorage, data in IndexedDB
const cloud = makeCloud({
  load: async () => { try { return JSON.parse(localStorage.getItem("sgm.session") || "null"); } catch { return null; } },
  save: async (s) => (s ? localStorage.setItem("sgm.session", JSON.stringify(s)) : localStorage.removeItem("sgm.session")),
});
const dbp = new Promise((res, rej) => { const r = indexedDB.open("sgm", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idb = async (mode, fn) => { const d = await dbp; return new Promise((res, rej) => { const tx = d.transaction("kv", mode); const q = fn(tx.objectStore("kv")); tx.oncomplete = () => res(q?.result); tx.onerror = () => rej(tx.error); }); };
const getK = (k) => idb("readonly", (s) => s.get(k));
const setK = (k, v) => idb("readwrite", (s) => s.put(v, k));

const S = { sites: new Map(), data: new Map(), cursor: { sites: EPOCH, data: EPOCH }, tab: "sites", open: null, lastSync: 0, error: null, busy: false };
const trend = (o) => S.data.get("trend:" + o) || [];
const kwpos = (o) => S.data.get("kwpos:" + o) || [];
const scanOf = (o) => S.data.get("scan:" + o) || null;
const lastPoint = (o) => { const h = trend(o); return h[h.length - 1] || null; };
const latestPos = (o, q) => [...kwpos(o)].reverse().find((r) => r.q === q) || null;

async function loadCache() {
  S.sites = new Map((await getK("sites") || []).map((s) => [s.origin, s]));
  S.data = new Map(Object.entries((await getK("data")) || {}));
  S.cursor = (await getK("cursor")) || { sites: EPOCH, data: EPOCH };
  S.lastSync = (await getK("lastSync")) || 0;
}
const saveCache = () => Promise.all([setK("sites", [...S.sites.values()]), setK("data", Object.fromEntries(S.data)), setK("cursor", S.cursor), setK("lastSync", S.lastSync)]);

/** Fetch everything changed since the last sync. */
async function pull({ quiet = true } = {}) {
  if (S.busy) return;
  S.busy = true; paintStatus();
  try {
    const sites = await cloud.changes("sites", S.cursor.sites);
    for (const r of sites) r.deleted_at ? S.sites.delete(r.origin) : S.sites.set(r.origin, siteFromRow(r));
    if (sites.length) S.cursor.sites = sites[sites.length - 1].updated_at;
    const data = await cloud.changes("site_data", S.cursor.data);
    for (const r of data) r.deleted_at || r.value == null ? S.data.delete(r.key) : S.data.set(r.key, r.value);
    if (data.length) S.cursor.data = data[data.length - 1].updated_at;
    S.lastSync = Date.now(); S.error = null;
    await saveCache();
    if (sites.length || data.length || !quiet) render();
  } catch (e) {
    S.error = String(e.message || e);
    if (e.signedOut) return start();
  } finally { S.busy = false; paintStatus(); }
}

/** Save one site (new or changed) online, then refresh. */
async function putSite(site, deleted = false) {
  const s = await cloud.current();
  await cloud.putSites([siteRow(site, s.userId, deleted)]);
  deleted ? S.sites.delete(site.origin) : S.sites.set(site.origin, site);
  await saveCache();
  render();
  pull();
}

// ------------------------------------------------------------------ UI helpers
let toastT;
function toast(t) { const el = $("toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 2200); }
function notice(html) { const n = $("notice"); n.hidden = !html; n.innerHTML = html || ""; }
async function copy(text, msg) { try { await navigator.clipboard.writeText(text); toast(msg); } catch { notice("Couldn't copy. Long-press the text below to copy it."); } }
function paintStatus() {
  const el = $("status");
  if (!el || $("mode").hidden) return;
  el.innerHTML = `${S.busy ? "Syncing…" : S.error ? `Offline: ${esc(S.error)}` : S.lastSync ? `Synced ${ago(S.lastSync)}` : "Not synced yet"} <button class="linkish" id="syncbtn">Sync</button>`;
  $("syncbtn").onclick = () => pull({ quiet: false });
}

// ------------------------------------------------------------------ sign in
function renderSignIn(step = null) {
  $("mode").hidden = true; $("quickadd").hidden = true;
  $("status").textContent = "Your tracked sites, on your phone";
  $("view").innerHTML = `<h1 class="q">Sign in</h1>
    <p class="lede">Use the same email you signed in with in the extension (Settings › Sync with your phone). We email you a sign-in link; there's no password.</p>
    <form id="sform" class="field">${step
      ? `<p class="lede"><b>Check your email on this phone and tap Log In.</b> The page that opens brings you back here, signed in.</p>
        <label for="scode">Or paste the sign-in here</label><input id="scode" class="search big" autocomplete="off" placeholder="Paste here">
        <p class="unknowns">If the app doesn't open by itself, press <b>Open SEO God Mode</b> on that page, or press <b>Copy sign-in</b> there and paste it here.</p>`
      : `<label for="semail">Your email</label><input id="semail" class="search big" type="email" autocomplete="email" placeholder="you@example.com">`}</form>
    <div class="btns stack"><button id="sgo" class="primary">${step ? "Sign in" : "Email me a sign-in link"}</button>${step ? `<button id="sback">Use another email</button>` : ""}</div>`;
  $("sform").onsubmit = (e) => { e.preventDefault(); $("sgo").click(); };
  if (step) $("sback").onclick = () => renderSignIn();
  $("sgo").onclick = async () => {
    const b = $("sgo"); b.disabled = true; notice("");
    try {
      if (!step) {
        const email = $("semail").value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("That doesn't look like an email address.");
        await cloud.sendCode(email);
        return renderSignIn({ email });
      }
      await cloud.signIn(step.email, $("scode").value);
      start();
    } catch (e) { b.disabled = false; notice(esc(e.message || e)); }
  };
}

// ------------------------------------------------------------------ sites
function card(s) {
  const h = trend(s.origin), last = h[h.length - 1], prev = h[h.length - 2];
  const d = last && prev ? last.overall - prev.overall : null;
  const rivals = competitorsOf(s.origin).length;
  const of = s.competitorOf && S.sites.get(s.competitorOf);
  return `<div class="tcard"><button class="topen" data-open="${esc(s.origin)}"><div class="thead"><div><b>${esc(s.name)}</b><small>${last ? "Scanned " + when(last.t) : "Not scanned yet"} · ${s.keywords.length} keyword${s.keywords.length === 1 ? "" : "s"}${rivals ? ` · ${rivals} competitor${rivals === 1 ? "" : "s"}` : ""}${of ? ` · vs ${esc(of.name)}` : ""}</small></div>
    <div class="tscore ${status(last?.overall)}">${last ? last.overall : "–"}${d ? `<i class="${d > 0 ? "up" : "down"}">${d > 0 ? "+" : ""}${d}</i>` : ""}</div></div>
    ${h.length > 1 ? lineChart([{ name: "Overall", cls: "main", points: h.map((p) => ({ t: p.t, v: p.overall })) }], { height: 54, label: s.name + " score history" }) : ""}</button></div>`;
}

function renderSites() {
  const list = [...S.sites.values()];
  const groups = [["mine", "Your businesses"], ["client", "Clients you manage"], ["competitor", "Competitors"]];
  $("view").innerHTML = `<form id="paste" class="field"><label for="pasteurl">Look up a website</label><div class="row"><input id="pasteurl" class="search big" inputmode="url" autocomplete="off" placeholder="Paste a link"><button class="primary">Go</button></div></form>
    ${list.length ? groups.map(([role, title]) => { const xs = list.filter((s) => s.role === role); return xs.length ? `<h2 class="sec">${title} <small>${xs.length}</small></h2><div class="tlist">${xs.map(card).join("")}</div>` : ""; }).join("")
      : `<div class="emptybox"><b>Nothing tracked yet</b><p>Sites you track in the Chrome extension show up here once it's signed in. Or press + Quick add.</p></div>`}`;
  $("paste").onsubmit = (e) => {
    e.preventDefault();
    let o; try { o = originOf($("pasteurl").value); } catch { return notice("That doesn't look like a website address. Try something like example.com."); }
    notice("");
    if (S.sites.has(o)) return openSite(o);
    quickAdd({ url: o });
  };
  bindOpen();
}
const bindOpen = () => document.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => openSite(b.dataset.open)));
function openSite(o) { S.open = o; S.tab = "sites"; render(); scrollTo(0, 0); }

function scoreBoxes(p) {
  return `<div class="scorebox">${[["Overall", p?.overall], ["SEO", p?.seo], ["AEO", p?.aeo], ["GEO", p?.geo]].map(([k, n]) => `<div class="${status(n)}"><b>${n ?? "–"}</b><span>${k}</span></div>`).join("")}</div>`;
}

function renderSite(o) {
  const s = S.sites.get(o);
  if (!s) { S.open = null; return renderSites(); }
  const h = trend(o), p = h[h.length - 1] || null, scan = scanOf(o), report = S.data.get("kwreport:" + o);
  const of = s.competitorOf && S.sites.get(s.competitorOf);
  const rivals = competitorsOf(o);
  const failed = scan ? scan.results.filter((r) => r.ratio != null && r.ratio < 0.999 && r.cat !== "info").sort((a, b) => (b.gain || 0) - (a.gain || 0)) : [];
  const kws = s.keywords;
  const weak = report ? report.rows.filter((r) => group(r.pos) !== "top") : [];
  $("view").innerHTML = `<nav class="crumb"><button class="back" id="back">‹ Sites</button></nav>
    <div class="hero"><div><b>${esc(s.name)}</b><small>${ROLES[s.role]}${of ? ` of <button class="linkish" data-open="${esc(of.origin)}">${esc(of.name)}</button>` : ""} · <a href="${esc(o)}" target="_blank" rel="noopener">${esc(hostOf(o))}</a></small></div></div>
    ${scoreBoxes(p)}
    ${h.length > 1 ? lineChart([{ name: "Overall", cls: "main", points: h.map((x) => ({ t: x.t, v: x.overall })) }], { label: s.name + " score history" }) : ""}
    ${scan ? `<h2 class="sec">Summary <small>scanned ${when(scan.page.scannedAt)}</small></h2><div class="summarytext">${summaryText(scan).split("\n").map((l) => `<p>${esc(l)}</p>`).join("")}</div>
      ${failed.length ? `<h2 class="sec">Top fixes <small>${failed.length}</small></h2><div class="list">${failed.slice(0, 6).map((r) => `<div class="factor"><span class="dot ${r.ratio > 0.5 ? "s-part" : "s-fail"}"></span><div><b>${esc(r.name)}</b><small>${esc(r.detail || "")}${r.gain ? ` · +${Math.round(r.gain)} pts` : ""}</small></div></div>`).join("")}</div>
        <div class="btns stack"><button id="copyfix" class="primary">Copy fix prompt</button></div>` : ""}`
      : `<div class="emptybox"><b>Not scanned yet</b><p>Open SEO God Mode on your computer: sites added here are listed at the top of Track, ready to scan. The results show up here after the next sync.</p></div>`}
    <h2 class="sec">Keywords <small>${kws.length}</small></h2>
    ${kws.length ? `<table class="mini"><tr><th>Search</th><th>Position</th><th></th></tr>${kws.map((q) => { const r = latestPos(o, q); return `<tr><td>${esc(q)}${r ? `<small class="when">${when(r.t)}</small>` : ""}</td><td class="${r ? posStatus(r.pos) : ""}"><b class="posn">${r ? (r.pos ? "#" + r.pos : "not top " + (r.of || 10)) : "not checked"}</b></td><td><button class="tdel inline" data-rmkw="${esc(q)}" aria-label="Remove ${esc(q)}">×</button></td></tr>`; }).join("")}</table>
      <p class="unknowns">Positions come from the extension: press Check in Track on your computer to update them.</p>` : ""}
    <form id="addkw" class="field"><label for="kwin">Add keywords (comma separated)</label><div class="row"><input id="kwin" class="search" placeholder="roof repair york pa"><button>Add</button></div></form>
    ${report?.rows?.length ? `<h2 class="sec">Keyword report <small>${when(report.t)}</small></h2>
      <div class="kwsum"><span class="s-pass"><b>${report.rows.filter((r) => group(r.pos) === "top").length}</b>top 3</span><span class="s-part"><b>${report.rows.filter((r) => group(r.pos) === "close").length}</b>rest of page 1</span><span class="s-fail"><b>${report.rows.filter((r) => group(r.pos) === "behind").length}</b>further down</span></div>
      ${weak.length ? `<div class="list">${weak.map((r) => `<div class="factor"><span class="dot ${posStatus(r.pos)}"></span><div><b>${esc(r.q)} · ${r.pos ? "#" + r.pos : "not in top " + (r.of || 10)}</b>${r.score != null ? `<small>on-page ${r.score} vs ${esc((r.others || []).join(", ") || "–")}</small>` : ""}${r.verdict ? `<p>${esc(r.verdict)}</p>` : ""}</div></div>`).join("")}</div>
        <div class="btns stack"><button id="copykw" class="primary">Copy keyword fix prompt</button></div>` : `<p class="verdict">Every checked keyword is in the top 3. ${esc(OFF_PAGE)}</p>`}` : ""}
    ${s.role !== "competitor" ? `<h2 class="sec">Competitors <small>${rivals.length}</small></h2>${rivals.length ? compareTable(s, rivals) : `<p class="lede">None linked yet.</p>`}
      <div class="btns"><button id="addcomp">Add a competitor</button><button id="gocompare">Compare</button></div>` : ""}
    <h2 class="sec">This site</h2>
    <div class="field"><label for="role">This site is</label><select id="role" class="search">${Object.entries({ mine: "My business", client: "A client I manage", competitor: "A competitor" }).map(([k, l]) => `<option value="${k}" ${k === s.role ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div class="field" id="ofwrap" ${s.role === "competitor" ? "" : "hidden"}><label for="of">Competitor of</label><select id="of" class="search"><option value="">(not linked)</option>${owned().filter((x) => x.origin !== o).map((x) => `<option value="${esc(x.origin)}" ${x.origin === s.competitorOf ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>
    <div class="btns"><button id="saverole">Save</button><button id="untrack" class="danger">Stop tracking</button></div><div id="untrackbox"></div>`;
  $("back").onclick = () => { S.open = null; render(); };
  bindOpen();
  if ($("copyfix")) $("copyfix").onclick = () => copy(fixAllPrompt(scan), "Fix prompt copied");
  if ($("copykw")) $("copykw").onclick = () => copy(keywordPrompt(o, report), "Keyword fix prompt copied");
  if ($("addcomp")) $("addcomp").onclick = () => quickAdd({ role: "competitor", of: o });
  if ($("gocompare")) $("gocompare").onclick = () => { S.compare = o; S.open = null; S.tab = "compare"; render(); };
  document.querySelectorAll("[data-rmkw]").forEach((b) => (b.onclick = () => putSite({ ...s, keywords: s.keywords.filter((k) => k !== b.dataset.rmkw) }).catch(fail)));
  $("addkw").onsubmit = (e) => {
    e.preventDefault();
    const add = $("kwin").value.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (add.length) putSite({ ...s, keywords: [...new Set([...s.keywords, ...add])] }).then(() => toast("Keywords added")).catch(fail);
  };
  $("role").onchange = () => ($("ofwrap").hidden = $("role").value !== "competitor");
  $("saverole").onclick = () => { const role = $("role").value; putSite({ ...s, role, competitorOf: role === "competitor" ? $("of").value || null : null }).then(() => toast("Saved")).catch(fail); };
  $("untrack").onclick = () => {
    $("untrackbox").innerHTML = `<div class="confirm"><p><b>Stop tracking ${esc(s.name)}?</b> It's removed from the extension too at its next sync. Its history stays on the computer until then.</p><div class="btns"><button id="unyes" class="danger solid">Stop tracking</button><button id="unno">Keep it</button></div></div>`;
    $("unno").onclick = () => ($("untrackbox").innerHTML = "");
    $("unyes").onclick = () => { S.open = null; putSite(s, true).then(() => toast(`Stopped tracking ${s.name}`)).catch(fail); };
  };
}

/** A business and its competitors: latest scores, and the verdict when it's already ahead. */
function compareTable(s, rivals) {
  const rows = [s, ...rivals].map((x) => ({ x, p: lastPoint(x.origin) })).sort((a, b) => (b.p?.overall ?? -1) - (a.p?.overall ?? -1));
  const me = lastPoint(s.origin);
  const theirs = rivals.map((r) => lastPoint(r.origin)?.overall).filter((n) => n != null);
  const ahead = me?.overall != null && theirs.length && theirs.every((n) => n <= me.overall);
  const cell = (n, mine, self) => `<td class="${!self && n != null && mine != null && n > mine ? "down" : ""}">${n ?? "–"}</td>`;
  return `${ahead ? `<p class="verdict">${esc(s.name)} scores ${me.overall}, at or above every tracked competitor (best of theirs ${Math.max(...theirs)}). ${esc(OFF_PAGE)}</p>` : ""}
    <table class="mini"><tr><th>Site</th><th>All</th><th>SEO</th><th>AEO</th><th>GEO</th></tr>${rows.map(({ x, p }) => { const self = x.origin === s.origin;
      return `<tr class="${self ? "me" : ""}"><td><button class="linkish" data-open="${esc(x.origin)}">${esc(x.name)}</button></td>${cell(p?.overall, me?.overall, self)}${cell(p?.seo, me?.seo, self)}${cell(p?.aeo, me?.aeo, self)}${cell(p?.geo, me?.geo, self)}</tr>`; }).join("")}</table>`;
}

function renderCompare() {
  const biz = owned();
  if (!biz.length) { $("view").innerHTML = `<div class="emptybox"><b>No business to compare yet</b><p>Add your own website or a client with + Quick add, then its competitors.</p></div>`; return; }
  const o = S.compare && S.sites.has(S.compare) ? S.compare : biz[0].origin;
  const s = S.sites.get(o), rivals = competitorsOf(o), all = [s, ...rivals];
  const kws = [...new Set([...s.keywords, ...kwpos(o).map((r) => r.q)])].slice(0, 20);
  const posOf = (x, q) => { const r = latestPos(x.origin, q); return r ? (r.pos ? `<b class="posn ${posStatus(r.pos)}">#${r.pos}</b>` : "–") : "?"; };
  $("view").innerHTML = `<div class="field"><label for="cmpsel">Business</label><select id="cmpsel" class="search">${biz.map((b) => `<option value="${esc(b.origin)}" ${b.origin === o ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select></div>
    ${rivals.length ? `<h2 class="sec">Scores</h2>${compareTable(s, rivals)}
      ${all.some((x) => trend(x.origin).length > 1) ? lineChart(all.slice(0, 5).map((x, i) => ({ name: x.name, cls: ["main", "k1", "k2", "k3", "k4"][i], points: trend(x.origin).map((p) => ({ t: p.t, v: p.overall })) })), { label: "Overall score: you and competitors" }) : ""}
      ${kws.length ? `<h2 class="sec">Search positions</h2><div class="scrollx"><table class="mini"><tr><th>Keyword</th>${all.map((x) => `<th>${esc(x.name.slice(0, 12))}</th>`).join("")}</tr>${kws.map((q) => `<tr><td>${esc(q)}</td>${all.map((x) => `<td>${posOf(x, q)}</td>`).join("")}</tr>`).join("")}</table></div>` : ""}`
      : `<p class="lede">No competitors linked to ${esc(s.name)} yet.</p>`}
    <div class="btns"><button id="addcomp" class="primary">Add a competitor</button></div>`;
  $("cmpsel").onchange = () => { S.compare = $("cmpsel").value; renderCompare(); };
  $("addcomp").onclick = () => quickAdd({ role: "competitor", of: o });
  bindOpen();
}

async function renderAccount() {
  const s = await cloud.current();
  $("view").innerHTML = `<h2 class="sec first">Account</h2>
    <div class="upd"><p>Signed in as <b>${esc(s?.email || "")}</b>. ${S.lastSync ? `Last synced ${ago(S.lastSync)}.` : ""}</p>
    <p class="unknowns">Your sites, keywords, scores, positions, keyword reports and newest scans are kept in SEO God Mode's online database, where only your sign-in can read them, and cached on this phone so the app opens offline.</p>
    <div class="btns"><button id="signout">Sign out</button></div></div>
    <h2 class="sec">How it works</h2>
    <p class="lede">Scanning websites and checking Google positions run in the Chrome extension on your computer. This app shows the results and lets you add and organise sites, keywords and competitors; changes reach the extension within a minute while Chrome is open.</p>
    <p class="unknowns">SEO God Mode · Built by <a href="https://theagencyzero.com" target="_blank" rel="noopener">theagencyzero.com</a></p>`;
  $("signout").onclick = async () => { await cloud.signOut(); await Promise.all(["sites", "data", "cursor", "lastSync"].map((k) => setK(k, undefined))); S.sites.clear(); S.data.clear(); S.cursor = { sites: EPOCH, data: EPOCH }; S.lastSync = 0; start(); };
}

// ------------------------------------------------------------------ quick add (bottom sheet)
function quickAdd(pre = {}) {
  const w = { role: pre.role || null, of: pre.of ?? null, url: pre.url || "", fixed: !!pre.role };
  const sheet = $("sheet"), box = sheet.querySelector(".sheetbox");
  const close = () => { sheet.hidden = true; document.removeEventListener("keydown", esc_); };
  const esc_ = (e) => e.key === "Escape" && close();
  document.addEventListener("keydown", esc_);
  sheet.onclick = (e) => { if (e.target === sheet) close(); };
  const tile = (attr, val, title, desc, on) => `<button class="tile ${on ? "on" : ""}" ${attr}="${esc(val)}" aria-pressed="${on}"><b>${title}</b><small>${desc}</small></button>`;
  const draw = () => {
    const biz = owned();
    box.innerHTML = `<div class="sheethead"><h2 id="sheettitle" class="q">${w.role ? "Add " + { client: "a client", mine: "a website of yours", competitor: "a competitor" }[w.role] : "Quick add"}</h2><button id="qclose" class="linkish">Close</button></div>
      ${!w.role ? `<div class="tiles">${tile("data-qa", "client", "A client", "You manage its SEO.", false)}${tile("data-qa", "mine", "A website of mine", "Your own business.", false)}${tile("data-qa", "competitor", "A competitor", "Then pick whose competitor it is.", false)}</div>`
      : `<form id="qform"><div class="field"><label for="qurl">Website address</label><input id="qurl" class="search big" inputmode="url" autocomplete="off" placeholder="example.com" value="${esc(w.url)}"></div>
        ${w.role === "competitor" ? `<div class="field"><label>Whose competitor is it?</label><div class="tiles">${biz.map((b) => tile("data-of", b.origin, esc(b.name), b.role === "client" ? "Client" : "Your business", w.of === b.origin)).join("")}${tile("data-of", "", "Not linked", "Track it on its own.", w.of === "")}</div></div>` : ""}
        <div class="field"><label for="qkw">Searches it should rank for (optional, comma separated)</label><input id="qkw" class="search" placeholder="roof repair york pa, metal roofing"></div>
        <div class="btns stack"><button class="primary" id="qsave" ${w.role === "competitor" && biz.length && w.of == null ? "disabled" : ""}>Add and sync</button>${w.fixed ? "" : `<button type="button" id="qback">Back</button>`}</div></form>`}`;
    $("qclose").onclick = close;
    box.querySelectorAll("[data-qa]").forEach((b) => (b.onclick = () => { w.role = b.dataset.qa; draw(); }));
    box.querySelectorAll("[data-of]").forEach((b) => (b.onclick = (e) => { e.preventDefault(); w.url = $("qurl").value; w.of = b.dataset.of; draw(); }));
    if ($("qback")) $("qback").onclick = () => { w.role = null; draw(); };
    const form = $("qform");
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      let o; try { o = originOf($("qurl").value); } catch { return notice("That doesn't look like a website address. Try something like example.com."); }
      notice("");
      const kws = $("qkw").value.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
      const old = S.sites.get(o);
      const site = { origin: o, name: old?.name || hostOf(o), addedAt: old?.addedAt || new Date().toISOString(), keywords: [...new Set([...(old?.keywords || []), ...kws])],
        role: w.role, competitorOf: w.role === "competitor" ? w.of || null : null };
      $("qsave").disabled = true;
      try { await putSite(site); close(); toast(`Added ${hostOf(o)}. Scan it from the extension on your computer`); openSite(o); }
      catch (err) { $("qsave").disabled = false; fail(err); }
    };
  };
  draw();
  sheet.hidden = false;
  box.querySelector("button, input")?.focus();
}

const fail = (e) => notice(esc(e.message || e) + " Check your connection and try again.");

// ------------------------------------------------------------------ app
function render() {
  if ($("mode").hidden) return;
  document.querySelectorAll("#mode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === S.tab)));
  if (S.tab === "compare") renderCompare();
  else if (S.tab === "account") renderAccount();
  else if (S.open) renderSite(S.open);
  else renderSites();
}

let poll;
async function start() {
  clearInterval(poll);
  if (!(await cloud.current())) return renderSignIn();
  $("mode").hidden = false; $("quickadd").hidden = false;
  await loadCache();
  render(); paintStatus();
  await pull({ quiet: false });
  // While the app is open: every 20 seconds, and whenever it comes back to the front.
  poll = setInterval(() => document.visibilityState === "visible" && pull(), 20000);
}

// The sign-in page opens the app with seogodmode://login?access_token=…, at launch or while it's open.
async function fromLink(url) {
  if (!/access_token=/.test(url || "")) return;
  try { await cloud.signIn("", url); toast("Signed in"); notice(""); } catch (e) { notice(esc(e.message || e)); }
  start();
}
const AppPlugin = window.Capacitor?.Plugins?.App || window.Capacitor?.registerPlugin?.("App");
AppPlugin?.addListener?.("appUrlOpen", ({ url }) => fromLink(url));
AppPlugin?.getLaunchUrl?.().then((r) => fromLink(r?.url)).catch(() => {});

document.querySelectorAll("#mode button").forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; S.open = null; notice(""); render(); scrollTo(0, 0); }));
$("quickadd").onclick = () => quickAdd();
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && !$("mode").hidden && pull());
setInterval(paintStatus, 60000);
start();
