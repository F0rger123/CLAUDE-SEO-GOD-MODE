/**
 * Page-level rubric: the same ideas as references/rating-rubric.md, adapted to one page plus its site files.
 * Each check: id, cat (seo|aeo|geo), name, weight, tag (OBSERVED|INFERRED), test(p, s) -> {ratio|null, detail},
 * why (one line), steps (generic fix), platform (extra steps by detected platform), goal (for the Claude prompt).
 * To add a check: add an entry here + a fixture assertion in tests (see extension/README.md).
 */
const share = (arr, pred) => (arr.length ? arr.filter(pred).length / arr.length : null);
const LOCAL = /LocalBusiness|Store|Restaurant|Contractor|Plumber|Electrician|Roofing|HVAC|Dentist|AutoRepair|LegalService|ProfessionalService|HomeAndConstruction|MedicalBusiness|CleaningService/;
const ENTITY = /Organization|LocalBusiness|Corporation|ProfessionalService|Store|Restaurant|Contractor|Person|NGO|OnlineStore|OnlineBusiness/;
const types = (o) => [].concat(o?.["@type"] || []).map(String);
const entityOf = (p) => p.jsonld.find((o) => types(o).some((t) => ENTITY.test(t)));
const skips = (levels) => { const seq = [1, ...levels]; return seq.slice(1).filter((b, i) => b - seq[i] > 1).length; };
const nameIn = (p) => { const n = entityOf(p)?.name || ""; return n && (p.renderedText + " " + p.title).toLowerCase().includes(n.toLowerCase()); };

