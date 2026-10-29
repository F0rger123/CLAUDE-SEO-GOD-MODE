/**
 * Whole-site rating: a JavaScript port of the skill's scripts/rate_site.py (rubric v2.0), so the extension gives
 * the same scores as the skill. Same crawl rules (crawling/crawl.py), sitemap check (sitemap/sitemap_check.py),
 * link check (links/link_check.py), answer check (ai_answer/answer_check.py), checks, weights and point gains.
 * tests/e2e.mjs runs both on the same fixture sites and fails if any score or check ratio differs.
 * Changing a check: change rate_site.py and this file together.
 */
import { normalizeUrl, parseJsonld, parsePage, sameSite, schemaTypes } from "./pyparse.js";
import { parseRobots, robotsAllows } from "./site.js";

export const RUBRIC_VERSION = "2.0";
const CRAWL_UA = "AgencyZeroSEO";
export const SEARCH_BOTS = {
  Googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  Bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "OAI-SearchBot": "Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
  PerplexityBot: "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  "Claude-SearchBot": "Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +https://www.anthropic.com)",
};
const POLICY_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended", "CCBot"];
const ENTITY_TYPES = new Set(["Organization", "LocalBusiness", "Corporation", "ProfessionalService", "Store", "Restaurant",
  "MedicalBusiness", "LegalService", "HomeAndConstructionBusiness", "GeneralContractor", "Plumber", "Electrician", "RoofingContractor",
  "HVACBusiness", "AutoRepair", "Dentist", "Person", "NGO", "EducationalOrganization", "SoftwareApplication", "OnlineStore", "OnlineBusiness"]);
const NON_LOCAL = new Set(["Organization", "Corporation", "Person", "NGO", "SoftwareApplication", "OnlineBusiness", "EducationalOrganization"]);
const SKIP_EXT = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg", ".pdf", ".zip", ".mp4", ".mp3", ".css", ".js", ".ico",
  ".woff", ".woff2", ".ttf", ".xml", ".txt", ".doc", ".docx", ".xls", ".xlsx"];
const QUESTION_START = /^(how|what|why|when|where|which|who|can|do|does|is|are|should|will|much)\b/i;
export const GROUPS = { crawl: "Crawl & index", onpage: "On-page", content: "Content", schema: "Structured data", performance: "Performance", aeo: "AEO", geo: "GEO", info: "Info" };
const SEO_CATS = ["crawl", "onpage", "content", "schema", "performance"];
const WEIGHTS = { seo: 0.6, aeo: 0.2, geo: 0.2 };
const MULT = { High: 1.5, Medium: 1.0, Low: 0.6 };

const G = "https://github.com/F0rger123/CLAUDE-SEO-GOD-MODE/blob/main/";
const IDX = G + "workflows/indexing.md", TECH = G + "workflows/technical-seo.md", ONP = G + "workflows/on-page-seo.md",
  SCH = G + "workflows/schema.md", ANS = G + "skills/ai-search-answer-workflow/SKILL.md", GEOW = G + "workflows/aeo-geo.md", LOC = G + "workflows/local-seo.md";

/**
 * What each site check means, for the Issues list, the summary and the fix prompt. `say` is the short phrase the
 * typed summary uses; `setup` marks things you configure once rather than write.
 */
