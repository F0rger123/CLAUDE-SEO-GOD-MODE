/**
 * Business audit: the whole business, not just the website. Shared by the extension and the Android app; each passes
 * in how it searches Google (a background tab, or a window on the phone) and how it rates a website.
 *  - Website: the usual SEO/AEO/GEO rating.
 *  - Google Business Profile: found by searching the business's name and town, then audited (compete.js).
 *  - Listings: is it on Yelp, Bing, Apple Maps, BBB, Nextdoor, Facebook and the directories for its trade? Checked
 *    by searching Google for the business on each site (directories.json). "Not found" means Google didn't show a
 *    listing for that search, which usually means there isn't one, so each comes with steps to check and claim it.
 *  - Consistent details: the same phone and address on the website, its schema, the profile and the listings; hours set.
 *  - Reviews: rating and review count against the businesses in the map pack.
 *  - Competitors: the businesses ranking for "<what you do> <town>", rated the same way, with the services they list
 *    that this site doesn't.
 * The Business Score weighs those five parts. A part that couldn't be checked is left out, never guessed.
 */
import { auditBusiness, DIRECTORIES as DIRECTORY_HOSTS, detectTargets, fetchPage, sameDomain, terms } from "./compete.js";
import { parseJsonld, parsePage, schemaTypes } from "./pyparse.js";
import { geocode } from "./map.js";

export const PARTS = {
  website: { label: "Website", weight: 35 },
  profile: { label: "Google Business Profile", weight: 25 },
  listings: { label: "Listings", weight: 20 },
  consistency: { label: "Consistent details", weight: 10 },
  reviews: { label: "Reviews", weight: 10 },
};

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
let directories = null;
/** The directory list (directories.json): general ones for every business, plus ones for specific trades. */
export async function loadDirectories() {
  directories = directories || (await fetch(new URL("./directories.json", import.meta.url)).then((r) => r.json()));
  return directories;
}
/** Directories that apply to a business: the general ones, plus trade ones whose keywords match what it does. */
export function directoriesFor(dirs, category = "") {
  const what = String(category).toLowerCase();
  return dirs.filter((d) => !d.trades?.length || d.trades.some((t) => what.includes(t)));
}

// ---------------------------------------------------------------- reading
export const normPhone = (s) => { const d = String(s || "").replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : null; };
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
export const phonesIn = (text) => [...new Set((String(text || "").match(PHONE) || []).map(normPhone).filter(Boolean))];
const fmtPhone = (p) => (p ? `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}` : "");
/** Does this text name the business? Most of the name's distinctive words have to be there. */
// Words that many businesses in a trade share: they don't tell two businesses apart.
const COMMON = new Set(("roof roofing roofer roofers construction contracting contractor contractors builders building light lights lighting led installer installers " +
  "installation installs electric electrical electricians electrician plumbing plumber plumbers heating cooling hvac air services service company co llc inc ltd corp group " +
  "solutions home homes pro pros remodeling remodel cleaning cleaners landscaping lawn painting painters outdoor permanent holiday christmas design studio shop store " +
  "repair repairs pest control windows doors siding gutters gutter fence fencing decks concrete paving garage glass auto care dental law insurance realty properties").split(" "));
