/**
 * The Compete and Track views of the side panel.
 *  Compete: why the pages on a Google results page outrank you, keyword ideas for what you want to rank for, and a
 *           Google Business Profile audit (Maps place page or the panel beside search results).
 *  Track:   websites you follow, their score history and keyword positions over time, export/import, and updates.
 */
import { readGoogle } from "./lib/google.js";
import { auditBusiness, DIRECTORIES, keywordIdeas, sameDomain, whyTheyRank } from "./lib/compete.js";
import { rateSite, siteOrigins } from "./lib/siterate.js";
import { grade } from "./lib/rubric.js";
import { history, saveScan } from "./lib/proof.js";
import * as T from "./lib/track.js";
import * as U from "./lib/update.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const when = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const ALL_SITES = ["https://*/*", "http://*/*"];
const GOOGLE = ["https://www.google.com/*", "https://google.com/*", "https://maps.google.com/*"];
const v = { sub: "rank", google: null, rank: null, ideas: null, biz: null, kw: "", detail: null };
let ui; // helpers passed in by sidepanel.js: toast, copy, notice, download, activeTab

const status = (n) => (n == null ? "" : n >= 85 ? "s-pass" : n >= 65 ? "s-part" : "s-fail");
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
  return `<div class="field"><label for="mysel">Your website</label><select id="mysel" class="search">${list.map((s) => `<option value="${esc(s.origin)}" ${s.origin === me?.origin ? "selected" : ""}>${esc(s.name)}${s.role === "client" ? " (client)" : ""}</option>`).join("")}</select></div>`;
};
function bindSite(rerender) {
  const sel = $("mysel");
  if (sel) sel.onchange = async () => { await chrome.storage.local.set({ mySite: sel.value }); rerender(); };
  const save = $("savesite");
  if (save) save.onclick = async () => { const val = $("mysite").value.trim(); if (!val) return; const o = await T.trackSite(val); await chrome.storage.local.set({ mySite: o }); ui.toast("Saved and tracking"); rerender(); };
}

