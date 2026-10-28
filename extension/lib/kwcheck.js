/**
 * Keyword check, run from the Track view when you press Check (never on its own):
 *  - Searches each keyword on Google in a background tab, one at a time a few seconds apart, reads the results with
 *    readGoogle and records the site's position (the same reading a normal Google search records).
 *  - Stops at a robot check and brings that tab forward for you to solve. It never tries to get past one.
 *  - For keywords where the site isn't in the top 3, compares its page with the top results (the same breakdown as
 *    the Google hover cards) and lists what to change.
 *  - Suggests new keywords from the searches' "People also ask" and related searches, minus the ones already tracked.
 * The report is saved per site ("kwreport:<origin>") and merged with earlier checks.
 */
import { readGoogle } from "./google.js";
import { breakdown } from "./breakdown.js";
import { recordPositions, trackedSites } from "./track.js";

export const reportKey = (origin) => "kwreport:" + origin;
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loaded(tabId, timeout = 20000) {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(t); chrome.tabs.onUpdated.removeListener(on); setTimeout(resolve, 700); };
    const on = (id, info) => { if (id === tabId && info.status === "complete") done(); };
    const t = setTimeout(done, timeout);
    chrome.tabs.onUpdated.addListener(on);
  });
}

/** Search each keyword and record positions. Returns {results: [{q, pos, of, serp}], blocked}. */
export async function searchKeywords(qs, { origin, onProgress = () => {} } = {}) {
  const tab = await chrome.tabs.create({ url: "about:blank", active: false });
  const results = [];
  let blocked = false;
  try {
    for (const [i, q] of qs.entries()) {
      if (i) await sleep(2500 + Math.random() * 1500);
      onProgress(`Searching Google for “${q}” (${i + 1} of ${qs.length})…`);
      const wait = loaded(tab.id);
      await chrome.tabs.update(tab.id, { url: "https://www.google.com/search?q=" + encodeURIComponent(q) });
      await wait;
      const serp = (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readGoogle }).catch(() => [{}]))[0]?.result;
      if (serp?.blocked) { blocked = true; break; }
      if (serp?.kind !== "serp" || !serp.organic?.length) { results.push({ q, error: "couldn't read the results" }); continue; }
      serp.query = q;
      const mine = (await recordPositions(serp)).find((r) => r.origin === origin);
      results.push({ q, pos: mine?.pos ?? null, of: serp.organic.length, serp });
    }
  } finally {
    if (blocked) chrome.tabs.update(tab.id, { active: true }).catch(() => {});
    else chrome.tabs.remove(tab.id).catch(() => {});
  }
  return { results, blocked };
}

export const group = (pos) => (pos && pos <= 3 ? "top" : pos && pos <= 10 ? "close" : "behind");

/**
 * Break down the keywords where the site isn't top 3, suggest new keywords, and save the report merged with earlier ones.
 * canRead: whether the extension may read other websites (needed to compare pages).
 */
export async function buildReport(origin, results, { canRead = true, onProgress = () => {} } = {}) {
  const site = (await trackedSites()).find((s) => s.origin === origin);
  const old = (await chrome.storage.local.get(reportKey(origin)))[reportKey(origin)] || { rows: [], ideas: [] };
  const rows = new Map(old.rows.map((r) => [r.q, r]));
  const ideas = new Map(old.ideas.map((x) => [x.q.toLowerCase(), x]));
  for (const r of results.filter((x) => !x.error)) {
    const row = { q: r.q, pos: r.pos, of: r.of, t: new Date().toISOString(), top: r.serp.organic.slice(0, 3).map((o) => ({ host: hostOf(o.url), position: o.position })) };
    const hit = r.serp.organic.find((o) => hostOf(o.url) === hostOf(origin));
    row.page = hit?.url || origin + "/";
    if (group(r.pos) !== "top" && canRead) {
      onProgress(`Comparing your page with the top results for “${r.q}”…`);
      const b = await breakdown({ query: r.q, organic: r.serp.organic }, row.page, { n: 3 }).catch((e) => ({ error: String(e.message || e) }));
      if (b.error) row.error = b.error;
      else Object.assign(row, { score: b.score, others: b.others, verdict: b.verdict,
        gaps: b.gaps.filter((g) => g.behind).slice(0, 4).map((g) => ({ label: g.label, fix: g.fix, mine: g.mine, them: g.them })) });
    }
    rows.set(r.q, row);
    for (const q of r.serp.paa || []) ideas.set(q.toLowerCase(), { q, kind: "question", from: r.q });
    for (const q of r.serp.related || []) ideas.set(q.toLowerCase(), { q, kind: "related", from: r.q });
  }
  const have = new Set([...(site?.keywords || []), ...rows.keys()].map((k) => k.toLowerCase()));
  const report = { t: new Date().toISOString(), rows: [...rows.values()],
    ideas: [...ideas.values()].filter((x) => !have.has(x.q.toLowerCase())).slice(0, 15) };
  await chrome.storage.local.set({ [reportKey(origin)]: report });
  return report;
}

export async function getReport(origin) { return (await chrome.storage.local.get(reportKey(origin)))[reportKey(origin)] || null; }

/** A prompt to paste into an AI assistant: the keywords not in the top 3 and what to change for each. */
export function keywordPrompt(origin, report) {
  const weak = report.rows.filter((r) => group(r.pos) !== "top").sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
  const strong = report.rows.filter((r) => group(r.pos) === "top");
  const line = (r) => `- "${r.q}": ${r.pos ? "#" + r.pos : "not in the top " + (r.of || 10)} (page: ${r.page}). Top: ${r.top.map((t) => `#${t.position} ${t.host}`).join(", ")}.`
    + (r.score != null ? ` On-page score ${r.score}/100 vs theirs ${r.others?.join(", ") || "–"}.` : "")
    + (r.gaps?.length ? "\n" + r.gaps.map((g) => `  - ${g.label}: this page ${g.mine}, top pages ${g.them.join(" / ") || "–"}. ${g.fix}`).join("\n") : "");
  return `Help ${origin} rank higher on Google for these keywords (SEO God Mode keyword check, ${new Date().toISOString().slice(0, 10)}; positions read from Google, page facts OBSERVED).
${weak.length ? `Not in the top 3, closest first:\n${weak.map(line).join("\n")}` : "Every checked keyword is in the top 3."}
${strong.length ? `\nAlready top 3 (don't break these): ${strong.map((r) => `"${r.q}" #${r.pos}`).join(", ")}.` : ""}
If a page already scores at or above the top results on the page, say so: the on-page work is done there, and the next biggest wins are more Google reviews, a stronger Google Business Profile and links from other websites.
For each weak keyword: pick the one page that should rank for it (create it if no page fits and say so), then change its title, H1, opening lines and sections to answer the search, and link to it from related pages. Don't target two keywords with the same page if they need different answers.
Rules: use only facts that are on the site or that I confirm, and write [CONFIRM: ...] for anything you'd have to guess. Don't copy competitors' text, photos, reviews or claims. Use each keyword naturally; no stuffing. Keep the design. Verify the live pages after deploying. Don't promise rankings.
Not measured: backlinks, reviews and Google Business Profile strength, site age, clicks. Positions vary by location and person.`;
}
