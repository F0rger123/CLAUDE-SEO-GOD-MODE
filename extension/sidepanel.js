import { collectPageFacts } from "./lib/collect.js";
import { collectSiteFacts } from "./lib/site.js";
import { CATS, CHECKS, checkById, grade, score } from "./lib/rubric.js";
import { fixAllPrompt, fixPrompt } from "./lib/prompts.js";
import { compare, history, proofReport, saveScan, setBaseline } from "./lib/proof.js";
import { guideUrl, REPO, siteCommands } from "./lib/skills.js";
import { TOOLS } from "./lib/tools.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const when = (iso) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const EVIDENCE = { OBSERVED: ["Measured", ""], INFERRED: ["Estimate", "inferred"], UNKNOWN: ["Not measured", "unknown"] };
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const state = { scan: null, filter: "all", query: "", showPassing: false, tool: "serp", fresh: false };

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

async function ensureAccess(url) {
  const origins = url ? [new URL(url).origin + "/*"] : ["https://*/*", "http://*/*"];
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
    if (!(await ensureAccess(tab?.url))) throw new Error("The scan needs access to this site to read the page, robots.txt and sitemap. Press Scan again and choose Allow.");
    tab = await activeTab();
    $("url").textContent = tab.url;
    stage("Reading the page…");
    const [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectPageFacts });
    stage("Checking robots.txt, sitemap and crawlers…");
    const site = await collectSiteFacts(page.url);
    stage(`Scoring ${CHECKS.length} checks…`);
    const { scores, results } = score(page, site);
    state.scan = await saveScan({ page, site, scores, results });
    state.fresh = true;
    render();
  } catch (e) {
    notice(esc(e.message || e));
  } finally {
    btn.disabled = false; document.body.classList.remove("busy"); stage("Scan again");
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

function renderScores(scores, potential) {
  const len = Math.PI * 62;
  const bar = (k, label, sub) => `<div class="bar"><span class="lab"><b>${label}</b> ${sub}</span><span class="num" data-n="${scores[k] ?? 0}">0</span>
    <div class="track"><div class="fill ${status(scores[k])}" data-w="${scores[k] ?? 0}"></div></div></div>`;
  $("scores").innerHTML = `<div class="dial" role="img" aria-label="Overall score ${scores.overall} out of 100, grade ${grade(scores.overall)}">
      <svg width="150" height="82" viewBox="0 0 150 82"><path class="track" d="M13 75 A62 62 0 0 1 137 75" stroke-width="12"/>
      <path class="val ${status(scores.overall)}" d="M13 75 A62 62 0 0 1 137 75" stroke-width="12" stroke-dasharray="0 ${len.toFixed(1)}"/></svg>
      <div class="read"><div class="n" data-n="${scores.overall}">0</div><div class="cap">Overall, grade ${grade(scores.overall)}</div></div></div>
    <div class="bars">${bar("seo", "SEO", "search basics")}${bar("aeo", "AEO", "answer engines")}${bar("geo", "GEO", "AI search")}</div>
    <p class="potential">Fix the top five issues and this page could reach about <b>${potential}</b>.</p>`;
  $("scores").hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $("scores").querySelector(".val").setAttribute("stroke-dasharray", `${(len * (scores.overall ?? 0) / 100).toFixed(1)} ${len.toFixed(1)}`);
    $("scores").querySelectorAll(".fill").forEach((f) => (f.style.width = f.dataset.w + "%"));
    $("scores").querySelectorAll("[data-n]").forEach((n) => countUp(n, +n.dataset.n));
  }));
}