export function namesBusiness(text, name) {
  const all = terms(name).filter((w) => w.length > 2), distinct = all.filter((w) => !COMMON.has(w));
  // Only the distinctive words count ("Summit Ridge Roofing" is "summit ridge"); a name of only common words must appear whole.
  const want = distinct.length ? distinct : all;
  // A name with one distinctive word ("Hi Roofing") must appear whole, or every roofer would match.
  const flat = (s) => ` ${String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  if (want.length <= 1) return flat(text).includes(flat(name));
  const have = new Set(terms(text));
  return want.filter((w) => have.has(w)).length / want.length >= 0.6;
}
const streetNo = (a) => (String(a || "").match(/\b\d{2,6}\b/) || [null])[0];
const zip = (a) => (String(a || "").match(/\b\d{5}\b(?!.*\b\d{5}\b)/) || [null])[0];

/** The Google searches an audit makes. Listings are checked a few sites per search, to keep the searches few. */
export function auditSearches(biz, dirs) {
  const q = (s) => s.replace(/\s+/g, " ").trim();
  const locs = locationsOf(biz), home = locs[0] || "";
  const out = [{ kind: "profile", q: q(`${biz.name} ${home}`) }];
  // Competitors: what you do in the places you work (your base and the towns you serve, up to 4), and your main
  // services in your main market (the first town you serve, else your base).
  const towns = marketsOf(biz), market = towns[0] || home;
  const seen = new Set();
  const rival = (what, where, label) => { const s = q(`${what} ${where}`); if (what && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push({ kind: "rivals", q: s, label }); } };
  for (const loc of [...new Set([...towns, ...locs])].slice(0, 4).concat(locs.length || towns.length ? [] : [""])) rival(biz.category, loc, loc || "your area");
  for (const svc of (biz.services || []).filter((s) => !terms(s).every((w) => terms(biz.category || "").includes(w))).slice(0, 2)) rival(svc, market, svc);
  const searchable = dirs.filter((d) => d.domain);
  for (let i = 0; i < searchable.length; i += 4) {
    const group = searchable.slice(i, i + 4);
    out.push({ kind: "listings", ids: group.map((d) => d.id), q: q(`"${biz.name}" ${home} (${group.map((d) => `site:${d.domain}`).join(" OR ")})`) });
  }
  return out;
}

/** Listing results from one Google search: listed (with the page and any phone in its snippet) or not found. */
export function readListings(serp, group, biz) {
  return group.map((d) => {
    const hit = (serp?.organic || []).find((o) => (hostOf(o.url) === d.domain || hostOf(o.url).endsWith("." + d.domain)) && namesMe(`${o.title} ${o.snippet}`, biz));
    return { id: d.id, status: serp ? (hit ? "listed" : "missing") : "unknown", url: hit?.url || null, phones: hit ? phonesIn(hit.snippet) : [] };
  });
}

// Sites that rank for local searches but aren't competing businesses: government, schools, news, tourism, wikis.
const NOT_BUSINESS = /(\.gov|\.edu|\.mil)$|(^|\.)(township|borough|county|cityof|chamber|visit[a-z]*|tourism|news|times|gazette|patch|wikipedia|wikihow|reddit|quora)[a-z]*\./i;
/**
 * Competitors from a "<what you do> <town>" search: ranking websites whose title or snippet mentions what the
 * business does (directories, councils, news and tourism sites left out). words: the trade's and services' words.
 */
export function competitorsFrom(serp, myOrigin, max = 4, words = []) {
  const sites = [];
  // Product pages ("$23.00", "In stock") are shops' listings, not competing local businesses.
  const relevant = (o) => !/\$\s?\d|in stock|add to cart/i.test(`${o.title} ${o.snippet}`) && !/\b(tips|guide|how to|blog|faq|help center|support|tutorial|diy)\b/i.test(o.title) && (!words.length || terms(`${o.title} ${o.snippet}`).some((w) => words.includes(w)));
  for (const o of serp?.organic || []) {
    let origin; try { origin = new URL(o.url).origin; } catch { continue; }
    if (DIRECTORY_HOSTS.test(hostOf(o.url)) || NOT_BUSINESS.test(hostOf(o.url)) || sameDomain(origin, myOrigin) || sites.some((s) => s.origin === origin) || !relevant(o)) continue;
    sites.push({ origin, name: o.title.split(/\s[|–—-]\s|\s\||:\s/)[0].trim() || hostOf(origin), title: o.title, position: o.position });
  }
  return { sites: sites.slice(0, max), mapPack: (serp?.local || []).slice(0, 6) };
}

/** The real address behind a Google redirect link (a map pack business's Website button): follow it once. */
export async function resolveLink(url) {
  if (!url || !/google\.[a-z.]+\/(goto|url)/.test(url)) return url || null;
  try { const r = await fetch(url, { signal: AbortSignal.timeout(12000) }); return /google\./.test(hostOf(r.url)) ? null : r.url; } catch { return null; }
}
/** Straight-line distance between two places, in km. */
export function distanceKm(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(() => res(null), ms))]);

// ---------------------------------------------------------------- scoring
const ratio = (xs) => { const k = xs.filter((x) => x != null); return k.length ? k.filter(Boolean).length / k.length : null; };

/** Same phone and address everywhere the business shows up; hours set on the profile and the website. */
export function consistencyChecks({ site = {}, profile = null, listings = [] }) {
  const phones = [
    ["Website", site.phone ? normPhone(site.phone) : null],
    ["Google Business Profile", profile?.phone ? normPhone(profile.phone) : null],
    ...listings.filter((l) => l.id !== "google" && l.status === "listed" && l.phones.length).map((l) => [l.name, l.phones[0]]),
  ].filter(([, p]) => p);
  const distinct = [...new Set(phones.map(([, p]) => p))];
  const out = [];
  if (phones.length >= 2) out.push({ id: "phone-match", label: "Same phone number everywhere", ok: distinct.length === 1,
    detail: phones.map(([w, p]) => `${w}: ${fmtPhone(p)}`).join(" · ") });
  if (site.address && profile?.address) {
    const same = (streetNo(site.address) ?? "") === (streetNo(profile.address) ?? "") && (zip(site.address) ?? zip(profile.address)) === (zip(profile.address) ?? zip(site.address));
    out.push({ id: "address-match", label: "Same address on the website and the profile", ok: same, detail: `Website: ${site.address} · Profile: ${profile.address}` });
  }
  out.push({ id: "site-hours", label: "Hours on the website's business schema", ok: site.hours == null ? null : !!site.hours, detail: site.hours ? "openingHours in schema" : "Not in the site's schema" });
  if (site.phone == null) out.push({ id: "site-phone", label: "Phone number in the website's business schema", ok: false, detail: "No telephone in the site's schema" });
  return out;
}

/** The Business Score: the parts that could be checked, weighted. */
export function businessScore(parts) {
  const known = Object.entries(parts).filter(([, v]) => v != null);
  if (!known.length) return null;
  const w = known.reduce((a, [k]) => a + PARTS[k].weight, 0);
  return Math.round(known.reduce((a, [k, v]) => a + v * PARTS[k].weight, 0) / w);
}

/**
 * The profiles a business's own website links to (schema sameAs and hasMap, and links on the homepage), and every
 * name it goes by (schema name and alternateName). These are checked directly: the most reliable evidence there is.
 */
export async function siteProfiles(origin) {
  const home = await fetchPage(origin + "/");
  if (home.status !== 200) return { links: [], maps: null, names: [] };
  const p = parsePage(home.html), items = parseJsonld(p.jsonld).items;
  const links = new Set(), names = new Set();
  let maps = null;
  for (const i of items) {
    for (const u of [].concat(i.sameAs || [], i.hasMap || [], i.url || [])) if (typeof u === "string" && /^https?:/.test(u)) links.add(u);
    if (typeof i.hasMap === "string") maps = i.hasMap;
    for (const n of [].concat(i.name || [], i.alternateName || [])) if (typeof n === "string" && n.trim() && schemaTypes(i).some((t) => !["WebSite", "WebPage", "FAQPage", "Question", "Answer", "ImageObject", "BreadcrumbList"].includes(t))) names.add(n.trim());
  }
  for (const m of home.html.matchAll(/href=["'](https?:\/\/[^"'#]+)["']/gi)) if (/(yelp|bbb|facebook|nextdoor|instagram|linkedin|houzz|angi|thumbtack|porch|bark|buildzoom|homeguide|yellowpages|manta|hotfrog|foursquare|alignable|maps\.google|google\.[a-z.]+\/maps|g\.page|maps\.app\.goo\.gl|bing\.com\/maps|maps\.apple)/i.test(m[1])) links.add(m[1]);
  if (!maps) maps = [...links].find((u) => /maps\.google|google\.[a-z.]+\/maps|g\.page|maps\.app\.goo\.gl/i.test(u)) || null;
  return { links: [...links], maps, names: [...names] };
}
/** Whether text names this business, under any of its names. */
/** "York's Jolly Light Installers" and yorksjollylights.com: the same business, by a long shared start of letters. */
const squash = (s) => String(s || "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\.[a-z.]+$/, "").replace(/[^a-z0-9]/g, "");
export function sameBusiness(a, b) {
  const x = squash(a), y = squash(b);
  if (!x || !y) return false;
  let n = 0; while (n < x.length && x[n] === y[n]) n++;
  return n >= 10 || (Math.min(x.length, y.length) >= 6 && (x.includes(y) || y.includes(x)));
}
export const namesMe = (text, biz) => [biz.name, ...(biz.altNames || [])].filter(Boolean).some((n) => namesBusiness(text, n));

/** Open a profile page and confirm it's up and names the business (some sites block apps: then it's "linked"). */
async function verifyProfile(url, biz) {
  try {
    const r = await withTimeout(fetch(url, { signal: AbortSignal.timeout(12000) }), 14000);
    if (!r) return "linked";
    if (r.status === 404 || r.status === 410) return "broken";
    if (!r.ok) return "linked";
    const html = await r.text();
    return namesMe(html.slice(0, 400000), biz) ? "verified" : "linked";
  } catch { return "linked"; }
}

// ---------------------------------------------------------------- the audit
/**
 * Run a business audit.
 *  biz: { name, city, category, origin }. scan: the site's newest whole-site scan (for its score, schema facts and pages).
 *  search(queries): [{ q, serp }] in the same order (null serp if a page couldn't be read).
 *  rate(origin): a rateSite result for a competitor's website (or null to skip rating competitors).
 */
export async function runBusinessAudit({ biz, scan, websiteScore = null, search, searchProfile = null, rate, ownBusinesses = [], onProgress = () => {} }) {
  // Your other businesses and clients aren't this one's competitors.
  const isOwn = (name, origin) => ownBusinesses.some((o) => (origin && o.origin && sameDomain(origin, o.origin)) || [o.name, o.origin].some((x) => x && (namesBusiness(name, x) || sameBusiness(name, x))));
  // The Google profile first (on Google Maps when the caller can, where the full profile shows): it also tells
  // what the business does when that wasn't filled in.
  biz = { ...biz };
  onProgress("Reading the profiles your website links to…");
  const own = await siteProfiles(biz.origin).catch(() => ({ links: [], maps: null, names: [] }));
  // The site's other names count as yours only when they resemble the name given or the web address.
  biz.altNames = [...new Set([...(biz.altNames || []), ...own.names])].filter((n) => n !== biz.name && (namesBusiness(n, biz.name) || namesBusiness(biz.name, n) || sameBusiness(n, biz.name) || sameBusiness(n, biz.origin)));
  const profileQ = auditSearches(biz, [])[0].q;
  onProgress(`Looking up ${biz.name} on Google…`);
  // Your own Google Maps link opens exactly your profile; a name search can land on someone else's.
  let profileSerp = own.maps && searchProfile ? await searchProfile(own.maps).catch(() => null) : null;
  if (!profileSerp?.business || !namesMe(profileSerp.business.name, biz))
    profileSerp = searchProfile ? await searchProfile(profileQ).catch(() => null) : (await search([profileQ]))[0]?.serp || null;
  const packMe = (profileSerp?.local || []).find((m) => namesMe(m.name, biz));
  const foundPanel = profileSerp?.business && namesMe(profileSerp.business.name, biz) ? profileSerp.business : null;
  // No full panel, but the business is in the map pack: that's its profile, with what the map pack shows.
  const panel = foundPanel || (packMe ? { name: packMe.name, rating: packMe.rating, reviews: packMe.reviews, category: packMe.category, address: packMe.address, website: null, claimed: null, hasHours: null } : null);
  if (!biz.category && panel?.category) biz.category = panel.category.toLowerCase();

  const dirs = directoriesFor(await loadDirectories(), biz.category);
  // Listings your website links to are opened and checked directly; Google is searched only for the rest.
  const linked = new Map();
  for (const u of own.links) { const h = hostOf(u); const d = dirs.find((x) => x.domain && (h === x.domain || h.endsWith("." + x.domain))); if (d && !linked.has(d.id)) linked.set(d.id, u); }
  const plan = auditSearches(biz, dirs.filter((d) => !linked.has(d.id))).filter((p) => p.kind === "listings");
  onProgress(`Searching Google ${plan.length} more times: competitors and listings…`);
  const got = await search(plan.map((p) => p.q));
  plan.unshift({ kind: "profile", q: profileQ }); got.unshift({ q: profileQ, serp: profileSerp });
  const serpOf = (kind) => got[plan.findIndex((p) => p.kind === kind)]?.serp || null;
  let profile = panel ? auditBusiness(panel, { keyword: biz.category || "", mySite: biz.origin, local: profileSerp?.local || [] }) : null;

  // Listings
  const listings = [];
  plan.forEach((p, i) => { if (p.kind === "listings") listings.push(...readListings(got[i]?.serp, p.ids.map((id) => dirs.find((d) => d.id === id)), biz)); });
  for (const [id, url] of linked) {
    onProgress(`Checking your ${dirs.find((d) => d.id === id).name} page…`);
    const v = await verifyProfile(url, biz);
    listings.push({ id, status: v === "broken" ? "missing" : "listed", url, phones: [], source: v === "verified" ? "Linked from your website · page checked" : v === "broken" ? "Your website links to it, but the page is gone" : "Linked from your website" });
  }
  for (const l of listings) if (l.status === "listed" && !l.source) l.source = "Found on Google";
  for (const d of dirs.filter((x) => !x.domain)) listings.push({ id: d.id, status: "unknown", url: null, phones: [] });
  const q = encodeURIComponent(`${biz.name} ${locationsOf(biz)[0] || ""}`.trim());
  for (const l of listings) Object.assign(l, (({ name, signup, check, steps, core, why, note }) => ({ name, signup, check: check?.replace("{q}", q) || null, steps, core: !!core, why, note }))(dirs.find((d) => d.id === l.id)));
  if (panel || own.maps) listings.unshift({ id: "google", name: "Google Business Profile", core: true, status: "listed", url: own.maps || null, phones: panel?.phone ? phonesIn(panel.phone) : [],
    source: foundPanel ? (own.maps ? "Your Google Maps link · profile read" : "Found on Google") : own.maps ? "Linked from your website" : "In the map pack" });

  // Consistency, from the site's own schema and what was found
  const ent = scan?.entity || {};
  const site = { phone: ent.phone ?? null, address: ent.address ?? null, hours: ent.hours ?? null };
  const consistency = consistencyChecks({ site, profile: panel, listings });

  // Competitors
  onProgress("Rating competitors' websites…");
  // Competitors: the careful finder (several searches, map pack first, every website checked, distance).
  const fc = await findCompetitors({ biz, search, searchProfile, ownBusinesses, onProgress, maxLookups: 4 });
  const mapPack = fc.mapPack, searches = fc.searches;
  if (fc.category && !biz.category) biz.category = fc.category;
  const found = { sites: fc.list.slice(0, 5).map((c) => ({ ...c, fromPack: c.inPack, packAddress: c.address, seenIn: c.hits })), mapPack };
  const mine = await detectTargets(biz.origin + "/").catch(() => null);
  const myPhrases = [...new Set([...(biz.services || []), ...(mine?.services || []).map((s) => s.phrase)])].slice(0, 16);
  const myServices = new Set(myPhrases.flatMap((ph) => terms(ph)));
  // Against the map pack the finder saw: reviews compared with the businesses really competing.
  if (panel && mapPack.length) profile = auditBusiness(panel, { keyword: biz.category || "", mySite: biz.origin, local: mapPack });
  const competitors = [], dropped = [...fc.dropped];
  for (const c of found.sites) {
    onProgress(`Rating ${c.origin ? hostOf(c.origin) : c.name}…`);
    // A slow or huge site shouldn't hold up the audit: each gets a few minutes at most.
    const r = rate && c.origin ? await withTimeout(rate(c.origin).catch(() => null), 150000) : null;
    const t = c.origin ? await withTimeout(detectTargets(c.origin + "/").catch(() => null), 45000) : null;
    const services = (t?.services || []).map((s) => s.phrase).slice(0, 14);
    const offers = services.filter((ph) => terms(ph).some((w) => !myServices.has(w))).slice(0, 6);
    const pack = found.mapPack.find((m) => namesBusiness(m.name, c.name) || namesBusiness(c.name, m.name)) || null;
    // Double-check it's a business like this one: in the map pack, or its site states an address, a phone or services.
    if (c.origin && !c.fromPack && !pack && !r?.entity?.address && !r?.entity?.phone && services.length < 2) {
      dropped.push({ name: c.name, origin: c.origin, why: t?.error || r == null ? "its website couldn't be read" : "its website doesn't look like a local business (no address, phone or services)" });
      continue;
    }
    competitors.push({ ...c, scores: r?.scores ? { overall: r.scores.overall, seo: r.scores.seo, aeo: r.scores.aeo, geo: r.scores.geo } : null, offers, services,
      pages: r?.pages_rated ?? null, entity: r?.entity || null, pack });
  }

  // Where everyone is, for the map: coordinates from each site's schema, else its address looked up on OpenStreetMap.
  onProgress("Placing everyone on the map…");
  const locate = async (e) => (e?.lat != null ? { lat: e.lat, lng: e.lng } : e?.address ? await geocode(e.address).catch(() => null) : null);
  const firstLoc = locationsOf(biz)[0];
  const myPack = mapPack.find((x) => namesMe(x.name, biz));
  const place = (await locate(ent)) || (panel?.address ? await geocode(panel.address).catch(() => null) : null) || (myPack?.address ? await geocode(myPack.address).catch(() => null) : null)
    || (firstLoc ? { ...(await geocode(firstLoc).catch(() => null)), approx: true } : null);
  for (const c of competitors) c.place = c.place || (await locate(c.entity)) || (c.packAddress ? await geocode(c.packAddress).catch(() => null) : null);
  if (place && !place.approx) for (const c of [...competitors]) {
    const km = c.place ? distanceKm(place, c.place) : null;
    if (km != null && km > 120 && !c.fromPack) { competitors.splice(competitors.indexOf(c), 1); dropped.push({ name: c.name, origin: c.origin, why: `it's ${Math.round(km)} km away` }); }
    else c.km = km == null ? null : Math.round(km);
  }

  // Double-check listings Google didn't show: search each important one again, a different way (no quotes or town).
  const recheck = listings.filter((l) => l.status === "missing" && l.core).slice(0, 4);
  if (recheck.length) {
    onProgress(`Double-checking ${recheck.length} listing${recheck.length === 1 ? "" : "s"}…`);
    const again = await search(recheck.map((l) => `${biz.name} site:${dirs.find((d) => d.id === l.id).domain}`)).catch(() => []);
    recheck.forEach((l, i) => {
      const [res] = readListings(again[i]?.serp, [dirs.find((d) => d.id === l.id)], biz);
      l.checked = 2;
      if (res.status === "listed") Object.assign(l, { status: "listed", url: res.url, phones: res.phones, foundOnSecondLook: true });
    });
  }

  // Parts and score
  const core = listings.filter((l) => l.status !== "unknown");
  const listingScore = core.length ? core.reduce((a, l) => a + (l.status === "listed" ? (l.core ? 3 : 1) : 0), 0) / core.reduce((a, l) => a + (l.core ? 3 : 1), 0) : null;
  const rv = profile?.checks.filter((c) => c.id === "rating" || c.id === "reviews").map((c) => c.ok);
  const parts = {
    website: websiteScore ?? scan?.scores?.overall ?? null,
    // Searched, but Google showed no profile for the name and town: counted as missing.
    profile: profile ? profile.score : profileSerp ? 0 : null,
    listings: listingScore == null ? null : Math.round(100 * listingScore),
    consistency: ratio(consistency.map((c) => c.ok)) == null ? null : Math.round(100 * ratio(consistency.map((c) => c.ok))),
    reviews: rv && ratio(rv) != null ? Math.round(100 * ratio(rv)) : null,
  };
  // Found first, then the important ones still missing, then the rest.
  const rank = (l) => (l.status === "listed" ? 0 : l.status === "missing" ? (l.core ? 1 : 2) : 3);
  listings.sort((a, b) => rank(a) - rank(b) || (b.core ? 1 : 0) - (a.core ? 1 : 0));
  const report = { t: new Date().toISOString(), biz, parts, score: businessScore(parts), profile, profileQuery: plan[0].q, listings, consistency, competitors,
    mapPack: found.mapPack, searches, searched: plan.length + recheck.length, unread: got.filter((g) => !g.serp).length,
    verified: { listingsRechecked: recheck.length, foundOnSecondLook: recheck.filter((l) => l.foundOnSecondLook).length, dropped, profileFrom: foundPanel ? (searchProfile ? "Google Maps" : "Google's business panel") : panel ? "the map pack" : null },
    me: { services: myPhrases, place: place?.lat != null ? place : null, scores: scan?.scores ? { overall: websiteScore ?? scan.scores.overall, seo: scan.scores.seo, aeo: scan.scores.aeo, geo: scan.scores.geo } : null,
      rating: panel?.rating ?? packMe?.rating ?? null, reviews: panel?.reviews ?? packMe?.reviews ?? null, pages: scan?.pagesRated ?? null,
      bestPack: searches.filter((s) => s.minePack).sort((a, b) => a.minePack - b.minePack)[0] || null,
      bestOrganic: searches.filter((s) => s.mine).sort((a, b) => a.mine - b.mine)[0] || null } };
  report.issues = issuesFrom(report);
  report.levers = levers(report);
  return report;
}

