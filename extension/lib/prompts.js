import { checkById } from "./rubric.js";
import { SITE_CHECKS } from "./siterate.js";
import { guideUrl, REPO, skillCmd } from "./skills.js";
import { potentials } from "./summary.js";

const RULES = `Rules:
- Use only facts that are already on the site or that I confirm. Write [CONFIRM: ...] for anything you'd have to guess (phone, prices, years, reviews, profile URLs).
- Change only what this fix needs. Keep the design and brand voice.
- Verify before you finish: build/tests pass, then load the live page and confirm it returns HTTP 200 and shows the change.
- If the site is behind Cloudflare or another CDN, do redirects/HTTPS in the CDN settings, not in app code.
- Tag what you report as OBSERVED (measured), INFERRED or UNKNOWN. Don't promise rankings or AI placement.`;

/** Name, why, steps, goal and guide for any result, page-level or whole-site. */
export function metaFor(r, platform = "Unknown") {
  const s = SITE_CHECKS[r.id];
  if (s) return { name: r.name, why: s.why, goal: s.goal, guide: s.guide, steps: [r.tip || s.goal], cmd: "" };
  const c = checkById[r.id];
  return { name: c.name, why: c.why, goal: c.goal, guide: guideUrl(r.id), steps: [...c.steps, ...(c.platform[platform] || [])], cmd: "" };
}

const pagesLine = (r) => (r.pages?.length ? `\nAffected pages (${r.pages.length}): ${[...new Set(r.pages)].slice(0, 15).join(", ")}${r.pages.length > 15 ? ", …" : ""}` : "");
const kitsFor = (scan, id) => (scan.kits || []).filter((k) => k.check === id).map((k) => `\n${k.title}:\n\`\`\`${k.lang}\n${k.body}\n\`\`\``).join("");
const target = (scan) => (scan.mode === "site" ? `the whole site ${scan.page.origin} (${scan.pagesRated} pages checked)` : scan.page.url);

/** Prompt for one failed check. */
export function fixPrompt(result, scan) {
  const { page } = scan;
  const m = metaFor(result, page.platform);
  const cmd = scan.mode === "site" ? "" : skillCmd(result.id, page);
  return `Fix one SEO/AEO/GEO issue on ${target(scan)} (platform detected: ${page.platform}).

Issue: ${m.name}
Evidence (${result.tag}, scanned ${page.scannedAt.slice(0, 16).replace("T", " ")}): ${result.detail}${pagesLine(result)}
Why it matters: ${m.why}
Goal: ${m.goal}

Suggested steps:
${m.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}${kitsFor(scan, result.id)}

Guide for this fix: ${m.guide}${cmd ? `\nTo check it across the whole site with the SEO God Mode skill, run: ${cmd}` : ""}

${RULES}

When done, tell me exactly what changed (files or settings), and I'll scan again with SEO God Mode for before/after proof.`;
}

/** One prompt for every failed check, in priority order. */
export function fixAllPrompt(scan) {
  const failed = scan.results.filter((r) => r.ratio != null && r.ratio < 0.999);
  const order = scan.priority?.length ? scan.priority : [...failed].sort((a, b) => (b.gain || 0) - (a.gain || 0)).map((r) => r.id);
  const ranked = order.map((id) => failed.find((r) => r.id === id)).filter(Boolean);
  if (!ranked.length) return "Nothing to fix: every measured check passed.";
  const { page, scores } = scan;
  return `Improve SEO, AEO (answer engines) and GEO (AI search) for ${target(scan)} (platform: ${page.platform}).
Current scores: overall ${scores.overall}, SEO ${scores.seo}, AEO ${scores.aeo}, GEO ${scores.geo} (SEO God Mode, ${page.scannedAt.slice(0, 10)}).
Potential (estimate): about ${potentials(scan).top5} after the first 5 fixes, up to ${potentials(scan).all} after all of them.

Fix these in order (estimated points gained in brackets). Do the safe, factual ones; ask me before anything that needs facts or account access.
${ranked.map((r, i) => { const m = metaFor(r, page.platform);
  return `\n${i + 1}. ${m.name} [+${r.gain}] — ${r.tag}: ${r.detail}${pagesLine(r).replace("\n", "\n   ")}\n   Goal: ${m.goal}\n   Steps: ${m.steps.join(" ")}\n   Guide: ${m.guide}${kitsFor(scan, r.id)}`; }).join("\n")}

${RULES}

If the SEO God Mode skill is installed (${REPO}), run \`python scripts/rate_site.py ${page.origin}\` (or the seo_rate_site MCP tool) before and after for whole-site proof. Finish with a list of what changed and anything I still need to do by hand (accounts, settings, facts to confirm).`;
}
