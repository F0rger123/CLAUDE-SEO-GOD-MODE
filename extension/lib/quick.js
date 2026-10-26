/**
 * Quick rating of one page for the hover cards on Google results. Runs in the background service worker (no DOM there),
 * so it reads raw HTML with simple patterns. It's a fast estimate (INFERRED), not the full 39-check site rating:
 * use Site or Compete for that.
 */
const STOP = new Set("a an the and or of for to in on at by with is are be can do does how what why when where which who my i me you your near best vs from this that it its us our".split(" "));
const terms = (s) => (String(s || "").toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => !STOP.has(w) && (w.length > 2 || /\d/.test(w)));
const decode = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s) => decode(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const has = (text, ts) => { const t = " " + String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ") + " "; return ts.length ? ts.filter((w) => t.includes(" " + w + " ")).length / ts.length : 0; };

export function quickFacts(html, url) {
  const body = html.replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, " ");
  const meta = (n) => decode((html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${n}["'][^>]*content=["']([^"']*)["']`, "i")) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${n}["']`, "i")) || [])[1] || "");
  const heads = (lvl) => [...body.matchAll(new RegExp(`<h${lvl}\\b[^>]*>([\\s\\S]*?)</h${lvl}>`, "gi"))].map((m) => strip(m[1])).filter(Boolean);
  const types = new Set();
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) for (const t of m[1].matchAll(/"@type"\s*:\s*(\[[^\]]*\]|"[^"]+")/g)) (t[1].match(/"([^"]+)"/g) || []).forEach((x) => types.add(x.replace(/"/g, "")));
  const text = strip(body);
  return {
    url, title: strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]), description: meta("description"), robots: meta("robots"),
    h1: heads(1), h2: heads(2), h3: heads(3), words: text ? text.split(" ").length : 0, text: text.slice(0, 30000),
    schema: [...types].sort(), canonical: /<link[^>]+rel=["']canonical["']/i.test(html), viewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    https: url.startsWith("https:"), phone: /href=["']tel:/i.test(html), kb: Math.round(html.length / 1024),
    reviews: /"aggregateRating"/.test(html), faq: types.has("FAQPage"),
  };
}

/**
 * Topics a page targets, as real phrases: its title segments ("Roof Repair & Replacement, York PA" gives
 * "roof repair", "roof replacement", "york pa"), H1s and short H2s, scored by where they appear and how often
 * the body repeats them.
 */
export function pageKeywords(f, n = 6) {
  const score = new Map();
  const body = " " + f.text.toLowerCase().replace(/[^a-z0-9]+/g, " ") + " ";
  const add = (raw, w) => {
    for (const seg of String(raw || "").split(/\s[|–—:-]\s|[|–—:,]/)) {
      const parts = seg.split(/\s+(?:&|and|\+)\s+/i);
      const head = terms(parts[0] || "");
      parts.forEach((part, i) => {
        let t = terms(part);
        if (i && t.length === 1 && head.length > 1) t = [...head.slice(0, -1), t[0]];  // "Roof Repair & Replacement"
        if (t.length < 1 || t.length > 4 || /^\d+$/.test(t.join(""))) return;
        const p = t.join(" ");
        const freq = body.split(" " + p + " ").length - 1;
        score.set(p, (score.get(p) || 0) + w + Math.min(3, freq * 0.5));
      });
    }
  };
  add(f.title, 3); f.h1.forEach((h) => add(h, 2));
  f.h2.filter((h) => !/\?$/.test(h) && h.split(" ").length <= 6).slice(0, 10).forEach((h) => add(h, 1));
  const out = [];
  for (const [p] of [...score].sort((a, b) => b[1] - a[1] || b[0].split(" ").length - a[0].split(" ").length)) {
    if (!out.some((o) => o === p || (" " + o + " ").includes(" " + p + " "))) out.push(p);
    if (out.length >= n) break;
  }
  return out;
}

/** 0–100 quick score plus plain reasons the page shows for the search, and its biggest gaps. */
export function quickRate(f, query = "", ms = null) {
  const ts = terms(query);
  const checks = [
    ["Search words in the title", ts.length ? has(f.title, ts) >= 0.75 : null, 3],
    ["Search words in the H1", ts.length ? has(f.h1.join(" "), ts) >= 0.75 : null, 2],
    ["Title 25–60 characters", f.title.length >= 25 && f.title.length <= 60, 1],
    ["Meta description", f.description.length >= 70 && f.description.length <= 170, 1],
    ["Exactly one H1", f.h1.length === 1, 1],
    ["Substantial content (300+ words)", f.words >= 300, 2],
    ["Sections (2+ H2s)", f.h2.length >= 2, 1],
    ["Question headings", [...f.h2, ...f.h3].some((h) => /\?$|^(how|what|why|when|where|which|who|can|do|does|is|are)\b/i.test(h)), 1],
    ["Business or page schema", f.schema.length > 0, 2],
    ["Not blocked from Google (noindex)", !/noindex/i.test(f.robots), 3],
    ["HTTPS", f.https, 1],
    ["Mobile viewport", f.viewport, 1],
    ["Canonical tag", f.canonical, 1],
    ["Fast HTML (under 1.5 s)", ms == null ? null : ms < 1500, 1],
  ];
  const known = checks.filter((c) => c[1] != null);
  const score = Math.round(100 * known.reduce((a, c) => a + (c[1] ? c[2] : 0), 0) / known.reduce((a, c) => a + c[2], 0));
  const why = [];
  if (ts.length && has(f.title, ts) >= 0.75) why.push("Title matches the search");
  if (ts.length && has(f.h1.join(" "), ts) >= 0.75) why.push("Main heading matches the search");
  if (ts.length && has(f.text, ts) >= 1) why.push("Every search word appears on the page");
  if (f.words >= 800) why.push(`In-depth page (${f.words.toLocaleString()} words)`);
  if (f.schema.some((t) => /LocalBusiness|Organization|Contractor|Store|Restaurant|Service/.test(t))) why.push("Business schema tells Google who they are");
  if (f.faq) why.push("FAQ markup");
  if (f.reviews) why.push("Review stars in markup");
  if ([...f.h2, ...f.h3].some((h) => /\?$/.test(h))) why.push("Answers questions in headings");
  return { score, why, gaps: known.filter((c) => !c[1]).map((c) => c[0]).slice(0, 4), keywords: pageKeywords(f), words: f.words, title: f.title, schema: f.schema.slice(0, 5) };
}
