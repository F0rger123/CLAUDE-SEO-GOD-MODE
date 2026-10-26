import { OTHER_BOTS, SEARCH_BOTS, TRAINING_BOTS } from "./site.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const types = (o) => [].concat(o?.["@type"] || []).map(String);
let ctx;
/** Pixel width of text as Google renders it (approximation: Arial). */
function px(text, font) {
  ctx ||= document.createElement("canvas").getContext("2d");
  ctx.font = font;
  return Math.round(ctx.measureText(text || "").width);
}
function cut(text, font, max) {
  if (px(text, font) <= max) return text;
  let t = text;
  while (t.length && px(t + "…", font) > max) t = t.slice(0, -1);
  return t.replace(/\s+\S*$/, "") + " …";
}
const tag = (ok, good, bad) => `<span class="pill ${ok ? "ok" : "no"}">${ok ? good : bad}</span>`;

function serp(p) {
  const tFont = "20px Arial", dFont = "14px Arial";
  const title = p.title || "(no title)";
  const desc = p.description || p.firstPara || "(no meta description: Google will pick text from the page)";
  const tw = px(title, tFont);
  const u = new URL(p.url);
  const crumbs = [u.hostname.replace(/^www\./, ""), ...u.pathname.split("/").filter(Boolean)].join(" › ");
  return `<div class="tool"><h3>Google result preview</h3>
    <div class="serp"><div class="serp-site"><span class="fav">${esc(u.hostname[0]?.toUpperCase())}</span><span><b>${esc(p.og.siteName || u.hostname.replace(/^www\./, ""))}</b><br><span class="crumbtxt">${esc(crumbs)}</span></span></div>
    <div class="serp-title">${esc(cut(title, tFont, 600))}</div><div class="serp-desc">${esc(cut(desc, dFont, 920 * 1.0))}</div></div>
    <div class="facts">${tag(tw <= 600, `Title fits (${tw}px of 600)`, `Title cut off (${tw}px of 600)`)}${tag((p.description || "").length >= 70 && (p.description || "").length <= 160, `Description ${(p.description || "").length} chars`, p.description ? `Description ${(p.description || "").length} chars (aim 120–160)` : "No description")}</div></div>`;
}

function social(p) {
  const host = new URL(p.url).hostname.replace(/^www\./, "");
  return `<div class="tool"><h3>Share preview</h3><div class="card">${p.og.image ? `<img src="${esc(p.og.image)}" alt="" loading="lazy">` : `<div class="noimg">No og:image: shares show no picture</div>`}
    <div class="card-body"><span class="crumbtxt">${esc(host)}</span><b>${esc(p.og.title || p.title)}</b><span>${esc((p.og.description || p.description || "").slice(0, 120))}</span></div></div></div>`;
}

function outline(p) {
  let prev = 0;
  const rows = p.headings.slice(0, 60).map((h) => { const skip = h.level - prev > 1 && prev !== 0 || (prev === 0 && h.level > 2); prev = h.level;
    return `<li class="h${h.level}${skip ? " skip" : ""}${h.text ? "" : " empty"}"><span>H${h.level}</span>${esc(h.text || "(empty)")}${skip ? ' <em>skipped a level</em>' : ""}</li>`; }).join("");
  return `<div class="tool"><h3>Heading outline <small>${p.headings.length} headings</small></h3><ol class="outline">${rows || "<li>No headings</li>"}</ol></div>`;
}

function schema(p) {
  const list = p.jsonld.map((o, i) => `<details class="json"><summary>${esc(types(o).join(" / ") || "Untyped")}${o.name ? `: ${esc(String(o.name).slice(0, 40))}` : ""}</summary><pre>${esc(JSON.stringify(o, null, 2).slice(0, 4000))}</pre></details>`).join("");
  const enc = encodeURIComponent(p.url);
  return `<div class="tool"><h3>Structured data <small>${p.jsonld.length} item(s)${p.jsonldErrors.length ? `, ${p.jsonldErrors.length} broken` : ""}</small></h3>${list || "<p class='lede'>No JSON-LD on this page.</p>"}
    <div class="btns"><a class="btn" target="_blank" rel="noopener" href="https://search.google.com/test/rich-results?url=${enc}">Test in Google</a><a class="btn" target="_blank" rel="noopener" href="https://validator.schema.org/#url=${enc}">Validate at schema.org</a></div></div>`;
}

function crawlers(s) {
  const row = (b, kind) => `<tr><td>${esc(b)}</td><td>${kind}</td><td>${s.bots[b] ? '<span class="pill ok">allowed</span>' : '<span class="pill no">blocked</span>'}</td></tr>`;
  return `<div class="tool"><h3>Crawler access <small>robots.txt HTTP ${s.robotsStatus}</small></h3><table><tr><th>Crawler</th><th>Used for</th><th>This page</th></tr>
    ${SEARCH_BOTS.map((b) => row(b, "search")).join("")}${OTHER_BOTS.map((b) => row(b, "user fetch")).join("")}${TRAINING_BOTS.map((b) => row(b, "AI training")).join("")}</table>
    <p class="lede">Search and user-fetch crawlers decide whether you can be found and cited. Blocking training crawlers is a business choice and doesn't affect search.</p>
    <div class="facts">${tag(s.sitemapOk, "Sitemap found", "No sitemap")}${tag(s.robotsDeclaresSitemap, "Sitemap in robots.txt", "Sitemap not in robots.txt")}<span class="pill">${s.llmsTxt ? "llms.txt present" : "No llms.txt (optional)"}</span></div></div>`;
}