// ---------------------------------------------------------------- what to do, step by step
/** Each problem found, biggest first, with the steps to fix it. */
export function issuesFrom(r) {
  const out = [];
  const add = (part, title, why, steps, link = null, size = 1) => out.push({ part, title, why, steps, link, size });
  if (!r.profile && r.parts.profile === 0) add("profile", "No Google Business Profile found", `Google showed no business profile when searching "${r.profileQuery}". Without one you can't appear in the map pack, where most local customers pick a business.`,
    ["Go to business.google.com and sign in with the Google account the business will own.", `Search for "${r.biz.name}". If it's there, choose Claim; if not, choose Add your business.`,
      "Pick the primary category that matches your main service exactly.", "Add your phone, website, service area (or address if customers visit you) and hours.",
      "Verify the profile when Google asks (video, phone or postcard). It shows up after verification."], "https://business.google.com", 5);
  for (const c of r.profile?.checks || []) if (c.ok === false) add("profile", c.label, c.detail, [c.fix], "https://business.google.com", c.weight);
  for (const l of r.listings) if (l.status === "missing") add("listings", `Not listed on ${l.name}`, l.why || `Google didn't show a ${l.name} listing for ${r.biz.name}.`,
    l.steps?.length ? l.steps : [`Open ${l.signup} and search for your business.`, "Claim it if it exists, or add it. Use exactly the same name, phone and address as your website.", "Add your website, hours, photos and a short description."], l.signup, l.core ? 3 : 1);
  for (const l of r.listings) if (l.status === "unknown" && l.check) add("listings", `Check ${l.name}`, `${l.name} can't be checked from a Google search. Look it up there.`, l.steps?.length ? l.steps : [`Open ${l.check} and search for your business.`], l.check, l.core ? 2 : 1);
  for (const c of r.consistency) if (c.ok === false) add("consistency", c.label, c.detail, ({
    "phone-match": ["Pick one main phone number.", "Change it on every listing that shows a different one (the ones above), and on the website.", "Update the website's LocalBusiness schema telephone to match."],
    "address-match": ["Pick the exact address format the post office uses.", "Use it on the website, its schema and the Google profile (Edit profile › Location)."],
    "site-hours": ["Add openingHoursSpecification to the website's LocalBusiness schema, matching the Google profile.", "Show the hours on the contact page too."],
    "site-phone": ["Add telephone to the website's LocalBusiness schema, in the same format as on Google."],
  })[c.id] || [], null, 2);
  for (const c of r.competitors) if (c.offers.length) add("website", `${c.name} lists services you don't`, `Their site has pages or headings for: ${c.offers.join(", ")}.`,
    ["If you offer these, give each its own page: what it is, the area you serve, prices or a range, photos, and a call to action.", "Link each new page from your homepage and services page.", "If you don't offer them, ignore this."], null, 1);
  return out.sort((a, b) => b.size - a.size);
}