// ====================================================================== COMPETE
export async function renderCompete(helpers) {
  ui = helpers;
  const el = $("view");
  const tab = await ui.activeTab();
  const onGoogle = /^https:\/\/(www\.)?google\.[a-z.]+\/(search|maps)/.test(tab?.url || "");
  if (onGoogle && (!v.google || v.google.url !== tab.url) && (await chrome.permissions.contains({ origins: GOOGLE }))) {
    try { v.google = (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readGoogle }))[0].result; } catch { v.google = null; }
    if (v.google?.kind === "serp") T.recordPositions(v.google);
  }
  if (!onGoogle) v.google = null;
  if (v.google?.kind === "maps" && v.sub === "rank") v.sub = "biz";
  el.innerHTML = `<div class="subnav">${[["rank", "Why they rank"], ["ideas", "Keyword ideas"], ["biz", "Business profile"]].map(([id, l]) => `<button data-sub="${id}" class="${v.sub === id ? "on" : ""}">${l}</button>`).join("")}</div><div id="sub"></div>`;
  el.querySelectorAll("[data-sub]").forEach((b) => (b.onclick = () => { v.sub = b.dataset.sub; renderCompete(ui); }));
  if (v.sub === "rank") await renderRank(onGoogle, tab);
  else if (v.sub === "ideas") await renderIdeas();
  else await renderBiz(onGoogle, tab);
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
    s.innerHTML = `<p class="lede">Search what you want to rank for, then this shows who ranks, why, and what to change. It reads the results page you open; it never searches on its own.</p>
      ${searchBox("What do you want to rank for?", "roof repair york pa", v.kw)}${await siteSelect()}
      ${onGoogle && !(await chrome.permissions.contains({ origins: GOOGLE })) ? `<button id="allowg" class="primary run">Allow reading Google results</button>` : ""}`;
    bindSearch(); bindSite(() => renderCompete(ui));
    const ag = $("allowg"); if (ag) ag.onclick = async () => { if (await access(GOOGLE, "Allow access to google.com so the extension can read the results you open.")) { v.google = null; renderCompete(ui); } };
    return;
  }
  v.kw = g.query;
  const pos = me ? g.organic.find((o) => sameDomain(o.url, me.origin)) : null;
  const r = v.rank?.query === g.query && v.rank?.site === me?.origin ? v.rank : null;
  s.innerHTML = `<div class="serphead"><div><span>Search</span><b>${esc(g.query)}</b></div>
      <div class="pos ${pos ? (pos.position <= 3 ? "s-pass" : pos.position <= 10 ? "s-part" : "s-fail") : "s-fail"}"><span>${me ? esc(me.name) : "Your site"}</span><b>${pos ? "#" + pos.position : me ? "Not in top " + g.organic.length : "–"}</b></div></div>
    ${g.blocked ? `<p class="notice">Google is showing a robot check. Solve it in the tab, then press Compare again.</p>` : ""}
    ${await siteSelect()}
    <ol class="serplist">${g.organic.slice(0, 10).map((o) => `<li class="${me && sameDomain(o.url, me.origin) ? "me" : DIRECTORIES.test(hostOf(o.url)) ? "dir" : ""}"><span>${o.position}</span><div><b>${esc(o.title)}</b><small>${esc(hostOf(o.url))}${DIRECTORIES.test(hostOf(o.url)) ? " · directory, skipped" : ""}</small></div>${me && !sameDomain(o.url, me.origin) && !DIRECTORIES.test(hostOf(o.url)) ? `<button class="linkish addcomp" data-comp="${esc(new URL(o.url).origin)}" title="Track as a competitor of ${esc(me.name)}">+ Track</button>` : ""}</li>`).join("")}</ol>
    ${g.local?.length ? `<h2 class="sec">Map pack</h2><table class="mini"><tr><th>Business</th><th>Rating</th><th>Reviews</th></tr>${g.local.map((l) => `<tr><td>${esc(l.name)}</td><td>${l.rating ?? "–"}</td><td>${l.reviews ?? "–"}</td></tr>`).join("")}</table>` : ""}
    <div class="stack"><button id="cmp" class="primary run">${r ? "Compare again" : `Compare the top ${Math.min(8, g.organic.filter((o) => !DIRECTORIES.test(hostOf(o.url))).length)} pages with mine`}</button></div>
    <div id="rankout"></div>`;
  bindSite(() => renderCompete(ui));
  s.querySelectorAll("[data-comp]").forEach((b) => (b.onclick = async () => {
    await T.trackSite(b.dataset.comp, hostOf(b.dataset.comp), "competitor", me.origin);
    b.textContent = "Tracked"; b.disabled = true; ui.toast(`Tracking ${hostOf(b.dataset.comp)} as a competitor of ${me.name}`);
  }));
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

