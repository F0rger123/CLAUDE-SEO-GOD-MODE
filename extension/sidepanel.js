import { collectPageFacts } from "./lib/collect.js";
import { collectSiteFacts } from "./lib/site.js";
import { CATS, CHECKS, grade, score } from "./lib/rubric.js";
import { fixAllPrompt, fixPrompt, metaFor } from "./lib/prompts.js";
import { rateSite, siteOrigins } from "./lib/siterate.js";
import { potentials, summaryText } from "./lib/summary.js";
import { compare, history, proofReport, saveScan, setBaseline } from "./lib/proof.js";
import { REPO, siteCommands } from "./lib/skills.js";
import { TOOLS } from "./lib/tools.js";
import { addScorePoint, trackedFor, trackSite } from "./lib/track.js";
import { renderCompete, renderTrack, updateBanner } from "./views.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const when = (iso) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const EVIDENCE = { OBSERVED: ["Measured", ""], INFERRED: ["Estimate", "inferred"], UNKNOWN: ["Not measured", "unknown"] };
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const state = { scan: null, mode: "site", filter: "all", query: "", showPassing: false, tool: "serp", fresh: false };
const isSite = () => state.scan?.mode === "site";

function notice(html) { const n = $("notice"); n.hidden = !html; n.innerHTML = html || ""; }
function toast(text) { const t = $("toast"); t.textContent = text; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 1600); }
function stage(text) { $("scan").querySelector(".label").textContent = text; }

async function activeTab() {
  // sidepanel.html?tabId=N targets a specific tab (used when the panel is opened as a page, e.g. in tests).
  const pinned = new URLSearchParams(location.search).get("tabId");
  if (pinned) return chrome.tabs.get(Number(pinned));
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureAccess(url, mode) {
  const origins = !url ? ["https://*/*", "http://*/*"] : mode === "site" ? siteOrigins(url) : [new URL(url).origin + "/*"];
  if (await chrome.permissions.contains({ origins })) return true;
  return chrome.permissions.request({ origins });
}

async function scan() {
  const btn = $("scan");
  btn.disabled = true; document.body.classList.add("busy"); notice("");
  try {
    stage("Checking access…");
    let tab = await activeTab();
    if (tab?.url && !/^https?:/i.test(tab.url)) throw new Error("This tab isn't a website. Open a page that starts with http or https, then scan it.");
    const mode = state.mode;
    if (!(await ensureAccess(tab?.url, mode))) throw new Error("The scan needs access to this site to read its pages, robots.txt and sitemap. Press Scan again and choose Allow.");
    tab = await activeTab();
    $("url").textContent = mode === "site" ? new URL(tab.url).origin : tab.url;
    stage("Reading the page…");
    const [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectPageFacts });
    stage("Checking robots.txt, sitemap and crawlers…");
    const site = await collectSiteFacts(page.url);
    let scan;
    if (mode === "site") {
      // Same crawl, checks and scores as the skill's rate_site.py.
      let psiKey = "";
      try { psiKey = (await chrome.storage.local.get("psiKey")).psiKey || ""; } catch {}
      const r = await rateSite(page.origin + "/", { onProgress: stage, psiKey });
      scan = { mode, page, site, scores: r.scores, results: r.checks, priority: r.priority, kits: r.kits, unknown: r.unknown,
        pagesRated: r.pages_rated, hitLimit: r.hit_page_limit, rubricVersion: r.rubric_version, pages: r.pages };
    } else {
      stage(`Scoring ${CHECKS.length} checks…`);
      scan = { mode, page, site, ...score(page, site) };
    }
    state.scan = await saveScan(scan);
    if (mode === "site" && (await trackedFor(page.origin))) await addScorePoint((await trackedFor(page.origin)).origin, state.scan);
    state.fresh = true;
    render();
  } catch (e) {
    notice(esc(e.message || e));
  } finally {
    btn.disabled = false; document.body.classList.remove("busy"); scanLabel();
  }
}

