import { checkById } from "./rubric.js";

const RULES = `Rules:
- Use only facts that are already on the site or that I confirm. Write [CONFIRM: ...] for anything you'd have to guess (phone, prices, years, reviews, profile URLs).
- Change only what this fix needs. Keep the design and brand voice.
- Verify before you finish: build/tests pass, then load the live page and confirm it returns HTTP 200 and shows the change.
- If the site is behind Cloudflare or another CDN, do redirects/HTTPS in the CDN settings, not in app code.
- Tag what you report as OBSERVED (measured), INFERRED or UNKNOWN. Don't promise rankings or AI placement.`;

const steps = (c, platform) => [...c.steps, ...(c.platform[platform] || [])];

/** Prompt for one failed check. */
export function fixPrompt(result, page) {
  const c = checkById[result.id];
  return `Fix one SEO/AEO/GEO issue on ${page.url} (platform detected: ${page.platform}).

Issue: ${c.name}
Evidence (${result.tag}, scanned ${page.scannedAt.slice(0, 16).replace("T", " ")}): ${result.detail}
Why it matters: ${c.why}
Goal: ${c.goal}

Suggested steps:
${steps(c, page.platform).map((s, i) => `${i + 1}. ${s}`).join("\n")}

${RULES}

When done, tell me exactly what changed (files or settings), and I'll re-scan the page with the CLAUDE SEO GOD MODE extension for before/after proof.`;
}

/** One prompt for every failed check, highest point gain first. */
export function fixAllPrompt(scan) {
  const failed = scan.results.filter((r) => r.ratio != null && r.ratio < 0.999).sort((a, b) => (b.gain || 0) - (a.gain || 0));
  if (!failed.length) return "Nothing to fix: every measured check passed.";
  const { page, scores } = scan;
  return `Improve SEO, AEO (answer engines) and GEO (AI search) for ${page.url} (platform: ${page.platform}).
Current page scores: overall ${scores.overall}, SEO ${scores.seo}, AEO ${scores.aeo}, GEO ${scores.geo} (CLAUDE SEO GOD MODE extension, ${page.scannedAt.slice(0, 10)}).

Fix these in order (estimated points gained in brackets). Do the safe, factual ones; ask me before anything that needs facts or account access.
${failed.map((r, i) => { const c = checkById[r.id];
  return `\n${i + 1}. ${c.name} [+${r.gain}] — ${r.tag}: ${r.detail}\n   Goal: ${c.goal}\n   Steps: ${steps(c, page.platform).join(" ")}`; }).join("\n")}

${RULES}

If you have the CLAUDE SEO GOD MODE skill (https://github.com/F0rger123/CLAUDE-SEO-GOD-MODE), run its rate-my-site check on ${page.origin} before and after. Finish with a list of what changed and anything I still need to do by hand (accounts, settings, facts to confirm).`;
}