function rankReport(r) {
  const me = r.me;
  if (!me) return `<p class="notice">Couldn't read your page (${esc(r.myUrl)}). Check the address and that the site is up.</p>`;
  return `<h2 class="sec">Where they're ahead <small>${r.rivals.length} pages compared</small></h2>
    ${r.behind.length ? `<div class="list">${r.behind.map((f) => `<div class="factor"><span class="dot s-fail"></span><div><b>${esc(f.label)}</b><small>Top pages: ${esc(f.display[0])} · You: ${esc(f.display[1])}</small><p>${esc(f.fix)}</p></div></div>`).join("")}</div>` : `<p class="lede">You match or beat the top pages on every on-page factor measured. The gap is likely off-page (links, reviews, brand). See "Not measured".</p>`}
    <div class="btns stack"><button data-copy="fix" class="primary">Copy fix prompt</button><button data-copy="brief">Copy content brief</button></div>
    <h2 class="sec">Every factor</h2><table class="mini"><tr><th>Factor</th><th>Top pages</th><th>You</th></tr>${r.rows.map((f) => `<tr class="${f.behind ? "bad" : ""}"><td>${esc(f.label)}</td><td>${esc(f.display[0])}</td><td>${esc(f.display[1])}</td></tr>`).join("")}</table>
    ${r.topicGaps.length ? `<h2 class="sec">Topics they cover, you don't</h2><div class="chips">${r.topicGaps.map((t) => `<span class="chip">${esc(t.topic)} <b>${t.rivals}</b></span>`).join("")}</div>` : ""}
    ${r.paa.length || r.rivalQuestions.length ? `<h2 class="sec">Questions to answer</h2><ul class="qs">${[...r.paa.map((q) => [q, "People also ask"]), ...r.rivalQuestions.map((q) => [q, "competitor heading"])].slice(0, 12).map(([q, src]) => `<li>${esc(q)} <small>${src}</small></li>`).join("")}</ul>` : ""}
    <h2 class="sec">Content brief</h2><div class="brief"><p>Aim for about <b>${r.brief.targetWords ?? "?"}</b> words in <b>${r.brief.sections ?? "?"}</b> sections (the median of the top pages).</p>
      ${r.brief.outline.length ? `<p>Cover: ${r.brief.outline.map(esc).join(", ")}.</p>` : ""}${r.brief.schema.length ? `<p>Schema they use that you don't: ${r.brief.schema.map(esc).join(", ")}.</p>` : ""}</div>
    <h2 class="sec">Top pages</h2><table class="mini"><tr><th>#</th><th>Site</th><th>Words</th><th>Title</th></tr>${r.rivals.map((x) => `<tr><td>${x.position}</td><td>${esc(x.host)}</td><td>${x.words}</td><td>${esc(x.title.slice(0, 60))}</td></tr>`).join("")}
      <tr class="me"><td>${r.myPosition ?? "–"}</td><td>you</td><td>${me.words}</td><td>${esc(me.title.slice(0, 60))}</td></tr></table>
    ${r.failed.length ? `<p class="unknowns">Couldn't read: ${r.failed.map(esc).join(", ")}.</p>` : ""}
    <p class="unknowns">Not measured: ${r.notMeasured.map(esc).join("; ")}.</p>`;
}

const RULES = `Rules: use only facts that are on the site or that I confirm, and write [CONFIRM: ...] for anything you'd have to guess. Don't copy competitors' text, photos, reviews or claims; use their coverage as a checklist and write original content. Keep the design. Verify the live page after deploying. Don't promise rankings.`;

function rankPrompt(r) {
  return `Help my page rank for "${r.query}". My page: ${r.myUrl} (currently ${r.myPosition ? "#" + r.myPosition : "not in the top " + (r.rivals.length + r.skipped.length)}).
I compared it with the ${r.rivals.length} pages ranking above it (SEO God Mode, ${new Date().toISOString().slice(0, 10)}). On-page factors where they're ahead (OBSERVED):
${r.behind.map((f, i) => `${i + 1}. ${f.label}: top pages ${f.display[0]}, mine ${f.display[1]}. ${f.fix}`).join("\n") || "- None. The gap is probably off-page (links, reviews, brand)."}
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
    <button class="primary run">Find keyword ideas</button></form><div id="ideasout"></div>`;
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
  const dot = (on) => `<i class="cov ${on == null ? "" : on ? "s-pass" : "s-fail"}"></i>`;
  const group = (kind, title) => { const xs = r.ideas.filter((i) => i.kind === kind); return xs.length ? `<h2 class="sec">${title} <small>${xs.length}</small></h2><ul class="ideas">${xs.slice(0, 15).map((i) =>
    `<li><a href="https://www.google.com/search?q=${encodeURIComponent(i.phrase)}" target="_blank" rel="noopener">${esc(i.phrase)}</a>${i.on ? `<span title="title / headings / body">${dot(i.on.title)}${dot(i.on.headings)}${dot(i.on.body)}</span>` : ""}</li>`).join("")}</ul>` : ""; };
  $("ideasout").innerHTML = `${r.me ? "" : `<p class="notice">Couldn't read your page, so coverage isn't shown.</p>`}
    ${r.changes.length ? `<h2 class="sec">Changes for "${esc(r.keyword)}"</h2><div class="list">${r.changes.map((c) => `<div class="factor"><span class="dot s-part"></span><div><b>${esc(c.what)}</b><small>Now: ${esc(c.now)}</small><p>${esc(c.do)}</p></div></div>`).join("")}</div>` : r.me ? `<p class="lede">Your page already targets "${esc(r.keyword)}" well. Work on the questions below.</p>` : ""}
    <div class="btns stack"><button id="kwcopy" class="primary">Copy fix prompt</button>${me ? `<button id="kwtrack">Track this keyword</button>` : ""}</div>
    <p class="unknowns">Dots: in your title, headings, body. Ideas come from Google autocomplete${r.sources.extra ? " and the results page" : ""}; they show what people type, not how often (no volumes).</p>
    ${group("question", "Questions people ask")}${group("buyer", "Buyer searches")}${group("comparison", "Comparisons")}${group("related", "Related")}`;
  $("kwcopy").onclick = () => ui.copy(ideasPrompt(r), "Fix prompt copied");
  const tk = $("kwtrack"); if (tk) tk.onclick = async () => { const site = await mySite(); await T.setKeywords(site.origin, [...site.keywords, r.keyword]); ui.toast("Keyword tracked"); };
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
    ${a.peers.length ? `<h2 class="sec">Map pack on this search</h2><table class="mini"><tr><th>Business</th><th>Rating</th><th>Reviews</th></tr>${a.peers.map((l) => `<tr><td>${esc(l.name)}</td><td>${l.rating ?? "–"}</td><td>${l.reviews ?? "–"}</td></tr>`).join("")}</table>` : ""}
    <p class="unknowns">Read from what Google shows on screen. Grey dots weren't visible here (for example the description sits on the About tab). Profile edits happen at business.google.com.</p>`;
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
  return `<div class="tcard" data-open="${esc(s.origin)}"><div class="thead"><div><b>${esc(s.name)}</b><small>${last ? "Scanned " + when(last.t) : "Not scanned yet"} · ${s.keywords.length} keyword${s.keywords.length === 1 ? "" : "s"}${rivals ? ` · ${rivals} competitor${rivals === 1 ? "" : "s"}` : ""}${of ? ` · vs ${esc(of.name)}` : ""}</small></div>
    <div class="tscore ${status(last?.overall)}">${last ? last.overall : "–"}${d ? `<i class="${d > 0 ? "up" : "down"}">${d > 0 ? "+" : ""}${d}</i>` : ""}</div></div>
    ${h.length > 1 ? T.lineChart([{ name: "Overall", cls: "main", points: h.map((p) => ({ t: p.t, v: p.overall })) }], { height: 60, label: s.name + " score history" }) : ""}</div>`;
}