// ---------------------------------------------------------------- scores
const status = (v) => (v == null ? "" : v >= 85 ? "s-pass" : v >= 65 ? "s-part" : "s-fail");
const ratioStatus = (r) => (r == null ? "" : r >= 0.999 ? "s-pass" : r >= 0.6 ? "s-part" : "s-fail");

function countUp(el, to) {
  if (reduced || !state.fresh) { el.textContent = to; return; }
  const t0 = performance.now(), dur = 900;
  const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

function renderScores(scores, pot) {
  const len = Math.PI * 62;
  const bar = (k, label, sub) => `<div class="bar"><span class="lab"><b>${label}</b> ${sub}</span><span class="num" data-n="${scores[k] ?? 0}">0</span>
    <div class="track"><div class="fill ${status(scores[k])}" data-w="${scores[k] ?? 0}"></div></div></div>`;
  $("scores").innerHTML = `<div class="dial" role="img" aria-label="Overall score ${scores.overall} out of 100, grade ${grade(scores.overall)}">
      <svg width="150" height="82" viewBox="0 0 150 82"><path class="track" d="M13 75 A62 62 0 0 1 137 75" stroke-width="12"/>
      <path class="ghost" d="M13 75 A62 62 0 0 1 137 75" stroke-width="12" stroke-dasharray="0 ${len.toFixed(1)}"/>
      <path class="val ${status(scores.overall)}" d="M13 75 A62 62 0 0 1 137 75" stroke-width="12" stroke-dasharray="0 ${len.toFixed(1)}"/></svg>
      <div class="read"><div class="n" data-n="${scores.overall}">0</div><div class="cap">Overall, grade ${grade(scores.overall)}</div></div></div>
    <div class="bars">${bar("seo", "SEO", "search basics")}${bar("aeo", "AEO", "answer engines")}${bar("geo", "GEO", "AI search")}</div>
    ${pot.top5 <= pot.now ? `<div class="potential done"><div class="now"><span>Now</span><b>${scores.overall}</b><i>${grade(scores.overall)}</i></div><span></span>
      <p>Nothing left to fix from this scan. Rescan after changes to keep it here.</p></div>` : `<div class="potential" aria-label="Now ${scores.overall}, potential ${pot.top5}">
      <div class="now"><span>Now</span><b>${scores.overall}</b><i>${grade(scores.overall)}</i></div><span class="arrow" aria-hidden="true">→</span>
      <div class="pot"><span>Potential</span><b data-n="${pot.top5}">0</b><i>${grade(pot.top5)}</i></div>
      <p>after the top 5 fixes in the fix prompt${pot.all > pot.top5 ? `, up to <b>${pot.all}</b> if you fix everything` : ""}. Estimate.</p></div>`}`;
  $("scores").hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $("scores").querySelector(".val").setAttribute("stroke-dasharray", `${(len * (scores.overall ?? 0) / 100).toFixed(1)} ${len.toFixed(1)}`);
    $("scores").querySelector(".ghost").setAttribute("stroke-dasharray", `${(len * pot.top5 / 100).toFixed(1)} ${len.toFixed(1)}`);
    $("scores").querySelectorAll(".fill").forEach((f) => (f.style.width = f.dataset.w + "%"));
    $("scores").querySelectorAll("[data-n]").forEach((n) => countUp(n, +n.dataset.n));
  }));
}

// ---------------------------------------------------------------- summary
/** Failed checks in fix order: the skill's priority order for site scans, point gain for page scans. */
function ranked() {
  const { results, priority } = state.scan;
  const failed = results.filter((r) => r.ratio != null && r.ratio < 0.999);
  if (!priority?.length) return failed.sort((a, b) => (b.gain || 0) - (a.gain || 0));
  const pos = Object.fromEntries(priority.map((id, i) => [id, i]));
  return failed.sort((a, b) => (pos[a.id] ?? 99) - (pos[b.id] ?? 99));
}

