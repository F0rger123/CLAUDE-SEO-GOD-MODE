/**
 * Area scan: where a business shows up on Google Maps across the towns around it, and who it's up against.
 *  - Towns: its own town, the areas it serves, and the towns and cities around it (OpenStreetMap), across county and
 *    state lines, spread out so the map covers the area.
 *  - In each town, Google Maps is searched for "<what it does> <town>", the way a customer there would. Its position
 *    in that list (1–20) is recorded, with who ranks above it.
 *  - Competitors: every business in those lists in the same line of work (by its Google category), ranked by how often
 *    and how high it shows up. The top ones' websites are rated (Overall, SEO, AEO, GEO).
 * Maps results depend on the town searched, not on where the phone is, because the town is in the search.
 */
import { namesBusiness, distanceKm } from "./business.js";
import { sameDomain, terms } from "./compete.js";
import { geocode, placeOf } from "./map.js";

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
// Words a category shares with almost every other one: they don't make two businesses rivals.
const GENERIC = new Set("contractor contractors service services company store shop business agency center centre supplier dealer designer consultant professional office".split(" "));
const stem = (w) => w.slice(0, 5);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const originOf = (u) => { try { return new URL(u).origin; } catch { return null; } };

let TOWNS = null;
/** The US and Canadian towns list that ships with the app (towns.txt, from GeoNames): [{ name, state, lat, lng, pop }]. */
async function townList() {
  if (!TOWNS) {
    const text = await (await fetch(new URL("./towns.txt", import.meta.url))).text();
    TOWNS = text.split("\n").filter((l) => l && l[0] !== "#").map((l) => { const [name, state, lat, lng, pop] = l.split("|"); return { name, state, lat: +lat, lng: +lng, pop: +pop }; });
  }
  return TOWNS;
}

/**
 * Towns and cities within radiusKm of a place, biggest first: [{ name, state, lat, lng, km, pop }]. From the list that
 * ships with the app (US and Canada), so it needs no server; elsewhere, from OpenStreetMap.
 */
export async function townsAround(center, radiusKm = 45) {
  const near = (await townList().catch(() => [])).map((t) => ({ ...t, km: distanceKm(center, t) })).filter((t) => t.km <= radiusKm);
  if (near.length >= 3) return near.sort((a, b) => b.pop - a.pop);
  const q = `[out:json][timeout:25];(node["place"~"^(city|town)$"](around:${Math.round(radiusKm * 1000)},${center.lat},${center.lng}););out body 80;`;
  // The public servers turn away bursts: try the next one.
  let data = null, last = "";
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(30000) });
      if (res.ok) { data = await res.json(); break; }
      last = String(res.status);
    } catch (e) { last = String(e.message || e); }
  }
  if (!data) throw new Error(`Town lookup failed (${last})`);
  const { elements = [] } = data;
  return elements.filter((e) => e.tags?.name).map((e) => ({ name: e.tags.name, lat: e.lat, lng: e.lon, km: distanceKm(center, { lat: e.lat, lng: e.lon }),
    pop: +String(e.tags.population || "").replace(/\D/g, "") || (e.tags.place === "city" ? 50000 : 5000) }))
    .sort((a, b) => b.pop - a.pop);
}

/** Pick up to n places spread out over the area: each next one is the farthest from those already picked (bigger towns first on ties). */
export function spread(places, n, picked = []) {
  const out = [...picked], pool = places.filter((p) => !out.some((o) => distanceKm(o, p) < 6));
  while (out.length < n && pool.length) {
    let best = 0, bestD = -1;
    // Room around it counts up to 20 km; past that, the bigger town (more people searching) wins.
    pool.forEach((p, i) => { const d = Math.min(...out.map((o) => distanceKm(o, p)), 20) + 8 * Math.log10(p.pop || 1000); if (d > bestD) { bestD = d; best = i; } });
    const [p] = pool.splice(best, 1);
    out.push(p);
    for (let i = pool.length - 1; i >= 0; i--) if (distanceKm(p, pool[i]) < 6) pool.splice(i, 1);
  }
  return out;
}