// ---------------------------------------------------------------- rows
function issueRow(r, page, i = 0) {
  const c = checkById[r.id];
  const [ev, evCls] = EVIDENCE[r.tag] || EVIDENCE.UNKNOWN;
  const steps = [...c.steps, ...(c.platform[page.platform] || [])];
  const fix = r.ratio != null && r.ratio < 0.999;
  return `<details class="issue${state.fresh ? " reveal" : ""}" style="--i:${i}" data-id="${r.id}"><summary><span class="dot ${ratioStatus(r.ratio)}"></span><span class="name">${esc(c.name)}</span>${r.gain ? `<span class="gain">+${r.gain}</span>` : "<span></span>"}
    <span class="sub"><span class="area">${CATS[r.cat]}</span><span class="ev ${evCls}">${ev}:</span> ${esc(r.detail)}</span></summary>
    <div class="body"><p class="why">${esc(c.why)}</p>${fix ? `<h3>How to fix it${page.platform !== "Unknown" ? ` on ${esc(page.platform)}` : ""}</h3>
    <ol>${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
    <div class="btns">${fix ? `<button data-copy="${r.id}">Copy prompt for Claude</button>` : ""}<a href="${guideUrl(r.id)}" target="_blank" rel="noopener">Read the full guide</a></div></div></details>`;
}

function renderOverview() {
  const { page, results } = state.scan;
  const failed = results.filter((r) => r.ratio != null && r.ratio < 0.999).sort((a, b) => (b.gain || 0) - (a.gain || 0));
  const areas = ["seo", "aeo", "geo"].map((cat) => {
    const rs = results.filter((r) => r.cat === cat && r.ratio != null);
    const groups = [...new Set(rs.map((r) => r.group))].map((g) => {
      const gr = rs.filter((r) => r.group === g);
      return `<div class="grp" data-jump="${cat}"><span>${esc(g)}</span><span class="segs">${gr.map((r) => `<i class="${ratioStatus(r.ratio)}" title="${esc(r.name)}"></i>`).join("")}</span><b>${gr.filter((r) => r.ratio >= 0.999).length}/${gr.length}</b></div>`;
    }).join("");
    return `<div class="area-card"><div class="head">${CATS[cat]} <span>${rs.filter((r) => r.ratio >= 0.999).length} of ${rs.length} passing</span></div>${groups}</div>`;
  }).join("");
  const types = [...new Set(page.jsonld.flatMap((o) => [].concat(o["@type"] || [])))].slice(0, 3).join(", ");
  $("tab-overview").innerHTML = `<h2 class="sec">Biggest wins <small>points each fix adds</small></h2>
    ${failed.length ? `<div class="list">${failed.slice(0, 5).map((r, i) => issueRow(r, page, i)).join("")}</div>` : "<p class='lede'>Every measured check passed.</p>"}
    <h2 class="sec">By area <small>each bar is one check</small></h2><div class="areas">${areas}</div>
    <h2 class="sec">This page</h2><div class="chips">
      <span class="chip"><b>${page.wordCount}</b> words</span><span class="chip">LCP <b>${page.lcpMs == null ? "–" : (page.lcpMs / 1000).toFixed(1) + "s"}</b></span>
      <span class="chip"><b>${page.internalLinks}</b> internal links</span><span class="chip"><b>${page.images.length}</b> images</span>
      <span class="chip">Schema <b>${esc(types || "none")}</b></span></div>`;
}

function renderIssues() {
  const { page, results } = state.scan;
  const q = state.query.toLowerCase();
  const visible = results.filter((r) => (state.filter === "all" || r.cat === state.filter) && (state.showPassing || (r.ratio != null && r.ratio < 0.999))
    && (!q || (checkById[r.id].name + " " + r.detail + " " + r.group).toLowerCase().includes(q)));
  const groups = [...new Set(visible.map((r) => r.group))];
  let i = 0;
  const body = groups.map((g) => { const rs = visible.filter((r) => r.group === g).sort((a, b) => (b.gain || 0) - (a.gain || 0));
    return `<div class="group-h"><span>${esc(g)}</span><span>${rs.length}</span></div><div class="list">${rs.map((r) => issueRow(r, page, i++)).join("")}</div>`; }).join("");
  const unknown = results.filter((r) => r.ratio == null && (state.filter === "all" || r.cat === state.filter));
  $("tab-issues").innerHTML = `<div class="toolbar"><div class="seg">${["all", "seo", "aeo", "geo"].map((f) => `<button data-filter="${f}" class="${state.filter === f ? "on" : ""}">${f === "all" ? "All" : CATS[f]}</button>`).join("")}</div>
    <div class="row2"><input class="search" id="q" type="search" placeholder="Search checks" value="${esc(state.query)}"><label class="toggle"><input type="checkbox" id="passing" ${state.showPassing ? "checked" : ""}> Show passing</label></div></div>
    ${body || "<p class='lede'>Nothing to fix here. Turn on “Show passing” to see every check.</p>"}
    ${unknown.length ? `<p class="unknowns">Not measured on this page: ${unknown.map((r) => esc(checkById[r.id].name)).join(", ")}.</p>` : ""}`;
  $("tab-issues").querySelectorAll("[data-filter]").forEach((b) => (b.onclick = () => { state.filter = b.dataset.filter; state.fresh = false; renderIssues(); }));
  $("q").oninput = (e) => { state.query = e.target.value; state.fresh = false; renderIssues(); const el = $("q"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); };
  $("passing").onchange = (e) => { state.showPassing = e.target.checked; state.fresh = false; renderIssues(); };
  bindCopy($("tab-issues"));
}

function renderTools() {
  const { page, site } = state.scan;
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
      <p class="lede">${list.length} scan${list.length === 1 ? "" : "s"} saved for this page on this computer.</p>`;
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
    $("download").onclick = () => download(proofReport(baseline, scan), `seo-proof-${new URL(scan.page.url).host}-${scan.page.scannedAt.slice(0, 10)}.html`, "text/html");
    $("copyproof").onclick = () => copy(`SEO before and after for ${scan.page.url}\nOverall ${baseline.scores.overall} to ${scan.scores.overall} (SEO ${baseline.scores.seo} to ${scan.scores.seo}, AEO ${baseline.scores.aeo} to ${scan.scores.aeo}, GEO ${baseline.scores.geo} to ${scan.scores.geo})\n` +
      ch.map((r) => `- ${r.name}: ${r.status}`).join("\n"), "Summary copied");
  }
  const sb = $("setbase");
  if (sb) sb.onclick = async () => { await setBaseline(scan.page.url, scan.id); renderProof(await history(scan.page.url)); toast('Saved as "before"'); };
}