/** Types the summary out fast; a click (or reduced motion) shows it all at once. */
function typeOut(el, text) {
  cancelAnimationFrame(typeOut.raf);
  const done = () => { cancelAnimationFrame(typeOut.raf); el.textContent = text; el.classList.remove("typing"); };
  el.onclick = done;
  if (reduced || !state.fresh) return done();
  let i = 0, last = 0;
  el.textContent = ""; el.classList.add("typing");
  const step = (t) => {
    if (t - last >= 15) { i = Math.min(text.length, i + 4); el.textContent = text.slice(0, i); last = t; }
    if (i < text.length) typeOut.raf = requestAnimationFrame(step); else el.classList.remove("typing");
  };
  typeOut.raf = requestAnimationFrame(step);
}

function renderSummary() {
  const s = state.scan, n = ranked().length;
  const text = summaryText(s);
  $("summary").hidden = false;
  $("summary").innerHTML = `<p id="say" class="say" aria-label="${esc(text)}"></p>
    <div class="btns">${n ? `<button id="fixall" class="primary">Copy fix prompt</button>` : ""}<button id="seeall">${n ? `See all ${n} fixes` : "See every check"}</button><span id="trackbtn"></span></div>`;
  typeOut($("say"), text);
  if (n) $("fixall").onclick = () => copy(fixAllPrompt(s), "Fix prompt copied");
  if (isSite()) trackedFor(s.page.origin).then((t) => {
    const el = $("trackbtn"); if (!el) return;
    el.innerHTML = t ? `<button class="linkish" id="seetrack">Tracked: see history</button>` : `<button id="dotrack">Track this site</button>`;
    if (t) $("seetrack").onclick = () => setMode("track");
    else $("dotrack").onclick = async () => { const o = await trackSite(s.page.origin); await addScorePoint(o, s); toast("Tracking this site"); renderSummary(); };
  });
  $("seeall").onclick = () => { state.showPassing = !n; state.fresh = false; renderIssues(); showTab("issues"); $("tabs").scrollIntoView({ behavior: reduced ? "auto" : "smooth" }); };
}