// ---------------------------------------------------------------- the plan: the few things that would move the most
const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

/** Services: who offers what. Rows are services (yours and theirs, similar names merged); cells say who lists each. */
export function serviceMatrix(r) {
  const key = (ph) => terms(ph).sort().join(" ");
  const close = (a, b) => { const A = new Set(terms(a)), B = new Set(terms(b)); const both = [...A].filter((w) => B.has(w)).length; return both / Math.max(1, Math.min(A.size, B.size)) >= 0.75; };
  const rows = [];
  const addRow = (ph, who) => { if (!key(ph)) return; let row = rows.find((x) => close(x.name, ph)); if (!row) rows.push((row = { name: ph, who: new Set() })); row.who.add(who); };
  (r.me?.services || []).forEach((ph) => addRow(ph, "me"));
  r.competitors.forEach((c) => (c.services || []).forEach((ph) => addRow(ph, c.origin)));
  const list = rows.map((x) => ({ name: x.name, me: x.who.has("me"), rivals: r.competitors.filter((c) => x.who.has(c.origin)).map((c) => c.origin) }));
  return {
    only: list.filter((x) => x.me && !x.rivals.length),
    shared: list.filter((x) => x.me && x.rivals.length).sort((a, b) => b.rivals.length - a.rivals.length),
    gaps: list.filter((x) => !x.me && x.rivals.length).sort((a, b) => b.rivals.length - a.rivals.length),
  };
}