export const CHECKS = [
  // ---------------- SEO
  { id: "title", cat: "seo", name: "Title tag 25–60 characters", weight: 6, tag: "OBSERVED",
    test: (p) => ({ ratio: p.title.length >= 25 && p.title.length <= 60 ? 1 : p.title ? 0.4 : 0, detail: p.title ? `${p.title.length} chars: "${p.title}"` : "missing" }),
    why: "The title is the blue link in Google and the strongest on-page relevance signal.",
    steps: ["Write a unique title of about 50–60 characters: main topic first, then location if local, brand last.", "Don't repeat the same title on other pages."],
    platform: { WordPress: ["Yoast/Rank Math → edit page → SEO title."], Shopify: ["Online Store → Pages/Products → Search engine listing → Page title."], Wix: ["Page → SEO basics → Title tag."], Squarespace: ["Page settings → SEO → SEO title."], "Next.js": ["Set `metadata.title` (App Router) or `<title>` in the page's head."] },
    goal: "Rewrite this page's title to 50–60 characters, topic first and brand last, using only facts already on the page." },
  { id: "description", cat: "seo", name: "Meta description 70–170 characters", weight: 4, tag: "OBSERVED",
    test: (p) => { const n = (p.description || "").length; return { ratio: n >= 70 && n <= 170 ? 1 : n ? 0.4 : 0, detail: n ? `${n} chars` : "missing" }; },
    why: "It's the snippet under the link; a clear one earns more clicks.",
    steps: ["Write 120–160 characters: what the page offers, one proof point, a call to action.", "Make it unique to this page."],
    platform: { WordPress: ["Yoast/Rank Math → Meta description."], Shopify: ["Search engine listing → Description."], Wix: ["SEO basics → Meta description."], Squarespace: ["SEO → SEO description."], "Next.js": ["Set `metadata.description`."] },
    goal: "Write a 120–160 character meta description for this page from its existing content (benefit, proof, call to action)." },
  { id: "h1", cat: "seo", name: "Exactly one H1", weight: 4, tag: "OBSERVED",
    test: (p) => ({ ratio: p.h1Count === 1 ? 1 : 0, detail: `${p.h1Count} H1 tag(s)` }),
    why: "One H1 tells readers and crawlers what the page is about.",
    steps: ["Keep one H1 that names the page topic.", "Turn other H1s into H2s (style them with CSS if they must look big)."], platform: {},
    goal: "Make this page have exactly one H1 that states its topic; demote other H1s to H2 without changing the visual design." },
  { id: "headings", cat: "seo", name: "Heading levels in order", weight: 2, tag: "OBSERVED",
    test: (p) => { const n = skips(p.headings.map((h) => h.level)); return { ratio: n ? 0 : 1, detail: n ? `${n} skipped level(s)` : "no skipped levels" }; },
    why: "Headings work as an outline for readers, screen readers and AI parsers.", steps: ["Go H1 → H2 → H3 without skipping levels; use CSS for size."], platform: {},
    goal: "Fix skipped heading levels on this page (e.g. H2 → H4) so they form a proper outline, keeping the visual design." },
  { id: "canonical", cat: "seo", name: "Canonical tag present", weight: 3, tag: "OBSERVED",
    test: (p) => ({ ratio: p.canonical ? 1 : 0, detail: p.canonical || "missing" }),
    why: "Prevents duplicate URLs (tracking parameters, http/www variants) from splitting signals.",
    steps: ["Add `<link rel=\"canonical\" href=\"<this page's clean URL>\">`."], platform: { WordPress: ["Yoast/Rank Math add it automatically when enabled."], "Next.js": ["Set `alternates.canonical` in metadata."] },
    goal: "Add a self-referencing canonical tag to this page (and its template)." },
  { id: "indexable", cat: "seo", name: "Indexable (no noindex)", weight: 6, tag: "OBSERVED",
    test: (p, s) => { const ni = /noindex/.test(p.robotsMeta + "," + (s.xRobotsTag || "").toLowerCase()); return { ratio: ni ? 0 : 1, detail: ni ? "noindex found" : "indexable" }; },
    why: "A noindex page can't appear in Google or AI Overviews.", steps: ["Remove noindex from the robots meta tag or X-Robots-Tag header if this page should rank."],
    platform: { WordPress: ["Settings → Reading → untick 'Discourage search engines'; check the page's SEO plugin 'Allow in search results'."] },
    goal: "Remove the noindex directive from this page if it should be in search results; confirm with me first if unsure." },
  { id: "mobile", cat: "seo", name: "Mobile viewport and html lang", weight: 3, tag: "OBSERVED",
    test: (p) => ({ ratio: (p.viewport ? 0.5 : 0) + (p.lang ? 0.5 : 0), detail: `viewport ${p.viewport ? "yes" : "no"}, lang ${p.lang || "missing"}` }),
    why: "Google indexes the mobile version; lang helps the right audience.", steps: ["Add `<meta name=viewport content=\"width=device-width, initial-scale=1\">` and `<html lang=\"en\">`."], platform: {},
    goal: "Add the responsive viewport meta tag and the html lang attribute to the site template." },
  { id: "alt", cat: "seo", name: "Images have alt text", weight: 3, tag: "OBSERVED",
    test: (p) => { const r = share(p.images, (i) => i.alt !== null); return { ratio: r ?? 1, detail: `${p.images.filter((i) => i.alt !== null).length}/${p.images.length} images` }; },
    why: "Alt text describes images for screen readers and image search.", steps: ["Describe meaningful images in a few words; use alt=\"\" for decorative ones."], platform: { WordPress: ["Media Library → image → Alternative Text."] },
    goal: "Add accurate alt text to this page's images (describe what's visible; alt=\"\" for decorative ones). Don't invent details." },
  { id: "imgsize", cat: "seo", name: "Images have width/height", weight: 2, tag: "OBSERVED",
    test: (p) => { const r = share(p.images, (i) => i.sized); return { ratio: r ?? 1, detail: `${p.images.filter((i) => i.sized).length}/${p.images.length} sized` }; },
    why: "Set dimensions stop the layout jumping while images load (CLS).", steps: ["Add width and height attributes (or CSS aspect-ratio) to every image."], platform: { "Next.js": ["Use next/image with width/height."] },
    goal: "Give every image on this page width/height (or aspect-ratio) to prevent layout shift." },
  { id: "og", cat: "seo", name: "Social share tags", weight: 2, tag: "OBSERVED",
    test: (p) => { const n = ["title", "description", "image"].filter((k) => p.og[k]).length; return { ratio: n / 3, detail: `og:title ${p.og.title ? "✓" : "✗"}, og:description ${p.og.description ? "✓" : "✗"}, og:image ${p.og.image ? "✓" : "✗"}` }; },
    why: "Controls the preview when the page is shared on Facebook, LinkedIn, iMessage.", steps: ["Add og:title, og:description, og:image (1200×630) and twitter:card."],
    platform: { "Next.js": ["Page-level `openGraph` replaces the layout's: spread shared defaults (incl. images) into each page's openGraph."] },
    goal: "Add complete Open Graph tags (title, description, 1200×630 image) to this page and its template." },
  { id: "https", cat: "seo", name: "HTTPS", weight: 3, tag: "OBSERVED",
    test: (p) => ({ ratio: p.protocol === "https:" ? 1 : 0, detail: p.protocol }), why: "Browsers warn on http; Google prefers https.",
    steps: ["Install a TLS certificate (most hosts do it free) and serve every page over https."], platform: {}, goal: "Serve this site over HTTPS." },
  { id: "httpredirect", cat: "seo", name: "http:// redirects to https://", weight: 2, tag: "OBSERVED",
    test: (p, s) => ({ ratio: s.httpVariant === null || s.httpVariant === "unreachable" ? null : s.httpVariant === "redirects" ? 1 : 0, detail: `http:// ${s.httpVariant || "n/a"}` }),
    why: "Two versions of the site split signals and can show 'Not secure'.",
    steps: ["Turn on the host/CDN setting that forces HTTPS. Don't do it in app code behind a CDN."],
    platform: { "Next.js": ["If behind Cloudflare: SSL/TLS → Edge Certificates → Always Use HTTPS. Never key a redirect on x-forwarded-proto (Cloudflare sends http on every request → redirect loop)."], WordPress: ["Hosting panel 'Force HTTPS', or Really Simple SSL."] },
    goal: "Make http:// permanently redirect to https:// at the host/CDN level (not in app code). Tell me the exact setting to flip; verify the live site returns 200 afterwards." },
  { id: "robots", cat: "seo", name: "robots.txt allows Googlebot and Bingbot", weight: 5, tag: "OBSERVED",
    test: (p, s) => ({ ratio: (s.bots.Googlebot ? 0.5 : 0) + (s.bots.Bingbot ? 0.5 : 0), detail: `Googlebot ${s.bots.Googlebot ? "allowed" : "BLOCKED"}, Bingbot ${s.bots.Bingbot ? "allowed" : "BLOCKED"} (robots.txt HTTP ${s.robotsStatus})` }),
    why: "Blocked pages can't be crawled or shown properly.", steps: ["Remove the Disallow rule that matches this page for Googlebot/Bingbot."], platform: {},
    goal: "Fix robots.txt so Googlebot and Bingbot can crawl this page; keep private areas disallowed." },
  { id: "sitemap", cat: "seo", name: "XML sitemap reachable", weight: 3, tag: "OBSERVED",
    test: (p, s) => ({ ratio: s.sitemapOk ? 1 : 0, detail: `${s.sitemapUrl} ${s.sitemapOk ? "OK" : "missing/invalid"}` }),
    why: "Helps search engines find every page.", steps: ["Publish /sitemap.xml with your indexable pages and add `Sitemap: <url>` to robots.txt.", "Submit it in Search Console and Bing Webmaster Tools."],
    platform: { WordPress: ["WordPress core serves /wp-sitemap.xml; Yoast/Rank Math serve /sitemap_index.xml."], "Next.js": ["Add app/sitemap.ts."] },
    goal: "Create an XML sitemap listing only indexable 200 pages, reference it in robots.txt, and tell me how to submit it." },
  { id: "soft404", cat: "seo", name: "Missing pages return 404", weight: 2, tag: "OBSERVED",
    test: (p, s) => ({ ratio: s.soft404Status === null ? null : [404, 410].includes(s.soft404Status) ? 1 : 0, detail: `random URL → HTTP ${s.soft404Status}` }),
    why: "A 200 on junk URLs lets thin pages get indexed (soft 404).", steps: ["Return HTTP 404 (or 410) for unknown URLs with a helpful not-found page."], platform: {},
    goal: "Make unknown URLs return HTTP 404 with a helpful not-found page." },
  { id: "jsonld", cat: "seo", name: "Structured data valid", weight: 2, tag: "OBSERVED",
    test: (p) => ({ ratio: p.jsonldErrors.length ? 0 : 1, detail: p.jsonldErrors.length ? p.jsonldErrors[0] : `${p.jsonld.length} JSON-LD item(s)` }),
    why: "Broken JSON-LD is ignored by Google.", steps: ["Fix the JSON syntax; validate at validator.schema.org and Google's Rich Results Test."], platform: {},
    goal: "Fix the invalid JSON-LD on this page and validate it." },
  { id: "words", cat: "seo", name: "Substantial content (250+ words)", weight: 3, tag: "INFERRED",
    test: (p) => ({ ratio: Math.min(1, p.wordCount / 250), detail: `${p.wordCount} words` }),
    why: "Thin pages rarely rank; length isn't quality, but very short pages usually miss what people need.",
    steps: ["Add specifics customers ask about: process, price factors, proof (projects, reviews), FAQs.", "Or merge the page into a stronger one."], platform: {},
    goal: "Suggest additions that make this page more useful (process, pricing factors, proof, FAQs). Mark facts I must confirm as [CONFIRM]." },
  { id: "speed", cat: "seo", name: "Load speed in this visit (LCP, CLS)", weight: 6, tag: "OBSERVED",
    test: (p) => { if (p.lcpMs == null) return { ratio: null, detail: "no LCP entry (reload the page, then scan)" };
      const l = p.lcpMs <= 2500 ? 1 : p.lcpMs <= 4000 ? 0.5 : 0, c = p.cls <= 0.1 ? 1 : p.cls <= 0.25 ? 0.5 : 0;
      return { ratio: (l + c) / 2, detail: `LCP ${(p.lcpMs / 1000).toFixed(1)}s, CLS ${p.cls.toFixed(2)} (your device/network)` }; },
    why: "Core Web Vitals affect rankings and conversions. This is one visit on your machine; Search Console has field data.",
    steps: ["Compress and resize the largest image (WebP/AVIF), preload it, don't lazy-load it.", "Defer non-critical scripts; set image dimensions."], platform: { WordPress: ["A caching + image-optimization plugin; remove unused plugins."] },
    goal: "Improve this page's LCP and CLS (largest image, scripts, layout shifts) without changing its design. Measure before and after." },
  { id: "blocking", cat: "seo", name: "Few render-blocking scripts", weight: 2, tag: "OBSERVED",
    test: (p) => ({ ratio: p.blockingScripts <= 2 ? 1 : Math.max(0, 1 - (p.blockingScripts - 2) / 8), detail: `${p.blockingScripts} blocking <script> in <head>` }),
    why: "Blocking scripts delay first paint.", steps: ["Add defer/async to scripts in <head>, or move them to the end of <body>."], platform: {},
    goal: "Add defer/async to non-critical scripts in <head> so they don't block rendering; test that nothing breaks." },

  // ---------------- AEO
  { id: "snippet", cat: "aeo", name: "Eligible for snippets", weight: 20, tag: "OBSERVED",
    test: (p) => { const bad = /nosnippet|max-snippet\s*:\s*0\b/.test(p.robotsMeta); return { ratio: bad ? 0 : p.nosnippetEls ? 0.7 : 1, detail: bad ? "nosnippet/max-snippet:0 set" : p.nosnippetEls ? `${p.nosnippetEls} data-nosnippet element(s)` : "no snippet blockers" }; },
    why: "Google says a page must be snippet-eligible to appear in AI Overviews/AI Mode.", steps: ["Remove nosnippet / max-snippet:0 unless intentional; review data-nosnippet areas."], platform: {},
    goal: "Remove snippet blockers (nosnippet, max-snippet:0) from this page unless they're intentional — ask me first." },
  { id: "questions", cat: "aeo", name: "Question-style headings", weight: 15, tag: "INFERRED",
    test: (p) => ({ ratio: Math.min(1, p.questionHeadings.length / 2), detail: p.questionHeadings.length ? p.questionHeadings.slice(0, 3).join(" · ") : "none" }),
    why: "Matching the questions people ask makes answers easy to find and quote.", steps: ["Use real customer questions as H2/H3s (from Search Console queries, calls, reviews)."], platform: {},
    goal: "Propose 3–5 question-style H2s for this page based on real customer questions (use Search Console queries if available). Don't invent facts in the answers." },
  { id: "answer", cat: "aeo", name: "Direct answer near the top", weight: 20, tag: "INFERRED",
    test: (p) => ({ ratio: p.firstParaWords >= 25 && p.firstParaWords <= 90 ? 1 : p.firstParaWords ? 0.4 : 0, detail: `opening paragraph ${p.firstParaWords} words` }),
    why: "A plain 1–3 sentence answer up top helps readers and answer engines (house heuristic, not a Google rule).",
    steps: ["Open with who you are / what this page answers in 1–3 plain sentences, then the detail."], platform: {},
    goal: "Draft a 40–60 word opening paragraph that directly answers this page's main question, using only facts on the site. Keep the brand voice." },
  { id: "faq", cat: "aeo", name: "FAQ matches its schema", weight: 15, tag: "OBSERVED",
    test: (p) => { const faq = p.jsonld.find((o) => types(o).includes("FAQPage"));
      if (!faq) return { ratio: p.questionHeadings.length >= 3 ? 0.6 : 0, detail: "no FAQPage schema" };
      const qs = [].concat(faq.mainEntity || []).map((q) => (q.name || "").toLowerCase().replace(/\s+/g, " ").trim());
      const vis = p.renderedText.toLowerCase();
      const miss = qs.filter((q) => q && !vis.includes(q.slice(0, 60)));
      return { ratio: miss.length ? 0.5 : 1, detail: miss.length ? `${miss.length} schema question(s) not visible` : `${qs.length} FAQ question(s) match` }; },
    why: "FAQ content answers follow-up questions; schema must match what's visible.", steps: ["Add an FAQ section with real questions; add FAQPage schema only for those exact Q&As."], platform: {},
    goal: "Add an FAQ section with real customer questions and matching FAQPage JSON-LD (only for visible Q&As)." },
  { id: "structure", cat: "aeo", name: "Scannable sections (2+ H2s)", weight: 10, tag: "INFERRED",
    test: (p) => ({ ratio: Math.min(1, p.h2Count / 2), detail: `${p.h2Count} H2(s)` }), why: "Sections make passages easy to extract.",
    steps: ["Break long text into H2 sections, lists and tables."], platform: {}, goal: "Restructure this page into clear H2 sections with lists/tables where useful, without changing the facts." },
  { id: "rawhtml", cat: "aeo", name: "Content in raw HTML (not JS-only)", weight: 20, tag: "OBSERVED",
    test: (p, s) => { if (!s.rawTextWords && s.rawStatus == null) return { ratio: null, detail: "couldn't fetch raw HTML" };
      const r = p.wordCount ? Math.min(1, s.rawTextWords / p.wordCount) : 1; return { ratio: r >= 0.6 ? 1 : r, detail: `raw HTML ${s.rawTextWords} words vs rendered ${p.wordCount}` }; },
    why: "Most AI crawlers don't run JavaScript; content must be in the HTML.", steps: ["Server-render or prerender the main content (SSR/SSG)."], platform: { "Next.js": ["Avoid client-only components for main copy; use Server Components / static generation."] },
    goal: "Make this page's main content present in the server-rendered HTML (SSR/SSG) so non-JS crawlers can read it." },

  // ---------------- GEO
  { id: "aibots", cat: "geo", name: "AI search crawlers allowed", weight: 20, tag: "OBSERVED",
    test: (p, s) => { const bots = ["OAI-SearchBot", "PerplexityBot", "Claude-SearchBot", "Googlebot", "Bingbot"]; const ok = bots.filter((b) => s.bots[b]);
      return { ratio: ok.length / bots.length, detail: `blocked: ${bots.filter((b) => !s.bots[b]).join(", ") || "none"}` }; },
    why: "ChatGPT, Perplexity and Claude search can only cite pages their crawlers can fetch.",
    steps: ["In robots.txt allow OAI-SearchBot, PerplexityBot, Claude-SearchBot (training bots are your choice).", "Also check Cloudflare/CDN 'block AI bots' settings."], platform: {},
    goal: "Update robots.txt to allow OAI-SearchBot, PerplexityBot and Claude-SearchBot (keep my choices for training bots). Check CDN bot settings too." },
  { id: "entity", cat: "geo", name: "Business/organization schema", weight: 15, tag: "OBSERVED",
    test: (p) => { const e = entityOf(p); return { ratio: e ? (nameIn(p) ? 1 : 0.6) : 0, detail: e ? `${types(e).join("/")}: ${e.name || "no name"}${nameIn(p) ? "" : " (name not in page text)"}` : "none on this page" }; },
    why: "Clear entity data tells AI systems exactly who you are.", steps: ["Add Organization or LocalBusiness JSON-LD (name, url, logo, phone, address/areaServed, sameAs).", "State the business name in the visible text."],
    platform: { WordPress: ["Yoast/Rank Math → Site representation / Local SEO."] },
    goal: "Add Organization/LocalBusiness JSON-LD to the site template using only facts on the site; list facts I must confirm as [CONFIRM]." },
  { id: "sameas", cat: "geo", name: "sameAs profiles (3+)", weight: 10, tag: "OBSERVED",
    test: (p) => { const e = entityOf(p); const n = [].concat(e?.sameAs || []).length; return { ratio: e ? Math.min(1, n / 3) : null, detail: e ? `${n} profile link(s)` : "no entity schema" }; },
    why: "Links to your real profiles help AI systems confirm the same business everywhere.",
    steps: ["Add your real Google Business Profile, Apple Maps, Facebook, LinkedIn, Yelp URLs to sameAs."], platform: {},
    goal: "Add a sameAs list to the business schema. Ask me for each real profile URL; never guess one." },
  { id: "where", cat: "geo", name: "Location / service area", weight: 10, tag: "OBSERVED",
    test: (p) => { const e = entityOf(p); if (!e || !types(e).some((t) => LOCAL.test(t))) return { ratio: null, detail: "not a local business entity" };
      return { ratio: e.address || e.areaServed ? 1 : 0, detail: e.address ? "address set" : e.areaServed ? "areaServed set" : "no address/areaServed" }; },
    why: "Local answers need to know where you work.", steps: ["Add address (or areaServed for service-area businesses) to LocalBusiness schema; say where you work in the text."], platform: {},
    goal: "Add address or areaServed to the LocalBusiness schema and mention the service area in the visible text, using facts I confirm." },
  { id: "contact", cat: "geo", name: "Contact details findable", weight: 5, tag: "OBSERVED",
    test: (p) => ({ ratio: p.hasTel || p.hasMail || entityOf(p)?.telephone ? 1 : 0, detail: `tel ${p.hasTel ? "✓" : "✗"}, mailto ${p.hasMail ? "✓" : "✗"}` }),
    why: "A real, consistent phone/email is a trust signal.", steps: ["Show a clickable phone (tel:) or email (mailto:) and put the same in schema."], platform: {},
    goal: "Add a clickable phone or email link and matching schema telephone/email (ask me for the real values)." },
  { id: "sources", cat: "geo", name: "Cites sources", weight: 10, tag: "INFERRED",
    test: (p) => ({ ratio: p.externalLinks ? 1 : 0, detail: `${p.externalLinks} outbound link(s)` }), why: "Sourced claims are more trustworthy and more citable.",
    steps: ["Link statistics and claims to their original source."], platform: {}, goal: "Find claims/statistics on this page that need a source and suggest real sources; flag any number that can't be verified." },
  { id: "eeat", cat: "geo", name: "Author / date signals", weight: 10, tag: "INFERRED",
    test: (p) => { const has = !!p.authorMeta || p.timeEls > 0 || p.jsonld.some((o) => o.author || o.dateModified || types(o).includes("Person"));
      return { ratio: has ? 1 : 0, detail: has ? "author or date present" : "no author/date" }; },
    why: "Who wrote it and when helps readers and AI judge credibility.", steps: ["Show author (with a short bio link) and a published/updated date on articles and guides."], platform: {},
    goal: "Add author and updated-date info (visible and in schema) to this page if it's an article or guide." },
  { id: "bing", cat: "geo", name: "Bing can crawl (ChatGPT/Copilot)", weight: 5, tag: "OBSERVED",
    test: (p, s) => ({ ratio: s.bots.Bingbot ? 1 : 0, detail: s.bots.Bingbot ? "Bingbot allowed" : "Bingbot blocked" }),
    why: "ChatGPT search and Copilot use Bing's index.", steps: ["Allow Bingbot; add the site in Bing Webmaster Tools (import from Search Console)."], platform: {},
    goal: "Allow Bingbot in robots.txt and walk me through adding the site to Bing Webmaster Tools." },
];