export async function renderTrack(helpers) {
  ui = helpers;
  const el = $("view");
  const list = await T.trackedSites();
  if (v.detail && list.some((s) => s.origin === v.detail)) return renderSiteDetail(v.detail);
  const owned = list.filter(T.isOwned);
  const groups = [["mine", "Your businesses"], ["client", "Clients you manage"], ["competitor", "Competitors"]];
  const sections = (await Promise.all(groups.map(async ([role, title]) => {
    const xs = list.filter((s) => s.role === role);
    return xs.length ? `<h2 class="sec">${title} <small>${xs.length}</small></h2><div class="tlist">${(await Promise.all(xs.map((s) => card(s, list)))).join("")}</div>` : "";
  }))).join("");
  el.innerHTML = `<p class="lede">Follow your own businesses, the clients you manage, and their competitors. Every whole-site scan adds a point to the chart, and every Google search you analyze records where each site ranks.</p>
    <form id="addsite" class="addform"><div class="field"><label for="newsite">Add a website</label><input id="newsite" class="search" placeholder="example.com"></div>
      ${roleSelect("newrole", owned.length ? "competitor" : "mine", owned, owned[0]?.origin)}<button class="primary">Track</button></form>
    ${list.length ? sections + `<div class="btns stack"><button id="rescanall" class="run">Rescan all ${list.length}</button></div>` : `<p class="lede">No sites yet.</p>`}
    <h2 class="sec">Your data</h2><div class="btns"><button id="export">Export history</button><label class="btn">Import history<input id="import" type="file" accept="application/json" hidden></label></div>
    <p class="unknowns">History is saved in Chrome on this computer and survives extension updates. Export it to back it up or move it to another computer.</p>
    <div id="updatecard"></div>`;
  bindRole("newrole");
  $("addsite").onsubmit = async (e) => { e.preventDefault(); const val = $("newsite").value.trim(); if (!val) return;
    const role = $("newrole").value, of = role === "competitor" ? $("newrole-of").value || null : null;
    try { const o = await T.trackSite(val, "", role, of); ui.toast(`Tracking ${hostOf(o)} as ${T.ROLES[role].toLowerCase()}`); renderTrack(ui); } catch { ui.notice("That doesn't look like a website address."); } };
  el.querySelectorAll("[data-open]").forEach((c) => (c.onclick = () => { v.detail = c.dataset.open; renderTrack(ui); }));
  const ra = $("rescanall"); if (ra) ra.onclick = () => rescan(list.map((s) => s.origin));
  $("export").onclick = async () => ui.download(await T.exportAll(), `seo-god-mode-history-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
  $("import").onchange = async (e) => { const f = e.target.files[0]; if (!f) return;
    try { const n = await T.importAll(await f.text()); ui.toast(`Imported ${n} item${n === 1 ? "" : "s"}`); renderTrack(ui); } catch (err) { ui.notice(esc(err.message)); } };
  renderUpdateCard($("updatecard"));
}

async function rescan(origins) {
  if (!(await access(origins.flatMap((o) => siteOrigins(o + "/")), "Rescanning needs access to these sites. Press Rescan again and choose Allow."))) return;
  for (const [i, o] of origins.entries()) {
    busy(true, `Scanning ${hostOf(o)} (${i + 1}/${origins.length})…`);
    try {
      const { psiKey = "" } = await chrome.storage.local.get("psiKey");
      const r = await rateSite(o + "/", { psiKey, onProgress: (t) => busy(true, `${hostOf(o)}: ${t}`) });
      const page = { url: r.site, origin: new URL(r.site).origin, platform: "Unknown", scannedAt: new Date().toISOString(), jsonld: [], pageless: true };
      const scan = await saveScan({ mode: "site", page, site: null, scores: r.scores, results: r.checks, priority: r.priority, kits: r.kits, unknown: r.unknown,
        pagesRated: r.pages_rated, hitLimit: r.hit_page_limit, rubricVersion: r.rubric_version, pages: r.pages });
      await T.addScorePoint(o, scan);
    } catch (e) { ui.notice(`${esc(hostOf(o))}: ${esc(e.message || e)}`); }
  }
  busy(false); ui.toast("Rescan done"); v.detail ? renderSiteDetail(v.detail) : renderTrack(ui);
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
  return `<h2 class="sec">You vs competitors <small>${rivals.length}</small></h2>
    ${rivals.length ? `<table class="mini"><tr><th>Site</th><th>Overall</th><th>SEO</th><th>AEO</th><th>GEO</th></tr>${rows.map(({ x, p }) => `<tr class="${x.origin === s.origin ? "me" : ""}"><td>${esc(x.name)}</td>${x.origin === s.origin ? `<td>${p?.overall ?? "–"}</td><td>${p?.seo ?? "–"}</td><td>${p?.aeo ?? "–"}</td><td>${p?.geo ?? "–"}</td>` : cell(p?.overall, me?.overall) + cell(p?.seo, me?.seo) + cell(p?.aeo, me?.aeo) + cell(p?.geo, me?.geo)}</tr>`).join("")}</table>
      ${hist.some((h) => h.length) ? chart : ""}
      ${byCheck.length ? `<h2 class="sec">Where they're ahead</h2><div class="list">${byCheck.slice(0, 10).map((g) => `<div class="factor"><span class="dot s-fail"></span><div><b>${esc(g.name)}</b><small>${esc(g.who.join(", "))} ${g.who.length === 1 ? "beats" : "beat"} you here${g.gain ? ` · +${g.gain} pts for you` : ""}</small>${g.tip ? `<p>${esc(g.tip)}</p>` : ""}</div></div>`).join("")}</div>
        <div class="btns stack"><button id="cmpcopy" class="primary">Copy fix prompt</button></div>` : scans.slice(1).some(Boolean) ? `<p class="lede">No check where a competitor is clearly ahead. Compare search positions below and use Compete for single searches.</p>` : `<p class="lede">Rescan to compare check by check.</p>`}
      ${kws.length ? `<h2 class="sec">Search positions</h2><table class="mini"><tr><th>Keyword</th>${all.map((x) => `<th>${esc(x.name.slice(0, 14))}</th>`).join("")}</tr>${kws.map((q) => `<tr><td>${esc(q)}</td>${all.map((_, i) => `<td>${posOf(i, q)}</td>`).join("")}</tr>`).join("")}</table>
        <p class="unknowns">Positions update when you search a keyword on Google and open Compete.</p>` : ""}
      <div class="btns stack"><button id="rescangroup" class="run">Rescan ${esc(s.name)} and ${rivals.length} competitor${rivals.length === 1 ? "" : "s"}</button></div>`
    : `<p class="lede">No competitors linked yet. Add one below, or use "+ Track" on a Google results page in Compete.</p>`}
    <form id="addcomp" class="field"><label for="compnew">Add a competitor of ${esc(s.name)}</label><div class="row2"><input id="compnew" class="search" placeholder="rival.com"><button>Add</button></div></form>`;
}

function comparePrompt(c) {
  return `Help ${c.s.name} (${c.s.origin}) catch up with its competitors: ${c.rivals.map((r) => `${r.name} (${r.origin})`).join(", ")}.
Latest SEO God Mode whole-site scores: ${c.s.name} ${c.me?.overall ?? "?"}/100. Checks where competitors score clearly higher (OBSERVED):
${c.byCheck.map((g, i) => `${i + 1}. ${g.name}: ${g.who.join(", ")} ahead; worth about +${g.gain} pts. ${g.tip || ""}`).join("\n")}
Learn from what they do, but write our own content from our real facts; never copy their text, photos, reviews or claims. Use [CONFIRM: ...] for anything you'd have to guess. Verify the live site after each change.`;
}

async function renderSiteDetail(origin) {
  const el = $("view");
  const list = await T.trackedSites();
  const s = list.find((x) => x.origin === origin);
  const owned = list.filter((x) => T.isOwned(x) && x.origin !== origin);
  const h = await T.scoreHistory(origin), pos = await T.positionHistory(origin);
  const kws = [...new Set([...s.keywords, ...pos.map((p) => p.q)])];
  const latest = (q) => [...pos].reverse().find((p) => p.q === q);
  const prevOf = (q) => pos.filter((p) => p.q === q).slice(-2, -1)[0];
  const maxPos = Math.max(10, ...pos.map((p) => p.pos || 0));
  const topK = kws.filter((q) => pos.some((p) => p.q === q && p.pos)).slice(0, 5);
  const cls = ["main", "k1", "k2", "k3", "k4"];
  const of = s.competitorOf && list.find((x) => x.origin === s.competitorOf);
  el.innerHTML = `<button id="back" class="linkish">← All sites</button>
    <div class="thead big"><div><b>${esc(s.name)}</b><small>${esc(origin)} · ${esc(T.ROLES[s.role])}${of ? ` of <button class="linkish" id="goof">${esc(of.name)}</button>` : ""} · since ${when(s.addedAt)}</small></div><div class="tscore ${status(h[h.length - 1]?.overall)}">${h[h.length - 1]?.overall ?? "–"}</div></div>
    <details class="json"><summary>Edit name and role</summary><div class="pad"><div class="field"><label for="rename">Name</label><input id="rename" class="search" value="${esc(s.name)}"></div>
      ${roleSelect("editrole", s.role, owned, s.competitorOf)}<button id="saverole" class="primary">Save</button></div></details>
    <h2 class="sec">Score history <small>${h.length} scan${h.length === 1 ? "" : "s"}</small></h2>
    ${T.lineChart([{ name: "Overall", cls: "main", points: h.map((p) => ({ t: p.t, v: p.overall })) }, { name: "SEO", cls: "k1", points: h.map((p) => ({ t: p.t, v: p.seo })) },
      { name: "AEO", cls: "k2", points: h.map((p) => ({ t: p.t, v: p.aeo })) }, { name: "GEO", cls: "k3", points: h.map((p) => ({ t: p.t, v: p.geo })) }], { label: "Score history" })}
    <div class="btns stack"><button id="rescan1" class="primary run">Rescan now</button><button id="opensite">Open site</button></div>
    ${T.isOwned(s) ? await compareBlock(s, list) : ""}
    <h2 class="sec">Keyword positions <small>lower is better</small></h2>
    ${topK.length ? T.lineChart(topK.map((q, i) => ({ name: q, cls: cls[i], points: pos.filter((p) => p.q === q).map((p) => ({ t: p.t, v: p.pos })) })), { min: 1, max: maxPos, invert: true, label: "Keyword positions" }) : ""}
    ${kws.length ? `<table class="mini"><tr><th>Keyword</th><th>Now</th><th>Change</th><th></th></tr>${kws.map((q) => { const l = latest(q), p = prevOf(q); const d = l?.pos && p?.pos ? p.pos - l.pos : null;
      return `<tr><td>${esc(q)}</td><td>${l ? (l.pos ? "#" + l.pos : "–") : "?"}</td><td class="${d > 0 ? "up" : d < 0 ? "down" : ""}">${d ? (d > 0 ? "▲" : "▼") + Math.abs(d) : ""}</td><td><a href="https://www.google.com/search?q=${encodeURIComponent(q)}" target="_blank" rel="noopener" title="Search it on Google, then open Compete to record the position">Check</a></td></tr>`; }).join("")}</table>`
      : `<p class="lede">No keywords yet. Search one on Google and open Compete, or add some below.</p>`}
    <form id="kwadd" class="field"><label for="kwnew">Add keywords (comma separated)</label><div class="row2"><input id="kwnew" class="search" placeholder="roof repair york pa, metal roofing"><button>Add</button></div></form>
    <p class="unknowns">Positions are recorded when you search on Google and open the Compete view (the extension never searches by itself). "–" means not in the results shown.</p>
    ${h.length ? `<h2 class="sec">Scans</h2><table class="mini"><tr><th>Date</th><th>Overall</th><th>SEO</th><th>AEO</th><th>GEO</th><th>Pages</th></tr>${[...h].reverse().slice(0, 30).map((p) => `<tr><td>${when(p.t)}</td><td>${p.overall}</td><td>${p.seo}</td><td>${p.aeo}</td><td>${p.geo}</td><td>${p.pages ?? ""}</td></tr>`).join("")}</table>` : ""}
    <div class="btns stack"><button id="untrack" class="linkish danger">Stop tracking this site</button></div>`;
  bindRole("editrole");
  $("back").onclick = () => { v.detail = null; renderTrack(ui); };
  const go = $("goof"); if (go) go.onclick = () => renderSiteDetail(of.origin);
  $("saverole").onclick = async () => { const role = $("editrole").value;
    await T.renameSite(origin, $("rename").value); await T.setRole(origin, role, role === "competitor" ? $("editrole-of").value || null : null); ui.toast("Saved"); renderSiteDetail(origin); };
  $("rescan1").onclick = () => rescan([origin]);
  const rg = $("rescangroup"); if (rg) rg.onclick = () => rescan([origin, ...T.competitorsOf(origin, list).map((r) => r.origin)]);
  const cc = $("cmpcopy"); if (cc) cc.onclick = () => ui.copy(comparePrompt(v.cmp), "Fix prompt copied");
  const ac = $("addcomp"); if (ac) ac.onsubmit = async (e) => { e.preventDefault(); const val = $("compnew").value.trim(); if (!val) return;
    try { const o = await T.trackSite(val, "", "competitor", origin); await T.setRole(o, "competitor", origin); ui.toast(`Tracking ${hostOf(o)} as a competitor`); renderSiteDetail(origin); } catch { ui.notice("That doesn't look like a website address."); } };
  $("opensite").onclick = () => chrome.tabs.create({ url: origin + "/" });
  $("kwadd").onsubmit = async (e) => { e.preventDefault(); await T.setKeywords(origin, [...s.keywords, ...$("kwnew").value.split(",")]); renderSiteDetail(origin); };
  $("untrack").onclick = async () => { if (!confirm(`Stop tracking ${s.name}? Its history stays until you clear the extension's data.`)) return; await T.untrackSite(origin); v.detail = null; renderTrack(ui); };
}

// ====================================================================== updates
export async function renderUpdateCard(el, force = false) {
  if (!el) return;
  const u = await U.checkUpdate(force);
  const store = u.installType === "normal";
  if (store) { el.innerHTML = `<h2 class="sec">Updates</h2><p class="lede">Version ${esc(u.current)}. Installed from the Chrome Web Store, so Chrome updates it automatically.</p>`; return; }
  const helper = await U.helperStatus();
  el.innerHTML = `<h2 class="sec">Updates <small>version ${esc(u.current)}</small></h2>
    <div class="upd ${u.available ? "on" : ""}"><p>${u.available ? `<b>Version ${esc(u.latest)} is out.</b>` : u.latest ? "You're on the latest version." : esc(u.error || "")}</p>
    <div class="btns">${u.available && helper.installed ? `<button id="upnow" class="primary">Update now</button>` : ""}
      ${u.available && !helper.installed ? `<a class="btn primary" href="${U.ZIP}" target="_blank" rel="noopener">Download update</a>` : ""}
      <button id="upcheck">Check again</button><button id="reload">Reload extension</button></div>
    ${u.available && !helper.installed ? `<p class="unknowns">Manual update: unzip the download over your extension folder (replace files), then press Reload extension. Your history is kept.</p>` : ""}
    ${!helper.installed ? `<details class="json"><summary>Turn on one-click updates</summary><div class="pad"><p class="lede">One time: ${helper.permission ? "" : "allow the updater, then "}paste this into a terminal (needs Python 3). After that, "Update now" downloads and installs new versions for you.</p>
      ${helper.permission ? `<pre>${esc(U.installCommand())}</pre><button id="copycmd">Copy command</button>` : `<button id="allowhelper" class="primary">Allow the updater</button>`}</div></details>` : `<p class="unknowns">One-click updates are on (${esc(helper.folder || "")}).</p>`}</div>`;
  const b = (id, fn) => { const x = el.querySelector("#" + id); if (x) x.onclick = fn; };
  b("upcheck", () => renderUpdateCard(el, true));
  b("reload", () => chrome.runtime.reload());
  b("copycmd", () => ui.copy(U.installCommand(), "Command copied"));
  b("allowhelper", async () => { if (await U.askHelperPermission()) renderUpdateCard(el); });
  b("upnow", async () => { try { ui.toast("Updating…"); const r = await U.runOneClickUpdate(); ui.toast(r.updated ? `Updated to ${r.version}. Reloading…` : "Already up to date"); } catch (e) { ui.notice(esc(e.message)); } });
}

/** Small header banner when an update is out (checked at most once a day). */
export async function updateBanner(el, helpers) {
  ui = ui || helpers;
  const u = await U.checkUpdate().catch(() => null);
  if (!u?.available || u.installType === "normal") { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `Version ${esc(u.latest)} is out. <button class="linkish" id="goupd">Update</button>`;
  el.querySelector("#goupd").onclick = () => helpers.setMode("track").then(() => document.getElementById("updatecard")?.scrollIntoView({ behavior: "smooth" }));
}