/**
 * The biggest levers, in order, each with why (from this audit's own numbers) and the steps. impact: 3 biggest, 2 big, 1 helps.
 * Nothing here is a promise of rankings; it's where the gaps against these competitors are largest.
 */
export function levers(r) {
  const out = [];
  const add = (id, impact, title, detail, steps, link = null) => out.push({ id, impact, title, detail, steps, link });
  const peers = (r.mapPack || []).filter((m) => !namesMe(m.name, r.biz) && m.reviews != null);
  const peerReviews = median(peers.map((m) => m.reviews)), most = peers.reduce((a, m) => Math.max(a, m.reviews), 0);
  const myReviews = r.me?.reviews;
  if (!r.profile && r.parts.profile === 0) add("profile", 3, "Get on Google Maps", "Google showed no business profile for you, so you can't appear in the map pack at all. This comes before everything else.",
    ["Create or claim your profile at business.google.com.", "Pick the primary category that matches your main service.", "Add phone, website, hours and service area, then verify."], "https://business.google.com");
  if (myReviews != null && peerReviews && myReviews < peerReviews) {
    const big = myReviews < peerReviews / 2;
    add("reviews", big ? 3 : 2, "Get more Google reviews", `You have ${myReviews} reviews; ${peers.length === 1 ? `the other business in the map pack has ${most}` : `the other businesses in the map pack have ${peerReviews} (typical) and up to ${most}`}. Review count is one of the strongest signals for who shows in the map pack, and it's what customers compare first.`,
      ["Text every finished customer a direct review link (Google profile › Ask for reviews gives you one).", `Aim to close the gap to ${peerReviews} steadily: a few every week beats a burst.`, "Reply to every review, good and bad, within a day or two.", "Never buy, filter or reward reviews: Google removes them and can suspend the profile."]);
  }
  if (r.me?.rating != null && r.me.rating < 4.5) add("rating", 2, "Lift your star rating", `You're at ${r.me.rating} stars${peers.length ? `; the map pack averages ${(peers.reduce((a, m) => a + (m.rating || 0), 0) / peers.length).toFixed(1)}` : ""}. Many customers filter to 4.5+.`,
    ["Answer every low review calmly and offer to fix the problem.", "Ask happy repeat customers for reviews to balance older bad ones."]);
  const unclaimed = r.profile?.checks.find((c) => c.id === "claimed" && c.ok === false);
  if (unclaimed) add("claim", 3, "Claim your Google profile", "Google shows \"Claim this business\": anyone can suggest edits to it and it ranks worse until you own it.", [unclaimed.fix], "https://business.google.com");
  const missingCore = r.listings.filter((l) => l.status === "missing" && l.core);
  if (missingCore.length) add("listings", missingCore.length >= 3 ? 2 : 1, `Get listed on ${missingCore.length} important site${missingCore.length === 1 ? "" : "s"}`, `Not found on ${missingCore.map((l) => l.name).join(", ")}. These pages rank for your name, feed Apple Maps, Bing and AI assistants, and are all free.`,
    ["Open the Listings tab and press Add free on each.", "Use exactly the same name, phone and address as Google."]);
  const best = r.competitors.filter((c) => c.scores).sort((a, b) => b.scores.overall - a.scores.overall)[0];
  const mine = r.parts.website;
  if (best && mine != null && best.scores.overall > mine) add("website", best.scores.overall - mine >= 15 ? 2 : 1, "Improve your website", `Your site scores ${mine}; ${best.name} scores ${best.scores.overall}. The site rating lists what to fix first, by points gained.`,
    ["Open Overview and copy the fix prompt.", "Fix the top items, then scan again to confirm."]);
  const m = serviceMatrix(r);
  if (m.gaps.length) add("services", m.gaps.length >= 3 ? 2 : 1, "Add pages for services you offer that you don't show", `Competitors have pages for ${m.gaps.slice(0, 4).map((x) => x.name).join(", ")}${m.gaps.length > 4 ? ` and ${m.gaps.length - 4} more` : ""}. If you do these, a page for each lets you rank for them.`,
    ["For each service you actually offer: one page with what it is, where you do it, a price range, photos and a call to action.", "Link each from your homepage and services page."]);
  if (m.only.length) add("unique", 1, "Lead with what only you offer", `None of these competitors lists ${m.only.slice(0, 4).map((x) => x.name).join(", ")}. That's where you face the least competition.`,
    ["Put these services on your homepage and Google profile (services and posts).", "Add them to your Google profile's secondary categories if one fits."]);
  const phone = r.consistency.find((c) => c.id === "phone-match" && c.ok === false);
  if (phone) add("nap", 2, "Use one phone number everywhere", `Different numbers show up: ${phone.detail}. Mismatches split your identity across Google, maps and directories.`,
    ["Pick one main number.", "Change it on every listing and on your website and its schema."]);
  return out.sort((a, b) => b.impact - a.impact);
}

