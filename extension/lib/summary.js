/**
 * Plain-English summary shown (typed out) after a scan: a verdict, the biggest fixes, the one-time setup items,
 * and what's already working. Built only from measured results; nothing is invented.
 */
import { checkById } from "./rubric.js";
import { SITE_CHECKS } from "./siterate.js";

const VERDICT = [
  [90, "looks great. Only small polish left."],
  [80, "looks good, with a few gaps worth closing."],
  [70, "has a solid base but needs work in a few places."],
  [60, "needs attention. Several basics are missing."],
  [0, "has serious gaps holding it back in search and AI answers."],
];
const AREA = { seo: "search basics (SEO)", aeo: "answer engines (AEO)", geo: "AI search (GEO)" };
const list = (xs) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Lowercase the first letter unless it starts an acronym ("AI search", "HTTPS").
const low = (s) => (/^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

/** Short phrase for a failing check: site checks have `say`, page checks use their name. */
function say(r) {
  const s = SITE_CHECKS[r.id]?.say;
  if (s) return s;
  const name = checkById[r.id]?.name || r.name || r.id;
  return low(name);
}

/** Score after the top 5 fixes (same rule as rate_site.py) and after every measured fix. Estimates, not promises. */
export function potentials(scan) {
  const failed = scan.results.filter((r) => r.ratio != null && r.ratio < 0.999);
  const order = scan.priority?.length ? scan.priority.map((id) => failed.find((r) => r.id === id)).filter(Boolean) : [...failed].sort((a, b) => (b.gain || 0) - (a.gain || 0));
  const now = scan.scores.overall ?? 0, sum = (xs) => Math.round(xs.reduce((a, r) => a + (r.gain || 0), 0));
  return { now, top5: scan.scores.potential_after_top5 ?? Math.min(100, now + sum(order.slice(0, 5))), all: Math.min(100, now + sum(failed)) };
}

export function summaryText(scan) {
  const { scores, results } = scan;
  const site = scan.mode === "site";
  const what = site ? "This site" : "This page";
  const failed = results.filter((r) => r.ratio != null && r.ratio < 0.999 && r.cat !== "info");
  const order = scan.priority?.length ? scan.priority : [...failed].sort((a, b) => (b.gain || 0) - (a.gain || 0)).map((r) => r.id);
  const byId = Object.fromEntries(failed.map((r) => [r.id, r]));
  const ranked = order.map((id) => byId[id]).filter(Boolean);
  // A perfect score gets no to-do list: nothing measured needs work.
  if ((scores.overall ?? 0) >= 100 || !failed.length) {
    const lines = [`${what} scores ${scores.overall}/100. There's currently nothing you need to do from here.`];
    if (failed.length) lines.push(`${failed.length} tiny optional tweak${failed.length === 1 ? " is" : "s are"} listed under Issues if you want them, but they won't move the score.`);
    lines.push("Rescan after you change the site to keep it there. Rankings and AI citations also depend on things a public scan can't see, like reviews, links and Search Console data.");
    return lines.join("\n");
  }
  const v = VERDICT.find(([min]) => (scores.overall ?? 0) >= min)[1];
  const pot = potentials(scan);
  const out = [`${what} ${v} Overall ${scores.overall}/100${pot.top5 > pot.now ? `, potential about ${pot.top5} after the top 5 fixes` : ""}.`];

  const areas = ["seo", "aeo", "geo"].filter((k) => scores[k] != null).sort((a, b) => scores[a] - scores[b]);
  if (areas.length && scores[areas[0]] < 80) out.push(`The weakest area is ${AREA[areas[0]]} at ${scores[areas[0]]}.`);

  const setup = site ? ranked.filter((r) => SITE_CHECKS[r.id]?.setup) : [];
  const work = ranked.filter((r) => !setup.includes(r)).slice(0, 3);
  if (work.length) {
    const pts = Math.round(work.reduce((a, r) => a + (r.gain || 0), 0));
    out.push(`Biggest wins: ${list(work.map((r) => say(r) + (r.pages?.length ? ` (${r.pages.length} page${r.pages.length === 1 ? "" : "s"})` : "")))}. Together that's about +${pts} points.`);
  }
  if (setup.length) out.push(`You should set up: ${list(setup.slice(0, 4).map(say))}.`);
  if (!failed.length) out.push("Every measured check passed. The next gains need data a public scan can't see, like Search Console.");

  const good = results.filter((r) => r.ratio != null && r.ratio >= 0.999 && r.weight > 0).sort((a, b) => b.weight - a.weight).slice(0, 2)
    .map((r) => (checkById[r.id]?.name || r.name).replace(/\s*\(.*\)$/, ""));
  if (good.length) out.push(`Already working: ${list(good.map((g, i) => (i ? low(g) : g)))}.`);
  if (failed.length) out.push(`Copy the fix prompt to get it all done in order.`);
  // Verdict (and weakest area) as one opening line, then one line per point.
  const lead = out.splice(0, areas.length && scores[areas[0]] < 80 ? 2 : 1).join(" ");
  return [lead, ...out].map(cap).join("\n");
}
