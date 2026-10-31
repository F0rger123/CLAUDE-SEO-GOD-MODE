/**
 * SEO God Mode for Android: your tracked sites, scores, positions and competitors, synced with the Chrome extension.
 *  - Opens ready to use and works entirely on the phone, with no computer, account or sync. Sync is optional, in Account:
 *    turn it on, pair with the extension by QR code or sync code, or sign in (username + password, no email). Doing
 *    any of those later keeps the sites already on the phone.
 *  - Sites: everything you track, grouped like the extension's Track view. Paste a link to look it up or add it.
 *  - A site: scores, history, summary and fix prompt from its newest whole-site scan, keyword positions and report,
 *    and its competitors side by side. Add or remove keywords and competitors; change what it is to you.
 *  - Compare: a business next to its competitors, scores and positions.
 *  - Quick add: a client, a website of yours, a competitor (then whose), or a site in general (optionally linked).
 *  - Rate any website right here: the same whole-site crawl, checks and scores as the extension (lib/siterate.js),
 *    with no account or database needed. Scans of tracked sites sync to the extension.
 *  - Check Google positions here too: a browser window on the phone searches each keyword (native.js), then the same
 *    keyword report as the extension: where the site ranks, what to change, new keyword ideas.
 * Everything is saved on the phone first and synced only if sync is on.
 */
import { cleanCode, EPOCH, makeCloud, newCode, siteFromRow, siteRow } from "./lib/cloud.js";
import { qrSvg } from "./lib/qr.js";
import { lineChart } from "./lib/track.js";
import { summaryText } from "./lib/summary.js";
import { fixAllPrompt } from "./lib/prompts.js";
import { group, keywordPrompt, mergeReport } from "./lib/kwcheck.js";
import { readGoogle } from "./lib/google.js";
import { addReading } from "./lib/track.js";
import { OFF_PAGE } from "./lib/breakdown.js";
import { rateSite } from "./lib/siterate.js";
import { SB_URL } from "./lib/cloud.js";
import { canScan, canSearch, haptic, installNativeFetch, isNative, newerBuild, scanQR, searchGoogle } from "./native.js";

installNativeFetch([SB_URL]);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const when = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : when(new Date(t).toISOString()); };
const status = (n) => (n == null ? "" : n >= 85 ? "s-pass" : n >= 65 ? "s-part" : "s-fail");
const posStatus = (p) => (p == null ? "s-fail" : p <= 3 ? "s-pass" : p <= 10 ? "s-part" : "s-fail");
const ROLES = { mine: "My business", client: "Client", competitor: "Competitor", general: "General" };
const owned = () => [...S.sites.values()].filter((s) => s.role === "mine" || s.role === "client");
const canLink = (role) => role === "competitor" || role === "general";
const competitorsOf = (o) => [...S.sites.values()].filter((s) => s.role === "competitor" && s.competitorOf === o);
const linkedTo = (o) => [...S.sites.values()].filter((s) => s.role === "general" && s.competitorOf === o);
const originOf = (raw) => { const u = new URL(/^https?:/i.test(raw.trim()) ? raw.trim() : "https://" + raw.trim()); if (!u.hostname.includes(".")) throw new Error(); return u.origin; };