export const SITE_CHECKS = {
  "site-crawlable": { why: "If robots.txt blocks Google or Bing from the homepage, the site can't be crawled or ranked.", goal: "Fix robots.txt so Googlebot and Bingbot can crawl the homepage and key pages.", guide: IDX, say: "unblock Google and Bing in robots.txt", setup: true },
  "site-https": { why: "Browsers mark plain-HTTP sites as not secure and search engines prefer HTTPS.", goal: "Serve every page over HTTPS and 301-redirect http to https.", guide: TECH, say: "switch the site to HTTPS", setup: true },
  "site-host": { why: "If http:// and www/non-www versions all load, search engines see duplicate copies and split your links.", goal: "301-redirect http:// and the other www/non-www host to the one canonical https host (in the CDN or host settings if there is one).", guide: TECH, say: "redirect http and www to one address", setup: true },
  "site-sitemap": { why: "A clean sitemap tells search engines which pages exist and should be indexed.", goal: "Publish an XML sitemap listing only 200, indexable, canonical URLs, and reference it in robots.txt.", guide: IDX, say: "publish a clean XML sitemap", setup: true },
  "site-200": { why: "Links to error pages waste crawling and lose the value of those links.", goal: "Fix or 301-redirect the URLs that return errors and update links pointing at them.", guide: TECH, say: "fix pages that return errors" },
  "site-indexable": { why: "Pages with noindex or a canonical pointing elsewhere can't show up in Google or AI answers.", goal: "Remove unintended noindex tags and make each page's canonical point to itself.", guide: IDX, say: "make key pages indexable" },
  "site-404": { why: "If unknown URLs return 200, junk URLs can get indexed as thin duplicate pages.", goal: "Make unknown URLs return HTTP 404 (or 410) instead of 200.", guide: TECH, say: "return a real 404 for missing pages", setup: true },
  "site-canonical": { why: "A self-referencing canonical tells search engines which URL is the main copy.", goal: "Add a self-referencing <link rel=\"canonical\"> to every indexable page.", guide: TECH, say: "add canonical tags" },
  "site-links": { why: "Internal links to broken or redirected URLs waste crawl budget and slow users down.", goal: "Update internal links so they point straight at the final 200 URL.", guide: TECH, say: "fix broken and redirected internal links" },
  "site-ssr": { why: "Many crawlers and AI bots don't run JavaScript, so JS-only content is invisible to them.", goal: "Server-render or prerender the main content of these pages.", guide: TECH, say: "server-render the content" },
  "site-titles": { why: "The title is the blue link in Google. Too short, too long or duplicated titles lose clicks.", goal: "Give every page a unique, descriptive title of about 50–60 characters: topic first, brand last.", guide: ONP, say: "rewrite page titles" },
  "site-desc": { why: "The meta description is usually the snippet under the link; a good one earns the click.", goal: "Write a unique 120–160 character meta description for each page: benefit, proof, call to action.", guide: ONP, say: "write meta descriptions" },
  "site-h1": { why: "One clear H1 tells people and machines what the page is about.", goal: "Give every page exactly one H1 that says what the page is about.", guide: ONP, say: "give each page one H1" },
  "site-headings": { why: "Headings work as an outline; skipped levels make the structure harder to follow.", goal: "Fix heading order so levels aren't skipped (H2 then H3, not H2 then H4).", guide: ONP, say: "fix heading order" },
  "site-alt": { why: "Alt text describes images to search engines, AI and screen readers.", goal: "Add descriptive alt text to meaningful images and alt=\"\" to decorative ones.", guide: ONP, say: "add image alt text" },
  "site-mobile": { why: "Google indexes the mobile version; the viewport and language tags are basic requirements.", goal: "Add <meta name=\"viewport\"> and <html lang> on every page.", guide: TECH, say: "add viewport and language tags" },
  "site-social": { why: "Social cards control how links look when shared in chat apps and social media.", goal: "Add og:title, og:description, og:image (1200×630) and twitter:card to every page.", guide: ONP, say: "add social share cards" },
  "site-words": { why: "Thin pages rarely rank or get quoted; specifics are what people and AI look for.", goal: "Expand thin pages with real specifics (process, pricing factors, proof, FAQs) or merge them.", guide: ANS, say: "add substance to thin pages" },
  "site-inlinks": { why: "Pages with few internal links look unimportant and get crawled less.", goal: "Link every important page from the navigation or 2–3 related pages with descriptive anchors.", guide: ONP, say: "link to your orphaned pages" },
  "site-ttfb": { why: "Slow HTML slows crawling and every visit.", goal: "Add page caching or a CDN so HTML responds in under a second.", guide: TECH, say: "speed up the server" },
  "site-entity": { why: "Organization or LocalBusiness schema tells Google and AI who you are, where and how to reach you.", goal: "Add Organization or LocalBusiness JSON-LD to the homepage (name, url, logo, phone, address/areaServed, sameAs).", guide: SCH, say: "add business schema", setup: true },
  "site-jsonld": { why: "Broken JSON-LD is ignored entirely.", goal: "Fix the JSON syntax errors in structured data.", guide: SCH, say: "fix broken schema" },
  "site-pageschema": { why: "Page-type schema (breadcrumbs, services, articles) helps search engines understand each page.", goal: "Add BreadcrumbList and page-type schema (Service, Product, Article) that matches visible content.", guide: SCH, say: "add page-level schema" },
  "site-perf": { why: "Slow mobile pages lose visitors and rank lower.", goal: "Improve mobile performance: compress and resize images, defer non-critical JS, preload the hero image, cache static assets. Verify with PageSpeed Insights.", guide: TECH, say: "speed up mobile pages" },
  "site-eligible": { why: "nosnippet, max-snippet:0 or noindex stop a page from being quoted in search or AI answers.", goal: "Remove nosnippet, max-snippet:0 and noindex from pages that should be quoted.", guide: ANS, say: "let search engines quote your pages" },
  "site-questions": { why: "Answer engines match the questions people ask; question headings make answers easy to find.", goal: "Add the real questions customers ask as H2/H3 headings on key pages, each followed by a direct answer.", guide: ANS, say: "add question headings" },
  "site-lead": { why: "A short direct answer at the top is what gets quoted.", goal: "Open each key page with a plain 1–3 sentence (25–90 word) answer to the page's main question, then the detail.", guide: ANS, say: "open pages with a direct answer" },
  "site-faq": { why: "FAQ sections answer follow-up questions; FAQ schema must match what's visible.", goal: "Add an FAQ section with real customer questions; add FAQPage schema only if it matches the visible Q&A.", guide: ANS, say: "add an FAQ" },
  "site-h2": { why: "Sections with H2s make pages scannable and easy to quote in parts.", goal: "Break long pages into sections with H2s, lists and tables.", guide: ANS, say: "break pages into sections" },
  "site-rawhtml": { why: "Answer engines read the raw HTML; JS-only text is often missed.", goal: "Server-render content so answer engines can read it without JavaScript.", guide: ANS, say: "put content in the raw HTML" },
  "site-aibots": { why: "Blocking AI search crawlers keeps you out of ChatGPT search, Perplexity and Claude answers.", goal: "Allow Googlebot, Bingbot, OAI-SearchBot, PerplexityBot and Claude-SearchBot in robots.txt.", guide: GEOW, say: "allow AI search crawlers", setup: true },
  "site-waf": { why: "A CDN or firewall can block AI crawlers even when robots.txt allows them.", goal: "Check the CDN/WAF bot settings (e.g. Cloudflare AI bot blocking) and allow the AI search crawlers that got an error status.", guide: GEOW, say: "stop your firewall blocking AI crawlers", setup: true },
  "site-name": { why: "AI answers name businesses they can identify; your name should be in the homepage text.", goal: "State the business name, what it does and for whom in the first lines of the homepage.", guide: GEOW, say: "say your business name on the homepage" },
  "site-where": { why: "Local and AI search need to know where you operate.", goal: "Declare address or areaServed in schema and say where you operate on the homepage.", guide: LOC, say: "declare your location or service area" },
  "site-sameas": { why: "sameAs links tie your site to your profiles so AI and Google trust the identity.", goal: "List your real profiles (Google Business Profile, LinkedIn, Facebook, industry directories) in sameAs.", guide: G + "workflows/apple-business-connect.md", say: "link your profiles with sameAs", setup: true },
  "site-trust": { why: "About and Contact pages are basic trust signals for people, Google and AI.", goal: "Publish an About page (who, credentials, history) and a Contact page (how to reach you).", guide: LOC, say: "publish About and Contact pages" },
  "site-contact": { why: "A clickable phone or email makes you easy to reach and confirms who you are.", goal: "Show a clickable phone number or email on the homepage and in schema.", guide: LOC, say: "show a clickable phone or email" },
  "site-cites": { why: "Claims backed by sources are more likely to be trusted and cited.", goal: "Back claims and statistics with links to their sources; never publish unsourced numbers.", guide: GEOW, say: "cite your sources" },
  "site-bing": { why: "ChatGPT search and Copilot use Bing's index.", goal: "Allow Bingbot and register the site in Bing Webmaster Tools.", guide: G + "workflows/bing-webmaster.md", say: "open the site to Bing", setup: true },
  "site-llms": { why: "llms.txt is an optional map for AI agents. Google Search does not use it.", goal: "Optionally publish /llms.txt listing key pages.", guide: GEOW, say: "add llms.txt" },
};

// ------------------------------------------------------------------------------------------------ helpers
const pyRound = (x, nd = 0) => { const m = 10 ** nd, v = x * m, f = Math.floor(v); return (v - f === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(v)) / m; };
const share = (items, pred) => (items.length ? items.filter(pred).length / items.length : null);
const pathOf = (url) => { try { return new URL(url).pathname || "/"; } catch { return "/"; } };
const failing = (items, pred, key = "url") => items.filter((p) => !pred(p)).map((p) => pathOf(p[key]));
const eg = (paths, n = 3) => (paths.length ? `; e.g. ${paths.slice(0, n).join(", ")}` + (paths.length > n ? ` (+${paths.length - n} more)` : "") : "");
const clen = (s) => [...(s || "")].length;  // Python len(): code points
const ws = (s) => String(s ?? "").split(/\s+/).filter(Boolean).join(" ");
const skippedLevels = (levels) => { const seq = [1, ...levels]; return seq.slice(1).map((b, i) => [seq[i], b, i]).filter(([a, b]) => b - a > 1).map(([a, b, i]) => `${i === 0 ? "start" : "H" + a}→H${b}`); };
const pLimit = async (items, n, fn) => { const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } })); return out; };

/** common.fetch: follows redirects and records whether there was a hop. */
async function pyFetch(url, { timeout = 20000, headers: send } = {}) {
  const t0 = performance.now();
  try {
    const r = await fetch(url, { cache: "no-store", credentials: "omit", redirect: "follow", signal: AbortSignal.timeout(timeout), ...(send ? { headers: send } : {}) });
    const body = await r.text();
    const headers = {}; r.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    return { url, final_url: r.url || url, status: r.status, chain: r.redirected ? [[url, 301], [r.url, r.status]] : [[url, r.status]],
      headers, body, elapsed_ms: Math.round(performance.now() - t0), error: null };
  } catch (e) {
    return { url, final_url: url, status: null, chain: [], headers: {}, body: "", elapsed_ms: Math.round(performance.now() - t0), error: String(e.message || e) };
  }
}