function renderPrompt() {
  const s = state.scan, { page, results } = s;
  const failed = results.filter((r) => r.ratio != null && r.ratio < 0.999).sort((a, b) => (b.gain || 0) - (a.gain || 0));
  $("tab-prompt").innerHTML = `<p class="lede">Paste this into Claude to fix everything in order. It works best in Claude Code with the site's code open.</p>
    <div class="stack"><button id="copyall" class="primary">Copy prompt for all ${failed.length} fixes</button></div><pre>${esc(fixAllPrompt(s))}</pre>
    <h2 class="sec">Export</h2><div class="btns"><button id="exjson">Download scan (JSON)</button><button id="excsv">Download checks (CSV)</button><button id="exmd">Copy issue list</button></div>
    <div class="skill"><h3>Go further with the CLAUDE SEO GOD MODE skill</h3>
    <p class="lede">This extension checks one page. With the skill installed, Claude can do the rest:</p>
    <ul>${siteCommands(page).map(([what, how]) => `<li>${esc(what)}: <code>${esc(how)}</code></li>`).join("")}</ul>
    <a href="${REPO}#quick-start-people" target="_blank" rel="noopener">How to install the skill</a></div>`;
  $("copyall").onclick = () => copy(fixAllPrompt(s), "Prompt copied");
  const host = new URL(page.url).host, day = page.scannedAt.slice(0, 10);
  $("exjson").onclick = () => download(JSON.stringify(s, null, 2), `seo-scan-${host}-${day}.json`, "application/json");
  $("excsv").onclick = () => download(["area,group,check,score,evidence,points_to_gain,detail",
    ...results.map((r) => [CATS[r.cat], r.group, checkById[r.id].name, r.ratio == null ? "" : Math.round(r.ratio * 100), r.tag, r.gain ?? "", r.detail]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n"), `seo-checks-${host}-${day}.csv`, "text/csv");
  $("exmd").onclick = () => copy(`SEO, AEO and GEO issues for ${page.url}\n` + failed.map((r) => `- [${CATS[r.cat]}] ${checkById[r.id].name} (+${r.gain}): ${r.detail}`).join("\n"), "Issue list copied");
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
    copy(fixPrompt(state.scan.results.find((r) => r.id === b.dataset.copy), state.scan.page), "Prompt copied"); }));
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
  const failed = results.filter((r) => r.ratio != null && r.ratio < 0.999);
  const potential = Math.min(100, scores.overall + Math.round([...failed].sort((a, b) => (b.gain || 0) - (a.gain || 0)).slice(0, 5).reduce((a, r) => a + (r.gain || 0), 0)));
  $("empty").hidden = true; $("tabs").hidden = false;
  $("platform").hidden = page.platform === "Unknown"; $("platform").textContent = page.platform;
  renderScores(scores, potential);
  $("tabs").querySelector('[data-tab="issues"]').innerHTML = `Issues <span class="count">${failed.length}</span>`;
  renderOverview(); renderIssues(); renderTools(); renderPrompt();
  renderProof(await history(page.url));
  bindCopy($("tab-overview"));
  $("tab-overview").querySelectorAll("[data-jump]").forEach((g) => (g.onclick = () => { state.filter = g.dataset.jump; state.fresh = false; renderIssues(); showTab("issues"); }));
  requestAnimationFrame(moveInk);
  state.fresh = false;
}

document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
addEventListener("resize", moveInk);
$("scan").onclick = scan;

// Show the last scan for this page when the panel opens.
(async () => {
  const tab = await activeTab();
  if (!tab?.url || !/^https?:/i.test(tab.url)) return;
  $("url").textContent = tab.url;
  const { list } = await history(tab.url);
  if (list[0] && list[0].results.length === CHECKS.length) { state.scan = list[0]; render(); stage("Scan again"); notice(`Showing your last scan from ${esc(when(list[0].page.scannedAt))}.`); }
})();
