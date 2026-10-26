/**
 * Full breakdown of one Google result: why it ranks where it does for the search, compared with the top results.
 * Used by the Google hover cards (in the offscreen document, which has a DOM parser) and by the side panel, so both
 * show the same numbers.
 *  - Reads the page and up to three rival pages: the ones ranking above it, or (for #1) the ones right below it.
 *  - Scores the page 0–100 on the 21 on-page factors Compete uses, judged against those rivals ("search match").
 *  - Lists what helps it rank, what the rivals do differently, the fixes, and a fix prompt.
 * Only on-page signals are measured (OBSERVED). Backlinks, reviews and domain age are listed as not measured.
 */
import { DIRECTORIES, FACTORS, fetchPage, pageFacts, sameDomain, terms } from "./compete.js";
import { detectTech, techLine } from "./tech.js";

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const median = (xs) => { const s = xs.filter((x) => typeof x === "number").sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

// How much each factor counts toward the search match score.
const WEIGHT = { kwTitle: 3, kwH1: 2, kwLead: 2, kwSubs: 1, kwDesc: 1, kwUrl: 1, words: 2, h2: 1, questions: 1, lists: 1, business: 2, faq: 1,
  reviews: 1, breadcrumb: 1, internal: 1, external: 1, phone: 1, altShare: 1, ms: 1, https: 1, rendered: 2 };
// Floors that apply even when the rivals are weak.
const FLOOR = { kwSubs: 1, words: 300, h2: 2, questions: 1, lists: 1, internal: 3, external: 1, altShare: 0.8 };
// Plain reasons for the "why it ranks" list.
const WHY = { kwTitle: "Its title uses the search words", kwH1: "Its main heading names the search", kwLead: "It answers the search in the opening lines",
  kwSubs: "Its subheadings use the search words", kwDesc: "Its Google description matches the search", kwUrl: "Its address (URL) has the search words",
  words: "It has more detail than most", h2: "It's split into clear sections", questions: "It answers the questions people ask", lists: "It uses lists or tables",
  business: "Business schema tells Google who and where it is", faq: "FAQ markup", reviews: "Review stars in its markup", breadcrumb: "Breadcrumb markup",
  internal: "It links to related pages on its site", external: "It links to sources", phone: "Tap-to-call phone number", ms: "The page loads fast",
  rendered: "Its text is readable without JavaScript" };
// The rows the hover card shows side by side.
export const KEY_ROWS = ["kwTitle", "kwH1", "words", "h2", "questions", "business", "faq", "reviews", "ms"];

const pages = new Map();
async function get(url) {
  const hit = pages.get(url);
  if (hit && Date.now() - hit.at < 36e5) return hit.res;
  const res = await fetchPage(url, 12000);
  pages.set(url, { at: Date.now(), res });
  if (pages.size > 40) pages.delete(pages.keys().next().value);
  return res;
}

const value = (f, x) => (f.kind === "numlen" ? x[f.id].length : x[f.id]);
function passes(f, v, ref) {
  if (v == null) return false;
  if (f.kind === "share") return typeof v === "number" ? v >= 0.75 : !!v;
  if (f.kind === "lower") return v <= Math.max(1500, ref != null ? ref * 1.5 : 0);
  return v >= Math.max(FLOOR[f.id] ?? 0, ref != null ? ref * 0.6 : 0);
}
function show(f, v) {
  if (v == null) return "–";
  if (f.kind === "share") return typeof v === "number" ? (v >= 0.75 ? "yes" : v > 0 ? "partly" : "no") : v ? "yes" : "no";
  if (f.id === "altShare") return Math.round(v * 100) + "%";
  if (f.id === "ms") return v >= 1000 ? (v / 1000).toFixed(1) + " s" : Math.round(v) + " ms";
  return Math.round(v).toLocaleString();
}

/**
 * serp: {query, organic: [{position, url, title}]}; url: the result to break down.
 * Returns {query, url, host, position, title, score, rows, why, gaps, rivals, relation, tech, prompt, notMeasured} or {error}.
 */
export async function breakdown(serp, url, { n = 3 } = {}) {
  const ts = terms(serp.query);
  const organic = (serp.organic || []).slice(0, 20);
  const target = organic.find((o) => o.url === url) || organic.find((o) => sameDomain(o.url, url)) || { url, position: null, title: "" };
  const pool = organic.filter((o) => !DIRECTORIES.test(hostOf(o.url)) && !sameDomain(o.url, target.url));
  const above = pool.filter((o) => target.position != null && o.position < target.position).slice(0, n);
  const rivalsList = above.length ? above : pool.slice(0, n);
  const [res, ...rivRes] = await Promise.all([get(target.url), ...rivalsList.map((o) => get(o.url))]);
  const me = pageFacts(res, ts);
  if (!me) return { error: res?.error || (res?.status ? `the page answered HTTP ${res.status}` : "couldn't read the page"), url: target.url, host: hostOf(target.url), position: target.position };
  const rivals = rivRes.map((r, i) => { const f = pageFacts(r, ts); return f && { ...f, position: rivalsList[i].position }; }).filter(Boolean);
  const rows = FACTORS.map((f) => {
    const vals = rivals.map((r) => value(f, r));
    const ref = f.kind === "share" ? null : median(vals);
    const mine = value(f, me);
    const ok = passes(f, mine, ref);
    const theyOk = vals.map((x) => passes(f, x, ref));
    const most = rivals.length ? theyOk.filter(Boolean).length >= Math.ceil(rivals.length / 2) : false;
    return { id: f.id, label: f.label, fix: f.fix, weight: WEIGHT[f.id] || 1, ok, behind: !ok && most, edge: ok && rivals.length > 0 && !most,
      mine: show(f, mine), them: vals.map((x) => show(f, x)) };
  });
  const total = rows.reduce((a, r) => a + r.weight, 0);
  const score = Math.round(100 * rows.filter((r) => r.ok).reduce((a, r) => a + r.weight, 0) / total);
  // Stand-outs (things most of the compared pages lack) first; only called out when there are 2+ pages to compare.
  const why = rows.filter((r) => r.ok).sort((a, b) => Number(b.edge) - Number(a.edge) || b.weight - a.weight).slice(0, 5)
    .map((r) => (r.edge && rivals.length >= 2 ? WHY[r.id] + ", unlike most of the others" : WHY[r.id]));
  const gaps = rows.filter((r) => !r.ok).sort((a, b) => Number(b.behind) - Number(a.behind) || b.weight - a.weight);
  const relation = above.length ? "above" : "below";
  const tech = res.headers ? detectTech(res.html, res.headers) : null;
  const out = { query: serp.query, url: me.url, host: me.host, position: target.position, title: me.title, score, rows, why, gaps, relation,
    rivals: rivals.map((r) => ({ host: r.host, position: r.position, url: r.url, title: r.title })),
    facts: { words: me.words, h2: me.h2, questions: me.questions.length, ms: me.ms, schema: me.schemaTypes.slice(0, 6) },
    tech: tech ? { line: techLine(tech), tools: tech.tools.slice(0, 4) } : null,
    notMeasured: ["Backlinks and domain authority", "Reviews and Google Business Profile strength", "How long the site has existed", "Clicks and engagement"] };
  out.prompt = fixPrompt(out);
  return out;
}

export function fixPrompt(b) {
  const vs = b.rivals.map((r) => `#${r.position} ${r.host}`).join(", ");
  const list = b.gaps.slice(0, 8).map((g, i) => `${i + 1}. ${g.label}: this page ${g.mine}, ${b.relation === "above" ? "pages above it" : "next results"} ${g.them.join(" / ") || "–"}. ${g.fix}`).join("\n");
  return `Help ${b.url} rank higher for "${b.query}" on Google (it's ${b.position ? "#" + b.position : "not in the top results"}). SEO God Mode compared it with ${vs || "the top results"} on ${new Date().toISOString().slice(0, 10)}; search match ${b.score}/100.
${list ? `What to change, most important first (OBSERVED on the pages):\n${list}` : "It already matches the top results on every on-page factor measured; the gap is probably off-page (links, reviews, brand)."}
${b.why.length ? `\nKeep what already works: ${b.why.join("; ")}.` : ""}
Rules: use only facts that are on the site or that I confirm, and write [CONFIRM: ...] for anything you'd have to guess. Don't copy other sites' text, photos, reviews or claims. Keep the design. Verify the live page after deploying. Don't promise rankings.
Not measured here: ${b.notMeasured.join("; ")}.`;
}
