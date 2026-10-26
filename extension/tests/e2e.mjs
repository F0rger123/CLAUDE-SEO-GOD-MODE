// End-to-end test: loads the real extension in Chromium and scans a GOOD and a BAD local fixture site through the
// side panel UI, in both views (whole site and this page). It also checks that the whole-site rating matches the
// skill's own `python scripts/rate_site.py` score for score and check for check, then fixes the bad site and checks
// the before/after proof.
//
//   npm i playwright && npx playwright install chromium
//   node extension/tests/e2e.mjs            (PLAYWRIGHT=<path to playwright>, PYTHON=<python> if they're elsewhere)
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const extSrc = path.resolve(here, "..");
const repo = path.resolve(extSrc, "..");
const pwPath = process.env.PLAYWRIGHT;
const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const { chromium } = await import(pwPath ? pathToFileURL(path.join(pwPath, "index.mjs")).href : "playwright");

// ---- fixture sites
const words = "We repair and replace residential roofs across York County with licensed crews, written estimates and photo reports after every job. ".repeat(6);
const sub = (base, p, title, h1) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="description" content="Roof repair and replacement in York, PA. Free inspections, written estimates and a ten-year workmanship warranty.">
<link rel="canonical" href="${base}${p}"><meta property="og:title" content="${title}"><meta property="og:description" content="Roofing in York, PA">
<meta property="og:image" content="${base}/og.webp"><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Service", name: h1 })}</script></head>
<body><nav><a href="/">Home</a> <a href="/services/">Services</a> <a href="/about/">About</a> <a href="/contact/">Contact</a></nav><main><h1>${h1}</h1>
<p>Summit Ridge Roofing is a roofing contractor in York, PA that repairs and replaces residential roofs for homeowners across York County, with free inspections and written estimates.</p>
<h2>What does a roof inspection include?</h2><p>${words}</p><h2>How long does a replacement take?</h2><p>${words}</p>
<img src="/roof.webp" alt="New roof" width="800" height="600"><a href="tel:+17175550142">Call</a> <a href="https://www.energystar.gov/">Source</a></main></body></html>`;
const good = (base) => ({
  "/robots.txt": `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`,
  "/sitemap.xml": `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["/", "/services/", "/about/", "/contact/"].map((p) => `<url><loc>${base}${p}</loc></url>`).join("")}</urlset>`,
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
  "/services/": sub(base, "/services/", "Roof Replacement and Repair Services in York, PA", "Roof services"),
  "/about/": sub(base, "/about/", "About Summit Ridge Roofing, Licensed York Roofers", "About Summit Ridge Roofing"),
  "/contact/": sub(base, "/contact/", "Contact Summit Ridge Roofing for a Free Inspection", "Contact us"),
});
const bad = {
  "/robots.txt": "User-agent: *\nAllow: /\n\nUser-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /\n",
  "/": `<html><head><script src="/a.js"></script><script src="/b.js"></script><script src="/c.js"></script><script src="/d.js"></script></head>
<body><h3>Welcome</h3><h1>Hi</h1><h1>Again</h1><img src="/x.png"><p>Small page.</p><a href="/missing/">old page</a></body></html>`,
};
// The bad site's firewall also refuses OAI-SearchBot, so the user-agent probe has something to find.
function serve(pagesFor, { blockUA = () => false } = {}) {
  const srv = http.createServer((req, res) => {
    const pages = pagesFor(`http://127.0.0.1:${srv.address().port}`);
    const p = req.url.split("?")[0];
    if (blockUA() && /OAI-SearchBot/.test(req.headers["user-agent"] || "")) { res.writeHead(403, { "content-type": "text/html" }); return res.end("Forbidden"); }
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
mf.host_permissions = ["http://127.0.0.1/*", "https://127.0.0.1/*"];
fs.writeFileSync(path.join(tmp, "ext", "manifest.json"), JSON.stringify(mf));
const ctx = await chromium.launchPersistentContext(path.join(tmp, "profile"), {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${path.join(tmp, "ext")}`, `--load-extension=${path.join(tmp, "ext")}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker");
const extId = new URL(sw.url()).host;

async function scanVia(url, mode) {
  const site = await ctx.newPage();
  await site.goto(url, { waitUntil: "load" });
  await site.waitForTimeout(300);
  const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u).id, url);
  const panel = await ctx.newPage();
  panel.on("pageerror", (e) => console.log("panel error:", e.message));
  await panel.setViewportSize({ width: 420, height: 860 });
  await panel.goto(`chrome-extension://${extId}/sidepanel.html?tabId=${tabId}`);
  await panel.waitForTimeout(300);
  await panel.click(`#mode [data-mode="${mode}"]`);
  await panel.waitForTimeout(200);
  await panel.click("#scan");
  await panel.waitForSelector(".dial .n", { timeout: 60000 }).catch(async (e) => { console.log("notice:", await panel.$eval("#notice", (n) => n.textContent)); throw e; });
  await panel.waitForFunction(() => !document.querySelector("#say.typing") && document.querySelector("#say")?.textContent, null, { timeout: 15000 });
  const nums = [await panel.$eval(".dial .n", (e) => +e.dataset.n), ...(await panel.$$eval(".bar .num", (els) => els.map((e) => +e.dataset.n)))];
  return { panel, site, scores: { overall: nums[0], seo: nums[1], aeo: nums[2], geo: nums[3] }, summary: await panel.$eval("#say", (e) => e.textContent) };
}
const noClaude = async (panel, where) => {
  const text = await panel.evaluate(() => document.body.innerText);
  assert.doesNotMatch(text.replace(/Claude-SearchBot/g, ""), /Claude/, `no "Claude" wording in the ${where}`);
};