// ---------------------------------------------------------------- what the business is, filled in for you
/** The towns a business serves (areas that are towns, not counties or states), in order. */
export function marketsOf(biz) {
  const state = (locationsOf(biz)[0] || "").match(/,\s*([A-Z]{2})\b/)?.[1] || "";
  return (biz.areas || []).filter((a) => !/county|township|state|region|area|pennsylvania|maryland|virginia|^[A-Z]{2}$/i.test(a) && a.split(/\s+/).length <= 3)
    .map((a) => (/,\s*[A-Z]{2}\b/.test(a) || !state ? a : `${a}, ${state}`)).slice(0, 3);
}
/** The places a business works, oldest field (city) included. */
export const locationsOf = (biz) => [...new Set([...(biz.locations || []), biz.city].filter((x) => x && String(x).trim()).map((x) => String(x).trim()))];

const GENERIC_TYPES = new Set(["Organization", "LocalBusiness", "ProfessionalService", "HomeAndConstructionBusiness", "Corporation", "Store", "WebSite", "WebPage", "Thing", "Place", "CreativeWork", "Brand", "OnlineBusiness", "Service"]);
// A schema type that names a trade: "RoofingContractor", "HVACBusiness", "Electrician", "BeautySalon".
const TRADE_TYPE = /(Contractor|Business|Store|Shop|Service|Agency|Restaurant|Dentist|Clinic|Electrician|Plumber|Locksmith|Roofing|Company|Office|Center|Studio|Salon|Firm|Attorney|Physician|Bakery|Cafe|Bar|Hotel|Dealer|Repair)$/;
const typeWords = (t) => String(t).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
const cityOf = (a) => {
  if (!a) return null;
  if (typeof a === "object") return [a.addressLocality, a.addressRegion].filter((x) => typeof x === "string" && x.trim()).join(", ") || null;
  // "1 Main St, York, PA 17401" -> "York, PA"
  const parts = String(a).split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1].replace(/\b\d{5}(-\d{4})?\b/, "").trim(), prev = parts[parts.length - 2];
  return /^[A-Z]{2}$/.test(last) ? `${prev}, ${last}` : parts.length >= 3 ? `${parts[parts.length - 2]}, ${last}` : null;
};
const flatPlace = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const names = (v) => [].concat(v || []).map((x) => (typeof x === "string" ? x : x?.name || x?.address?.addressLocality)).filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());

/**
 * Fill in a business's details from its own website: name, what it does (its schema type, or its main service),
 * every address it lists, the areas it serves, its services and its phone. Each comes back with where it was found.
 */
export async function detectBusiness(origin) {
  const home = await fetchPage(origin + "/");
  if (home.status !== 200) throw new Error(`Couldn't read ${origin} (${home.status ?? home.error})`);
  const p = parsePage(home.html);
  const items = parseJsonld(p.jsonld).items;
  const ents = items.filter((i) => schemaTypes(i).some((t) => !["WebSite", "WebPage", "BreadcrumbList", "FAQPage", "ImageObject", "Person", "Review", "Offer", "Product"].includes(t)) && (i.name || i.address));
  const ent = ents.find((i) => i.address) || ents[0] || null;
  const t = await detectTargets(origin + "/").catch(() => null);
  const specific = ents.flatMap((e) => schemaTypes(e)).find((x) => !GENERIC_TYPES.has(x) && TRADE_TYPE.test(x));
  // Or the service the homepage title leads with ("Govee Installer & Permanent Outdoor Lights in York, PA").
  const stem = (w) => w.slice(0, 5), titleStems = new Set(terms(p.title || "").map(stem));
  const services = [...new Set([...items.filter((i) => schemaTypes(i).includes("Service")).map((i) => i.name || i.serviceType).filter(Boolean),
    ...names(ent?.makesOffer?.map?.((o) => o.itemOffered) || []), ...(t?.services || []).map((s) => s.phrase)])]
    // Headings like "3 steps" or "Accessories" aren't services: keep 2–5 word phrases without numbers.
    .filter((s) => !/\d/.test(s) && terms(s).length >= 1 && s.split(/\s+/).length >= 2 && s.split(/\s+/).length <= 5).slice(0, 12);
  const locations = [...new Set(ents.map((e) => cityOf(Array.isArray(e.address) ? e.address[0] : e.address)).filter(Boolean))];
  const areas = [...new Set([...ents.flatMap((e) => names(e.areaServed)), ...(t?.places || []).map((x) => (typeof x === "string" ? x : x.place || x.name)).filter(Boolean)])]
    .filter((a) => !locations.some((l) => flatPlace(l).startsWith(flatPlace(a)))).slice(0, 10);
  const name = (typeof ent?.name === "string" && ent.name) || p.og?.["og:site_name"] || (p.title || "").split(/\s[|–—-]\s/).pop().trim() || null;
  const tel = [].concat(ent?.telephone || [])[0] || null;
  const titled = services.find((s) => terms(s).length >= 2 && terms(s).every((w) => titleStems.has(stem(w)))) || null;
  return {
    name, category: specific ? typeWords(specific) : titled || null, locations, areas, services, phone: typeof tel === "string" ? tel : null,
    from: { name: ent?.name ? "your schema" : "your page title", category: specific ? "your schema type" : titled ? "your homepage title" : null, locations: locations.length ? "your schema address" : null },
  };
}