// ---------------------------------------------------------------- rows
function issueRow(r, page, i = 0) {
  const m = metaFor(r, page.platform);
  const [ev, evCls] = EVIDENCE[r.tag] || EVIDENCE.UNKNOWN;
  const fix = r.ratio != null && r.ratio < 0.999;
  const pages = [...new Set(r.pages || [])];
  return `<details class="issue${state.fresh ? " reveal" : ""}" style="--i:${i}" data-id="${r.id}"><summary><span class="dot ${ratioStatus(r.ratio)}"></span><span class="name">${esc(m.name)}</span>${r.gain ? `<span class="gain">+${r.gain}</span>` : "<span></span>"}
    <span class="sub"><span class="area">${CATS[r.cat]}</span><span class="ev ${evCls}">${ev}:</span> ${esc(r.detail)}</span></summary>
    <div class="body"><p class="why">${esc(m.why)}</p>${fix ? `<h3>How to fix it${page.platform !== "Unknown" ? ` on ${esc(page.platform)}` : ""}</h3>
    <ol>${m.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
    ${fix && pages.length ? `<h3>Pages (${pages.length})</h3><p class="pages">${pages.slice(0, 12).map((p) => `<code>${esc(p)}</code>`).join(" ")}${pages.length > 12 ? ` and ${pages.length - 12} more` : ""}</p>` : ""}
    <div class="btns">${fix ? `<button data-copy="${r.id}">Copy fix prompt</button>` : ""}<a href="${m.guide}" target="_blank" rel="noopener">Read the full guide</a></div></div></details>`;
}

function renderOverview() {
  const { page, results } = state.scan;
  const failed = ranked();
  const areas = ["seo", "aeo", "geo"].map((cat) => {
    const rs = results.filter((r) => r.cat === cat && r.ratio != null);
    const groups = [...new Set(rs.map((r) => r.group))].map((g) => {
      const gr = rs.filter((r) => r.group === g);
      return `<div class="grp" data-jump="${cat}"><span>${esc(g)}</span><span class="segs">${gr.map((r) => `<i class="${ratioStatus(r.ratio)}" title="${esc(r.name)}"></i>`).join("")}</span><b>${gr.filter((r) => r.ratio >= 0.999).length}/${gr.length}</b></div>`;
    }).join("");
    return `<div class="area-card"><div class="head">${CATS[cat]} <span>${rs.filter((r) => r.ratio >= 0.999).length} of ${rs.length} passing</span></div>${groups}</div>`;
  }).join("");
  const types = [...new Set(page.jsonld.flatMap((o) => [].concat(o["@type"] || [])))].slice(0, 3).join(", ");
  const s = state.scan;
  const facts = isSite() ? `<h2 class="sec">This site</h2><div class="chips">
      <span class="chip"><b>${s.pagesRated}</b> pages checked${s.hitLimit ? " (sample)" : ""}</span><span class="chip"><b>${s.pages.filter((p) => p.indexable).length}</b> indexable</span>
      <span class="chip">median <b>${s.pages.map((p) => p.words).sort((a, b) => a - b)[Math.floor(s.pages.length / 2)] || 0}</b> words</span>
      <span class="chip">Rubric <b>v${esc(s.rubricVersion)}</b>, same as the skill</span></div>
      ${s.results.some((r) => r.id === "site-perf" && /quota/.test(r.detail)) ? `<form id="psikey" class="keyform"><label for="psi">PageSpeed's free shared quota is used up, so speed is an estimate. Add your own free
        <a href="https://developers.google.com/speed/docs/insights/v5/get-started#APIKey" target="_blank" rel="noopener">PageSpeed API key</a> for real mobile scores. It stays on this computer.</label>
        <div class="row2"><input id="psi" class="search" type="password" autocomplete="off" placeholder="API key"><button class="primary">Save key</button></div></form>` : ""}
      ${s.unknown?.length ? `<p class="unknowns">A public scan can't see: ${s.unknown.map(esc).join("; ")}.</p>` : ""}`
    : `<h2 class="sec">This page</h2><div class="chips">
      <span class="chip"><b>${page.wordCount}</b> words</span><span class="chip">LCP <b>${page.lcpMs == null ? "–" : (page.lcpMs / 1000).toFixed(1) + "s"}</b></span>
      <span class="chip"><b>${page.internalLinks}</b> internal links</span><span class="chip"><b>${page.images.length}</b> images</span>
      <span class="chip">Schema <b>${esc(types || "none")}</b></span></div>`;
  $("tab-overview").innerHTML = `<h2 class="sec">Biggest wins <small>points each fix adds</small></h2>
    ${failed.length ? `<div class="list">${failed.slice(0, 5).map((r, i) => issueRow(r, page, i)).join("")}</div>` : "<p class='lede'>Every measured check passed.</p>"}
    <h2 class="sec">By area <small>each bar is one check</small></h2><div class="areas">${areas}</div>${facts}`;
}

function renderIssues() {
  const { page, results } = state.scan;
  const q = state.query.toLowerCase();
  const visible = results.filter((r) => (state.filter === "all" || r.cat === state.filter) && (state.showPassing || (r.ratio != null && r.ratio < 0.999))
    && (!q || (r.name + " " + r.detail + " " + r.group).toLowerCase().includes(q)));
  const groups = [...new Set(visible.map((r) => r.group))];
  let i = 0;
  const body = groups.map((g) => { const rs = visible.filter((r) => r.group === g).sort((a, b) => (b.gain || 0) - (a.gain || 0));
    return `<div class="group-h"><span>${esc(g)}</span><span>${rs.length}</span></div><div class="list">${rs.map((r) => issueRow(r, page, i++)).join("")}</div>`; }).join("");
  const unknown = results.filter((r) => r.ratio == null && (state.filter === "all" || r.cat === state.filter));
  $("tab-issues").innerHTML = `<div class="toolbar"><div class="seg">${["all", "seo", "aeo", "geo"].map((f) => `<button data-filter="${f}" class="${state.filter === f ? "on" : ""}">${f === "all" ? "All" : CATS[f]}</button>`).join("")}</div>
    <div class="row2"><input class="search" id="q" type="search" placeholder="Search checks" value="${esc(state.query)}"><label class="toggle"><input type="checkbox" id="passing" ${state.showPassing ? "checked" : ""}> Show passing</label></div></div>
    ${body || "<p class='lede'>Nothing to fix here. Turn on “Show passing” to see every check.</p>"}
    ${unknown.length ? `<p class="unknowns">Not measured${isSite() ? "" : " on this page"}: ${unknown.map((r) => esc(r.name)).join(", ")}.</p>` : ""}`;
  $("tab-issues").querySelectorAll("[data-filter]").forEach((b) => (b.onclick = () => { state.filter = b.dataset.filter; state.fresh = false; renderIssues(); }));
  $("q").oninput = (e) => { state.query = e.target.value; state.fresh = false; renderIssues(); const el = $("q"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); };
  $("passing").onchange = (e) => { state.showPassing = e.target.checked; state.fresh = false; renderIssues(); };
  bindCopy($("tab-issues"));
}

function renderTools() {
  const { page, site } = state.scan;
  if (page.pageless || !site) { $("tab-tools").innerHTML = `<p class="lede">This scan ran from the Track view, so the page tools are empty. Open the site and scan it to use them.</p>`; return; }
  const tool = TOOLS.find((t) => t[0] === state.tool) || TOOLS[0];
  $("tab-tools").innerHTML = `<div class="subnav">${TOOLS.map(([id, label]) => `<button data-tool="${id}" class="${id === tool[0] ? "on" : ""}">${label}</button>`).join("")}</div>${tool[2](page, site)}`;
  $("tab-tools").querySelectorAll("[data-tool]").forEach((b) => (b.onclick = () => { state.tool = b.dataset.tool; renderTools(); }));
  // A share image that fails to load is itself a problem worth showing.
  $("tab-tools").querySelectorAll(".card img").forEach((img) => img.addEventListener("error", () => {
    img.outerHTML = `<div class="noimg">og:image couldn't be loaded: ${esc(img.getAttribute("src"))}</div>`; }));
  $("tab-tools").querySelectorAll("img.thumb").forEach((img) => img.addEventListener("error", () => (img.style.visibility = "hidden")));
}

function renderProof({ list, baseline }) {
  const scan = state.scan, el = $("tab-proof");
  if (!baseline) {
    el.innerHTML = `<p class="lede">Save this scan as the before picture. Make your fixes, scan again, and this tab shows what changed, with a report you can send.</p>
      <div class="stack"><button id="setbase" class="primary">Save this scan as "before"</button></div>
      <p class="lede">${list.length} scan${list.length === 1 ? "" : "s"} saved for this ${isSite() ? "site" : "page"} on this computer.</p>`;
  } else if (baseline.id === scan.id) {
    el.innerHTML = `<p class="lede">"Before" saved ${esc(when(baseline.page.scannedAt))}, overall ${baseline.scores.overall}. Make your fixes, then scan again to see the after.</p>`;
  } else {
    const { rows, delta } = compare(baseline, scan);
    const ch = rows.filter((r) => ["fixed", "improved", "regressed"].includes(r.status));
    const d = (k, l) => `<div>${l}<b class="${delta[k] >= 0 ? "up" : "down"}">${delta[k] > 0 ? "+" : ""}${delta[k]}</b>${baseline.scores[k]} to ${scan.scores[k]}</div>`;
    el.innerHTML = `<p class="lede">Before ${esc(when(baseline.page.scannedAt))}, after ${esc(when(scan.page.scannedAt))}.</p>
      <div class="delta">${d("overall", "Overall")}${d("seo", "SEO")}${d("aeo", "AEO")}${d("geo", "GEO")}</div>
      ${ch.length ? `<table class="proof-table"><tr><th>Check</th><th>Change</th></tr>${ch.map((r) => `<tr><td>${esc(r.name)}</td><td class="${r.status}">${r.status}</td></tr>`).join("")}</table>` : "<p class='lede'>No measured check has changed yet.</p>"}
      <div class="stack"><button id="download" class="primary">Download proof report</button>
      <div class="btns"><button id="copyproof">Copy summary</button><button id="setbase">Use this scan as the new "before"</button></div></div>`;
    $("download").onclick = () => download(proofReport(baseline, scan), `seo-proof-${new URL(scan.page.url).host}${isSite() ? "-site" : ""}-${scan.page.scannedAt.slice(0, 10)}.html`, "text/html");
    $("copyproof").onclick = () => copy(`SEO before and after for ${isSite() ? scan.page.origin + " (whole site)" : scan.page.url}\nOverall ${baseline.scores.overall} to ${scan.scores.overall} (SEO ${baseline.scores.seo} to ${scan.scores.seo}, AEO ${baseline.scores.aeo} to ${scan.scores.aeo}, GEO ${baseline.scores.geo} to ${scan.scores.geo})\n` +
      ch.map((r) => `- ${r.name}: ${r.status}`).join("\n"), "Summary copied");
  }
  const sb = $("setbase");
  if (sb) sb.onclick = async () => { await setBaseline(scan.page.url, scan.id, scan.mode); renderProof(await history(scan.page.url, scan.mode)); toast('Saved as "before"'); };
}

function renderPrompt() {
  const s = state.scan, { page, results } = s;
  const failed = ranked();
  $("tab-prompt").innerHTML = `<p class="lede">One fix prompt for every issue, in order. Paste it into your AI coding assistant with the site's code open.</p>
    <div class="stack"><button id="copyall" class="primary">Copy fix prompt (${failed.length} fixes)</button></div><pre>${esc(fixAllPrompt(s))}</pre>
    <h2 class="sec">Export</h2><div class="btns"><button id="exjson">Download scan (JSON)</button><button id="excsv">Download checks (CSV)</button><button id="exmd">Copy issue list</button></div>
    <div class="skill"><h3>Go further with the SEO God Mode skill</h3>
    <p class="lede">The extension uses the skill's rubric. With the skill installed, your assistant can also:</p>
    <ul>${siteCommands(page).map(([what, how]) => `<li>${esc(what)}: <code>${esc(how)}</code></li>`).join("")}</ul>
    <a href="${REPO}#quick-start-people" target="_blank" rel="noopener">How to install the skill</a></div>`;
  $("copyall").onclick = () => copy(fixAllPrompt(s), "Fix prompt copied");
  const host = new URL(page.url).host, day = page.scannedAt.slice(0, 10);
  $("exjson").onclick = () => download(JSON.stringify(s, null, 2), `seo-scan-${host}${isSite() ? "-site" : ""}-${day}.json`, "application/json");
  $("excsv").onclick = () => download(["area,group,check,score,evidence,points_to_gain,detail",
    ...results.map((r) => [CATS[r.cat], r.group, r.name, r.ratio == null ? "" : Math.round(r.ratio * 100), r.tag, r.gain ?? "", r.detail]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n"), `seo-checks-${host}${isSite() ? "-site" : ""}-${day}.csv`, "text/csv");
  $("exmd").onclick = () => copy(`SEO, AEO and GEO issues for ${isSite() ? page.origin + " (whole site)" : page.url}\n` + failed.map((r) => `- [${CATS[r.cat]}] ${r.name} (+${r.gain}): ${r.detail}`).join("\n"), "Issue list copied");
}

// ---------------------------------------------------------------- shared
function download(text, name, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  toast("Downloaded");
}
async function copy(text, msg = "Copied") {
  try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast("Couldn't copy: select the text and copy it"); }
}
function bindCopy(root) {
  root.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = (ev) => { ev.preventDefault();
    copy(fixPrompt(state.scan.results.find((r) => r.id === b.dataset.copy), state.scan), "Fix prompt copied"); }));
}
function moveInk() {
  const on = document.querySelector("#tabs button.on"), ink = document.querySelector("#tabs .ink");
  if (on && ink) { ink.style.left = on.offsetLeft + "px"; ink.style.width = on.offsetWidth + "px"; }
}
function showTab(name) {
  document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((t) => (t.hidden = t.id !== "tab-" + name));
  moveInk();
}

async function render() {
  const { page, scores, results } = state.scan;
  const failed = ranked();
  const pot = potentials(state.scan);
  $("empty").hidden = true; $("tabs").hidden = false;
  $("url").textContent = isSite() ? page.origin : page.url;
  $("platform").hidden = page.platform === "Unknown"; $("platform").textContent = page.platform;
  renderScores(scores, pot);
  renderSummary();
  $("tabs").querySelector('[data-tab="issues"]').innerHTML = `Issues <span class="count">${failed.length}</span>`;
  renderOverview(); renderIssues(); renderTools(); renderPrompt();
  renderProof(await history(page.url, state.scan.mode));
  bindCopy($("tab-overview"));
  const kf = $("psikey");
  if (kf) kf.onsubmit = async (e) => { e.preventDefault(); const v = $("psi").value.trim(); if (!v) return;
    await chrome.storage.local.set({ psiKey: v }); kf.remove(); toast("Key saved. Scan again for real speed scores"); };
  $("tab-overview").querySelectorAll("[data-jump]").forEach((g) => (g.onclick = () => { state.filter = g.dataset.jump; state.fresh = false; renderIssues(); showTab("issues"); }));
  requestAnimationFrame(moveInk);
  state.fresh = false;
}

document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
addEventListener("resize", moveInk);
$("scan").onclick = scan;
document.querySelectorAll("#mode button").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

function scanLabel() {
  const again = state.scan && state.scan.mode === state.mode;
  stage(state.mode === "site" ? (again ? "Scan the site again" : "Scan the whole site") : (again ? "Scan this page again" : "Scan this page"));
}

/** Switch between whole site and this page, and show the last saved scan for that view. */
const helpers = { toast, copy: (t, m) => copy(t, m), notice, download, activeTab, setMode: (m) => setMode(m) };

async function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll("#mode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  try { await chrome.storage.local.set({ mode }); } catch {}
  notice("");
  const extra = mode === "compete" || mode === "track";
  document.body.classList.toggle("viewmode", extra);
  $("view").hidden = !extra;
  for (const id of ["scan", "empty", "scores", "summary", "tabs"]) if (extra) $(id).hidden = true;
  document.querySelectorAll(".tab").forEach((t) => extra && (t.hidden = true));
  if (extra) {
    $("scan").hidden = true;
    $("url").textContent = mode === "compete" ? "Who ranks, why, and what to change" : "Your sites over time";
    return mode === "compete" ? renderCompete(helpers) : renderTrack(helpers);
  }
  $("scan").hidden = false;
  showTab(document.querySelector("#tabs button.on")?.dataset.tab || "overview");
  const tab = await activeTab();
  if (!tab?.url || !/^https?:/i.test(tab.url)) { scanLabel(); return; }
  $("url").textContent = mode === "site" ? new URL(tab.url).origin : tab.url;
  const { list } = await history(tab.url, mode);
  const last = list.find((s) => (s.mode || "page") === mode && (mode === "site" || s.results.length === CHECKS.length));
  if (last) { state.scan = last; state.fresh = false; await render(); notice(`Showing your last ${mode === "site" ? "site" : "page"} scan from ${esc(when(last.page.scannedAt))}.`); }
  else {
    state.scan = null;
    for (const id of ["scores", "summary", "tabs"]) $(id).hidden = true;
    document.querySelectorAll(".tab").forEach((t) => (t.innerHTML = ""));
    $("empty").hidden = false;
  }
  scanLabel();
}

(async () => {
  let mode = "site";
  try { mode = (await chrome.storage.local.get("mode")).mode || "site"; } catch {}
  await setMode(mode);
  updateBanner($("updbar"), helpers);
})();
// Re-read the page when the user switches tabs or a Google page finishes loading, so Compete stays current.
chrome.tabs.onActivated.addListener(() => state.mode === "compete" && renderCompete(helpers));
chrome.tabs.onUpdated.addListener((id, info) => info.status === "complete" && state.mode === "compete" && renderCompete(helpers));