// ------------------------------------------------------------------ storage: session in localStorage, data in IndexedDB
const cloud = makeCloud({
  load: async () => { try { return JSON.parse(localStorage.getItem("sgm.sync") || "null"); } catch { return null; } },
  save: async (s) => (s ? localStorage.setItem("sgm.sync", JSON.stringify(s)) : localStorage.removeItem("sgm.sync")),
});
const dbp = new Promise((res, rej) => { const r = indexedDB.open("sgm", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idb = async (mode, fn) => { const d = await dbp; return new Promise((res, rej) => { const tx = d.transaction("kv", mode); const q = fn(tx.objectStore("kv")); tx.oncomplete = () => res(q?.result); tx.onerror = () => rej(tx.error); }); };
const getK = (k) => idb("readonly", (s) => s.get(k));
const setK = (k, v) => idb("readwrite", (s) => s.put(v, k));

const S = { sites: new Map(), data: new Map(), cursor: { sites: EPOCH, data: EPOCH }, tab: "sites", open: null, lastSync: 0, error: null, busy: false,
  // Changes saved here but not sent yet: site rows by origin, and data keys.
  pending: { sites: {}, keys: [] }, scanning: null, lookup: null };
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
  S.pending = (await getK("pending")) || { sites: {}, keys: [] };
}
const saveCache = () => Promise.all([setK("sites", [...S.sites.values()]), setK("data", Object.fromEntries(S.data)), setK("cursor", S.cursor), setK("lastSync", S.lastSync), setK("pending", S.pending)]);
const pendingCount = () => Object.keys(S.pending.sites).length + S.pending.keys.length;

/** Send what's waiting. Throws (and keeps it waiting) if the server can't take it. */
async function flush() {
  const sites = Object.values(S.pending.sites), keys = [...S.pending.keys];
  // General sites go last and separately, so a server without that site type yet still takes everything else.
  const general = sites.filter((r) => r.role === "general"), rest = sites.filter((r) => r.role !== "general");
  if (rest.length) await cloud.putSites(rest);
  S.oldServer = false;
  if (general.length) await cloud.putSites(general).catch((e) => { if (!e.needsUpdate) throw e; S.oldServer = true; });
  if (keys.length) await cloud.putData(keys.map((key) => { const value = S.data.get(key) ?? null; return { key, value, deleted_at: value == null ? new Date().toISOString() : null }; }));
  for (const r of S.oldServer ? rest : sites) if (S.pending.sites[r.origin] === r) delete S.pending.sites[r.origin];
  S.pending.keys = S.pending.keys.filter((k) => !keys.includes(k));
  await saveCache();
}

/** Fetch everything changed since the last sync. */
async function pull({ quiet = true } = {}) {
  // Already syncing: go again right after, so a change saved meanwhile isn't left waiting.
  if (S.busy) { S.again = true; return; }
  // Sync is off: everything stays on this phone.
  S.local = !(await cloud.current());
  if (S.local) { if (!quiet) render(); return paintStatus(); }
  S.busy = true; paintStatus();
  try {
    await flush();
    const sites = await cloud.changes("sites", S.cursor.sites);
    for (const r of sites) if (!S.pending.sites[r.origin]) r.deleted_at ? S.sites.delete(r.origin) : S.sites.set(r.origin, siteFromRow(r));
    if (sites.length) S.cursor.sites = sites[sites.length - 1].updated_at;
    const data = await cloud.changes("site_data", S.cursor.data);
    for (const r of data) if (!S.pending.keys.includes(r.key)) r.deleted_at || r.value == null ? S.data.delete(r.key) : S.data.set(r.key, r.value);
    if (data.length) S.cursor.data = data[data.length - 1].updated_at;
    S.lastSync = Date.now(); S.error = null;
    await saveCache();
    if (sites.length || data.length || !quiet) render();
  } catch (e) {
    S.error = e.notReady ? "notready" : String(e.message || e);
    if (e.signedOut) return start();
  } finally {
    S.busy = false; paintStatus();
    if (S.again) { S.again = false; pull(); }
  }
}

/** Save one site (new or changed) on the phone, then send it when it can. */
async function putSite(site, deleted = false) {
  S.pending.sites[site.origin] = siteRow(site, deleted);
  deleted ? S.sites.delete(site.origin) : S.sites.set(site.origin, site);
  await saveCache();
  render();
  pull();
}
/** Save data keys (already set in S.data) on the phone, then send them when it can. */
async function putData(keys) {
  S.pending.keys = [...new Set([...S.pending.keys, ...keys])];
  await saveCache();
  pull();
}

// ------------------------------------------------------------------ UI helpers
let toastT;
function toast(t) { haptic("ok"); const el = $("toast"); el.textContent = t; el.classList.remove("on"); void el.offsetWidth; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 2200); }
function notice(html) { if (html) haptic("warn"); const n = $("notice"); n.hidden = !html; n.innerHTML = html || ""; n.classList.remove("shake"); if (html) { void n.offsetWidth; n.classList.add("shake"); } }
async function copy(text, msg) { try { await navigator.clipboard.writeText(text); toast(msg); } catch { notice("Couldn't copy. Long-press the text below to copy it."); } }
function paintStatus() {
  const el = $("status");
  if (!el || $("mode").hidden) return;
  const waiting = pendingCount();
  el.className = `url ${S.busy ? "busy" : S.local || !S.error && !S.oldServer ? "ok" : "wait"}`;
  if (S.local) { el.innerHTML = `<i class="syncdot"></i>Saved on this phone`; return; }
  el.innerHTML = `<i class="syncdot"></i>${S.busy ? "Syncing…" : S.oldServer ? "Synced, except General sites (sync server needs its newest script)" : S.error === "notready" ? "Saved on this phone. Sync starts once the sync server is set up"
    : S.error ? `Saved on this phone${waiting ? ` (${waiting} to send)` : ""}. Offline: ${esc(S.error)}` : S.lastSync ? `Synced ${ago(S.lastSync)}` : "Not synced yet"} <button class="linkish" id="syncbtn">Sync</button>`;
  $("syncbtn").onclick = () => pull({ quiet: false });
}

// ------------------------------------------------------------------ pair with the extension (or another phone)
/** Scan button (Android app) and a box to type the code. p: id prefix. */
const pairForm = (p) => `${canScan ? `<div class="btns stack"><button id="${p}scan" class="primary">Scan QR code</button></div>` : ""}
  <form id="${p}form" class="field"><label for="${p}code">${canScan ? "Or type the sync code" : "Sync code"}</label><input id="${p}code" class="search big" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"></form>
  <div class="btns stack"><button id="${p}go">Connect</button></div>`;
function bindPair(p) {
  const go = async (text) => { notice(""); try { await joinCode(text); } catch (e) { notice(esc(e.message || e)); } };
  $(p + "form").onsubmit = (e) => { e.preventDefault(); go($(p + "code").value); };
  $(p + "go").onclick = () => go($(p + "code").value);
  if ($(p + "scan")) $(p + "scan").onclick = async () => {
    notice("");
    try { const text = await scanQR(); if (text) await go(text); } catch (e) { notice(esc(e.message || e)); }
  };
}
/** Use a scanned or typed sync code, keeping this phone's sites. */
async function joinCode(text) {
  const code = cleanCode(String(text || "").match(/[0-9A-Za-z]{4}(?:[- ]?[0-9A-Za-z]{4}){4}/)?.[0]);
  if (!code) throw new Error("That isn't a sync code. It looks like XXXX-XXXX-XXXX-XXXX-XXXX.");
  if ((await cloud.current())?.code === code) return toast("This phone already uses that code");
  await switchKeeping(() => cloud.use(code), "Paired");
}

/**
 * Move this phone to another sync code (a scanned or typed one, or an account's), keeping what's on it: after the
 * other side's sites arrive, any of this phone's sites and data it doesn't have yet are sent there. Nothing there is
 * overwritten. If the sync server can't be reached, the phone stays as it was.
 */
async function switchKeeping(change, done) {
  const before = localStorage.getItem("sgm.sync");
  await loadCache();
  const mine = { sites: [...S.sites.values()], data: [...S.data] };
  const r = await change();
  // Same code as before (an account made from this phone's code): nothing moves.
  if (before && r?.switched === false) { toast(done); return start(); }
  await clearCache();
  await pull({ quiet: false });
  if (S.error) {
    const why = S.error === "notready" ? "the sync server isn't set up yet" : S.error;
    if (before) localStorage.setItem("sgm.sync", before); else await cloud.signOut();
    S.sites = new Map(mine.sites.map((s) => [s.origin, s])); S.data = new Map(mine.data); await saveCache();
    notice(`Couldn't connect (${esc(why)}), so this phone stays as it was. Try again when you're online.`);
    return start();
  }
  const add = mine.sites.filter((s) => !S.sites.has(s.origin));
  for (const s of add) { S.sites.set(s.origin, s); S.pending.sites[s.origin] = siteRow(s); }
  const keys = mine.data.filter(([k]) => !S.data.has(k)).map(([k, v]) => (S.data.set(k, v), k));
  S.pending.keys = [...new Set([...S.pending.keys, ...keys])];
  await saveCache();
  toast(add.length ? `${done}. Brought ${add.length} site${add.length === 1 ? "" : "s"} from this phone` : done);
  S.tab = "sites"; S.open = null;
  start();
}

// Optional account (username + password, no email): it only remembers the sync code. Sign in on a new phone to get the same sites.
function renderAccountForm() {
  const connected = !S.local;
  $("view").innerHTML = `<h1 class="q">${connected ? "Save to an account" : "Sign in"}</h1>
      <p class="lede">${connected ? "Keep your sync code in an account, so signing in on another phone or computer finds these sites." : "Sign in to get your sites, or create an account to keep them. Works without a computer. Just a username and password: no email."}</p>
      <form id="aform" class="field"><label for="auser">Username</label><input id="auser" class="search big" autocomplete="username" autocapitalize="none" spellcheck="false">
        <label for="apw">Password (8 characters or more)</label><input id="apw" class="search big" type="password" autocomplete="current-password"></form>
      <p class="unknowns">There's no password reset (no email), so keep your password, or your sync code, somewhere safe.</p>
      <div class="btns stack"><button id="ain" class="primary">Sign in</button><button id="aup">Create account</button><button id="aback">Back</button></div>`;
  const go = async (kind) => {
    notice("");
    try { await switchKeeping(() => cloud.account(kind, $("auser").value, $("apw").value), kind === "signup" ? "Account made" : "Signed in"); }
    catch (e) { notice(esc(e.message || e)); }
  };
  $("aform").onsubmit = (e) => { e.preventDefault(); go("signin"); };
  $("ain").onclick = () => go("signin");
  $("aup").onclick = () => go("signup");
  $("aback").onclick = () => renderAccount();
}

async function clearCache() {
  await Promise.all(["sites", "data", "cursor", "lastSync"].map((k) => setK(k, undefined)));
  S.sites.clear(); S.data.clear(); S.cursor = { sites: EPOCH, data: EPOCH }; S.lastSync = 0; S.tab = "sites"; S.open = null; S.compare = null;
  S.pending = { sites: {}, keys: [] }; await setK("pending", undefined);
}

// ------------------------------------------------------------------ rate a website on the phone
/** A whole-site scan in the extension's format (like a Track rescan), so summaries, prompts and sync all work. */
function scanFrom(r, origin) {
  const scannedAt = new Date().toISOString();
  return { id: scannedAt, mode: "site", page: { url: r.site, origin, platform: "Unknown", scannedAt, jsonld: [], pageless: true }, site: null,
    scores: r.scores, results: r.checks, priority: r.priority, kits: r.kits, unknown: r.unknown, pagesRated: r.pages_rated,
    hitLimit: r.hit_page_limit, rubricVersion: r.rubric_version, pages: r.pages };
}
/** Keep a scan for a tracked site: newest scan and a point on its score history, then sync. */
async function keepScan(origin, scan) {
  const s = scan.scores, h = trend(origin);
  S.data.set("scan:" + origin, scan);
  S.data.set("trend:" + origin, [...h, { t: scan.page.scannedAt, overall: s.overall, seo: s.seo, aeo: s.aeo, geo: s.geo, potential: s.potential_after_top5 ?? null,
    pages: scan.pagesRated ?? null, failing: scan.results.filter((r) => r.ratio != null && r.ratio < 0.999).length }].slice(-200));
  await putData(["scan:" + origin, "trend:" + origin]);
}
/** Rate a site (tracked or not). Shows progress in #scanprog while it runs. */
async function scanSite(origin) {
  if (S.scanning) return notice("A scan is already running. Wait for it to finish.");
  S.scanning = { origin, text: "Starting…" };
  const show = () => { const el = $("scanprog"); if (el) el.textContent = S.scanning ? `${hostOf(origin)}: ${S.scanning.text}` : ""; };
  render();
  try {
    const r = await rateSite(origin + "/", { psi: isNative, onProgress: (text) => { S.scanning.text = text; show(); } });
    const scan = scanFrom(r, origin);
    if (S.sites.has(origin)) await keepScan(origin, scan);
    else S.lookup = { origin, scan };
    toast(`${hostOf(origin)} scored ${scan.scores.overall}`);
  } catch (e) {
    if (!S.sites.has(origin)) S.lookup = { origin, scan: null };
    notice(esc(e.message || e));
  } finally { S.scanning = null; lastScreen = null; render(); }
}

function renderLookup(o) {
  const scan = S.lookup?.origin === o ? S.lookup.scan : null, running = S.scanning?.origin === o;
  const failed = scan ? scan.results.filter((r) => r.ratio != null && r.ratio < 0.999 && r.cat !== "info").sort((a, b) => (b.gain || 0) - (a.gain || 0)) : [];
  $("view").innerHTML = `<nav class="crumb"><button class="back" id="back">‹ Sites</button></nav>
    <div class="hero"><div><b>${esc(hostOf(o))}</b><small>Not tracked · <a href="${esc(o)}" target="_blank" rel="noopener">${esc(o)}</a></small></div></div>
    ${running ? scanBox("Rating the whole site…", "scanprog", `${hostOf(o)}: ${S.scanning.text}`, "Same crawl, checks and scores as the Chrome extension. Takes up to a minute.")
      : scan ? `${scoreBoxes(scan.scores)}<h2 class="sec">SEO snapshot <small>${scan.pagesRated} pages, ${when(scan.page.scannedAt)}</small></h2><div class="summarytext">${summaryText(scan).split("\n").map((l) => `<p>${esc(l)}</p>`).join("")}</div>
        ${failed.length ? `<h2 class="sec">Top fixes <small>${failed.length}</small></h2><div class="list">${failed.slice(0, 6).map(fixRow).join("")}</div>` : ""}
        <div class="btns stack">${failed.length ? `<button id="copyfix">Copy fix prompt</button>` : ""}<button id="track" class="primary">Keep this site</button><button id="rescan">Scan again</button></div>`
      : `<div class="emptybox"><b>Couldn't rate it</b><p>Check the address and your connection, then try again.</p></div><div class="btns stack"><button id="rescan" class="primary">Try again</button></div>`}`;
  $("back").onclick = () => { S.open = null; render(); };
  if ($("copyfix")) $("copyfix").onclick = () => copy(fixAllPrompt(scan), "Fix prompt copied");
  if ($("track")) $("track").onclick = () => quickAdd({ url: o });
  if ($("rescan")) $("rescan").onclick = () => scanSite(o);
}
const fixRow = (r) => `<div class="factor"><span class="dot ${r.ratio > 0.5 ? "s-part" : "s-fail"}"></span><div><b>${esc(r.name)}</b><small>${esc(r.detail || "")}${r.gain ? ` · +${Math.round(r.gain)} pts` : ""}</small></div></div>`;


// ------------------------------------------------------------------ sites
function card(s) {
  const h = trend(s.origin), last = h[h.length - 1], prev = h[h.length - 2];
  const d = last && prev ? last.overall - prev.overall : null;
  const rivals = competitorsOf(s.origin).length;
  const of = s.competitorOf && S.sites.get(s.competitorOf);
  return `<div class="tcard"><button class="topen" data-open="${esc(s.origin)}"><div class="thead"><div><b>${esc(s.name)}</b><small>${last ? "Scanned " + when(last.t) : "Not scanned yet"} · ${s.keywords.length} keyword${s.keywords.length === 1 ? "" : "s"}${rivals ? ` · ${rivals} competitor${rivals === 1 ? "" : "s"}` : ""}${of ? ` · ${s.role === "general" ? "linked to" : "vs"} ${esc(of.name)}` : ""}</small></div>
    <div class="tscore">${ring(last?.overall)}${d ? `<i class="${d > 0 ? "up" : "down"}">${d > 0 ? "+" : ""}${d}</i>` : ""}</div></div>
    ${h.length > 1 ? lineChart([{ name: "Overall", cls: "main", points: h.map((p) => ({ t: p.t, v: p.overall })) }], { height: 54, label: s.name + " score history" }) : ""}</button></div>`;
}

function renderSites() {
  const list = [...S.sites.values()];
  const groups = [["mine", "Your businesses"], ["client", "Clients you manage"], ["competitor", "Competitors"], ["general", "General"]];
  $("view").innerHTML = `<form id="paste" class="ratehero"><label for="pasteurl">Rate any website</label><small>SEO, AI answers and AI search, scored out of 100.</small><div class="row"><input id="pasteurl" class="search big" inputmode="url" autocomplete="off" placeholder="Paste a link"><button class="primary">Rate it</button></div></form>
    ${list.length ? groups.map(([role, title]) => { const xs = list.filter((s) => s.role === role); return xs.length ? `<h2 class="sec">${title} <small>${xs.length}</small></h2><div class="tlist">${xs.map(card).join("")}</div>` : ""; }).join("")
      : `<div class="emptybox"><div class="empty-art" aria-hidden="true"><span></span><span></span><span></span></div><b>Nothing tracked yet</b><p>Paste a link above to rate any website, or press + Quick add to keep one here. Everything works on this phone, with no computer needed.</p></div>`}`;
  $("paste").onsubmit = (e) => {
    e.preventDefault();
    let o; try { o = originOf($("pasteurl").value); } catch { return notice("That doesn't look like a website address. Try something like example.com."); }
    notice("");
    if (S.sites.has(o)) return openSite(o);
    S.lookup = null; S.open = o; scrollTo(0, 0);
    scanSite(o);
  };
  bindOpen();
}
const bindOpen = () => document.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => openSite(b.dataset.open)));
function openSite(o) { S.open = o; S.tab = "sites"; render(); scrollTo(0, 0); }