/** What Google's business panel says about a name (and town): category, address, phone. search(qs) as in runBusinessAudit. */
export async function lookupOnGoogle(biz, search) {
  const q = `${biz.name} ${locationsOf(biz)[0] || ""}`.trim();
  const [hit] = await search([q]);
  const pack = (hit?.serp?.local || []).find((m) => namesBusiness(m.name, biz.name));
  const b = hit?.serp?.business && namesBusiness(hit.serp.business.name, biz.name) ? hit.serp.business : pack;
  if (!b) return null;
  return { name: b.name, category: b.category ? b.category.toLowerCase() : null, locations: [cityOf(b.address)].filter(Boolean), phone: b.phone || null, website: b.website || null };
}

/** Merge found details into what's there: typed values win; lists are combined. */
export function mergeBiz(have, found) {
  if (!found) return have;
  const list = (a, b) => { const seen = new Set(); return [...(a || []), ...(b || [])].map((x) => String(x).trim()).filter((x) => x && !seen.has(flatPlace(x)) && seen.add(flatPlace(x))); };
  return { ...have, name: have.name || found.name || "", category: have.category || found.category || "", locations: list(locationsOf(have), found.locations), areas: list(have.areas, found.areas),
    services: list(have.services, found.services).slice(0, 16), phone: have.phone || found.phone || null };
}