/** Is a Maps entry this business? Its name, or its website. */
const isMe = (p, biz) => (p.website && biz.origin && sameDomain(p.website, biz.origin)) || namesBusiness(p.name, biz.name) || namesBusiness(biz.name, p.name);

/** Do two Google categories (or a category and what the business sells) name the same line of work? */
export function sameTrade(category, words) {
  const mine = terms(category || "").filter((w) => !GENERIC.has(w)).map(stem);
  return mine.some((w) => words.has(w));
}

/**
 * Run the area scan. searchMaps(q) returns readGoogle() of a Google Maps search (a list in .places, or one place in
 * .business). rate(origin) rates a website ({ scores }). Returns { t, keyword, home, towns, competitors, dropped }.
 */
export async function scanArea({ biz, keyword, searchMaps, rate = null, maxTowns = 10, radiusKm = 50, maxRated = 6, onProgress = () => {} }) {
  keyword = (keyword || biz.category || "").trim();
  if (!keyword) throw new Error("Add what the business does (for example: roofing contractor) first.");
  const base = (biz.locations || [])[0] || biz.city || "";
  if (!base) throw new Error("Add the town the business is in first.");
  onProgress(`Finding ${base} on the map…`);
  const home = await geocode(base);
  if (!home) throw new Error(`Couldn't find ${base} on the map. Write it as "Town, ST".`);
  const state = base.match(/,\s*([A-Z]{2})\b/)?.[1] || "";

  // The towns: home, the areas it serves, then the biggest towns around, spread out.
  onProgress("Finding the towns around you…");
  const served = [];
  for (const a of (biz.areas || []).filter((x) => !/county|region|state|^[A-Z]{2}$/i.test(x)).slice(0, 3)) {
    const g = await geocode(/,\s*[A-Z]{2}\b/.test(a) || !state ? a : `${a}, ${state}`).catch(() => null);
    if (g && distanceKm(home, g) <= radiusKm * 1.5) served.push({ name: a.split(",")[0].trim(), lat: g.lat, lng: g.lng, km: distanceKm(home, g), pop: 1e6, served: true });
  }
  const around = await townsAround(home, radiusKm).catch(() => []);
  const picked = spread(around, maxTowns, [{ name: base.split(",")[0].trim(), lat: home.lat, lng: home.lng, km: 0, pop: 1e7, home: true }, ...served]);
  // Each town's county and state, so a result across a line stands out.
  const towns = [];
  for (const t of picked) {
    const at = await placeOf(t.lat, t.lng).catch(() => null);
    const st = at?.state || t.state || state;
    towns.push({ ...t, km: Math.round(t.km), county: at?.county || null, state: st, label: `${t.name}${st ? `, ${st}` : ""}`, otherState: !!(state && st && st !== state) });
  }
  const homeCounty = towns[0]?.county;
  towns.forEach((t) => (t.otherCounty = !!(homeCounty && t.county && t.county !== homeCounty)));

  // Search each town on Google Maps.
  const seen = new Map();
  for (const [i, t] of towns.entries()) {
    const q = `${keyword} ${t.label}`;
    onProgress(`Searching Google Maps for “${q}” (${i + 1} of ${towns.length})…`);
    const r = await searchMaps(q).catch(() => null);
    const places = r?.places?.length ? r.places : r?.business ? [{ ...r.business, position: 1 }] : [];
    t.q = q; t.read = !!(r && !r.blocked && (r.places || r.business)); t.count = places.length;
    const mine = places.find((p) => isMe(p, biz));
    t.rank = mine ? mine.position : null;
    t.ahead = places.filter((p) => !isMe(p, biz) && (!mine || p.position < mine.position)).map((p) => p.name);
    for (const p of places) {
      if (isMe(p, biz)) continue;
      // The same business twice (with and without its website, or a second listing) counts once.
      const key = (p.website && hostOf(p.website)) || p.name.toLowerCase();
      const twin = seen.get(key) || [...seen.values()].find((x) => namesBusiness(x.name, p.name) || namesBusiness(p.name, x.name));
      if (twin && !p.website) { twin.hits.push({ town: t.label, pos: p.position }); continue; }
      if (twin && !twin.website) { seen.delete([...seen.entries()].find(([, v]) => v === twin)[0]); Object.assign(twin, { website: p.website, origin: originOf(p.website) }); twin.hits.push({ town: t.label, pos: p.position }); seen.set(key, twin); continue; }
      const c = seen.get(key) || { name: p.name, website: p.website || null, origin: p.website ? originOf(p.website) : null, category: p.category || null, rating: p.rating ?? null,
        reviews: p.reviews ?? null, lat: p.lat ?? null, lng: p.lng ?? null, address: p.address || null, hits: [] };
      c.hits.push({ town: t.label, pos: p.position });
      seen.set(key, c);
    }
  }

  // Same line of work: its Google category shares a word with what this business does or sells.
  const words = new Set([keyword, biz.category, ...(biz.services || [])].flatMap((x) => terms(x || "")).filter((w) => !GENERIC.has(w)).map(stem));
  let all = [...seen.values()];
  const dropped = [];
  // A shop or maker selling the same things isn't a rival for a business that does the work (and the other way round).
  const retail = (cat) => /\b(store|shop|manufacturer|supplier|supply|wholesaler|distributor|showroom|outlet)\b/i.test(cat || "");
  const trade = all.filter((c) => !c.category || (sameTrade(c.category, words) && retail(c.category) === retail(biz.category || keyword)));
  const a = (w) => (/^[aeiou]/i.test(w) ? "an " : "a ") + w;
  if (trade.length >= 3) for (const c of all) if (!trade.includes(c)) dropped.push({ name: c.name, why: `${a(c.category.toLowerCase())}, not the same line of work` });
  all = trade.length >= 3 ? trade : all;
  // Who ranks above you in each town: only businesses in your line of work.
  const rivalNames = new Set(all.map((c) => c.name));
  for (const t of towns) { t.above = (t.ahead || []).filter((n) => rivalNames.has(n)).slice(0, 3); delete t.ahead; }
  for (const c of all) {
    c.towns = c.hits.length;
    c.best = Math.min(...c.hits.map((h) => h.pos));
    c.score = c.hits.reduce((s, h) => s + (21 - h.pos), 0) + Math.log10((c.reviews || 0) + 1);
    c.km = c.lat != null ? Math.round(distanceKm(home, c)) : null;
  }
  all.sort((a, b) => b.score - a.score);

  // Rate the top competitors' websites.
  if (rate) {
    const toRate = all.filter((c) => c.origin && !sameDomain(c.origin, biz.origin || "")).slice(0, maxRated);
    for (const [i, c] of toRate.entries()) {
      onProgress(`Rating ${c.name}'s website (${i + 1} of ${toRate.length})…`);
      const r = await rate(c.origin).catch(() => null);
      if (r?.scores) { c.scores = { overall: r.scores.overall, seo: r.scores.seo, aeo: r.scores.aeo, geo: r.scores.geo }; c.rated = r; }
    }
  }
  return { t: new Date().toISOString(), keyword, home: { lat: home.lat, lng: home.lng, label: base }, towns, competitors: all.slice(0, 20), dropped };
}

/** Plain-English lines about where a business shows up, for the list under the map. */
export function areaSummary(a) {
  const read = a.towns.filter((t) => t.read), shown = read.filter((t) => t.rank);
  const top3 = shown.filter((t) => t.rank <= 3);
  const far = shown.filter((t) => t.otherState || t.otherCounty);
  return {
    headline: read.length ? `You show up in ${shown.length} of ${read.length} towns${top3.length ? `, top 3 in ${top3.length}` : ""}` : "Google Maps couldn't be read",
    far: far.map((t) => `${t.label}${t.otherState ? " (another state)" : t.county ? ` (${t.county})` : ""}: #${t.rank}`),
  };
}