function robotsFrom(r) {
  if (r.status && r.status >= 400 && r.status < 500) return [];
  if (r.status !== 200) return [[["*"], [[false, "/"]]]];
  return parseRobots(r.body);
}
const canFetch = (groups, agent, url) => robotsAllows(groups, agent.split("/")[0], url);

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  return doc.getElementsByTagName("parsererror").length ? null : doc;
}

async function sitemapUrls(url, fetcher, limit = 5000) {
  const out = [], queue = [url];
  while (queue.length && out.length < limit) {
    const r = await fetcher(queue.shift());
    if (r.status !== 200) continue;
    const doc = parseXml(r.body);
    if (!doc) continue;
    const locs = Array.from(doc.getElementsByTagName("*")).filter((e) => e.localName.endsWith("loc") && e.textContent).map((e) => e.textContent.trim());
    (doc.documentElement.localName.endsWith("sitemapindex") ? queue : out).push(...locs);
  }
  return out.slice(0, limit);
}

async function loadSitemap(url, problems, fetcher, depth = 0) {
  const r = await fetcher(url);
  if (r.status !== 200) { problems.push(`Sitemap ${url} returned ${r.status || r.error}`); return []; }
  if (r.chain.length > 1) problems.push(`Sitemap ${url} redirects to ${r.final_url}`);
  const doc = parseXml(r.body);
  if (!doc) { problems.push(`Sitemap ${url} is not valid XML`); return []; }
  const root = doc.documentElement, entries = [];
  if (root.localName.endsWith("sitemapindex")) {
    if (depth > 2) { problems.push(`Sitemap index nesting too deep at ${url}`); return []; }
    for (const sm of root.children) {
      const loc = Array.from(sm.children).find((c) => c.localName.endsWith("loc") && c.textContent)?.textContent.trim();
      if (loc) entries.push(...(await loadSitemap(loc, problems, fetcher, depth + 1)));
    }
    return entries;
  }
  for (const u of root.children) {
    const d = {}; for (const c of u.children) d[c.localName] = (c.textContent || "").trim();
    if (d.loc) entries.push({ loc: d.loc, lastmod: d.lastmod || "" });
  }
  if (entries.length > 50000) problems.push(`${url} has ${entries.length} URLs (limit 50,000 per file)`);
  return entries;
}

