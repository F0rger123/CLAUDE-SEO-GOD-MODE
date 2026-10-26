// End-to-end test: loads the real extension in Chromium, scans a GOOD and a BAD local fixture site through the
// side panel UI, then fixes the bad site and checks the before/after proof.
//
//   npm i playwright && npx playwright install chromium
//   node extension/tests/e2e.mjs            (PLAYWRIGHT=<path to playwright> if it's installed elsewhere)
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const extSrc = path.resolve(here, "..");
const pwPath = process.env.PLAYWRIGHT;
const { chromium } = await import(pwPath ? pathToFileURL(path.join(pwPath, "index.mjs")).href : "playwright");

// ---- fixture sites
const words = "We repair and replace residential roofs across York County with licensed crews, written estimates and photo reports after every job. ".repeat(6);
const good = (base) => ({
  "/robots.txt": `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`,
  "/sitemap.xml": `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}/</loc></url></urlset>`,
  "/": `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Summit Ridge Roofing: Roof Repair &amp; Replacement, York PA</title>
<meta name="description" content="Roof repair and replacement in York, PA. Free inspections, written estimates and a ten-year workmanship warranty from a licensed local crew.">
<link rel="canonical" href="${base}/"><meta property="og:title" content="Summit Ridge Roofing"><meta property="og:description" content="Roofing in York, PA">
<meta property="og:image" content="${base}/og.webp"><meta name="author" content="Sam Ridge">
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "RoofingContractor", name: "Summit Ridge Roofing",
  url: `${base}/`, logo: `${base}/logo.png`, description: "Roofing contractor in York, PA.", telephone: "+1-717-555-0142", areaServed: ["York, PA"], sameAs: ["https://www.facebook.com/x", "https://www.linkedin.com/company/x", "https://maps.apple.com/?q=x"] })}</script>
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "How much does a roof replacement cost?", acceptedAnswer: { "@type": "Answer", text: "It depends." } }] })}</script>
</head><body><main><h1>Summit Ridge Roofing</h1>
<p>Summit Ridge Roofing is a roofing contractor in York, PA that repairs and replaces residential roofs for homeowners across York County, with free inspections, written estimates and a ten-year workmanship warranty.</p>
<nav><a href="/about/">About us</a> <a href="/contact/">Contact</a> <a href="/services/">Roof services</a></nav>
<p>Updated <time datetime="${new Date().toISOString().slice(0, 10)}">recently</time>. Over 15 years in business and 1,200 roofs replaced; read our 300 reviews.</p>
<h2>How much does a roof replacement cost?</h2><p>${words}</p><ul><li>Inspection</li><li>Written estimate</li><li>Installation</li></ul><h2>What areas do you serve?</h2><p>${words}</p>
<img src="/roof.webp" alt="New roof" width="800" height="600"><a href="tel:+17175550142">Call</a> <a href="https://www.energystar.gov/">Source</a></main></body></html>`,
});
const bad = {
  "/robots.txt": "User-agent: *\nAllow: /\n\nUser-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /\n",
  "/": `<html><head><script src="/a.js"></script><script src="/b.js"></script><script src="/c.js"></script><script src="/d.js"></script></head>
<body><h3>Welcome</h3><h1>Hi</h1><h1>Again</h1><img src="/x.png"><p>Small page.</p></body></html>`,
};
function serve(pagesFor) {
  const srv = http.createServer((req, res) => {
    const pages = pagesFor(`http://127.0.0.1:${srv.address().port}`);
    const p = req.url.split("?")[0];
    if (pages[p] == null) { res.writeHead(404, { "content-type": "text/html" }); return res.end("<h1>Not found</h1>"); }
    res.writeHead(200, { "content-type": p.endsWith(".txt") ? "text/plain" : p.endsWith(".xml") ? "application/xml" : "text/html" });
    res.end(pages[p]);
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ srv, base: `http://127.0.0.1:${srv.address().port}` })));
}

// ---- load the extension with host access pre-granted (test build only; the shipped manifest asks per site)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sgm-ext-"));
fs.cpSync(extSrc, path.join(tmp, "ext"), { recursive: true, filter: (s) => !s.includes(`${path.sep}tests`) });
const mf = JSON.parse(fs.readFileSync(path.join(tmp, "ext", "manifest.json"), "utf8"));
mf.host_permissions = ["http://127.0.0.1/*"];
fs.writeFileSync(path.join(tmp, "ext", "manifest.json"), JSON.stringify(mf));
const ctx = await chromium.launchPersistentContext(path.join(tmp, "profile"), {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${path.join(tmp, "ext")}`, `--load-extension=${path.join(tmp, "ext")}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker");
const extId = new URL(sw.url()).host;

async function scanVia(url) {
  const site = await ctx.newPage();
  await site.goto(url, { waitUntil: "load" });
  await site.waitForTimeout(300);
  const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u).id, url);
  const panel = await ctx.newPage();
  await panel.setViewportSize({ width: 420, height: 860 });
  await panel.goto(`chrome-extension://${extId}/sidepanel.html?tabId=${tabId}`);
  await panel.click("#scan");
  await panel.waitForSelector(".dial .n", { timeout: 30000 });
  const nums = [await panel.$eval(".dial .n", (e) => +e.textContent), ...(await panel.$$eval(".bar .num", (els) => els.map((e) => +e.textContent)))];
  return { panel, site, scores: { overall: nums[0], seo: nums[1], aeo: nums[2], geo: nums[3] } };
}

