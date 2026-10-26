import { collectPageFacts } from "./lib/collect.js";
import { collectSiteFacts } from "./lib/site.js";
import { CATS, checkById, grade, score } from "./lib/rubric.js";
import { fixAllPrompt, fixPrompt } from "./lib/prompts.js";
import { compare, history, proofReport, saveScan, setBaseline } from "./lib/proof.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let current = null;

function notice(html) { const n = $("notice"); n.hidden = !html; n.innerHTML = html || ""; }

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
  btn.disabled = true; btn.textContent = "Scanning…"; notice("");
  try {
    let tab = await activeTab();
    if (tab?.url && !/^https?:/i.test(tab.url)) throw new Error("Open a normal website tab (http/https) to scan it.");
    if (!(await ensureAccess(tab?.url))) throw new Error("Access to this site wasn't granted. The scan needs it to read the page, robots.txt and sitemap.");
    tab = await activeTab();
    $("url").textContent = tab.url;
    const [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectPageFacts });
    const site = await collectSiteFacts(page.url);
    const { scores, results } = score(page, site);
    current = await saveScan({ page, site, scores, results });
    render(current);
  } catch (e) {
    notice(esc(e.message || e));
  } finally {
    btn.disabled = false; btn.textContent = "Scan again";
  }
}

const tone = (n) => (n == null ? "" : n >= 85 ? "t-good" : n >= 70 ? "t-ok" : n >= 55 ? "t-warn" : "t-bad");
function ring(label, n) {
  const r = 26, c = 2 * Math.PI * r, v = n == null ? 0 : n / 100;
  return `<div class="ring"><svg width="64" height="64" viewBox="0 0 64 64"><circle class="track" cx="32" cy="32" r="${r}" stroke-width="7"/>
    <circle class="val ${tone(n)}" cx="32" cy="32" r="${r}" stroke-width="7" stroke-dasharray="${(c * v).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/></svg>
    <div class="num">${n ?? "?"}</div><div class="lbl">${label}</div><div class="g">${grade(n)}</div></div>`;
}

function issueCard(r, page) {
  const c = checkById[r.id];
  const cls = r.ratio == null ? "" : r.ratio >= 0.999 ? "c-good" : r.ratio >= 0.6 ? "c-warn" : "c-bad";
  const steps = [...c.steps, ...(c.platform[page.platform] || [])];
  return `<details class="issue ${cls}"><summary><div class="row"><span class="name">${esc(c.name)}</span>${r.gain ? `<span class="gain">+${r.gain} pts</span>` : ""}</div>
    <div class="meta"><span class="chip">${CATS[r.cat]}</span><span class="chip tag-${r.tag}">${r.tag}</span></div><div class="detail">${esc(r.detail)}</div></summary>
    <div class="body"><div class="why">${esc(c.why)}</div><b>How to fix${page.platform !== "Unknown" ? ` (${esc(page.platform)})` : ""}</b>
    <ol>${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
    <div class="btns"><button data-copy="${r.id}">Copy Claude prompt</button></div></div></details>`;
}

