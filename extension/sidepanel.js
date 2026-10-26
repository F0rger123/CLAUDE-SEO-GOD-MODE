import { collectPageFacts } from "./lib/collect.js";
import { collectSiteFacts } from "./lib/site.js";
import { CATS, checkById, grade, score } from "./lib/rubric.js";
import { fixAllPrompt, fixPrompt } from "./lib/prompts.js";
import { compare, history, proofReport, saveScan, setBaseline } from "./lib/proof.js";
import { guideUrl, REPO, siteCommands } from "./lib/skills.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const when = (iso) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const EVIDENCE = { OBSERVED: ["Measured", ""], INFERRED: ["Estimate", "inferred"], UNKNOWN: ["Not measured", "unknown"] };
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
    if (tab?.url && !/^https?:/i.test(tab.url)) throw new Error("This tab isn't a website. Open a page that starts with http or https, then scan it.");
    if (!(await ensureAccess(tab?.url))) throw new Error("The scan needs access to this site to read the page, robots.txt and sitemap. Press Scan again and choose Allow.");
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

const status = (n) => (n == null ? "" : n >= 85 ? "s-pass" : n >= 65 ? "s-part" : "s-fail");

function scoresHtml(scores, potential) {
  const r = 62, len = Math.PI * r, v = (scores.overall ?? 0) / 100;
  const bar = (k, label) => `<div class="bar"><span class="lab"><b>${label}</b> ${{ seo: "search basics", aeo: "answer engines", geo: "AI search" }[k]}</span>
    <span class="num">${scores[k] ?? "?"}</span><div class="track"><div class="fill ${status(scores[k])}" style="width:${scores[k] ?? 0}%"></div></div></div>`;
  return `<div class="dial" role="img" aria-label="Overall score ${scores.overall} out of 100, grade ${grade(scores.overall)}">
      <svg width="150" height="82" viewBox="0 0 150 82"><path class="track" d="M13 75 A62 62 0 0 1 137 75" stroke-width="12"/>
      <path class="val ${status(scores.overall)}" d="M13 75 A62 62 0 0 1 137 75" stroke-width="12" stroke-dasharray="${(len * v).toFixed(1)} ${len.toFixed(1)}"/></svg>
      <div class="read"><div class="n">${scores.overall ?? "?"}</div><div class="cap">Overall, grade ${grade(scores.overall)}</div></div></div>
    <div class="bars">${bar("seo", "SEO")}${bar("aeo", "AEO")}${bar("geo", "GEO")}</div>
    <p class="potential">Fix the top five issues and this page could reach about <b>${potential}</b>.</p>`;
}

function issueRow(r, page) {
  const c = checkById[r.id];
  const dot = r.ratio == null ? "" : r.ratio >= 0.999 ? "s-pass" : r.ratio >= 0.6 ? "s-part" : "s-fail";
  const [ev, evCls] = EVIDENCE[r.tag] || EVIDENCE.UNKNOWN;
  const steps = [...c.steps, ...(c.platform[page.platform] || [])];
  return `<details class="issue"><summary><span class="dot ${dot}"></span><span class="name">${esc(c.name)}</span>${r.gain ? `<span class="gain">+${r.gain}</span>` : "<span></span>"}
    <span class="sub"><span class="area">${CATS[r.cat]}</span><span class="ev ${evCls}">${ev}:</span> ${esc(r.detail)}</span></summary>
    <div class="body"><p class="why">${esc(c.why)}</p><h3>How to fix it${page.platform !== "Unknown" ? ` on ${esc(page.platform)}` : ""}</h3>
    <ol>${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
    <div class="btns"><button data-copy="${r.id}">Copy prompt for Claude</button><a href="${guideUrl(r.id)}" target="_blank" rel="noopener">Read the full guide</a></div></div></details>`;
}