function linksTool(p) {
  const rows = p.links.slice(0, 120).map((l) => `<tr data-kind="${l.internal ? "int" : "ext"}${l.nofollow ? " nf" : ""}"><td>${l.internal ? "Internal" : "External"}${l.nofollow ? " · nofollow" : ""}</td><td class="wrap">${esc(l.text || "(no text)")}</td><td class="wrap"><a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.href.replace(/^https?:\/\//, "").slice(0, 60))}</a></td></tr>`).join("");
  return `<div class="tool"><h3>Links <small>${p.internalLinks} internal, ${p.externalLinks} external</small></h3>
    <div class="facts"><span class="pill">${p.extDomains.length} outside domains</span><span class="pill ${p.genericAnchors ? "no" : "ok"}">${p.genericAnchors} "click here" links</span><span class="pill ${p.nofollowInternal ? "no" : "ok"}">${p.nofollowInternal} nofollow internal</span></div>
    <div class="scroll"><table><tr><th>Type</th><th>Text</th><th>Goes to</th></tr>${rows}</table></div></div>`;
}

function imagesTool(p) {
  const rows = p.images.slice(0, 80).map((i) => `<tr><td><img class="thumb" src="${esc(i.src)}" alt="" loading="lazy"></td><td class="wrap">${i.alt === null ? '<span class="pill no">no alt</span>' : i.alt === "" ? '<span class="pill">decorative</span>' : esc(i.alt.slice(0, 80))}</td>
    <td>${i.modern ? "✓" : "–"}</td><td>${i.sized ? "✓" : "–"}</td><td>${i.lazy ? "lazy" : "eager"}</td></tr>`).join("");
  return `<div class="tool"><h3>Images <small>${p.images.length}</small></h3><div class="scroll"><table><tr><th></th><th>Alt text</th><th>Modern</th><th>Sized</th><th>Load</th></tr>${rows || "<tr><td colspan=5>No images</td></tr>"}</table></div></div>`;
}

function content(p, s) {
  const f = (label, value) => `<div><span>${label}</span><b>${value}</b></div>`;
  return `<div class="tool"><h3>Page facts</h3><div class="grid">
    ${f("Words", p.wordCount)}${f("Paragraphs", p.paraCount)}${f("Avg paragraph", p.paraAvg + " words")}${f("Reading ease", p.readingEase ?? "–")}
    ${f("Lists / tables", `${p.lists} / ${p.tables}`)}${f("Figures cited", p.statCount)}${f("Last dated", p.ageDays == null ? "–" : p.ageDays + " days ago")}${f("Platform", p.platform)}
    ${f("LCP (this visit)", p.lcpMs == null ? "–" : (p.lcpMs / 1000).toFixed(1) + "s")}${f("CLS", p.cls.toFixed(2))}${f("Server response", p.ttfbMs == null ? "–" : p.ttfbMs + " ms")}${f("Requests", p.requests)}
    ${f("DOM nodes", p.domNodes)}${f("HTML size", p.htmlKB + " KB")}${f("Third-party hosts", p.thirdParty.length)}${f("Raw HTML words", s.rawTextWords)}</div></div>`;
}

function quick(p) {
  const e = encodeURIComponent, u = new URL(p.url);
  const brand = p.jsonld.find((o) => o.name && /Organization|Business|Service|Store|Contractor/.test(types(o).join(" ")))?.name || p.og.siteName || u.hostname.replace(/^www\./, "");
  const links = [
    ["PageSpeed Insights (real-user speed)", `https://pagespeed.web.dev/analysis?url=${e(p.url)}`],
    ["Google: pages indexed (site:)", `https://www.google.com/search?q=${e("site:" + u.hostname)}`],
    ["Bing: pages indexed (site:)", `https://www.bing.com/search?q=${e("site:" + u.hostname)}`],
    ["Ask Perplexity about this business", `https://www.perplexity.ai/search?q=${e("What is " + brand + "? Who do they serve?")}`],
    ["Ask ChatGPT about this business", `https://chatgpt.com/?q=${e("What is " + brand + " (" + u.hostname + ")? Who do they serve?")}`],
    ["Apple Maps listing", `https://maps.apple.com/?q=${e(brand)}`],
    ["Google Business Profile search", `https://www.google.com/search?q=${e(brand)}`],
    ["robots.txt", `${p.origin}/robots.txt`],
  ];
  return `<div class="tool"><h3>Quick checks elsewhere</h3><div class="linkgrid">${links.map(([t, h]) => `<a target="_blank" rel="noopener" href="${esc(h)}">${esc(t)}</a>`).join("")}</div>
    <p class="lede">The AI-answer links show whether assistants already know the business. Answers vary from run to run; treat them as a spot check.</p></div>`;
}

export const TOOLS = [
  ["serp", "Search preview", (p) => serp(p) + social(p)],
  ["outline", "Headings", (p) => outline(p)],
  ["schema", "Schema", (p) => schema(p)],
  ["crawlers", "Crawlers", (p, s) => crawlers(s)],
  ["links", "Links", (p) => linksTool(p)],
  ["images", "Images", (p) => imagesTool(p)],
  ["facts", "Page facts", (p, s) => content(p, s)],
  ["quick", "Quick links", (p) => quick(p)],
];