function renderProof(scan, { list, baseline }) {
  const el = $("tab-proof");
  if (!baseline) {
    el.innerHTML = `<p class="summary">Save this scan as your <b>before</b>. Make the fixes, scan again, and this tab shows the before/after with a downloadable proof report.</p>
      <button id="setbase" class="primary">Use this scan as BEFORE</button>
      <p class="summary">${list.length} scan(s) saved for this page on this device.</p>`;
  } else if (baseline.id === scan.id) {
    el.innerHTML = `<p class="summary"><b>Before</b> saved ${esc(baseline.page.scannedAt.replace("T", " ").slice(0, 16))} (overall ${baseline.scores.overall}). Fix things, then scan again to see the after.</p>`;
  } else {
    const { rows, delta } = compare(baseline, scan);
    const ch = rows.filter((r) => ["fixed", "improved", "regressed"].includes(r.status));
    const d = (k, l) => `<div>${l}<b class="${delta[k] >= 0 ? "up" : "down"}">${delta[k] > 0 ? "+" : ""}${delta[k]}</b>${baseline.scores[k]} → ${scan.scores[k]}</div>`;
    el.innerHTML = `<p class="summary">Before ${esc(baseline.page.scannedAt.replace("T", " ").slice(0, 16))} → after ${esc(scan.page.scannedAt.replace("T", " ").slice(0, 16))} (UTC)</p>
      <div class="delta">${d("overall", "Overall")}${d("seo", "SEO")}${d("aeo", "AEO")}${d("geo", "GEO")}</div>
      ${ch.length ? `<table><tr><th>Check</th><th>Change</th></tr>${ch.map((r) => `<tr><td>${esc(r.name)}</td><td class="${r.status}">${r.status}</td></tr>`).join("")}</table>` : "<p class='summary'>No measured check changed yet.</p>"}
      <div class="btns" style="margin-top:10px"><button id="download" class="primary">Download proof report (HTML)</button><button id="copyproof">Copy summary</button><button id="setbase">Make this the new BEFORE</button></div>`;
    $("download").onclick = () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([proofReport(baseline, scan)], { type: "text/html" }));
      a.download = `seo-proof-${new URL(scan.page.url).host}-${scan.page.scannedAt.slice(0, 10)}.html`;
      a.click();
    };
    $("copyproof").onclick = () => copy(`SEO before/after for ${scan.page.url}\nOverall ${baseline.scores.overall} → ${scan.scores.overall} (SEO ${baseline.scores.seo} → ${scan.scores.seo}, AEO ${baseline.scores.aeo} → ${scan.scores.aeo}, GEO ${baseline.scores.geo} → ${scan.scores.geo})\n` +
      ch.map((r) => `- ${r.name}: ${r.status}`).join("\n"), $("copyproof"));
  }
  const sb = $("setbase");
  if (sb) sb.onclick = async () => { await setBaseline(scan.page.url, scan.id); renderProof(scan, await history(scan.page.url)); };
}

async function copy(text, btn) {
  await navigator.clipboard.writeText(text);
  const old = btn.textContent; btn.textContent = "Copied ✓"; btn.classList.add("done");
  setTimeout(() => { btn.textContent = old; btn.classList.remove("done"); }, 1500);
}

async function render(s) {
  const { page, scores, results } = s;
  $("scores").hidden = false; $("tabs").hidden = false;
  $("scores").innerHTML = ring("Overall", scores.overall) + ring("SEO", scores.seo) + ring("AEO", scores.aeo) + ring("GEO", scores.geo);
  const failed = results.filter((r) => r.ratio != null && r.ratio < 0.999).sort((a, b) => (b.gain || 0) - (a.gain || 0));
  const passed = results.filter((r) => r.ratio != null && r.ratio >= 0.999);
  const unknown = results.filter((r) => r.ratio == null);
  const potential = Math.min(100, scores.overall + Math.round(failed.slice(0, 5).reduce((a, r) => a + (r.gain || 0), 0)));
  $("tab-fix").innerHTML = `<p class="summary">${failed.length} to fix · platform: ${esc(page.platform)} · fixing the top 5 → about <b>${potential}</b></p>` +
    (failed.map((r) => issueCard(r, page)).join("") || "<p>Every measured check passed.</p>") +
    (unknown.length ? `<p class="summary">Couldn't measure: ${unknown.map((r) => esc(checkById[r.id].name) + " (" + esc(r.detail) + ")").join("; ")}</p>` : "");
  $("tab-passed").innerHTML = passed.map((r) => issueCard(r, page)).join("") || "<p>Nothing passed yet.</p>";
  $("tab-prompt").innerHTML = `<p class="summary">Paste this into Claude (Claude Code works best with the site's repo open). It lists every fix in priority order with the rules it must follow.</p>
    <div class="btns"><button id="copyall" class="primary">Copy "fix everything" prompt</button></div><pre>${esc(fixAllPrompt(s))}</pre>`;
  $("copyall").onclick = () => copy(fixAllPrompt(s), $("copyall"));
  document.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = (ev) => { ev.preventDefault(); copy(fixPrompt(results.find((r) => r.id === b.dataset.copy), page), b); }));
  renderProof(s, await history(page.url));
}

document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => {
  document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll(".tab").forEach((t) => (t.hidden = t.id !== "tab-" + b.dataset.tab));
}));
$("scan").onclick = scan;

// Show the last scan for the current page when the panel opens.
(async () => {
  const tab = await activeTab();
  if (!tab?.url || !/^https?:/i.test(tab.url)) return;
  $("url").textContent = tab.url;
  const { list } = await history(tab.url);
  if (list[0]) { current = list[0]; render(current); $("scan").textContent = "Scan again"; notice(`Showing your last scan (${esc(list[0].page.scannedAt.replace("T", " ").slice(0, 16))} UTC).`); }
})();