function renderProof(scan, { list, baseline }) {
  const el = $("tab-proof");
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
      ${ch.length ? `<table><tr><th>Check</th><th>Change</th></tr>${ch.map((r) => `<tr><td>${esc(r.name)}</td><td class="${r.status}">${r.status}</td></tr>`).join("")}</table>` : "<p class='lede'>No measured check has changed yet.</p>"}
      <div class="stack"><button id="download" class="primary">Download proof report</button>
      <div class="btns"><button id="copyproof">Copy summary</button><button id="setbase">Use this scan as the new "before"</button></div></div>`;
    $("download").onclick = () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([proofReport(baseline, scan)], { type: "text/html" }));
      a.download = `seo-proof-${new URL(scan.page.url).host}-${scan.page.scannedAt.slice(0, 10)}.html`;
      a.click();
    };
    $("copyproof").onclick = () => copy(`SEO before and after for ${scan.page.url}\nOverall ${baseline.scores.overall} to ${scan.scores.overall} (SEO ${baseline.scores.seo} to ${scan.scores.seo}, AEO ${baseline.scores.aeo} to ${scan.scores.aeo}, GEO ${baseline.scores.geo} to ${scan.scores.geo})\n` +
      ch.map((r) => `- ${r.name}: ${r.status}`).join("\n"), $("copyproof"));
  }
  const sb = $("setbase");
  if (sb) sb.onclick = async () => { await setBaseline(scan.page.url, scan.id); renderProof(scan, await history(scan.page.url)); };
}

async function copy(text, btn) {
  await navigator.clipboard.writeText(text);
  const old = btn.textContent; btn.textContent = "Copied"; btn.classList.add("done");
  setTimeout(() => { btn.textContent = old; btn.classList.remove("done"); }, 1500);
}

async function render(s) {
  const { page, scores, results } = s;
  const failed = results.filter((r) => r.ratio != null && r.ratio < 0.999).sort((a, b) => (b.gain || 0) - (a.gain || 0));
  const passed = results.filter((r) => r.ratio != null && r.ratio >= 0.999);
  const unknown = results.filter((r) => r.ratio == null);
  const potential = Math.min(100, scores.overall + Math.round(failed.slice(0, 5).reduce((a, r) => a + (r.gain || 0), 0)));
  $("scores").hidden = false; $("tabs").hidden = false;
  $("scores").innerHTML = scoresHtml(scores, potential);
  $("tabs").querySelector('[data-tab="fix"]').innerHTML = `To fix <span class="count">${failed.length}</span>`;
  $("tabs").querySelector('[data-tab="passed"]').innerHTML = `Passing <span class="count">${passed.length}</span>`;
  $("tab-fix").innerHTML = (failed.length
      ? `<p class="lede">Biggest wins first. The number is how many points each fix adds to the overall score.${page.platform !== "Unknown" ? ` Built with ${esc(page.platform)}.` : ""}</p><div class="list">${failed.map((r) => issueRow(r, page)).join("")}</div>`
      : `<p class="lede">Every check that could be measured passed. Next gains come from Search Console data and content.</p>`) +
    (unknown.length ? `<p class="unknowns">Not measured on this page: ${unknown.map((r) => esc(checkById[r.id].name)).join(", ")}.</p>` : "");
  $("tab-passed").innerHTML = passed.length ? `<div class="list">${passed.map((r) => issueRow(r, page)).join("")}</div>` : "<p class='lede'>Nothing passes yet.</p>";
  $("tab-prompt").innerHTML = `<p class="lede">Paste this into Claude to fix everything in order. It works best in Claude Code with the site's code open.</p>
    <div class="stack"><button id="copyall" class="primary">Copy prompt for all fixes</button></div><pre>${esc(fixAllPrompt(s))}</pre>
    <div class="skill"><h3>Go further with the CLAUDE SEO GOD MODE skill</h3>
    <p class="lede">The extension checks this one page. With the skill installed, Claude can do the rest:</p>
    <ul>${siteCommands(page).map(([what, how]) => `<li>${esc(what)}: <code>${esc(how)}</code></li>`).join("")}</ul>
    <a href="${REPO}#quick-start-people" target="_blank" rel="noopener">How to install the skill</a></div>`;
  $("copyall").onclick = () => copy(fixAllPrompt(s), $("copyall"));
  document.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = (ev) => { ev.preventDefault(); copy(fixPrompt(results.find((r) => r.id === b.dataset.copy), page), b); }));
  renderProof(s, await history(page.url));
}

document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => {
  document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll(".tab").forEach((t) => (t.hidden = t.id !== "tab-" + b.dataset.tab));
}));
$("scan").onclick = scan;

// Show the last scan for this page when the panel opens.
(async () => {
  const tab = await activeTab();
  if (!tab?.url || !/^https?:/i.test(tab.url)) return;
  $("url").textContent = tab.url;
  const { list } = await history(tab.url);
  if (list[0]) { current = list[0]; render(current); $("scan").textContent = "Scan again"; notice(`Showing your last scan from ${esc(when(list[0].page.scannedAt))}.`); }
})();
