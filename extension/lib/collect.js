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
  const norm = (s) => clean(s).toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return ""; } };
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

  // ---- performance observed during this page load
  const observe = (type) => new Promise((resolve) => {
    const out = [];
    try {
      const po = new PerformanceObserver((list) => out.push(...list.getEntries()));
      po.observe({ type, buffered: true });
      setTimeout(() => { po.disconnect(); resolve(out); }, 150);
    } catch { resolve(out); }
  });
  const [lcpEntries, shiftEntries] = await Promise.all([observe("largest-contentful-paint"), observe("layout-shift")]);
  const lcp = lcpEntries[lcpEntries.length - 1];
  const nav = performance.getEntriesByType("navigation")[0];
  const resources = performance.getEntriesByType("resource");
  const myHost = location.hostname.replace(/^www\./, "");
  const thirdParty = [...new Set(resources.map((r) => host(r.name)).filter((h) => h && !h.endsWith(myHost)))];

  // ---- text
  const main = $("main") || $("article") || document.body;
  const text = clean(main?.innerText || "");
  const paras = $$("main p, article p, body p").map((p) => clean(p.textContent)).filter((t) => words(t) >= 5);
  const paraWords = paras.map(words);
  const firstPara = paras.find((t) => words(t) >= 8) || "";
  const sample = text.split(" ").slice(0, 1500).join(" ");
  const sentences = Math.max(1, (sample.match(/[.!?]+(\s|$)/g) || []).length);
  const syll = (w) => { w = w.toLowerCase().replace(/[^a-z]/g, ""); if (!w) return 0; if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, ""); return Math.max(1, (w.match(/[aeiouy]{1,2}/g) || []).length); };
  const sw = sample.split(" ").filter(Boolean);
  const readingEase = sw.length > 50 ? Math.round(206.835 - 1.015 * (sw.length / sentences) - 84.6 * (sw.reduce((a, w) => a + syll(w), 0) / sw.length)) : null;
  const statRe = /(\d+(\.\d+)?\s?%|\$\s?\d[\d,.]*|\b\d{2,}[\d,.]*\s?(years?|customers?|clients?|projects?|homes?|reviews?|stars?|people|users|businesses|installs?|jobs)\b)/gi;
  const statCount = (text.match(statRe) || []).length;

  // ---- headings
  const headings = $$("h1,h2,h3,h4,h5,h6").filter((h) => !h.closest("svg")).map((h) => ({ level: +h.tagName[1], text: clean(h.textContent).slice(0, 140) }));
  const questionRe = /^(how|what|why|when|where|which|who|can|do|does|is|are|should|will|much)\b/i;
  const questionHeadings = headings.filter((h) => h.level >= 2 && (h.text.endsWith("?") || questionRe.test(h.text))).map((h) => h.text);

  // ---- structured data
  const jsonld = [];
  const jsonldErrors = [];
  let jsonldHttpContext = false;
  for (const s of $$('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.textContent);
      if (/"@context"\s*:\s*"http:\/\//.test(s.textContent)) jsonldHttpContext = true;
      const stack = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const o = stack.shift();
        if (o && typeof o === "object") { if (Array.isArray(o["@graph"])) stack.push(...o["@graph"]); else jsonld.push(o); }
      }
    } catch (e) { jsonldErrors.push(String(e.message || e).slice(0, 120)); }
  }
  const microdata = $$("[itemscope][itemtype]").map((e) => e.getAttribute("itemtype")).slice(0, 10);

  // ---- FAQ schema vs the whole visible page
  const pageText = norm(document.body?.innerText || "") + " " + norm(document.body?.textContent || "");
  const faqQuestions = jsonld.filter((o) => [].concat(o["@type"] || []).includes("FAQPage"))
    .flatMap((o) => [].concat(o.mainEntity || [])).map((q) => norm(q?.name || "")).filter(Boolean);
  const faq = { total: faqQuestions.length, missing: faqQuestions.filter((q) => !pageText.includes(q.slice(0, 80))).length };

  // ---- links
  const here = location.origin;
  const generic = /^(click here|here|read more|learn more|more|this|link|go|continue|details)$/i;
  const links = $$("a[href]").map((a) => {
    const href = abs(a.getAttribute("href"));
    return { href, text: clean(a.textContent || a.getAttribute("aria-label") || a.querySelector("img")?.alt || "").slice(0, 80),
             internal: href.startsWith(here), nofollow: /nofollow/i.test(a.rel), http: /^https?:/i.test(href) };
  }).filter((l) => l.http);
  const extDomains = [...new Set(links.filter((l) => !l.internal).map((l) => host(l.href)))];
  const authority = extDomains.filter((d) => /\.(gov|edu|mil)$|\.gov\.|wikipedia\.org$|\.org$/.test(d));

  // ---- images
  const images = $$("img").map((img) => {
    const src = img.currentSrc || img.src || "";
    return { src, alt: img.getAttribute("alt"), sized: !!(img.getAttribute("width") && img.getAttribute("height")) || !!img.style.aspectRatio,
             lazy: img.loading === "lazy", srcset: !!img.getAttribute("srcset") || !!img.closest("picture"),
             modern: /\.(webp|avif|svg)(\?|$)/i.test(src) || /\/_next\/image|format=(webp|avif)|fm=(webp|avif)/i.test(src) };
  }).filter((i) => i.src);

  // ---- head and markup
  const html = document.documentElement.outerHTML;
  const headScripts = $$("head script[src]");
  const gen = (meta("generator") || "").toLowerCase();
  const platform = /wordpress/.test(gen) || /wp-content\//.test(html) ? "WordPress"
    : /shopify/.test(gen) || /cdn\.shopify\.com/.test(html) ? "Shopify"
    : /wix\.com/.test(gen) || /static\.wixstatic\.com/.test(html) ? "Wix"
    : /squarespace/.test(gen) || /squarespace-cdn\.com/.test(html) ? "Squarespace"
    : /webflow/.test(gen) || /webflow\.(com|io)/.test(html) ? "Webflow"
    : document.getElementById("__next") || /\/_next\/static\//.test(html) ? "Next.js"
    : /\/_astro\//.test(html) ? "Astro" : "Unknown";
  const mixed = location.protocol === "https:" ? $$("img[src],script[src],link[href][rel=stylesheet],iframe[src],source[src],video[src],audio[src]")
    .map((e) => e.getAttribute("src") || e.getAttribute("href") || "").filter((u) => /^http:\/\//i.test(u)).length : 0;
  const dateRaw = jsonld.map((o) => o.dateModified || o.datePublished).find(Boolean) || prop("article:modified_time") || prop("article:published_time")
    || $("time[datetime]")?.getAttribute("datetime") || null;
  const ageDays = dateRaw && !isNaN(Date.parse(dateRaw)) ? Math.round((Date.now() - Date.parse(dateRaw)) / 864e5) : null;

  return {
    url: location.href, origin: here, protocol: location.protocol, path: location.pathname, search: location.search,
    title: clean(document.title), description: meta("description"),
    robotsMeta: [meta("robots"), meta("googlebot")].filter(Boolean).join(",").toLowerCase(),
    canonical: $('link[rel="canonical"]')?.href ?? null, canonicalCount: $$('link[rel="canonical"]').length,
    lang: document.documentElement.lang || null, charset: !!$("meta[charset]") || /charset=/i.test($('meta[http-equiv="content-type" i]')?.content || ""),
    doctype: !!document.doctype, favicon: !!$('link[rel~="icon"]'), metaRefresh: !!$('meta[http-equiv="refresh" i]'),
    viewport: meta("viewport"), hreflang: $$('link[rel="alternate"][hreflang]').map((l) => ({ lang: l.hreflang, href: l.href })),
    og: { title: prop("og:title"), description: prop("og:description"), image: prop("og:image"), url: prop("og:url"), type: prop("og:type"), siteName: prop("og:site_name") },
    twitterCard: meta("twitter:card"),
    headings, h1Count: headings.filter((h) => h.level === 1).length, h2Count: headings.filter((h) => h.level === 2).length,
    emptyHeadings: headings.filter((h) => !h.text).length, questionHeadings: questionHeadings.slice(0, 12),
    wordCount: words(text), firstPara, firstParaWords: words(firstPara),
    paraCount: paras.length, paraAvg: paraWords.length ? Math.round(paraWords.reduce((a, b) => a + b, 0) / paraWords.length) : 0,
    paraLong: paraWords.filter((n) => n > 150).length, paraQuotable: paraWords.filter((n) => n >= 40 && n <= 160).length,
    definition: [firstPara, ...paras.slice(0, 3), meta("description") || ""].some((t) => /^[^.?!]{0,160}\b(is|are)\s+(a|an|the|our|one|your)\b/i.test(t)),
    lists: $$("ul,ol").filter((l) => l.querySelectorAll(":scope > li").length >= 3 && !l.closest("nav,header,footer")).length,
    orderedLists: $$("ol").filter((l) => l.querySelectorAll(":scope > li").length >= 3).length,
    tables: $$("table").filter((t) => t.querySelectorAll("tr").length >= 3).length,
    readingEase, statCount, nosnippetEls: $$("[data-nosnippet]").length,
    jsonld, jsonldErrors, jsonldHttpContext, microdata, faq,
    links: links.slice(0, 300), internalLinks: links.filter((l) => l.internal).length, externalLinks: links.filter((l) => !l.internal).length,
    nofollowInternal: links.filter((l) => l.internal && l.nofollow).length, genericAnchors: links.filter((l) => generic.test(l.text)).length,
    emptyAnchors: links.filter((l) => !l.text).length, extDomains: extDomains.slice(0, 40), authorityLinks: authority.length,
    aboutLink: links.some((l) => l.internal && /\/about/i.test(l.href)), contactLink: links.some((l) => l.internal && /\/(contact|quote|book)/i.test(l.href)),
    images, hasTel: $$('a[href^="tel:"]').length > 0, hasMail: $$('a[href^="mailto:"]').length > 0,
    phoneInText: /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(pageText),
    authorMeta: meta("author"), bylineEl: !!$('[rel="author"], [itemprop="author"], .author, .byline'), timeEls: $$("time[datetime]").length,
    dateRaw, ageDays, reviewsMention: /\b(reviews?|testimonials?|rated|★)\b/i.test(text),
    blockingScripts: headScripts.filter((s) => !s.async && !s.defer && s.type !== "module").length,
    stylesheets: $$('head link[rel="stylesheet"]').length, inlineScriptKB: Math.round($$("script:not([src])").reduce((a, s) => a + s.textContent.length, 0) / 1024),
    domNodes: document.getElementsByTagName("*").length, iframes: $$("iframe").length, htmlKB: Math.round(html.length / 1024),
    textRatio: (() => { const code = $$("script,style").reduce((a, s) => a + s.outerHTML.length, 0);
      return Math.round((100 * (document.body?.innerText || "").length) / Math.max(1, html.length - code)); })(),
    mixed, requests: resources.length, thirdParty: thirdParty.slice(0, 30),
    lcpMs: lcp ? Math.round(lcp.startTime) : null, lcpTag: lcp?.element?.tagName?.toLowerCase() || null,
    lcpLazy: lcp?.element?.tagName === "IMG" ? lcp.element.loading === "lazy" : false,
    cls: shiftEntries.filter((e) => !e.hadRecentInput).reduce((a, e) => a + e.value, 0),
    ttfbMs: nav ? Math.round(nav.responseStart) : null, loadMs: nav ? Math.round(nav.loadEventEnd || nav.domContentLoadedEventEnd) : null,
    transferKB: nav ? Math.round((nav.transferSize || nav.encodedBodySize || 0) / 1024) : null,
    viewportBlocksZoom: /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(meta("viewport") || ""),
    renderedText: text.slice(0, 2000), platform, scannedAt: new Date().toISOString(),
  };
}
