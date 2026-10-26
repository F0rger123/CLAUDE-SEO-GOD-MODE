/**
 * Runs inside the scanned page (chrome.scripting.executeScript). Must be self-contained: no imports, no closures.
 * Returns plain facts about the rendered page; scoring happens in the side panel.
 */
export async function collectPageFacts() {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const meta = (name) => $(`meta[name="${name}" i]`)?.getAttribute("content") ?? null;
  const prop = (p) => $(`meta[property="${p}" i]`)?.getAttribute("content") ?? null;
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const words = (s) => clean(s).split(" ").filter(Boolean).length;

  // Layout/paint metrics observed during this page load (buffered entries).
  const observe = (type) => new Promise((resolve) => {
    const out = [];
    try {
      const po = new PerformanceObserver((list) => out.push(...list.getEntries()));
      po.observe({ type, buffered: true });
      setTimeout(() => { po.disconnect(); resolve(out); }, 150);
    } catch { resolve(out); }
  });
  const [lcpEntries, shiftEntries] = await Promise.all([observe("largest-contentful-paint"), observe("layout-shift")]);
  const nav = performance.getEntriesByType("navigation")[0];

  // Visible text without nav/footer/script noise.
  const main = $("main") || document.body;
  const text = clean(main?.innerText || "");

  const headings = $$("h1,h2,h3,h4,h5,h6").filter((h) => !h.closest("svg")).map((h) => ({ level: +h.tagName[1], text: clean(h.textContent).slice(0, 140) }));
  const firstPara = $$("main p, article p, body p").map((p) => clean(p.textContent)).find((t) => words(t) >= 8) || "";
  const questionRe = /^(how|what|why|when|where|which|who|can|do|does|is|are|should|will)\b/i;
  const questionHeadings = headings.filter((h) => h.level >= 2 && (h.text.endsWith("?") || questionRe.test(h.text)));

  const jsonld = [];
  const jsonldErrors = [];
  for (const s of $$('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.textContent);
      const stack = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const o = stack.shift();
        if (o && typeof o === "object") {
          if (Array.isArray(o["@graph"])) stack.push(...o["@graph"]);
          else jsonld.push(o);
        }
      }
    } catch (e) { jsonldErrors.push(String(e.message || e).slice(0, 120)); }
  }

  // FAQ schema vs visible text, checked against the whole page (normalized quotes and spacing).
  const norm = (s) => clean(s).toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');
  const pageText = norm(document.body?.innerText || "") + " " + norm(document.body?.textContent || "");
  const faqQuestions = jsonld.filter((o) => [].concat(o["@type"] || []).includes("FAQPage"))
    .flatMap((o) => [].concat(o.mainEntity || [])).map((q) => norm(q?.name || "")).filter(Boolean);
  const faq = { total: faqQuestions.length, missing: faqQuestions.filter((q) => !pageText.includes(q.slice(0, 80))).length };

  const here = location.origin;
  const anchors = $$("a[href]").map((a) => a.href).filter((h) => /^https?:/i.test(h));
  const images = $$("img").map((img) => ({
    src: img.currentSrc || img.src || "", alt: img.getAttribute("alt"),
    sized: !!(img.getAttribute("width") && img.getAttribute("height")) || !!img.style.aspectRatio,
    lazy: img.loading === "lazy",
  })).filter((i) => i.src);

  const headScripts = $$("head script[src]");
  const blocking = headScripts.filter((s) => !s.async && !s.defer && s.type !== "module").length;

  // Signals that identify the platform, for platform-specific fix steps.
  const html = document.documentElement.outerHTML.slice(0, 400000);
  const gen = (meta("generator") || "").toLowerCase();
  const platform = /wordpress/.test(gen) || /wp-content\//.test(html) ? "WordPress"
    : /shopify/.test(gen) || /cdn\.shopify\.com/.test(html) ? "Shopify"
    : /wix\.com/.test(gen) || /static\.wixstatic\.com/.test(html) ? "Wix"
    : /squarespace/.test(gen) || /squarespace-cdn\.com/.test(html) ? "Squarespace"
    : /webflow/.test(gen) || /webflow\.(com|io)/.test(html) ? "Webflow"
    : document.getElementById("__next") || /\/_next\/static\//.test(html) ? "Next.js"
    : /\/_astro\//.test(html) ? "Astro"
    : "Unknown";

  return {
    url: location.href, origin: here, protocol: location.protocol, title: clean(document.title),
    description: meta("description"), robotsMeta: [meta("robots"), meta("googlebot")].filter(Boolean).join(",").toLowerCase(),
    canonical: $('link[rel="canonical"]')?.href ?? null, lang: document.documentElement.lang || null,
    viewport: meta("viewport"), og: { title: prop("og:title"), description: prop("og:description"), image: prop("og:image") },
    twitterCard: meta("twitter:card"), headings, h1Count: headings.filter((h) => h.level === 1).length,
    wordCount: words(text), firstPara, firstParaWords: words(firstPara), questionHeadings: questionHeadings.map((h) => h.text).slice(0, 10),
    h2Count: headings.filter((h) => h.level === 2).length, nosnippetEls: $$("[data-nosnippet]").length,
    jsonld, jsonldErrors, images, internalLinks: anchors.filter((h) => h.startsWith(here)).length,
    externalLinks: anchors.filter((h) => !h.startsWith(here)).length,
    hasTel: $$('a[href^="tel:"]').length > 0, hasMail: $$('a[href^="mailto:"]').length > 0,
    authorMeta: meta("author"), timeEls: $$("time[datetime]").length,
    blockingScripts: blocking, stylesheets: $$('head link[rel="stylesheet"]').length,
    lcpMs: lcpEntries.length ? Math.round(lcpEntries[lcpEntries.length - 1].startTime) : null,
    cls: shiftEntries.filter((e) => !e.hadRecentInput).reduce((a, e) => a + e.value, 0),
    transferKB: nav ? Math.round((nav.transferSize || nav.encodedBodySize || 0) / 1024) : null,
    renderedText: text.slice(0, 2000), faq, platform, scannedAt: new Date().toISOString(),
  };
}
