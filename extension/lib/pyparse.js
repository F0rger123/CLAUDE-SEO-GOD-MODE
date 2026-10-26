/**
 * HTML facts extracted exactly the way the skill's Python parsers do it (scripts/common.py PageParser and
 * scripts/ai_answer/answer_check.py BlockParser), so the site rating matches `rate_site.py` number for number.
 * Raw HTML only (no JavaScript runs), like the Python crawler.
 */
const SKIP = new Set(["script", "style", "noscript", "template"]);
const BLOCK_SKIP = new Set(["script", "style", "noscript", "template", "svg"]);
const BLOCKS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "dt", "dd", "summary"]);
const ws = (s) => (s || "").split(/\s+/).filter(Boolean).join(" ");

export function normalizeUrl(url, base) {
  try {
    const u = new URL(url.trim(), base);
    u.hash = "";
    if (!u.pathname) u.pathname = "/";
    return `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${u.pathname || "/"}${u.search}`;
  } catch { return ""; }
}
export function sameSite(a, b) {
  const h = (x) => { try { return new URL(x).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };
  return h(a) === h(b);
}
export const schemaTypes = (o) => [].concat(o?.["@type"] ?? []).map(String);

export function parseJsonld(blocks) {
  const items = [], errors = [];
  for (const raw of blocks) {
    let data;
    try { data = JSON.parse(raw); } catch (e) { errors.push(String(e.message || e)); continue; }
    const stack = Array.isArray(data) ? [...data] : [data];
    while (stack.length) {
      const o = stack.shift();
      if (o && typeof o === "object" && !Array.isArray(o)) { if ("@graph" in o) stack.push(...[].concat(o["@graph"])); else items.push(o); }
    }
  }
  return { items, errors };
}

/** Text of a subtree, skipping script/style/noscript/template (PageParser's visible-text rule). */
function textOf(root) {
  const out = [];
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) out.push(c.nodeValue);
      else if (c.nodeType === 1 && !SKIP.has(c.localName)) walk(c);
    }
  };
  walk(root);
  return out.join(" ");
}

/** Facts equal to PageParser + BlockParser output for one HTML document. */
export function parsePage(html) {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  const all = Array.from(doc.getElementsByTagName("*"));
  const meta = {}, og = {};
  let robotsMeta = "", canonical = null;
  for (const m of doc.getElementsByTagName("meta")) {
    const name = (m.getAttribute("name") || "").toLowerCase(), prop = (m.getAttribute("property") || "").toLowerCase(), content = m.getAttribute("content") || "";
    if (name) {
      meta[name] = content;
      if (name === "robots" || name === "googlebot") robotsMeta = [robotsMeta, content].filter(Boolean).join(",").replace(/^,|,$/g, "");
    }
    if (prop.startsWith("og:") || prop.startsWith("twitter:")) og[prop] = content;
  }
  for (const l of doc.getElementsByTagName("link")) if ((l.getAttribute("rel") || "").toLowerCase().split(/\s+/).includes("canonical")) canonical = l.getAttribute("href");
  const titleEl = Array.from(doc.getElementsByTagName("title")).find((t) => !t.closest("svg"));
  const headings = all.filter((e) => /^h[1-6]$/.test(e.localName)).map((h) => [+h.localName[1], ws(textOf(h))]);
  const links = Array.from(doc.getElementsByTagName("a")).filter((a) => a.getAttribute("href")).map((a) => ({ href: a.getAttribute("href"), rel: a.getAttribute("rel") || "" }));
  const images = Array.from(doc.getElementsByTagName("img")).map((i) => ({
    src: i.getAttribute("src") || i.getAttribute("data-src") || "", alt: i.getAttribute("alt"), width: i.getAttribute("width"), height: i.getAttribute("height") }));
  const scripts = Array.from(doc.getElementsByTagName("script"));
  const jsonld = scripts.filter((s) => (s.getAttribute("type") || "").toLowerCase().includes("ld+json")).map((s) => s.textContent);
  const text = ws(textOf(doc.documentElement || doc));

  // BlockParser: innermost open block collects text; svg is skipped too.
  const blocks = [];
  let cur = null, skip = 0, nosnippet = 0;
  const visit = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { if (cur && !skip) cur[1].push(c.nodeValue); continue; }
      if (c.nodeType !== 1) continue;
      const tag = c.localName;
      if (c.hasAttribute("data-nosnippet")) nosnippet++;
      if (BLOCK_SKIP.has(tag)) skip++;
      else if (BLOCKS.has(tag)) cur = [tag, []];
      visit(c);
      if (BLOCK_SKIP.has(tag) && skip) skip--;
      else if (cur && tag === cur[0]) { const t = ws(cur[1].join(" ")); if (t) blocks.push([cur[0], t]); cur = null; }
    }
  };
  visit(doc);

  return {
    title: ws(titleEl ? titleEl.textContent : ""), meta, og, robotsMeta, canonical, lang: doc.documentElement?.getAttribute("lang") ?? null,
    viewport: meta.viewport || "", headings, links, images, jsonld, scriptCount: scripts.length, text, blocks, nosnippet,
  };
}