/** A score ring: fills up and counts up when its screen opens. */
const ring = (n, size = "") => `<span class="sring ${size} ${status(n)}"><svg viewBox="0 0 40 40" aria-hidden="true"><circle class="trk" cx="20" cy="20" r="17" pathLength="100"/>${n == null ? "" : `<circle class="val" cx="20" cy="20" r="17" pathLength="100" style="--v:${n}"/>`}</svg><b ${n == null ? "" : `data-n="${n}"`}>${n ?? "–"}</b></span>`;
function scoreBoxes(p) {
  return `<div class="scorebox"><div class="big">${ring(p?.overall, "lg")}<span>Overall</span></div><div class="three">${[["SEO", p?.seo], ["AEO", p?.aeo], ["GEO", p?.geo]].map(([k, n]) => `<div>${ring(n)}<span>${k}</span></div>`).join("")}</div></div>`;
}
const scanBox = (title, id, text, sub = "") => `<div class="scanbox"><span class="sweep" aria-hidden="true"></span><div><b>${title}</b><p id="${id}">${esc(text)}</p>${sub ? `<small>${sub}</small>` : ""}</div><i class="scanbar" aria-hidden="true"></i></div>`;

function renderSite(o) {
  const s = S.sites.get(o);
  if (!s) return S.lookup?.origin === o || S.scanning?.origin === o ? renderLookup(o) : ((S.open = null), renderSites());
  const running = S.scanning?.origin === o;
  const h = trend(o), p = h[h.length - 1] || null, scan = scanOf(o), report = S.data.get("kwreport:" + o);
  const of = s.competitorOf && S.sites.get(s.competitorOf);
  const rivals = competitorsOf(o);
  const failed = scan ? scan.results.filter((r) => r.ratio != null && r.ratio < 0.999 && r.cat !== "info").sort((a, b) => (b.gain || 0) - (a.gain || 0)) : [];
  const kws = s.keywords;
  const weak = report ? report.rows.filter((r) => group(r.pos) !== "top") : [];
  $("view").innerHTML = `<nav class="crumb"><button class="back" id="back">‹ Sites</button></nav>
    <div class="hero"><div><b>${esc(s.name)}</b><small>${ROLES[s.role]}${of ? ` ${s.role === "general" ? "linked to" : "of"} <button class="linkish" data-open="${esc(of.origin)}">${esc(of.name)}</button>` : ""} · <a href="${esc(o)}" target="_blank" rel="noopener">${esc(hostOf(o))}</a></small></div></div>
    ${scoreBoxes(p)}
    ${running ? scanBox("Rating the whole site…", "scanprog", `${hostOf(o)}: ${S.scanning.text}`) : `<div class="btns stack"><button id="scannow"${scan ? "" : ` class="primary"`}>${scan ? "Scan again" : "Scan now"}</button></div>`}
    ${h.length > 1 ? lineChart([{ name: "Overall", cls: "main", points: h.map((x) => ({ t: x.t, v: x.overall })) }], { label: s.name + " score history" }) : ""}
    ${scan ? `<h2 class="sec">SEO snapshot <small>scanned ${when(scan.page.scannedAt)}</small></h2><div class="summarytext">${summaryText(scan).split("\n").map((l) => `<p>${esc(l)}</p>`).join("")}</div>
      ${failed.length ? `<h2 class="sec">Top fixes <small>${failed.length}</small></h2><div class="list">${failed.slice(0, 6).map(fixRow).join("")}</div>
        <div class="btns stack"><button id="copyfix" class="primary">Copy fix prompt</button></div>` : ""}`
      : running ? "" : `<div class="emptybox"><b>Not scanned yet</b><p>Press Scan now to rate the whole site on this phone. Scans from the Chrome extension show up here too.</p></div>`}
    <h2 class="sec">Keywords <small>${kws.length}</small></h2>
    ${kws.length ? `<table class="mini"><tr><th>Search</th><th>Position</th><th></th></tr>${kws.map((q) => { const r = latestPos(o, q); return `<tr><td>${esc(q)}${r ? `<small class="when">${when(r.t)}</small>` : ""}</td><td class="${r ? posStatus(r.pos) : ""}"><b class="posn">${r ? (r.pos ? "#" + r.pos : "not top " + (r.of || 10)) : "not checked"}</b></td><td><button class="tdel inline" data-rmkw="${esc(q)}" aria-label="Remove ${esc(q)}">×</button></td></tr>`; }).join("")}</table>
      ${S.checking?.origin === o ? scanBox("Checking Google…", "checkprog", S.checking.text)
        : canSearch() ? `<div class="btns stack"><button id="checkkw" class="primary">Check positions on Google</button></div><p class="unknowns">Opens Google on this phone and searches each keyword. If Google asks for a robot check, solve it there and the check carries on.</p>`
        : `<p class="unknowns">Checking positions needs the Android app.</p>`}` : ""}
    <form id="addkw" class="field"><label for="kwin">Add keywords (comma separated)</label><div class="row"><input id="kwin" class="search" placeholder="roof repair york pa"><button>Add</button></div></form>
    ${report?.rows?.length ? `<h2 class="sec">Keyword report <small>${when(report.t)}</small></h2>
      <div class="kwsum"><span class="s-pass"><b>${report.rows.filter((r) => group(r.pos) === "top").length}</b>top 3</span><span class="s-part"><b>${report.rows.filter((r) => group(r.pos) === "close").length}</b>rest of page 1</span><span class="s-fail"><b>${report.rows.filter((r) => group(r.pos) === "behind").length}</b>further down</span></div>
      ${weak.length ? `<div class="list">${weak.map((r) => `<div class="factor"><span class="dot ${posStatus(r.pos)}"></span><div><b>${esc(r.q)} · ${r.pos ? "#" + r.pos : "not in top " + (r.of || 10)}</b>${r.score != null ? `<small>on-page ${r.score} vs ${esc((r.others || []).join(", ") || "–")}</small>` : ""}${r.verdict ? `<p>${esc(r.verdict)}</p>` : ""}${r.gaps?.length ? `<small>${r.gaps.map((g) => esc(g.fix || g.label)).join(" ")}</small>` : ""}${r.top?.length ? `<small>Top: ${r.top.map((x) => esc(x.host)).join(", ")}</small>` : ""}</div></div>`).join("")}</div>
        <div class="btns stack"><button id="copykw" class="primary">Copy keyword fix prompt</button></div>` : `<p class="verdict">Every checked keyword is in the top 3. ${esc(OFF_PAGE)}</p>`}` : ""}
    ${report?.ideas?.length ? `<h2 class="sec">Keyword ideas <small>${report.ideas.length}</small></h2><div class="list">${report.ideas.map((x) => `<div class="factor"><div><b>${esc(x.q)}</b><small>${x.kind === "question" ? "People also ask" : "Related search"}</small></div><button data-addkw="${esc(x.q)}">Add</button></div>`).join("")}</div>` : ""}
    ${linkedTo(o).length ? `<h2 class="sec">Linked sites <small>${linkedTo(o).length}</small></h2><div class="tlist">${linkedTo(o).map(card).join("")}</div>` : ""}
    ${s.role === "mine" || s.role === "client" ? `<h2 class="sec">Competitors <small>${rivals.length}</small></h2>${rivals.length ? compareTable(s, rivals) : `<p class="lede">None linked yet.</p>`}
      <div class="btns"><button id="addcomp">Add a competitor</button><button id="gocompare">Compare</button></div>` : ""}
    <h2 class="sec">This site</h2>
    <div class="field"><label for="role">This site is</label><select id="role" class="search">${Object.entries({ mine: "My business", client: "A client I manage", competitor: "A competitor", general: "Just in general" }).map(([k, l]) => `<option value="${k}" ${k === s.role ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div class="field" id="ofwrap" ${canLink(s.role) ? "" : "hidden"}><label for="of">Competitor of, or linked to</label><select id="of" class="search"><option value="">(not linked)</option>${owned().filter((x) => x.origin !== o).map((x) => `<option value="${esc(x.origin)}" ${x.origin === s.competitorOf ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>
    <div class="btns"><button id="saverole">Save</button><button id="untrack" class="danger">Stop tracking</button></div><div id="untrackbox"></div>`;
  $("back").onclick = () => { S.open = null; render(); };
  bindOpen();
  if ($("scannow")) $("scannow").onclick = () => scanSite(o);
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
  if ($("checkkw")) $("checkkw").onclick = () => checkKeywords(o);
  document.querySelectorAll("[data-addkw]").forEach((b) => (b.onclick = () => putSite({ ...s, keywords: [...new Set([...s.keywords, b.dataset.addkw.toLowerCase()])] }).then(() => toast("Keyword added")).catch(fail)));
  $("role").onchange = () => ($("ofwrap").hidden = !canLink($("role").value));
  $("saverole").onclick = () => { const role = $("role").value; putSite({ ...s, role, competitorOf: canLink(role) ? $("of").value || null : null }).then(() => toast("Saved")).catch(fail); };
  $("untrack").onclick = () => {
    $("untrackbox").innerHTML = `<div class="confirm"><p><b>Stop tracking ${esc(s.name)}?</b> It's removed from the extension too at its next sync. Its history stays on the computer until then.</p><div class="btns"><button id="unyes" class="danger solid">Stop tracking</button><button id="unno">Keep it</button></div></div>`;
    $("unno").onclick = () => ($("untrackbox").innerHTML = "");
    $("unyes").onclick = () => { S.open = null; putSite(s, true).then(() => toast(`Stopped tracking ${s.name}`)).catch(fail); };
  };
}

/** Check a site's keywords on Google from the phone, record positions for every tracked site, and update its report. */
async function checkKeywords(o) {
  if (S.checking) return;
  const s = S.sites.get(o), progress = (text) => { S.checking.text = text; const el = $("checkprog"); if (el) el.textContent = text; };
  S.checking = { origin: o, text: "Opening Google…" };
  render();
  try {
    const found = await searchGoogle(s.keywords, readGoogle, progress);
    const keys = new Set(), results = [];
    for (const { q, serp } of found) {
      if (!serp?.organic?.length) { results.push({ q, error: true }); continue; }
      serp.query = q;
      for (const x of S.sites.values()) {
        if (x.origin !== o && !serp.organic.some((r) => hostOf(r.url) === hostOf(x.origin))) continue;
        S.data.set("kwpos:" + x.origin, addReading(kwpos(x.origin), serp, x.origin));
        keys.add("kwpos:" + x.origin);
      }
      const mine = serp.organic.find((r) => hostOf(r.url) === hostOf(o));
      results.push({ q, pos: mine ? mine.position : null, of: serp.organic.length, serp });
    }
    const failed = results.filter((r) => r.error).length;
    if (results.length > failed) {
      S.data.set("kwreport:" + o, await mergeReport(S.data.get("kwreport:" + o), o, s.keywords, results, { onProgress: progress }));
      keys.add("kwreport:" + o);
      await saveCache();
      await putData([...keys]);
      toast(`Checked ${results.length - failed} keyword${results.length - failed === 1 ? "" : "s"}`);
    }
    if (failed) notice(`Couldn't read Google's results for ${failed} keyword${failed === 1 ? "" : "s"}. Nothing was recorded for ${failed === 1 ? "it" : "them"}.`);
  } catch (e) { fail(e); }
  finally { S.checking = null; lastScreen = null; render(); }
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
  const about = `<h2 class="sec">How it works</h2>
    <p class="lede">Rate any website, keep sites, compare competitors and check Google positions, all on this phone. Everything is saved here first. A computer is optional: pair with the Chrome extension to share your sites with it.</p>
    <p class="unknowns">App build ${esc(String(BUILD))}. <button class="linkish" id="checkupd">Check for updates</button></p>
    <p class="unknowns">SEO God Mode · Built by <a href="https://theagencyzero.com" target="_blank" rel="noopener">theagencyzero.com</a></p>`;
  if (!s) {
    $("view").innerHTML = `<h2 class="sec first">Sync (optional)</h2>
      <p class="lede">Everything is saved on this phone and you don't need anything else. Turn on sync only to back it up, or to share it with a computer or another phone.</p>
      <div class="btns stack"><button id="syncnew">Turn on sync</button><button id="sacct">Sign in or create account</button></div>
      <h2 class="sec">Connect your computer</h2>
      <p class="lede">In the Chrome extension, open <b>Settings › Sync with your phone</b>. ${canScan ? "Scan the QR code it shows, or type its code." : "Type the code it shows."} This phone's sites come along.</p>
      ${pairForm("j")}${about}`;
    $("syncnew").onclick = () => switchKeeping(() => cloud.use(newCode()), "Sync is on").catch(fail);
    $("sacct").onclick = () => renderAccountForm();
    $("checkupd").onclick = () => checkUpdate(true);
    return bindPair("j");
  }
  $("view").innerHTML = `<h2 class="sec first">Account</h2>
    <div class="upd">${s?.user ? `<p>Signed in as <b>${esc(s.user)}</b>. Sign in with it on another phone or computer to see the same sites.</p>` : ""}<p>Your sync code${S.lastSync ? ` (last synced ${ago(S.lastSync)})` : ""}:</p><p class="synccode">${esc(s?.code || "")}</p>
    <p class="unknowns">Your sites, keywords, scores, positions, keyword reports and newest scans are kept in SEO God Mode's online database under this code, and cached on this phone so the app opens offline. Anyone with the code can see and change them, so keep it private.</p>
    <div class="btns"><button id="copycode">Copy code</button>${s?.user ? "" : `<button id="acctsave">Save to an account</button>`}<button id="signout">${s?.user ? "Sign out" : "Turn off sync"}</button></div></div>
    <h2 class="sec">Connect your computer</h2>
    <p class="lede"><b>Extension not synced yet?</b> In it, open <b>Settings › Sync with your phone › I have a code</b> and type the code above. Its sites join yours.</p>
    <p class="lede"><b>Extension already synced?</b> ${canScan ? "Scan the QR code it shows, or type its code." : "Type the code it shows."} This phone's sites come along.</p>
    ${pairForm("j")}
    <details class="fold"><summary>Show this phone's QR code</summary><div class="pad"><div class="pair">${qrSvg(s?.code || "", "QR code of this phone's sync code")}<p>Scan it with the app on another phone to see the same sites there.</p></div></div></details>
    ${about}`;
  $("copycode").onclick = () => copy(s?.code || "", "Sync code copied");
  $("checkupd").onclick = () => checkUpdate(true);
  bindPair("j");
  if (!s?.user) $("acctsave").onclick = () => renderAccountForm();
  // Signing out of an account clears its sites from this phone. Turning off sync without one keeps them here.
  $("signout").onclick = async () => {
    await cloud.signOut();
    if (s?.user) await clearCache();
    else { S.cursor = { sites: EPOCH, data: EPOCH }; S.pending = { sites: {}, keys: [] }; S.error = null; S.lastSync = 0; await saveCache(); }
    S.tab = "account"; start();
  };
}

// ------------------------------------------------------------------ quick add (bottom sheet)
let sheetT;
function openSheet() { clearTimeout(sheetT); const s = $("sheet"); s.classList.remove("closing"); s.hidden = false; }
function closeSheet() { const s = $("sheet"); s.classList.add("closing"); clearTimeout(sheetT); sheetT = setTimeout(() => { s.hidden = true; s.classList.remove("closing"); }, reduced ? 0 : 190); }

function quickAdd(pre = {}) {
  const w = { role: pre.role || null, of: pre.of ?? null, url: pre.url || "", fixed: !!pre.role };
  const sheet = $("sheet"), box = sheet.querySelector(".sheetbox");
  const close = () => { closeSheet(); document.removeEventListener("keydown", esc_); };
  const esc_ = (e) => e.key === "Escape" && close();
  document.addEventListener("keydown", esc_);
  sheet.onclick = (e) => { if (e.target === sheet) close(); };
  const tile = (attr, val, title, desc, on) => `<button class="tile ${on ? "on" : ""}" ${attr}="${esc(val)}" aria-pressed="${on}"><b>${title}</b><small>${desc}</small></button>`;
  const draw = () => {
    const biz = owned();
    box.innerHTML = `<div class="sheethead"><h2 id="sheettitle" class="q">${w.role ? "Add " + { client: "a client", mine: "a website of yours", competitor: "a competitor", general: "a site in general" }[w.role] : "Quick add"}</h2><button id="qclose" class="linkish">Close</button></div>
      ${!w.role ? `<div class="tiles">${tile("data-qa", "client", "A client", "You manage its SEO.", false)}${tile("data-qa", "mine", "A website of mine", "Your own business.", false)}${tile("data-qa", "competitor", "A competitor", "Then pick whose competitor it is.", false)}${tile("data-qa", "general", "Just in general", "Any other site you want a snapshot of.", false)}</div>`
      : `<form id="qform"><div class="field"><label for="qurl">Website address</label><input id="qurl" class="search big" inputmode="url" autocomplete="off" placeholder="example.com" value="${esc(w.url)}"></div>
        ${w.role === "general" && biz.length ? `<div class="field"><label>Link it to one of your businesses? (optional)</label><div class="tiles">${biz.map((b) => tile("data-of", b.origin, esc(b.name), b.role === "client" ? "Client" : "Your business", w.of === b.origin)).join("")}${tile("data-of", "", "No link", "Keep it on its own.", !w.of)}</div></div>` : ""}
        ${w.role === "competitor" ? `<div class="field"><label>Whose competitor is it?</label><div class="tiles">${biz.map((b) => tile("data-of", b.origin, esc(b.name), b.role === "client" ? "Client" : "Your business", w.of === b.origin)).join("")}${tile("data-of", "", "Not linked", "Track it on its own.", w.of === "")}</div></div>` : ""}
        <div class="field"><label for="qkw">Searches it should rank for (optional, comma separated)</label><input id="qkw" class="search" placeholder="roof repair york pa, metal roofing"></div>
        <div class="btns stack"><button class="primary" id="qsave" ${w.role === "competitor" && biz.length && w.of == null ? "disabled" : ""}>Add</button>${w.fixed ? "" : `<button type="button" id="qback">Back</button>`}</div></form>`}`;
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
        role: w.role, competitorOf: canLink(w.role) ? w.of || null : null };
      $("qsave").disabled = true;
      try {
        await putSite(site); close();
        if (S.lookup?.origin === o) { await keepScan(o, S.lookup.scan); S.lookup = null; toast(`Tracking ${hostOf(o)}`); }
        else toast(`Added ${hostOf(o)}. Press Scan now to rate it`);
        openSite(o);
      }
      catch (err) { $("qsave").disabled = false; fail(err); }
    };
  };
  draw();
  openSheet();
  box.querySelector("button, input")?.focus();
}

const fail = (e) => notice(esc(e.message || e));

// ------------------------------------------------------------------ app
// A new screen slides in, its parts arrive one after another, and rings count up. A background sync that redraws the
// same screen animates nothing, so the page never flickers.
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TABS = ["sites", "compare", "account"];
let lastScreen = null, lastDepth = 0;
function countUp(el) {
  const to = +el.dataset.n, t0 = performance.now(), dur = 950;
  const step = (t) => { if (!el.isConnected) return; const k = Math.min(1, (t - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
  el.textContent = 0; requestAnimationFrame(step);
}
function animateScreen() {
  const v = $("view"), depth = TABS.indexOf(S.tab) * 2 + (S.open ? 1 : 0), screen = S.tab + "|" + (S.open || "");
  if (screen === lastScreen) return v.classList.remove("enter", "back");
  const back = lastScreen !== null && depth < lastDepth, first = lastScreen === null;
  lastScreen = screen; lastDepth = depth;
  v.classList.remove("enter", "back");
  [...v.children].forEach((c, i) => c.style.setProperty("--i", Math.min(i, 10)));
  v.querySelectorAll(".tlist > *, .list > *").forEach((c, i) => c.style.setProperty("--j", Math.min(i, 10)));
  v.querySelectorAll(".chart .ln.main").forEach((l) => l.setAttribute("pathLength", "1"));
  if (reduced) return;
  void v.offsetWidth;
  v.classList.add("enter");
  if (back && !first) v.classList.add("back");
  v.querySelectorAll("[data-n]").forEach(countUp);
}
function render() {
  if ($("mode").hidden) return;
  document.querySelectorAll("#mode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === S.tab)));
  $("pill").style.setProperty("--tab", TABS.indexOf(S.tab));
  if (S.tab === "compare") renderCompare();
  else if (S.tab === "account") return void renderAccount().then(animateScreen);
  else if (S.open) renderSite(S.open);
  else renderSites();
  animateScreen();
}

let poll;
async function start() {
  clearInterval(poll);
  $("mode").hidden = false; $("quickadd").hidden = false;
  await loadCache();
  S.local = !(await cloud.current());
  render(); paintStatus();
  await pull({ quiet: false });
  // While the app is open: every 20 seconds, and whenever it comes back to the front.
  poll = setInterval(() => document.visibilityState === "visible" && pull(), 20000);
}

document.querySelectorAll("#mode button").forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; S.open = null; notice(""); render(); scrollTo(0, 0); }));
// A light tap on every button press.
document.addEventListener("pointerdown", (e) => e.target.closest?.("button, .btn, a, select") && haptic("tap"), { passive: true });

// ------------------------------------------------------------------ updates: a pop-up when a newer app is published
let BUILD = "?", lastCheck = 0;
fetch("./build.json").then((r) => r.json()).then((j) => (BUILD = j.build || "dev")).catch(() => {});
async function checkUpdate(asked = false) {
  if (!asked && Date.now() - lastCheck < 3 * 3600e3) return;
  lastCheck = Date.now();
  const u = await newerBuild();
  if (!u) return asked && toast("You have the newest version");
  if (!asked && localStorage.getItem("sgm.skipBuild") === String(u.build)) return;
  const sheet = $("sheet"), box = sheet.querySelector(".sheetbox");
  box.innerHTML = `<div class="sheethead"><h2 id="sheettitle" class="q">Update available</h2></div>
    <p class="lede">A newer version of SEO God Mode is ready (build ${esc(String(u.build))}, you have ${esc(String(u.mine || "an older one"))}).${u.notes ? ` ${esc(u.notes)}` : ""}</p>
    <p class="unknowns">Update now downloads it in your browser. Open the download and tap Install; your sites stay on the phone.</p>
    <div class="btns stack"><button id="updnow" class="primary">Update now</button><button id="updlater">Later</button></div>`;
  sheet.onclick = null;
  openSheet();
  $("updnow").onclick = () => { closeSheet(); location.href = u.apk; };
  $("updlater").onclick = () => { localStorage.setItem("sgm.skipBuild", String(u.build)); closeSheet(); };
}
$("quickadd").onclick = () => quickAdd();
document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "visible") return; checkUpdate(); if (!$("mode").hidden) pull(); });
setInterval(paintStatus, 60000);
start();
checkUpdate();