/** crawl.py analyse() */
function analyse(resp, root, rp) {
  const url = resp.url, ctype = resp.headers["content-type"] || "";
  const page = { url, final_url: resp.final_url, status: resp.status, redirect_chain: resp.chain.length > 1 ? resp.chain : [],
    elapsed_ms: resp.elapsed_ms, x_robots_tag: resp.headers["x-robots-tag"] || "", blocked_by_robots: !canFetch(rp, "Googlebot", url) };
  const linksOut = [];
  if (resp.status === 200 && ctype.includes("html")) {
    const p = parsePage(resp.body);
    const { items, errors } = parseJsonld(p.jsonld);
    const internal = [], external = [];
    for (const link of p.links) {
      const href = link.href;
      if (/^(mailto:|tel:|javascript:|#|data:)/.test(href)) continue;
      const absu = normalizeUrl(href, resp.final_url);
      if (!absu.startsWith("http")) continue;
      if (sameSite(absu, root)) { internal.push({ url: absu }); linksOut.push(absu); } else external.push({ url: absu });
    }
    const canonical = p.canonical ? normalizeUrl(p.canonical, resp.final_url) : null;
    const noindex = (p.robotsMeta + page.x_robots_tag).toLowerCase().includes("noindex");
    const words = p.text ? p.text.split(" ").length : 0;
    Object.assign(page, {
      title: p.title, meta_description: p.meta.description || "", canonical, lang: p.lang,
      h1: p.headings.filter((h) => h[0] === 1).map((h) => h[1]), heading_levels: p.headings.map((h) => h[0]), word_count: words,
      internal_links: internal, external_links: external,
      images: p.images.map((i) => ({ ...i, src: i.src ? normalizeUrl(i.src, resp.final_url) : "" })),
      jsonld_types: [...new Set(items.flatMap((i) => schemaTypes(i)).filter(Boolean))].sort(), jsonld_errors: errors,
      og: p.og, viewport: p.viewport,
      indexable: !noindex && !page.blocked_by_robots && !page.redirect_chain.length && (canonical == null || canonical === normalizeUrl(resp.final_url)),
      js_shell_suspect: words < 80 && p.scriptCount >= 3,
      _parsed: p, _body: resp.body, _headers: resp.headers,
    });
  } else page.indexable = false;
  return [page, linksOut];
}

/** answer_check.py check_page(), reusing the crawl's fetch of the same URL. */
function checkPage(url, r) {
  const row = { url, status: r.status }, fs = [];
  if (r.status !== 200) return [row, fs];
  const meta = r._parsed || parsePage(r.body);
  const robots = (meta.robotsMeta + "," + (r.headers["x-robots-tag"] || "")).toLowerCase();
  const F = (area, text) => fs.push({ tag: "OBSERVED", area, finding: text, url });
  if (robots.includes("noindex")) F("eligibility", "noindex present");
  if (robots.includes("nosnippet") || /max-snippet\s*:\s*0\b/.test(robots)) F("eligibility", "nosnippet / max-snippet:0");
  if (meta.nosnippet) F("eligibility", `${meta.nosnippet} data-nosnippet element(s)`);
  if (meta.canonical && normalizeUrl(meta.canonical, url) !== normalizeUrl(r.final_url)) F("eligibility", `canonical points elsewhere (${meta.canonical})`);
  const lead = meta.blocks.find(([k, t]) => k === "p" && t.split(" ").length >= 8)?.[1] || "";
  row.lead_words = lead ? lead.split(" ").length : 0;
  row.question_headings = meta.blocks.filter(([k, t]) => ["h2", "h3", "h4", "summary", "dt"].includes(k) && (t.endsWith("?") || QUESTION_START.test(t))).length;
  const stats = meta.text.match(/\b\d[\d,.]*\s?(%|percent|years?|homes?|projects?|customers?)/gi) || [];
  row.stat_mentions = stats.length;
  row.external_links = meta.links.filter((l) => l.href.startsWith("http") && !sameSite(l.href, url)).length;
  const { items } = parseJsonld(meta.jsonld);
  const visible = meta.text.toLowerCase();
  for (const it of items) {
    if (!schemaTypes(it).includes("FAQPage") || !Array.isArray(it.mainEntity)) continue;
    for (const q of it.mainEntity) {
      const qn = ws(String(q?.name ?? "")).toLowerCase();
      if (qn && !visible.includes(qn)) fs.push({ tag: "OBSERVED", area: "schema", finding: `FAQPage question not in visible text: '${qn.slice(0, 70)}'`, url });
    }
  }
  return [row, fs];
}

/** rate_site.py perf_proxy() */
function perfProxy(homeHtml, pages) {
  const head = (homeHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i) || [null, ""])[1];
  const blocking = (head.match(/<script\b[^>]*\bsrc=[^>]*>/gi) || []).filter((s) => !/\b(async|defer)\b|type=["']module/i.test(s));
  const css = head.match(/<link\b[^>]*rel=["']?stylesheet[^>]*>/gi) || [];
  const kb = new TextEncoder().encode(homeHtml).length / 1024;
  const imgs = pages.flatMap((p) => p.images || []).filter((i) => i.src);
  const sized = share(imgs, (i) => i.width && i.height);
  const modern = share(imgs, (i) => /\.(webp|avif|svg)(\?|$)/i.test(i.src) || i.src.includes("/_next/image"));
  const parts = [blocking.length <= 2 ? 1 : Math.max(0, 1 - (blocking.length - 2) / 8), css.length <= 4 ? 1 : Math.max(0, 1 - (css.length - 4) / 8),
    kb <= 150 ? 1 : Math.max(0, 1 - (kb - 150) / 450), sized == null ? 1 : sized, modern == null ? 1 : modern];
  const pct = (v) => (v == null ? "n/a" : Math.round(v * 100) + "%");
  return [parts.reduce((a, b) => a + b, 0) / parts.length,
    [`${blocking.length} blocking script(s)`, `${css.length} stylesheet(s)`, `${Math.round(kb)} KB HTML`, `${pct(sized)} sized images`, `${pct(modern)} modern formats`]];
}

async function psiScore(site, key) {
  try {
    const q = new URLSearchParams({ url: site, strategy: "mobile", category: "performance" });
    if (key) q.set("key", key);
    const r = await fetch("https://www.googleapis.com/pagespeedonline/v5/runPagespeed?" + q, { signal: AbortSignal.timeout(70000) });
    const d = await r.json();
    if (d.error) return [null, d.error.code === 429 ? "quota exhausted (add a free PageSpeed API key)" : String(d.error.message || "error").slice(0, 100)];
    const s = d.lighthouseResult?.categories?.performance?.score;
    return s == null ? [null, "no score returned"] : [Math.round(s * 100), ""];
  } catch (e) { return [null, "unavailable (" + String(e.message || e).slice(0, 60) + ")"]; }
}

/**
 * Homepage status as seen with a crawler's user-agent. In the extension it uses a session rule because fetch() can't
 * set User-Agent; the Android app's native requests can set it directly (sgmCanSetUA).
 */
async function probeUA(url, ua, id) {
  if (globalThis.sgmCanSetUA) return (await pyFetch(url, { timeout: 15000, headers: { "user-agent": ua } })).status;
  const dnr = globalThis.chrome?.declarativeNetRequest;
  if (!dnr?.updateSessionRules) return null;
  await dnr.updateSessionRules({ removeRuleIds: [id], addRules: [{ id, priority: 1,
    action: { type: "modifyHeaders", requestHeaders: [{ header: "user-agent", operation: "set", value: ua }] },
    condition: { urlFilter: "|" + url + "|", resourceTypes: ["xmlhttprequest"] } }] });
  try { return (await pyFetch(url, { timeout: 15000 })).status; } finally { await dnr.updateSessionRules({ removeRuleIds: [id] }); }
}

/** Host permission patterns the site rating needs (the site, its http and www variants). */
export function siteOrigins(url) {
  const h = new URL(url).hostname;
  const hosts = /^[\d.]+$|^\[|^localhost$/.test(h) ? [h] : [h, h.startsWith("www.") ? h.slice(4) : "www." + h];
  // Explicit schemes: a "*://" pattern isn't covered by the manifest's separate http and https optional permissions.
  return hosts.flatMap((x) => [`https://${x}/*`, `http://${x}/*`]);
}
const isLocal = (url) => /^(localhost|127\.|10\.|192\.168\.|\[::1\])|\.(local|localhost|test)$/.test(new URL(url).hostname);

// ------------------------------------------------------------------------------------------------ main
/**
 * Rate a site exactly like `python scripts/rate_site.py <site>`.
 * opts: maxPages (30), psi (true: ask PageSpeed Insights, else the INFERRED proxy), psiKey (optional API key), onProgress(text).
 */
export async function rateSite(siteUrl, { maxPages = 30, psi = true, psiKey = "", onProgress = () => {} } = {}) {
  const cache = new Map();
  const get = (u, o) => { if (!cache.has(u)) cache.set(u, pyFetch(u, o)); return cache.get(u); };
  let site = normalizeUrl(siteUrl);
  onProgress("Loading the homepage…");
  const home = await pyFetch(site);
  if (home.status == null) throw new Error(`Can't reach ${site}: ${home.error}`);
  { const f = new URL(home.final_url); site = normalizeUrl(f.origin + "/"); }
  const host = new URL(site).host;
  // PageSpeed Insights can't reach local or private addresses, so those use the estimate.
  const psiPromise = psi && !isLocal(site) ? psiScore(site, psiKey) : Promise.resolve([null, psi ? "skipped (local address)" : "skipped"]);

  onProgress("Reading robots.txt and the sitemap…");
  const robotsResp = await get(normalizeUrl("/robots.txt", site));
  const rp = robotsFrom(robotsResp);
  const declared = robotsResp.status === 200 ? robotsResp.body.split(/\r?\n/).filter((l) => l.toLowerCase().startsWith("sitemap:")).map((l) => l.split(/:(.*)/s)[1].trim()) : [];
  const sitemap = declared[0] || normalizeUrl("/sitemap.xml", site);
  const smOk = (await get(sitemap)).status === 200;

  // ---- crawl.py
  const root = site, queue = [root], seen = new Set([root]), pages = [], inlinks = new Map();
  if (smOk) for (let u of await sitemapUrls(sitemap, get)) { u = normalizeUrl(u); if (!seen.has(u) && sameSite(u, root)) { seen.add(u); queue.push(u); } }
  while (queue.length && pages.length < maxPages) {
    const batch = queue.splice(0, Math.min(4, maxPages - pages.length));
    onProgress(`Crawling page ${pages.length + 1} of up to ${maxPages}…`);
    const done = await Promise.all(batch.map(async (url) => (canFetch(rp, CRAWL_UA, url) ? analyse(await get(url), root, rp) : null)));
    batch.forEach((url, k) => {
      if (!done[k]) { pages.push({ url, status: null, blocked_by_robots: true, indexable: false }); return; }
      const [page, links] = done[k];
      pages.push(page);
      const final = page.final_url;
      if (final && final !== url && !seen.has(final) && sameSite(final, root)) { seen.add(final); queue.push(final); }
      for (const link of links) {
        if (link === url || link === final) continue;
        if (!inlinks.has(link)) inlinks.set(link, new Set());
        inlinks.get(link).add(url);
        const path = new URL(link).pathname.toLowerCase();
        if (seen.has(link) || SKIP_EXT.some((e) => path.endsWith(e)) || link.includes("?")) continue;
        seen.add(link); queue.push(link);
      }
    });
  }
  for (const p of pages) p.inlinks = new Set([...(inlinks.get(p.url) || []), ...(inlinks.get(p.final_url) || [])]).size;
  const hitLimit = queue.length > 0;

  // ---- sitemap_check.py (first 60 URLs)
  onProgress("Checking sitemap URLs…");
  const problems = [], entries = await loadSitemap(sitemap, problems, get);
  if (entries.some((e) => !sameSite(e.loc, sitemap))) problems.push("URL(s) on a different host than the sitemap");
  if (entries.length !== new Set(entries.map((e) => e.loc)).size) problems.push("duplicate URL(s) in sitemap");
  const urlIssues = (await pLimit(entries.slice(0, 60), 4, async (e) => {
    const r = await get(e.loc);
    if (r.status == null) return { url: e.loc, issue: "error" };
    if (r.chain.length > 1) return { url: e.loc, issue: "redirects" };
    if (r.status !== 200) return { url: e.loc, issue: `status ${r.status}` };
    const p = parsePage(r.body);
    if ((p.robotsMeta + (r.headers["x-robots-tag"] || "")).toLowerCase().includes("noindex")) return { url: e.loc, issue: "noindex" };
    if (p.canonical && normalizeUrl(p.canonical, e.loc) !== normalizeUrl(e.loc)) return { url: e.loc, issue: "canonical elsewhere" };
    return null;
  })).filter(Boolean);

  // ---- link_check.py
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const broken = new Set(), redirected = new Set();
  for (const p of pages) for (const l of p.internal_links || []) {
    const t = byUrl.get(l.url);
    if (!t) continue;
    if (t.status && t.status >= 400) broken.add(l.url); else if (t.redirect_chain?.length) redirected.add(l.url);
  }

  // ---- answer_check.py
  onProgress("Checking answers and AI crawler access…");
  let urls = [...new Set(pages.filter((p) => p.indexable).map((p) => p.url))].slice(0, maxPages);
  if (!urls.length) urls = [site];
  const access = {};
  for (const bot of [...Object.keys(SEARCH_BOTS), ...POLICY_BOTS]) access[bot] = [site, ...urls.slice(0, 5)].every((u) => canFetch(rp, bot, u));
  const rows = [], findings = [];
  for (const u of urls) {
    const crawled = byUrl.get(u);
    const r = crawled?._body != null ? { status: crawled.status, final_url: crawled.final_url, headers: crawled._headers, body: crawled._body, _parsed: crawled._parsed } : await get(u);
    const [row, fs] = checkPage(u, r);
    rows.push(row); findings.push(...fs);
  }

  // ================================================================ scoring (rate_site.py main)
  const ok = pages.filter((p) => p.status === 200 && "title" in p && !p.redirect_chain?.length);
  const idx = ok.filter((p) => p.indexable);
  const reached = pages.filter((p) => p.status != null);
  const homeMeta = parsePage(home.body);
  const { items } = parseJsonld(homeMeta.jsonld);
  const allTypes = new Set(ok.flatMap((p) => p.jsonld_types || []));
  const entity = items.find((i) => schemaTypes(i).some((t) => ENTITY_TYPES.has(t))) || null;
  const localBiz = !!entity && schemaTypes(entity).some((t) => !NON_LOCAL.has(t));
  const checks = [], kits = [];
  const add = (id, cat, name, ratio, weight, detail, tip = "", tag = "OBSERVED", impact = null, pagesList = []) => {
    ratio = ratio == null ? null : Math.max(0, Math.min(1, ratio));
    checks.push({ id, category: cat, cat: cat === "aeo" ? "aeo" : cat === "geo" || cat === "info" ? "geo" : "seo", group: GROUPS[cat], name, ratio, weight,
      points: ratio == null ? null : pyRound(ratio * weight, 2), tag: ratio == null ? "UNKNOWN" : tag, detail: ws(detail), tip, impact, pages: pagesList || [] });
  };
  const kit = (check, title, lang, body) => kits.push({ check, title, lang, body });

  // ---- crawl & index
  add("site-crawlable", "crawl", "Homepage crawlable by Googlebot and Bingbot", canFetch(rp, "Googlebot", site) && canFetch(rp, "Bingbot", site) ? 1 : 0, 6,
    `robots.txt HTTP ${robotsResp.status}`, "Remove robots.txt rules that block Googlebot/Bingbot from the homepage.", "OBSERVED", "High");
  add("site-https", "crawl", "HTTPS", site.startsWith("https://") ? 1 : 0, 3, site, "Serve the whole site over HTTPS and 301 http to https.", "OBSERVED", "High");
  const hostname = new URL(site).host;
  const variants = new Set(["http://" + hostname + "/", (hostname.startsWith("www.") ? "https://" + hostname.slice(4) : "https://www." + hostname) + "/"]);
  variants.delete(site);
  const consolidated = [];
  for (const v of variants) {
    const r = await pyFetch(v, { timeout: 15000 });
    if (r.status != null) consolidated.push([v, normalizeUrl(r.final_url) === site && r.chain.length > 1]);
  }
  add("site-host", "crawl", "One canonical host (http and www variants redirect)", consolidated.length ? share(consolidated, (x) => x[1]) : 1, 3,
    consolidated.map(([v, k]) => `${v} → ${k ? "redirects" : "does not redirect to " + site}`).join("; ") || "variants don't resolve",
    "301-redirect http:// and the other www/non-www variant to one canonical https host.", "OBSERVED", "High");
  add("site-sitemap", "crawl", "XML sitemap reachable and clean", (smOk ? 0.5 : 0) + (smOk && !urlIssues.length && !problems.length ? 0.5 : 0), 5,
    `${pathOf(sitemap)}: ${smOk ? "200" : "missing"}; ${urlIssues.length} non-indexable URL(s) listed`,
    "Publish an XML sitemap with only 200, indexable, canonical URLs and list it in robots.txt.", "OBSERVED", "High", urlIssues.map((u) => pathOf(u.url)));
  if (!smOk) kit("site-sitemap", "Sitemap to publish (URLs this scan found)", "xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${idx.map((p) => `  <url><loc>${p.url}</loc></url>`).join("\n")}\n</urlset>\n\nAdd to robots.txt:\nSitemap: ${normalizeUrl("/sitemap.xml", site)}`);
  const bad200 = failing(reached, (p) => p.status === 200);
  add("site-200", "crawl", "Pages return 200", share(reached, (p) => p.status === 200), 5, `${reached.length - bad200.length}/${reached.length} crawled URLs returned 200${eg(bad200)}`,
    "Fix or 301-redirect URLs that return 4xx/5xx, and update links pointing to them.", "OBSERVED", "High", bad200);
  const notidx = failing(ok, (p) => p.indexable);
  add("site-indexable", "crawl", "Pages are indexable", share(ok, (p) => p.indexable), 6, `${idx.length}/${ok.length} HTML pages indexable${eg(notidx)}`,
    "Remove unintended noindex tags and make canonicals self-referencing.", "OBSERVED", "High", notidx);
  const bogus = await pyFetch(normalizeUrl(`/zz-${Math.random().toString(16).slice(2, 12)}-not-a-page`, site), { timeout: 15000 });
  add("site-404", "crawl", "Missing pages return a real 404", [404, 410].includes(bogus.status) ? 1 : 0, 3, `random URL returned HTTP ${bogus.status}` + (bogus.status === 200 ? " (soft 404)" : ""),
    "Make unknown URLs return HTTP 404/410 instead of 200, so junk URLs don't get indexed.", "OBSERVED", "Medium");
  const nocanon = failing(ok, (p) => p.canonical);
  add("site-canonical", "crawl", "Canonical tag on every page", share(ok, (p) => p.canonical), 2, `${ok.length - nocanon.length}/${ok.length} pages${eg(nocanon)}`,
    "Add a self-referencing <link rel=canonical> to every indexable page.", "OBSERVED", "Low", nocanon);
  const nBroken = broken.size + redirected.size;
  add("site-links", "crawl", "No broken or redirected internal links", nBroken === 0 ? 1 : Math.max(0, 1 - nBroken / 10), 3, `${broken.size} broken, ${redirected.size} pointing at redirects`,
    "Update internal links to point straight at final 200 URLs.", "OBSERVED", "Medium", [...broken, ...redirected].map(pathOf));
  const js = failing(ok, (p) => !p.js_shell_suspect);
  add("site-ssr", "crawl", "Server-rendered content (not JS-only)", share(ok, (p) => !p.js_shell_suspect), 2, `${js.length} page(s) look JS-rendered${eg(js)}`,
    "Server-render or prerender main content; many crawlers and AI bots don't run JavaScript.", "OBSERVED", "High", js);

  // ---- on-page
  const titleOk = (p) => clen(p.title) >= 25 && clen(p.title) <= 60;
  const titles = ok.filter((p) => p.title).map((p) => p.title.toLowerCase());
  const dupTitles = new Set(titles.filter((t) => titles.indexOf(t) !== titles.lastIndexOf(t)));
  const uniq = new Set(titles).size / Math.max(1, ok.length);
  let bad = failing(ok, titleOk);
  add("site-titles", "onpage", "Titles 25–60 chars and unique", (share(ok, titleOk) || 0) * uniq, 7, `${ok.length - bad.length}/${ok.length} in range; ${dupTitles.size} duplicated${eg(bad)}`,
    "Give every page a unique, descriptive title of ~50–60 characters: topic first, brand last.", "OBSERVED", "High", bad);
  if (bad.length) kit("site-titles", "Titles to rewrite (path, length, current title)", "text", ok.filter((p) => !titleOk(p)).map((p) => `${pathOf(p.url)}  [${clen(p.title)} chars]  ${p.title || "(missing)"}`).join("\n").slice(0, 3000));
  const descOk = (p) => clen(p.meta_description) >= 70 && clen(p.meta_description) <= 170;
  bad = failing(ok, descOk);
  add("site-desc", "onpage", "Meta descriptions 70–170 chars", share(ok, descOk), 4, `${ok.length - bad.length}/${ok.length} in range${eg(bad)}`,
    "Write a unique 120–160 character description per page: benefit, proof, call to action.", "OBSERVED", "Medium", bad);
  if (bad.length) kit("site-desc", "Meta descriptions to rewrite (path, length, current)", "text", ok.filter((p) => !descOk(p)).map((p) => `${pathOf(p.url)}  [${clen(p.meta_description)} chars]  ${p.meta_description || "(missing)"}`).join("\n").slice(0, 3000));
  bad = failing(ok, (p) => p.h1.length === 1);
  add("site-h1", "onpage", "Exactly one H1", share(ok, (p) => p.h1.length === 1), 4, `${ok.length - bad.length}/${ok.length} pages${eg(bad)}`,
    "Use one clear H1 per page that says what the page is about.", "OBSERVED", "Medium", bad);
  const skips = ok.map((p) => [pathOf(p.url), skippedLevels(p.heading_levels)]);
  bad = skips.filter(([, s]) => s.length).map(([u]) => u);
  add("site-headings", "onpage", "Logical heading order", share(skips, (x) => !x[1].length), 2,
    bad.length ? ("skips: " + skips.filter(([, s]) => s.length).map(([u, s]) => `${u} (${[...new Set(s)].sort().join(", ")})`).join("; ")).slice(0, 300) : "no skipped levels",
    "Don't skip heading levels (H2 then H4); use headings as an outline.", "OBSERVED", "Low", bad);
  const imgs = ok.flatMap((p) => p.images).filter((i) => i.src);
  const withAlt = imgs.filter((i) => i.alt != null).length;
  add("site-alt", "onpage", "Images have alt text", imgs.length ? withAlt / imgs.length : 1, 3, `${withAlt}/${imgs.length} images`,
    "Add descriptive alt text to meaningful images (alt=\"\" for decorative ones).", "OBSERVED", "Medium");
  const vp = (p) => !!p.viewport && !!p.lang;
  bad = failing(ok, vp);
  add("site-mobile", "onpage", "Mobile viewport + html lang", share(ok, vp), 3, `${ok.length - bad.length}/${ok.length} pages${eg(bad)}`,
    "Add <meta name=viewport> and <html lang> on every page.", "OBSERVED", "High", bad);
  const social = (p) => ["og:title", "og:description", "og:image"].every((k) => p.og[k]);
  bad = failing(ok, social);
  add("site-social", "onpage", "Social cards (og:title, og:description, og:image)", share(ok, social), 2, `${ok.length - bad.length}/${ok.length} complete${eg(bad)}`,
    "Add og:title, og:description, og:image (1200×630) and twitter:card to every page.", "OBSERVED", "Low", bad);
  if (bad.length) { const p0 = ok.find((p) => !social(p)); const e = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    kit("site-social", `Social card tags (example for ${pathOf(p0.url)})`, "html", `<meta property="og:title" content="${e(p0.title)}">\n<meta property="og:description" content="${e(p0.meta_description || "[CONFIRM: 120-160 char summary]")}">\n<meta property="og:image" content="${normalizeUrl("/og-image.png", site)}">  <!-- [CONFIRM] 1200x630 image -->\n<meta property="og:url" content="${p0.url}">\n<meta name="twitter:card" content="summary_large_image">`); }

  // ---- content
  bad = failing(idx, (p) => p.word_count >= 250);
  add("site-words", "content", "Pages have substantial text (250+ words)", share(idx, (p) => p.word_count >= 250), 8, `${idx.length - bad.length}/${idx.length} indexable pages${eg(bad)}`,
    "Expand thin pages with specifics customers need (process, pricing factors, proof, FAQs) or merge them.", "INFERRED", "Medium", bad);
  const others = idx.filter((p) => p.url !== site);
  bad = failing(others, (p) => p.inlinks >= 2);
  add("site-inlinks", "content", "Pages are internally linked (2+ inlinks)", others.length ? share(others, (p) => p.inlinks >= 2) : 1, 4, `${others.length - bad.length}/${others.length} pages${eg(bad)}`,
    "Link every important page from the nav or 2–3 related pages with descriptive anchors.", "OBSERVED", "Medium", bad);
  const times = ok.map((p) => p.elapsed_ms).sort((a, b) => a - b);
  bad = failing(ok, (p) => p.elapsed_ms < 1000);
  add("site-ttfb", "content", "Server responds fast (HTML < 1 s)", share(ok, (p) => p.elapsed_ms < 1000), 3, `median ${times.length ? times[Math.floor(times.length / 2)] : "?"} ms${eg(bad)}`,
    "Add page caching/CDN; slow HTML hurts crawling and users.", "OBSERVED", "Medium", bad);

  // ---- structured data
  const homeTypes = [...new Set(items.flatMap((i) => schemaTypes(i)))].sort();
  add("site-entity", "schema", "Organization/LocalBusiness schema on homepage", entity ? 1 : 0, 5, `homepage types: ${homeTypes.join(", ") || "none"}`,
    "Add Organization or LocalBusiness JSON-LD (name, url, logo, phone, address/areaServed, sameAs).", "OBSERVED", "High");
  if (!entity) { const name = homeMeta.og["og:site_name"] || homeMeta.title.split("|").pop().split("–").pop().trim();
    kit("site-entity", "Starter Organization JSON-LD (fill every [CONFIRM])", "html", '<script type="application/ld+json">\n' + JSON.stringify({ "@context": "https://schema.org", "@type": "Organization",
      "@id": site + "#organization", name: name || "[CONFIRM: business name]", url: site, logo: "[CONFIRM: logo URL]", telephone: "[CONFIRM]",
      sameAs: ["[CONFIRM: Google Business Profile URL]", "[CONFIRM: LinkedIn/Facebook URL]"] }, null, 2) + "\n</script>"); }
  bad = failing(ok, (p) => !p.jsonld_errors.length);
  add("site-jsonld", "schema", "JSON-LD is valid", share(ok, (p) => !p.jsonld_errors.length), 3, `${bad.length} page(s) with invalid JSON-LD${eg(bad)}`,
    "Fix JSON syntax errors in structured data.", "OBSERVED", "Medium", bad);
  add("site-pageschema", "schema", "Page-level schema (Breadcrumb, Service, Article…)", ["BreadcrumbList", "Service", "Product", "Article", "BlogPosting", "FAQPage", "WebPage"].some((t) => allTypes.has(t)) ? 1 : 0, 2,
    `site-wide types: ${[...allTypes].sort().join(", ") || "none"}`, "Add BreadcrumbList and page-type schema (Service, Product, Article) that matches visible content.", "OBSERVED", "Low");

  // ---- performance
  onProgress(psi ? "Waiting for PageSpeed Insights…" : "Scoring…");
  const [perf, psiNote] = await psiPromise;
  if (perf != null) add("site-perf", "performance", "Mobile performance (PageSpeed Insights)", perf / 100, 10, `PSI mobile ${perf}/100`,
    "Compress/resize images, defer non-critical JS, preload the hero image, cache static assets.", "OBSERVED", "High");
  else { const [ratio, notes] = perfProxy(home.body, ok);
    add("site-perf", "performance", "Performance (estimated; PageSpeed unavailable)", ratio, 10, `PageSpeed ${psiNote}. Proxy: ${notes.join(", ")}`,
      "Defer non-critical scripts, size and compress images (WebP/AVIF), keep HTML light. Verify with PageSpeed Insights.", "INFERRED", "High"); }

  // ---- AEO
  const blockers = findings.filter((f) => f.area === "eligibility" && f.tag === "OBSERVED");
  add("site-eligible", "aeo", "Pages eligible for snippets (no nosnippet/noindex)", Math.max(0, (share(rows, (r) => r.status === 200) || 0) - blockers.length / Math.max(1, rows.length)), 25,
    `${blockers.length} snippet/index blocker(s)`, "Remove nosnippet / max-snippet:0 / noindex from pages you want quoted.", "OBSERVED", "High", blockers.map((f) => pathOf(f.url)));
  bad = failing(rows, (r) => (r.question_headings || 0) >= 1);
  add("site-questions", "aeo", "Question-style headings (what/how/why/cost…)", share(rows, (r) => (r.question_headings || 0) >= 1), 20, `${rows.length - bad.length}/${rows.length} pages${eg(bad)}`,
    "Add the real questions customers ask as H2/H3 headings on key pages.", "INFERRED", "Medium", bad);
  const leadOk = (r) => (r.lead_words || 0) >= 25 && (r.lead_words || 0) <= 90;
  bad = failing(rows, leadOk);
  add("site-lead", "aeo", "Direct answer near the top (25–90 word opener)", share(rows, leadOk), 20, `${rows.length - bad.length}/${rows.length} pages${eg(bad)}`,
    "Open key pages with a plain 1–3 sentence answer to the page's main question, then the detail.", "INFERRED", "Medium", bad);
  const faqBad = findings.filter((f) => f.finding.includes("FAQPage question not in visible text"));
  const hasFaq = allTypes.has("FAQPage");
  add("site-faq", "aeo", "FAQ content (and FAQ schema matches visible text)", hasFaq && !faqBad.length ? 1 : hasFaq ? 0.5 : rows.some((r) => (r.question_headings || 0) >= 3) ? 0.6 : 0, 15,
    `FAQPage schema: ${hasFaq ? "yes" : "no"}; mismatches: ${faqBad.length}`, "Add an FAQ section with real customer questions; FAQ schema only if it matches the visible Q&A.", "OBSERVED", "Low");
  const twoH2 = (p) => p.heading_levels.filter((l) => l === 2).length >= 2;
  bad = failing(ok, twoH2);
  add("site-h2", "aeo", "Scannable structure (2+ H2 sections)", share(ok, twoH2), 10, `${ok.length - bad.length}/${ok.length} pages${eg(bad)}`,
    "Break long pages into sections with H2s, lists, and tables.", "INFERRED", "Low", bad);
  add("site-rawhtml", "aeo", "Content in raw HTML (no JS-only rendering)", share(ok, (p) => !p.js_shell_suspect), 10, "raw HTML text present",
    "Server-render content so answer engines can read it without JavaScript.", "OBSERVED", "High", js);

  // ---- GEO
  const botNames = Object.keys(SEARCH_BOTS);
  const allowed = botNames.filter((b) => access[b]), blocked = botNames.filter((b) => !access[b]);
  add("site-aibots", "geo", "AI search crawlers allowed in robots.txt", allowed.length / botNames.length, 20, `allowed: ${allowed.join(", ") || "none"}; blocked: ${blocked.join(", ") || "none"}`,
    "Allow Googlebot, Bingbot, OAI-SearchBot, PerplexityBot, and Claude-SearchBot in robots.txt.", "OBSERVED", "High");
  if (blocked.length) kit("site-aibots", "robots.txt groups to allow AI search crawlers", "text", blocked.map((b) => `User-agent: ${b}\nAllow: /`).join("\n\n"));
  onProgress("Testing how the server treats AI crawlers…");
  const probe = {};
  let i = 0;
  for (const [b, ua] of Object.entries(SEARCH_BOTS)) probe[b] = await probeUA(site, ua, 7100 + i++);
  const probed = Object.values(probe).some((s) => s !== null);
  const wafBlocked = botNames.filter((b) => [401, 403, 429, 503].includes(probe[b]) && home.status === 200);
  add("site-waf", "geo", "No CDN/WAF blocking of AI crawler user-agents", probed ? 1 - wafBlocked.length / botNames.length : null, 15,
    probed ? `homepage HTTP by user-agent: ${botNames.map((b) => `${b} ${probe[b]}`).join(", ")}` : "user-agent probe unavailable in this browser",
    `Check CDN/WAF bot settings: ${wafBlocked.join(", ") || "a crawler"} got an error status.`, "INFERRED", "High");
  const name = entity?.name || homeMeta.og["og:site_name"] || "";
  const text = homeMeta.text.toLowerCase();
  add("site-name", "geo", "Clear entity: business name stated in homepage text", name && text.includes(String(name).toLowerCase()) ? 1 : 0, 15, `entity name: ${name || "not found"}`,
    "State the business name, what it does, and for whom in the first lines of the homepage.", "OBSERVED", "High");
  const addr = entity?.address || {};
  const loc = (addr && typeof addr === "object" && !Array.isArray(addr) ? addr.addressLocality : "") || "";
  const area = entity?.areaServed;
  const hasWhere = !!(loc || area);
  add("site-where", "geo", "Location/service area declared (schema)", localBiz || hasWhere ? (hasWhere ? 1 : 0) : null, 10,
    localBiz || hasWhere ? `addressLocality: ${loc || "-"}; areaServed: ${area ? "yes" : "-"}` : "not a local-business entity",
    "Declare address or areaServed in schema and say where you operate on the homepage.", "OBSERVED", "Medium");
  let sameAs = entity?.sameAs || [];
  sameAs = Array.isArray(sameAs) ? sameAs : [sameAs];
  const hostOf = (s) => { try { return new URL(s).host; } catch { return ""; } };
  add("site-sameas", "geo", "Consistent identity across the web (sameAs)", Math.min(1, sameAs.length / 3), 10,
    `${sameAs.length} sameAs link(s)${sameAs.length ? ": " + sameAs.slice(0, 4).map(hostOf).join(", ") : ""}`,
    "List your real profiles (Google Business Profile, LinkedIn, Facebook, industry directories) in sameAs.", "OBSERVED", "Medium");
  if (sameAs.length < 3 && entity) kit("site-sameas", "sameAs to add to your existing Organization/LocalBusiness JSON-LD", "json",
    JSON.stringify({ sameAs: [...sameAs, ...["[CONFIRM: Google Business Profile / Maps URL]", "[CONFIRM: LinkedIn URL]", "[CONFIRM: Facebook or industry directory URL]"].slice(0, Math.max(0, 4 - sameAs.length))] }, null, 2));
  const homeLinks = [...home.body.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]).join(" ").toLowerCase();
  const urlsL = ok.map((p) => p.url.toLowerCase()).join(" ") + " " + homeLinks;
  const trust = Number(urlsL.includes("about") || allTypes.has("AboutPage")) + Number(urlsL.includes("contact") || allTypes.has("ContactPage"));
  add("site-trust", "geo", "About and Contact pages exist", trust / 2, 10, `found ${trust}/2`, "Publish About (who, credentials, history) and Contact (how to reach you) pages.", "OBSERVED", "Medium");
  const contact = /href=["'](tel:|mailto:)/i.test(home.body) || !!(entity?.telephone || entity?.email);
  add("site-contact", "geo", "Contact details findable (tel/mailto link or schema)", contact ? 1 : 0, 5, contact ? "found on homepage" : "no tel:/mailto: link or schema telephone/email on homepage",
    "Show a clickable phone number or email on the homepage and in schema.", "OBSERVED", "Medium");
  bad = failing(rows, (r) => (r.external_links || 0) >= 1);
  add("site-cites", "geo", "Cites sources (outbound links to evidence)", share(rows, (r) => (r.external_links || 0) >= 1), 10, `${rows.length - bad.length}/${rows.length} pages link out${eg(bad)}`,
    "Back claims and statistics with links to their sources; never publish unsourced numbers.", "INFERRED", "Low", bad);
  add("site-bing", "geo", "Bing access (ChatGPT search and Copilot use Bing's index)", access.Bingbot ? 1 : 0, 5, access.Bingbot ? "Bingbot allowed" : "Bingbot blocked",
    "Allow Bingbot and register the site in Bing Webmaster Tools.", "OBSERVED", "Medium");
  const llms = (await get(normalizeUrl("/llms.txt", site))).status === 200;
  add("site-llms", "info", "llms.txt (optional, not scored)", null, 0, `/llms.txt ${llms ? "present" : "absent"}; Google Search does not use it`);

  // ---- scores
  const scoreOf = (cats) => { const s = checks.filter((c) => cats.includes(c.category) && c.ratio != null); const tot = s.reduce((a, c) => a + c.weight, 0);
    return tot ? pyRound(100 * s.reduce((a, c) => a + c.points, 0) / tot) : null; };
  const seo = scoreOf(SEO_CATS), aeo = scoreOf(["aeo"]), geo = scoreOf(["geo"]);
  const overall = [seo, aeo, geo].includes(null) ? seo : pyRound(WEIGHTS.seo * seo + WEIGHTS.aeo * aeo + WEIGHTS.geo * geo);
  const groups = [[SEO_CATS, WEIGHTS.seo], [["aeo"], WEIGHTS.aeo], [["geo"], WEIGHTS.geo]];
  for (const x of checks) for (const [cats, w] of groups) {
    if (!cats.includes(x.category) || x.ratio == null) continue;
    const tot = checks.filter((y) => cats.includes(y.category) && y.ratio != null).reduce((a, y) => a + y.weight, 0);
    x.gain = pyRound(100 * w * x.weight * (1 - x.ratio) / tot, 1);
  }
  const prio = (x) => (x.gain || 0) * (MULT[x.impact] ?? 1) * (x.tag === "INFERRED" ? 0.8 : 1);
  const tips = checks.filter((x) => x.ratio != null && x.ratio < 0.999 && x.tip).sort((a, b) => prio(b) - prio(a));
  const potential = Math.min(100, overall + pyRound(tips.slice(0, 5).reduce((a, t) => a + (t.gain || 0), 0)));
  const cats = Object.fromEntries(SEO_CATS.map((k) => [k, scoreOf([k])]));
  const unknown = ["Rankings, clicks, impressions and queries (needs Google Search Console)", "Whether pages are actually indexed (needs Search Console URL Inspection)",
    "Bing index coverage and Copilot/ChatGPT search traffic (needs Bing Webmaster Tools)", "Backlinks and brand mentions (needs a backlink data source)",
    "Whether AI assistants cite the site today (needs prompt checks or a tracker)", "Google Business Profile completeness (manual check)"];
  if (perf == null) unknown.unshift(`Real Core Web Vitals: PageSpeed ${psiNote}; performance shown is an estimate`);
  return {
    site, host, rubric_version: RUBRIC_VERSION, pages_rated: ok.length, hit_page_limit: hitLimit, priority: tips.map((t) => t.id),
    scores: { overall, seo, aeo, geo, potential_after_top5: potential, ...Object.fromEntries(Object.entries(cats).map(([k, v]) => ["seo_" + k, v])) },
    checks, kits, unknown,
    pages: ok.map((p) => ({ path: pathOf(p.url), title: p.title, words: p.word_count, indexable: !!p.indexable })),
  };
}