let state = "bad";
const { srv: s1, base: goodBase } = await serve((b) => good(b));
const { srv: s2, base: badBase } = await serve((b) => (state === "bad" ? bad : good(b)), { blockUA: () => state === "bad" });

// ================================================================ parity with the skill (rate_site.py)
const helper = await ctx.newPage();
await helper.goto(`chrome-extension://${extId}/sidepanel.html`);
for (const [label, base] of [["good", goodBase], ["bad", badBase]]) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "sgm-rate-"));
  // Async on purpose: the fixture servers run in this process and must keep answering while Python crawls them.
  await promisify(execFile)(python, [path.join(repo, "scripts", "rate_site.py"), base + "/", "--no-psi", "--delay", "0", "--out", out]);
  const py = JSON.parse(fs.readFileSync(path.join(out, "rating.json"), "utf8"));
  const js = await helper.evaluate(async (u) => (await import("./lib/siterate.js")).rateSite(u, { psi: false }), base + "/");
  const diffs = [];
  for (const k of ["overall", "seo", "aeo", "geo", "potential_after_top5"]) if (py.scores[k] !== js.scores[k]) diffs.push(`score ${k}: python ${py.scores[k]} vs extension ${js.scores[k]}`);
  assert.equal(js.checks.length, py.checks.length, `${label}: same number of checks`);
  for (const pc of py.checks) {
    const jc = js.checks.find((c) => c.name === pc.check);
    if (!jc) { diffs.push(`missing check: ${pc.check}`); continue; }
    const same = pc.ratio == null ? jc.ratio == null : jc.ratio != null && Math.abs(jc.ratio - pc.ratio) < 1e-6;
    if (!same) diffs.push(`${pc.check}: python ${pc.ratio} (${pc.detail}) vs extension ${jc.ratio} (${jc.detail})`);
    if (pc.check.startsWith("No CDN/WAF") && js.checks.find((c) => c.id === "site-waf").ratio == null) diffs.push("WAF probe could not set the user-agent");
  }
  assert.deepEqual(js.priority.slice(0, 5), py.top_fixes.slice(0, 5).map((t) => js.checks.find((c) => c.name === t.check).id), `${label}: same top fixes`);
  console.log(`parity ${label}:`, js.scores, diffs.length ? diffs : "identical");
  assert.equal(diffs.length, 0, `${label}: extension matches rate_site.py`);
}
await helper.close();

