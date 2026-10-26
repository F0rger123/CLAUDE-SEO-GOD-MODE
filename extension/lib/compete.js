/**
 * Competitor and keyword analysis for the Compete view.
 *  - whyTheyRank(): fetches the pages ranking on the Google results page the user has open, compares them with the
 *    user's page factor by factor, and lists where they're ahead, topics and questions they cover, and a content brief.
 *  - keywordIdeas(): expands a target keyword with Google autocomplete and checks which ideas the user's page covers.
 *  - auditBusiness(): checks a Google Business Profile panel read by google.js.
 * Only on-page signals are measured. Backlinks, domain age and click data are listed as not measured, never guessed.
 */
import { parseJsonld, parsePage, schemaTypes } from "./pyparse.js";

export const DIRECTORIES = /(^|\.)(yelp|angi|angieslist|homeadvisor|houzz|thumbtack|bbb|facebook|instagram|linkedin|nextdoor|yellowpages|mapquest|porch|bark|reddit|youtube|wikipedia|amazon|tripadvisor|indeed|glassdoor|twitter|x|tiktok|pinterest|quora|manta|chamberofcommerce|expertise|networx|homeguide|buildzoom|google)\.[a-z.]+$/i;
const STOP = new Set("a an the and or of for to in on at by with is are be can do does how what why when where which who my i me you your near best vs from this that it its me us our".split(" "));
const QUESTION = /^(how|what|why|when|where|which|who|can|do|does|is|are|should|will)\b|\?$/i;
export const terms = (s) => (String(s || "").toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => !STOP.has(w) && (w.length > 2 || /\d/.test(w)));
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
export const sameDomain = (a, b) => !!a && !!b && hostOf(a) === hostOf(b);
const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const has = (text, ts) => { const t = " " + String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ") + " "; return ts.length ? ts.filter((w) => t.includes(" " + w + " ")).length / ts.length : 0; };
const pLimit = async (items, n, fn) => { const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; };

export async function fetchPage(url, timeout = 15000) {
  const t0 = performance.now();
  try {
    const r = await fetch(url, { credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(timeout) });
    const html = await r.text();
    return { url, finalUrl: r.url, status: r.status, html, ms: Math.round(performance.now() - t0) };
  } catch (e) { return { url, status: null, html: "", error: String(e.message || e) }; }
}

/** On-page facts for one fetched page, relative to the search terms. */
export function pageFacts(res, ts) {
  if (!res || res.status !== 200 || !res.html) return null;
  const p = parsePage(res.html);
  const { items, errors } = parseJsonld(p.jsonld);
  const types = new Set(items.flatMap(schemaTypes));
  const h1 = p.headings.filter((h) => h[0] === 1).map((h) => h[1]).join(" ");
  const subs = p.headings.filter((h) => h[0] >= 2 && h[0] <= 3).map((h) => h[1]);
  const lead = p.blocks.find(([k, t]) => k === "p" && t.split(" ").length >= 8)?.[1] || "";
  const words = p.text ? p.text.split(" ").length : 0;
  const host = hostOf(res.finalUrl || res.url);
  const links = p.links.map((l) => { try { return new URL(l.href, res.finalUrl || res.url); } catch { return null; } }).filter(Boolean);
  const imgs = p.images.filter((i) => i.src);
  const agg = items.find((i) => i.aggregateRating)?.aggregateRating;
  return {
    url: res.finalUrl || res.url, host, ms: res.ms, kb: Math.round(new TextEncoder().encode(res.html).length / 1024),
    title: p.title, description: p.meta.description || "", h1, subs, words, text: p.text, lead,
    kwTitle: has(p.title, ts), kwH1: has(h1, ts), kwSubs: subs.filter((s) => has(s, ts) >= 0.5).length, kwLead: has(lead, ts),
    kwDesc: has(p.meta.description, ts), kwUrl: has(decodeURIComponent(new URL(res.finalUrl || res.url).pathname).replace(/[-_/]/g, " "), ts),
    kwBody: has(p.text, ts), mentions: ts.length ? Math.min(...ts.map((w) => (p.text.toLowerCase().match(new RegExp(`\\b${w}\\b`, "g")) || []).length)) : 0,
    h2: p.headings.filter((h) => h[0] === 2).length, questions: subs.filter((s) => QUESTION.test(s)),
    lists: (res.html.match(/<(ul|ol|table)\b/gi) || []).length,
    business: [...types].some((t) => /LocalBusiness|Organization|Contractor|Service$|Store|Restaurant|Plumber|Electrician|Roofing|HVAC|Dentist|Attorney|Legal/.test(t)),
    faq: types.has("FAQPage"), reviews: !!agg, ratingCount: agg ? Number(agg.reviewCount || agg.ratingCount) || null : null,
    breadcrumb: types.has("BreadcrumbList"), schemaTypes: [...types].sort(), schemaErrors: errors.length,
    internal: links.filter((u) => hostOf(u.href) === host).length, external: links.filter((u) => /^https?:/.test(u.protocol) && hostOf(u.href) !== host).length,
    images: imgs.length, altShare: imgs.length ? imgs.filter((i) => i.alt != null && i.alt.trim()).length / imgs.length : 1,
    https: (res.finalUrl || res.url).startsWith("https:"), viewport: !!p.viewport, rendered: words >= 80,
    phone: /href=["']tel:/i.test(res.html), canonical: !!p.canonical,
    headingsText: subs.join(" | ").toLowerCase(),
  };
}

/** Factors compared between ranking pages and yours. kind bool = share of rivals that have it; num = rival median. */
export const FACTORS = [
  { id: "kwTitle", label: "Search words in the title", kind: "share", fix: "Put the search words near the start of the page title (about 50–60 characters, brand last)." },
  { id: "kwH1", label: "Search words in the H1", kind: "share", fix: "Make the H1 say the service and place in plain words." },
  { id: "kwLead", label: "Search words in the opening paragraph", kind: "share", fix: "Open with 1–2 sentences that answer the search directly and use its words." },
  { id: "kwSubs", label: "Subheadings that use the search words", kind: "num", fix: "Use the search wording (and close variants) in 1–3 H2/H3 headings." },
  { id: "kwDesc", label: "Search words in the meta description", kind: "share", fix: "Rewrite the meta description (120–160 characters) around the search and a reason to click." },
  { id: "kwUrl", label: "Search words in the URL", kind: "share", fix: "Use a short URL with the service words for new pages. Don't change old URLs without a 301 redirect." },
  { id: "words", label: "Amount of content (words)", kind: "num", fix: "Add useful detail customers need: process, cost factors, timelines, proof, FAQs. Don't pad." },
  { id: "h2", label: "Sections (H2 headings)", kind: "num", fix: "Break the page into clear H2 sections covering each part of the topic." },
  { id: "questions", label: "Question headings answered", kind: "numlen", fix: "Add the questions people ask as headings, each with a short direct answer." },
  { id: "lists", label: "Lists and tables", kind: "num", fix: "Use lists or a table for steps, options, prices or comparisons." },
  { id: "business", label: "Business schema (LocalBusiness/Organization)", kind: "share", fix: "Add LocalBusiness or Organization JSON-LD with name, phone, address or service area, and sameAs." },
  { id: "faq", label: "FAQ schema", kind: "share", fix: "Add an FAQ section; add FAQPage schema only if it matches the visible questions." },
  { id: "reviews", label: "Review stars in schema", kind: "share", fix: "Show real reviews on the page. Only mark up reviews that are visible and about your business (no self-serving stars from your own site for LocalBusiness)." },
  { id: "breadcrumb", label: "Breadcrumb schema", kind: "share", fix: "Add BreadcrumbList schema that matches the page's place in the site." },
  { id: "internal", label: "Internal links", kind: "num", fix: "Link to related service, area and FAQ pages with descriptive anchor text." },
  { id: "external", label: "Links to sources", kind: "num", fix: "Back up claims and numbers with links to trustworthy sources." },
  { id: "phone", label: "Clickable phone number", kind: "share", fix: "Add a tap-to-call link (tel:) near the top." },
  { id: "altShare", label: "Images with alt text", kind: "num", fix: "Describe meaningful images in alt text." },
  { id: "ms", label: "Server response time (ms)", kind: "lower", fix: "Add caching or a CDN so the HTML loads in under a second." },
  { id: "https", label: "HTTPS", kind: "share", fix: "Serve the page over HTTPS." },
  { id: "rendered", label: "Text readable without JavaScript", kind: "share", fix: "Server-render the main content so crawlers and AI bots can read it." },
];

/** Shared topics among rival headings that your page doesn't mention (bigrams first, then single words). */
function topicGaps(rivals, mine) {
  const count = new Map();
  for (const r of rivals) {
    const seen = new Set();
    for (const h of r.subs) {
      const w = terms(h);
      for (let i = 0; i < w.length; i++) { seen.add(w[i]); if (i + 1 < w.length) seen.add(w[i] + " " + w[i + 1]); }
    }
    seen.forEach((k) => count.set(k, (count.get(k) || 0) + 1));
  }
  const myText = " " + (mine?.text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ") + " ";
  const min = Math.max(2, Math.ceil(rivals.length * 0.4));
  return [...count].filter(([k, n]) => n >= min && !myText.includes(" " + k + " "))
    .sort((a, b) => b[1] - a[1] || b[0].split(" ").length - a[0].split(" ").length).slice(0, 14).map(([k, n]) => ({ topic: k, rivals: n }));
}

/**
 * Compare the pages ranking for the open search with yours.
 * serp: output of readGoogle(); myUrl: your page (your ranking URL is used when you're on the page).
 */
export async function whyTheyRank(serp, myUrl, { max = 8, onProgress = () => {} } = {}) {
  const ts = terms(serp.query);
  const mine = serp.organic.find((o) => sameDomain(o.url, myUrl));
  const rivalsList = serp.organic.filter((o) => !DIRECTORIES.test(hostOf(o.url)) && !sameDomain(o.url, myUrl)).slice(0, max);
  const skipped = serp.organic.filter((o) => DIRECTORIES.test(hostOf(o.url))).map((o) => hostOf(o.url));
  onProgress(`Reading ${rivalsList.length} ranking pages…`);
  const myTarget = mine?.url || myUrl;
  const [myRes, ...rivRes] = await pLimit([myTarget, ...rivalsList.map((o) => o.url)], 4, (u) => (u ? fetchPage(u) : null));
  const me = pageFacts(myRes, ts);
  const rivals = rivRes.map((r, i) => { const f = pageFacts(r, ts); return f && { ...f, position: rivalsList[i].position, serpTitle: rivalsList[i].title }; }).filter(Boolean);
  const failed = rivRes.map((r, i) => (!r || r.status !== 200 ? hostOf(rivalsList[i].url) : null)).filter(Boolean);
  const rows = FACTORS.map((f) => {
    const vals = rivals.map((r) => (f.kind === "numlen" ? r[f.id].length : r[f.id]));
    const mv = me ? (f.kind === "numlen" ? me[f.id].length : me[f.id]) : null;
    let them, behind;
    if (f.kind === "share") {
      them = vals.length ? vals.filter((v) => (typeof v === "number" ? v >= 0.75 : v)).length / vals.length : null;
      const mineOk = typeof mv === "number" ? mv >= 0.75 : !!mv;
      behind = me != null && them != null && them >= 0.5 && !mineOk;
      return { ...f, them, mine: mineOk, behind, display: [`${Math.round((them || 0) * 100)}% of top pages`, mineOk ? "yes" : "no"] };
    }
    them = median(vals);
    behind = me != null && them != null && (f.kind === "lower" ? mv > them * 1.5 && mv > 800 : them > 0 && mv < them * 0.6);
    const fmt = (v) => (v == null ? "–" : f.id === "altShare" ? Math.round(v * 100) + "%" : Math.round(v));
    return { ...f, them, mine: mv, behind, display: [`median ${fmt(them)}`, fmt(mv)] };
  });
  const paa = (serp.paa || []).filter((q) => !me || has(me.headingsText + " " + me.text.slice(0, 20000), terms(q)) < 0.75);
  const rivalQs = [...new Set(rivals.flatMap((r) => r.questions))].filter((q) => !me || has(me.headingsText, terms(q)) < 0.75).slice(0, 10);
  const gaps = topicGaps(rivals, me);
  const brief = {
    targetWords: median(rivals.map((r) => r.words)), sections: median(rivals.map((r) => r.h2)),
    titleIdeas: rivals.slice(0, 3).map((r) => r.title), outline: gaps.slice(0, 8).map((g) => g.topic), questions: [...paa, ...rivalQs].slice(0, 8),
    schema: [...new Set(rivals.flatMap((r) => r.schemaTypes))].filter((t) => !me?.schemaTypes.includes(t)).slice(0, 8),
  };
  return { query: serp.query, terms: ts, myPosition: mine?.position ?? null, myUrl: myTarget, me, rivals, failed, skipped,
    rows, behind: rows.filter((r) => r.behind), paa, rivalQuestions: rivalQs, topicGaps: gaps, brief, local: serp.local || [],
    notMeasured: ["Backlinks and domain authority", "How long each site has existed", "Clicks and engagement", "Google Business Profile strength (open the business panel to audit yours)"] };
}

// ---------------------------------------------------------------- keyword ideas

export async function suggest(q) {
  try {
    const r = await fetch("https://suggestqueries.google.com/complete/search?" + new URLSearchParams({ client: "firefox", hl: "en", q }), { credentials: "omit", signal: AbortSignal.timeout(8000) });
    const d = JSON.parse(await r.text());
    return Array.isArray(d?.[1]) ? d[1].filter((s) => typeof s === "string") : [];
  } catch { return []; }
}

const COMMERCIAL = /\b(cost|costs|price|prices|pricing|best|near me|reviews?|company|companies|services?|cheap|affordable|top|hire|quote|estimate|install(ation)?|contractor)\b/i;
const COMPARE = /\b(vs|versus|or|alternative|alternatives|compared)\b/i;

/** Expand a keyword into what people type, grouped, and check which ideas your page already covers. */
export async function keywordIdeas(keyword, myUrl, { extra = [], onProgress = () => {} } = {}) {
  const kw = keyword.trim();
  const seeds = [kw, ...["cost", "price", "near me", "best", "vs", "for", "reviews", "how long", "company"].map((m) => `${kw} ${m}`),
    ...["how much does", "how to", "what is", "why", "is", "can", "best", "when to"].map((m) => `${m} ${kw}`)];
  onProgress(`Asking Google autocomplete (${seeds.length} lookups)…`);
  const lists = await pLimit(seeds, 4, (s) => suggest(s));
  const ideas = new Map();
  const add = (phrase, source) => { const k = phrase.toLowerCase().trim(); if (k && k !== kw.toLowerCase() && !ideas.has(k)) ideas.set(k, { phrase: phrase.trim(), source }); };
  lists.flat().forEach((s) => add(s, "autocomplete"));
  extra.forEach((s) => add(s.phrase || s, s.source || "results page"));
  onProgress("Checking your page…");
  const res = myUrl ? await fetchPage(myUrl) : null;
  const me = pageFacts(res, terms(kw));
  const covered = (phrase) => {
    if (!me) return null;
    const ts = terms(phrase);
    return { title: has(me.title, ts) >= 0.75, headings: has(me.headingsText + " " + me.h1, ts) >= 0.75, body: has(me.text, ts) >= 0.75 };
  };
  const rows = [...ideas.values()].map((i) => ({ ...i, kind: QUESTION.test(i.phrase) ? "question" : COMPARE.test(i.phrase) ? "comparison" : COMMERCIAL.test(i.phrase) ? "buyer" : "related", on: covered(i.phrase) }));
  const order = { question: 0, buyer: 1, comparison: 2, related: 3 };
  rows.sort((a, b) => order[a.kind] - order[b.kind] || (a.on?.body ? 1 : 0) - (b.on?.body ? 1 : 0) || a.phrase.length - b.phrase.length);
  const ts = terms(kw);
  const changes = [];
  if (me) {
    if (me.kwTitle < 1) changes.push({ what: "Title", now: me.title || "(none)", do: `Lead the title with "${kw}", then the benefit or area, brand last; about 50–60 characters.` });
    if (me.kwH1 < 1) changes.push({ what: "H1", now: me.h1 || "(none)", do: `Make the H1 say "${kw}" (or a natural version of it).` });
    if (me.kwLead < 0.75) changes.push({ what: "Opening paragraph", now: me.lead.slice(0, 140) || "(none found)", do: `Start with a 1–2 sentence direct answer for "${kw}" that names the service and place.` });
    if (me.kwDesc < 0.75) changes.push({ what: "Meta description", now: me.description || "(none)", do: `Write 120–160 characters around "${kw}": what you do, proof, and a call to action.` });
    const qs = rows.filter((r) => r.kind === "question" && !r.on?.headings).slice(0, 5);
    if (qs.length) changes.push({ what: "Questions to answer", now: `${qs.length} common questions aren't headings on your page`, do: "Add each as an H2/H3 with a 40–60 word direct answer: " + qs.map((q) => `"${q.phrase}"`).join(", ") });
    const buy = rows.filter((r) => r.kind === "buyer" && !r.on?.body).slice(0, 5);
    if (buy.length) changes.push({ what: "Buyer searches not covered", now: buy.map((b) => b.phrase).join(", "), do: "Cover these where true for the business (pricing factors, service area, reviews), in your own words." });
    if (me.words < 300) changes.push({ what: "Depth", now: `${me.words} words`, do: "Add the details customers need to decide; aim for the depth of the pages ranking now." });
  }
  return { keyword: kw, terms: ts, myUrl, me, ideas: rows.slice(0, 80), changes, sources: { autocomplete: lists.flat().length, extra: extra.length } };
}

// ---------------------------------------------------------------- business profile

/** Audit a Google Business Profile read from Maps or the search panel. ok: true / false / null (couldn't see it). */
export function auditBusiness(b, { keyword = "", mySite = "", local = [] } = {}) {
  if (!b) return null;
  const ts = terms(keyword);
  const peers = local.filter((l) => l.name !== b.name);
  const peerReviews = median(peers.map((p) => p.reviews));
  const peerRating = median(peers.map((p) => p.rating));
  const C = (id, label, ok, detail, fix, weight = 1) => ({ id, label, ok, detail, fix, weight });
  const checks = [
    C("claimed", "Profile is claimed by the owner", b.claimed === false ? false : null, b.claimed === false ? "Google shows \"Claim this business\"" : "No claim prompt seen (likely claimed)",
      "Claim and verify the profile at business.google.com. Unclaimed profiles can be edited by anyone and rank worse.", 3),
    C("category", "Primary category matches what you sell", b.category ? (ts.length ? has(b.category, ts) > 0 || null : null) : false,
      b.category ? `Category: ${b.category}` : "No category visible", "Set the primary category to your main service (the closest exact match Google offers); add secondary categories for other services.", 3),
    C("rating", "Rating 4.5 or higher", b.rating == null ? null : b.rating >= 4.5, b.rating == null ? "Rating not visible" : `${b.rating} stars` + (peerRating ? ` (map pack median ${peerRating})` : ""),
      "Ask every happy customer for a review (a short link in texts and invoices), and reply to every review, including bad ones.", 2),
    C("reviews", "Review count competitive", b.reviews == null ? null : peerReviews ? b.reviews >= peerReviews : b.reviews >= 25,
      b.reviews == null ? "Review count not visible" : `${b.reviews} reviews` + (peerReviews ? ` vs map pack median ${peerReviews}` : ""), "Set a steady review habit (a few a week beats a burst). Never buy or gate reviews.", 2),
    C("website", "Website link points to your site", b.website ? (mySite ? sameDomain(b.website, mySite) : true) : false,
      b.website ? `Links to ${hostOf(b.website)}` : "No website link", "Add your website (the most relevant page, usually the homepage or the location page) to the profile.", 2),
    C("phone", "Phone number listed", b.phone ? true : false, b.phone || "No phone visible", "Add a local phone number that matches your website exactly.", 1),
    C("address", "Address or service area shown", b.address ? true : null, b.address || "Not visible (fine for service-area businesses)", "Service-area businesses should hide the address and set service areas instead.", 1),
    C("hours", "Opening hours set", b.hasHours, b.hasHours ? "Hours listed" : "No hours visible", "Add regular and holiday hours; profiles with hours get more actions.", 1),
    C("photos", "Photos (10+)", b.photos ? b.photos >= 10 : null, b.photos ? `${b.photos} visible on this screen` : "Photo count not visible", "Upload real photos of work, team, vehicles and storefront; add new ones monthly.", 1),
    C("description", "Business description mentions your services", b.description ? (ts.length ? has(b.description, ts) >= 0.5 : true) : null,
      b.description ? `"${b.description.slice(0, 90)}${b.description.length > 90 ? "…" : ""}"` : "Description not visible here (open the profile's About tab)",
      "Write a 600–750 character description: what you do, where, and what makes you different. No links, no keyword stuffing.", 1),
    C("updates", "Posts or updates", b.hasUpdates || null, b.hasUpdates ? "Updates visible" : "No recent updates visible", "Post an update, offer or project photo every 1–2 weeks.", 1),
    C("qa", "Questions & answers", b.hasQA || null, b.hasQA ? "Q&A visible" : "No Q&A seen", "Add and answer common customer questions yourself.", 1),
    C("name", "Business name has no keyword stuffing", /[|]|\b(best|cheap|#1|near me)\b/i.test(b.name) || (ts.length > 1 && has(b.name, ts) >= 1 && b.name.split(" ").length > 4) ? false : true,
      b.name, "Use your real business name only. Adding keywords or cities to the name breaks Google's guidelines and risks suspension.", 1),
  ];
  const known = checks.filter((c) => c.ok != null);
  const score = known.length ? Math.round(100 * known.reduce((a, c) => a + (c.ok ? c.weight : 0), 0) / known.reduce((a, c) => a + c.weight, 0)) : null;
  return { name: b.name, score, checks, peers, measured: known.length, total: checks.length };
}
