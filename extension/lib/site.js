/**
 * Site-level facts fetched from the side panel (needs host permission for the origin).
 * robots.txt matching follows Google's rules: most specific user-agent group, longest matching path wins,
 * Allow wins ties, '*' and '$' wildcards. Mirrors scripts/common.py Robots.
 */
export const SEARCH_BOTS = ["Googlebot", "Bingbot", "OAI-SearchBot", "PerplexityBot", "Claude-SearchBot"];

export function parseRobots(text) {
  const groups = [];
  let agents = [], rules = [], lastWasAgent = false;
  for (const raw of (text || "").split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase(), val = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (!lastWasAgent && (agents.length || rules.length)) { groups.push([agents, rules]); agents = []; rules = []; }
      agents.push(val.toLowerCase()); lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      lastWasAgent = false;
      if (val || key === "allow") rules.push([key === "allow", val]);
    } else lastWasAgent = false;
  }
  if (agents.length) groups.push([agents, rules]);
  return groups;
}

function rulesFor(groups, agent) {
  const a = agent.toLowerCase();
  let bestLen = -1, star = null;
  for (const [agents, rules] of groups) for (const g of agents) {
    if (g === "*") star = (star || []).concat(rules);
    else if (a.startsWith(g) && g.length > bestLen) bestLen = g.length;
  }
  if (bestLen < 0) return star || [];
  return groups.filter(([agents]) => agents.some((g) => g !== "*" && a.startsWith(g) && g.length === bestLen)).flatMap(([, r]) => r);
}

export function robotsAllows(groups, agent, url) {
  const u = new URL(url);
  const path = (u.pathname || "/") + u.search;
  let best = -1, allowed = true;
  for (const [allow, pattern] of rulesFor(groups, agent)) {
    const re = new RegExp("^" + pattern.split("").map((c, i) =>
      c === "*" ? ".*" : c === "$" && i === pattern.length - 1 ? "$" : c.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(""));
    if (re.test(path) && (pattern.length > best || (pattern.length === best && allow))) { best = pattern.length; allowed = allow; }
  }
  return allowed;
}

async function get(url, opts = {}) {
  try {
    const r = await fetch(url, { cache: "no-store", credentials: "omit", ...opts });
    return { status: r.status, type: r.type, redirected: r.redirected, url: r.url, headers: r.headers,
             text: opts.method === "HEAD" || r.type === "opaqueredirect" ? "" : await r.text() };
  } catch (e) { return { status: null, error: String(e.message || e) }; }
}

const htmlText = (html) => (new DOMParser().parseFromString(html || "", "text/html").body?.textContent || "")
  .replace(/\s+/g, " ").trim();

export async function collectSiteFacts(pageUrl) {
  const page = new URL(pageUrl);
  const origin = page.origin;
  const [robots, raw, llms, bogus] = await Promise.all([
    get(origin + "/robots.txt"),
    get(pageUrl),
    get(origin + "/llms.txt", { method: "HEAD" }),
    get(origin + "/zz-" + Math.random().toString(36).slice(2, 9) + "-not-a-page"),
  ]);
  const groups = robots.status === 200 ? parseRobots(robots.text) : robots.status >= 400 && robots.status < 500 ? [] : [[["*"], [[false, "/"]]]];
  const bots = Object.fromEntries(SEARCH_BOTS.map((b) => [b, robotsAllows(groups, b, pageUrl)]));
  const sitemaps = robots.status === 200 ? [...robots.text.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]) : [];
  const smUrl = sitemaps[0] || origin + "/sitemap.xml";
  const sm = await get(smUrl, { method: "GET" });
  let httpVariant = null;
  if (page.protocol === "https:") {
    const v = await get("http://" + page.host + "/", { redirect: "manual" });
    httpVariant = v.status === null ? "unreachable" : v.type === "opaqueredirect" || (v.status >= 300 && v.status < 400) ? "redirects" : "serves-content";
  }
  return {
    robotsStatus: robots.status, bots, sitemapUrl: smUrl, sitemapOk: sm.status === 200 && /<(urlset|sitemapindex)/i.test(sm.text || ""),
    rawStatus: raw.status, xRobotsTag: raw.headers?.get("x-robots-tag") || "", rawTextWords: htmlText(raw.text).split(" ").filter(Boolean).length,
    llmsTxt: llms.status === 200, soft404Status: bogus.status, httpVariant,
  };
}