// ================================================================ whole-site view (the default)
const gs = await scanVia(goodBase + "/", "site");
const bs = await scanVia(badBase + "/", "site");
console.log("site good", gs.scores, "bad", bs.scores);
console.log("summary (bad):", bs.summary);
for (const k of ["overall", "seo", "aeo", "geo"]) assert.ok(gs.scores[k] > bs.scores[k] + 15, `site: good beats bad on ${k}`);
assert.match(bs.summary, /^This site /); assert.match(bs.summary, /Biggest wins: /); assert.match(bs.summary, /You should set up: .*allow AI search crawlers/);
assert.match(bs.summary, /fix prompt/); assert.match(gs.summary, /This site (looks great|looks good)/);
assert.equal(await bs.panel.$eval('#tabs [data-tab="prompt"]', (e) => e.textContent), "Fix prompt");
await noClaude(bs.panel, "site view");
await bs.panel.click('#tabs button[data-tab="issues"]');
const siteIssues = await bs.panel.$$eval("#tab-issues .issue .name", (els) => els.map((e) => e.textContent));
for (const want of ["Titles 25–60 chars and unique", "AI search crawlers allowed in robots.txt", "No CDN/WAF blocking of AI crawler user-agents", "Pages return 200"]) assert.ok(siteIssues.includes(want), `site lists "${want}"`);
await bs.panel.click('#tab-issues .issue[data-id="site-200"] summary');
assert.match(await bs.panel.$eval('#tab-issues .issue[data-id="site-200"] .pages', (e) => e.textContent), /\/missing\//);
await bs.panel.click('#tab-issues .issue[data-id="site-200"] [data-copy]');
await bs.panel.click('#tabs button[data-tab="prompt"]');
const sitePrompt = await bs.panel.$eval("#tab-prompt pre", (e) => e.textContent);
assert.match(sitePrompt, /whole site/); assert.match(sitePrompt, /Affected pages/); assert.match(sitePrompt, /User-agent: OAI-SearchBot\nAllow: \//);
assert.doesNotMatch(sitePrompt.replace(/Claude-SearchBot/g, ""), /Claude/);
await bs.panel.click('#tabs button[data-tab="overview"]');
await bs.panel.evaluate(() => window.scrollTo(0, 0));
await bs.panel.waitForTimeout(1900);
await bs.panel.screenshot({ path: path.join(repo, "assets", "extension-overview.png") });

// ================================================================ this-page view
const g = await scanVia(goodBase + "/", "page");
const b = await scanVia(badBase + "/", "page");
console.log("page good", g.scores, "bad", b.scores);
const gFails = await g.panel.$$eval("#tab-issues .issue", (els) => els.map((e) => e.querySelector(".name").textContent + " | " + e.querySelector(".sub").textContent));
console.log("good page fails:", gFails);
for (const k of ["overall", "seo", "aeo", "geo"]) assert.ok(g.scores[k] > b.scores[k] + 15, `page: good beats bad on ${k}`);
assert.ok(g.scores.geo >= 85, "good GEO >= 85");
assert.match(b.summary, /^This page /);
await noClaude(b.panel, "page view");

await b.panel.click('#tabs button[data-tab="issues"]');
const fixNames = await b.panel.$$eval("#tab-issues .issue .name", (els) => els.map((e) => e.textContent));
for (const want of ["Title tag 25–60 characters", "Exactly one H1", "AI search crawlers allowed", "Business/organization schema", "Says what it is ('X is…')", "Canonical tag present", "Lists or tables", "Links to About and Contact"]) assert.ok(fixNames.includes(want), `bad lists "${want}"`);
const prompt = await b.panel.$eval("#tab-prompt pre", (e) => e.textContent);
for (const t of ["serp", "outline", "schema", "crawlers", "links", "images", "facts", "quick"]) {
  await b.panel.click('#tabs button[data-tab="tools"]'); await b.panel.click(`[data-tool="${t}"]`);
  assert.ok(await b.panel.$(".tool"), `tool ${t} renders`);
}
await g.panel.bringToFront(); await g.panel.click('#tabs button[data-tab="tools"]'); await g.panel.click('[data-tool="serp"]');
await g.panel.waitForTimeout(600);
await g.panel.evaluate(() => document.querySelector("#tab-tools").scrollIntoView());
await g.panel.screenshot({ path: path.join(repo, "assets", "extension-tools.png") });
await b.panel.bringToFront();
await b.panel.click('[data-tool="crawlers"]');
assert.match(await b.panel.$eval(".tool", (e) => e.textContent), /OAI-SearchBot\s*search\s*blocked/);
assert.match(prompt, /\[CONFIRM/); assert.match(prompt, /AI search crawlers allowed/); assert.match(prompt, /Cloudflare/);

await b.panel.click('#tabs button[data-tab="prompt"]');
await b.panel.evaluate(() => document.querySelector("#tabs").scrollIntoView());
await b.panel.waitForTimeout(500);
await b.panel.screenshot({ path: path.join(repo, "assets", "extension-prompt.png") });
await b.panel.click('#tabs button[data-tab="issues"]');
await b.panel.click("#tab-issues .issue summary");
await b.panel.waitForTimeout(600);
await b.panel.screenshot({ path: path.join(repo, "assets", "extension-fix.png") });

// ================================================================ before/after proof (whole site)
await bs.panel.bringToFront();
await bs.panel.click('#tabs button[data-tab="proof"]');
await bs.panel.click("#setbase");
state = "good";
await bs.site.reload({ waitUntil: "load" });
await bs.panel.click("#scan");
await bs.panel.waitForSelector("#download", { timeout: 60000 });
const proofText = await bs.panel.$eval("#tab-proof", (e) => e.textContent);
assert.match(proofText, /fixed/);
const [download] = await Promise.all([bs.panel.waitForEvent("download"), bs.panel.click("#download")]);
const html = fs.readFileSync(await download.path(), "utf8");
assert.match(html, /proof/i); assert.match(html, /fixed/); assert.match(html, /whole site/);
console.log("proof report:", download.suggestedFilename(), html.length, "bytes");
await bs.panel.evaluate(() => window.scrollTo(0, 0));
await bs.panel.screenshot({ path: path.join(repo, "assets", "extension-proof.png") });

await ctx.close(); s1.close(); s2.close();
console.log("E2E OK");