export const CATS = { seo: "SEO", aeo: "AEO", geo: "GEO" };
export const WEIGHTS = { seo: 0.6, aeo: 0.2, geo: 0.2 };
export const grade = (n) => (n == null ? "?" : n >= 90 ? "A" : n >= 80 ? "B" : n >= 70 ? "C" : n >= 60 ? "D" : "F");

export function score(page, site) {
  const results = CHECKS.map((c) => {
    let r;
    try { r = c.test(page, site); } catch (e) { r = { ratio: null, detail: "check failed: " + e.message }; }
    const ratio = r.ratio == null ? null : Math.max(0, Math.min(1, r.ratio));
    return { id: c.id, cat: c.cat, name: c.name, weight: c.weight, tag: ratio == null ? "UNKNOWN" : c.tag, ratio, detail: r.detail };
  });
  const catScore = (cat) => { const s = results.filter((x) => x.cat === cat && x.ratio != null); const w = s.reduce((a, x) => a + x.weight, 0);
    return w ? Math.round((100 * s.reduce((a, x) => a + x.ratio * x.weight, 0)) / w) : null; };
  const scores = { seo: catScore("seo"), aeo: catScore("aeo"), geo: catScore("geo") };
  scores.overall = Math.round(WEIGHTS.seo * scores.seo + WEIGHTS.aeo * scores.aeo + WEIGHTS.geo * scores.geo);
  for (const x of results) {
    if (x.ratio == null) continue;
    const tot = results.filter((y) => y.cat === x.cat && y.ratio != null).reduce((a, y) => a + y.weight, 0);
    x.gain = Math.round(1000 * WEIGHTS[x.cat] * x.weight * (1 - x.ratio) / tot) / 10;
  }
  return { scores, results };
}

export const checkById = Object.fromEntries(CHECKS.map((c) => [c.id, c]));