// ---------------------------------------------------------------- finding competitors, carefully
/** Does this website look like a local business in this trade? Reads its homepage once. */
export async function checkCompetitor(origin, words) {
  const home = await fetchPage(origin + "/", 15000);
  if (home.status !== 200) return { ok: false, why: `its website didn't open (${home.status ?? home.error})` };
  const p = parsePage(home.html), items = parseJsonld(p.jsonld).items;
  const text = `${p.title} ${p.meta?.description || ""} ${(p.text || "").slice(0, 12000)}`.toLowerCase();
  const ent = items.find((i) => schemaTypes(i).some((x) => /Business|Contractor|Service|Store|Organization|Electrician|Plumber|Roofing|Company/.test(x)));
  const local = !!ent?.address || !!ent?.telephone || /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(text);
  const trade = !words.length || words.some((w) => text.includes(w));
  if (!trade) return { ok: false, why: "its website doesn't mention what you do" };
  if (!local) return { ok: false, why: "no local business details (phone or address) on its website" };
  const a = Array.isArray(ent?.address) ? ent.address[0] : ent?.address;
  const address = typeof a === "string" ? a : a && typeof a === "object" ? [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter((x) => typeof x === "string").join(", ") : null;
  return { ok: true, name: typeof ent?.name === "string" ? ent.name : null, address: address || null };
}

/**
 * Find a business's real competitors, carefully: search what it does in each place it works and its main services,
 * take the map pack's businesses first, look each one up for its website, address and reviews, check every website
 * is a local business in the same trade, leave out far-away ones and your own businesses, then rank them by how
 * often and how high they show up. Each comes with the reasons. Takes a few minutes.
 *  search(qs) and searchProfile(q) as in runBusinessAudit. ownBusinesses: [{ origin, name }] to leave out.
 */
export async function findCompetitors({ biz, search, searchProfile = null, ownBusinesses = [], mePlace = null, maxLookups = 5, maxKm = 80, onProgress = () => {} }) {
  biz = { ...biz };
  const isOwn = (name, origin) => ownBusinesses.some((o) => (origin && o.origin && sameDomain(origin, o.origin)) || [o.name, o.origin].some((x) => x && (namesBusiness(name, x) || sameBusiness(name, x))));
  const isMe = (name, origin) => namesMe(name, biz) || sameBusiness(name, biz.origin) || (origin && sameDomain(origin, biz.origin));
  const home = locationsOf(biz)[0] || "";
  if (!biz.category) {
    onProgress(`Finding what ${biz.name} does on Google…`);
    const g = await lookupOnGoogle(biz, async (qs) => [{ q: qs[0], serp: searchProfile ? await searchProfile(qs[0]).catch(() => null) : (await search(qs).catch(() => []))[0]?.serp }]).catch(() => null);
    if (g?.category) biz.category = g.category;
  }
  const runs = auditSearches(biz, []).filter((p) => p.kind === "rivals");
  if (!runs.length) return { list: [], dropped: [], mapPack: [], searches: [], category: null, error: "Add what the business does (for example: roofing contractor) to find its competitors." };
  onProgress(`Searching Google ${runs.length} times: ${runs.map((r) => `“${r.q}”`).join(", ")}…`);
  const got = await search(runs.map((r) => r.q));
  const words = [...new Set([biz.category, ...(biz.services || [])].flatMap((x) => terms(x || "")).filter((w) => w.length > 3))];
  const brandWords = words.filter((w) => !COMMON.has(w));
  const state = (locationsOf(biz)[0] || "").match(/,\s*([A-Z]{2})\b/)?.[1] || "";
  const countyOf = (title) => { const m = String(title || "").match(/\bin\s+([A-Z][A-Za-z .'-]+ County)\b/); return m ? `${m[1]}${state ? `, ${state}` : ""}` : null; };

  // Everyone who shows up, merged across searches (by website, or by name for map pack entries).
  const cands = [], searches = [];
  const find = (name, origin) => cands.find((c) => (origin && c.origin && sameDomain(origin, c.origin)) || namesBusiness(c.name, name) || namesBusiness(name, c.name) || sameBusiness(c.name, name));
  const add = (name, origin, hit, extra = {}) => {
    if (isMe(name, origin) || isOwn(name, origin)) return;
    let c = find(name, origin);
    if (!c) cands.push((c = { name, origin: origin || null, hits: [], rating: null, reviews: null, address: null, website: null, category: null }));
    if (origin && !c.origin) c.origin = origin;
    for (const [k, v] of Object.entries(extra)) if (v != null && c[k] == null) c[k] = v;
    c.hits.push(hit);
  };
  runs.forEach((p, i) => {
    const serp = got[i]?.serp;
    const f = competitorsFrom(serp, biz.origin, 8, words);
    (serp?.local || []).forEach((m, k) => add(m.name, null, { q: p.q, where: "pack", pos: k + 1 }, { rating: m.rating, reviews: m.reviews, address: m.address, website: m.website, category: m.category }));
    f.sites.forEach((s) => add(s.name, s.origin, { q: p.q, where: "results", pos: s.position }, { titleTown: (s.title || s.name).match(/\bin\s+([A-Z][A-Za-z .'-]+,\s*[A-Z]{2})\b/)?.[1] || countyOf(s.title) }));
    const me = (serp?.organic || []).find((o) => sameDomain(o.url, biz.origin));
    const packAt = (serp?.local || []).findIndex((m) => namesMe(m.name, biz)) + 1;
    searches.push({ q: p.q, label: p.label, read: !!serp, mine: me ? me.position : null, minePack: packAt || null,
      top: f.sites.filter((s) => !isOwn(s.name, s.origin)).slice(0, 5).map((s) => ({ origin: s.origin, name: s.name, position: s.position })),
      pack: (serp?.local || []).map((m) => m.name).filter((n) => !namesMe(n, biz) && !isOwn(n)) });
  });

  // Map pack businesses: look each up for its website, address and reviews.
  let lookups = 0;
  for (const c of cands.filter((x) => x.hits.some((h) => h.where === "pack"))) {
    if ((c.origin && c.address) || lookups >= maxLookups) continue;
    lookups++;
    onProgress(`Looking up ${c.name} (${lookups} of ${Math.min(maxLookups, cands.filter((x) => x.hits.some((h) => h.where === "pack")).length)})…`);
    const q = `${c.name} ${home}`.trim();
    const s = searchProfile ? await searchProfile(q).catch(() => null) : (await search([q]).catch(() => []))[0]?.serp;
    const b = s?.business && (namesBusiness(s.business.name, c.name) || namesBusiness(c.name, s.business.name)) ? s.business : null;
    if (b) { c.website = c.website || b.website || null; c.address = c.address || b.address || null; c.reviews = c.reviews ?? b.reviews ?? null; c.rating = c.rating ?? b.rating ?? null; c.category = c.category || b.category || null; }
    const site = c.origin ? null : await resolveLink(c.website);
    if (site) { try { c.origin = new URL(site).origin; } catch {} }
  }
  // The same business found twice (by name in the map pack, by website in the results) counts once.
  for (let i = cands.length - 1; i >= 0; i--) { const c = cands[i]; const twin = c.origin && cands.find((x, j) => j < i && x.origin && sameDomain(x.origin, c.origin)); if (twin) { twin.hits.push(...c.hits); for (const k of ["rating", "reviews", "address", "category"]) twin[k] = twin[k] ?? c[k]; cands.splice(i, 1); } }

  // Check every website, and how far away each business is.
  const dropped = [];
  const me = mePlace || (home ? await geocode(home).catch(() => null) : null);
  for (const c of [...cands]) {
    if (c.origin && (DIRECTORY_HOSTS.test(hostOf(c.origin)) || NOT_BUSINESS.test(hostOf(c.origin)) || isOwn(c.name, c.origin) || sameDomain(c.origin, biz.origin))) { cands.splice(cands.indexOf(c), 1); continue; }
    // The brand you install or sell ("govee installation" and govee.com) is a maker, not a local competitor.
    const label = c.origin ? hostOf(c.origin).split(".").slice(-2, -1)[0] : "";
    if (label && brandWords.includes(label)) { dropped.push({ name: c.name, origin: c.origin, why: `it's ${label}'s own website (the brand), not a local business` }); cands.splice(cands.indexOf(c), 1); continue; }
    if (c.origin) {
      onProgress(`Checking ${hostOf(c.origin)}…`);
      const chk = await withTimeout(checkCompetitor(c.origin, words).catch((e) => ({ ok: false, why: String(e.message || e) })), 25000) || { ok: false, why: "its website was too slow to check" };
      // Map pack businesses are real local businesses already; a website that doesn't mention the trade still counts there.
      if (!chk.ok && !c.hits.some((h) => h.where === "pack")) { dropped.push({ name: c.name, origin: c.origin, why: chk.why }); cands.splice(cands.indexOf(c), 1); continue; }
      c.address = c.address || chk.address || null;
    }
    // No address: the town a result names in its title ("… in Hellertown, PA") is where it's aimed.
    const titled = !c.address && c.titleTown;
    if (me && (c.address || titled)) {
      const at = await geocode(c.address || titled).catch(() => null);
      if (at) { c.place = at; c.km = Math.round(distanceKm(me, at)); }
      if (c.km != null && c.km > maxKm) { dropped.push({ name: c.name, origin: c.origin, why: `it's ${c.km} km away` }); cands.splice(cands.indexOf(c), 1); continue; }
    }
  }

  // Rank: the map pack counts most, then how often and how high they show up, then reviews.
  for (const c of cands) {
    const pack = c.hits.filter((h) => h.where === "pack"), res = c.hits.filter((h) => h.where === "results");
    c.packPos = pack.length ? Math.min(...pack.map((h) => h.pos)) : null;
    c.position = res.length ? Math.min(...res.map((h) => h.pos)) : null;
    c.inPack = !!pack.length;
    c.score = pack.length * 3 + (c.packPos ? 4 - Math.min(c.packPos, 3) : 0) + res.length + (c.position ? (11 - Math.min(c.position, 10)) / 10 : 0) + (c.reviews ? Math.log10(c.reviews + 1) : 0);
    const best = (hs) => hs.sort((a, b) => a.pos - b.pos)[0];
    c.why = [pack.length ? `Map pack #${best(pack).pos} for “${best(pack).q}”${pack.length > 1 ? ` and ${pack.length - 1} more search${pack.length > 2 ? "es" : ""}` : ""}` : "",
      res.length ? `Result #${best(res).pos} for “${best(res).q}”${res.length > 1 ? ` and ${res.length - 1} more` : ""}` : "",
      c.reviews != null ? `${c.reviews} Google reviews${c.rating ? ` · ${c.rating}★` : ""}` : "", c.km != null ? `${c.km} km away` : ""].filter(Boolean);
  }
  cands.sort((a, b) => b.score - a.score);
  const mapPack = cands.filter((c) => c.inPack).sort((a, b) => a.packPos - b.packPos).map((c) => ({ name: c.name, rating: c.rating, reviews: c.reviews, address: c.address, category: c.category, website: c.origin }));
  return { list: cands, dropped, mapPack, searches, category: biz.category, me };
}