let state = "bad";
const { srv: s1, base: goodBase } = await serve((b) => good(b));
const { srv: s2, base: badBase } = await serve((b) => (state === "bad" ? bad : good(b)));

const g = await scanVia(goodBase + "/");
const b = await scanVia(badBase + "/");
console.log("good", g.scores, "bad", b.scores);
const gFails = await g.panel.$$eval("#tab-issues .issue", (els) => els.map((e) => e.querySelector(".name").textContent + " | " + e.querySelector(".sub").textContent));
console.log("good fails:", gFails);
for (const k of ["overall", "seo", "aeo", "geo"]) assert.ok(g.scores[k] > b.scores[k] + 15, `good beats bad on ${k}`);
assert.ok(g.scores.geo >= 85, "good GEO >= 85");

// issues and prompts
await b.panel.click('#tabs button[data-tab="issues"]');
const fixNames = await b.panel.$$eval("#tab-issues .issue .name", (els) => els.map((e) => e.textContent));
for (const want of ["Title tag 25–60 characters", "Exactly one H1", "AI search crawlers allowed", "Business/organization schema", "Says what it is ('X is…')", "Canonical tag present", "Lists or tables", "Links to About and Contact"]) assert.ok(fixNames.includes(want), `bad lists "${want}"`);
const prompt = await b.panel.$eval("#tab-prompt pre", (e) => e.textContent);
// tools render
for (const t of ["serp", "outline", "schema", "crawlers", "links", "images", "facts", "quick"]) {
  await b.panel.click('#tabs button[data-tab="tools"]'); await b.panel.click(`[data-tool="${t}"]`);
  assert.ok(await b.panel.$(".tool"), `tool ${t} renders`);
}
await g.panel.bringToFront(); await g.panel.click('#tabs button[data-tab="tools"]'); await g.panel.click('[data-tool="serp"]');
await g.panel.waitForTimeout(600);
await g.panel.evaluate(() => document.querySelector("#tab-tools").scrollIntoView());
await g.panel.screenshot({ path: path.join(here, "..", "..", "assets", "extension-tools.png") });
await b.panel.click('[data-tool="crawlers"]');
assert.match(await b.panel.$eval(".tool", (e) => e.textContent), /OAI-SearchBot\s*search\s*blocked/);
assert.match(prompt, /\[CONFIRM/); assert.match(prompt, /AI search crawlers allowed/); assert.match(prompt, /Cloudflare/);

// screenshot: Claude prompt tab
await b.panel.click('#tabs button[data-tab="prompt"]');
await b.panel.screenshot({ path: path.join(here, "..", "..", "assets", "extension-claude.png") });

// screenshot: overview
await b.panel.click('#tabs button[data-tab="overview"]');
await b.panel.waitForTimeout(1100);
await b.panel.screenshot({ path: path.join(here, "..", "..", "assets", "extension-overview.png") });
// screenshot: issues with the first one expanded
await b.panel.click('#tabs button[data-tab="issues"]');
await b.panel.click("#tab-issues .issue summary");
await b.panel.waitForTimeout(600);
await b.panel.screenshot({ path: path.join(here, "..", "..", "assets", "extension-fix.png") });

// before/after proof: set baseline, fix the site, rescan
await b.panel.click('#tabs button[data-tab="proof"]');
await b.panel.click("#setbase");
state = "good";
await b.site.reload({ waitUntil: "load" });
await b.panel.click("#scan");
await b.panel.waitForSelector("#download", { timeout: 30000 });
const proofText = await b.panel.$eval("#tab-proof", (e) => e.textContent);
assert.match(proofText, /fixed/);
const [download] = await Promise.all([b.panel.waitForEvent("download"), b.panel.click("#download")]);
const html = fs.readFileSync(await download.path(), "utf8");
assert.match(html, /proof/i); assert.match(html, /fixed/);
console.log("proof report:", download.suggestedFilename(), html.length, "bytes");
await b.panel.evaluate(() => window.scrollTo(0, 0));
await b.panel.screenshot({ path: path.join(here, "..", "..", "assets", "extension-proof.png") });

await ctx.close(); s1.close(); s2.close();
console.log("E2E OK");
