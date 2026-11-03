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
import { auditBusiness, DIRECTORIES as DIRECTORY_HOSTS, detectTargets, sameDomain, terms } from "./compete.js";
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
export function namesBusiness(text, name) {
  const want = terms(name).filter((w) => w.length > 2);
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
  const out = [{ kind: "profile", q: q(`${biz.name} ${biz.city || ""}`) }];
  if (biz.category) out.push({ kind: "rivals", q: q(`${biz.category} ${biz.city || ""}`) });
  const searchable = dirs.filter((d) => d.domain);
  for (let i = 0; i < searchable.length; i += 4) {
    const group = searchable.slice(i, i + 4);
    out.push({ kind: "listings", ids: group.map((d) => d.id), q: q(`"${biz.name}" ${biz.city || ""} (${group.map((d) => `site:${d.domain}`).join(" OR ")})`) });
  }
  return out;
}

/** Listing results from one Google search: listed (with the page and any phone in its snippet) or not found. */
export function readListings(serp, group, biz) {
  return group.map((d) => {
    const hit = (serp?.organic || []).find((o) => (hostOf(o.url) === d.domain || hostOf(o.url).endsWith("." + d.domain)) && namesBusiness(`${o.title} ${o.snippet}`, biz.name));
    return { id: d.id, status: serp ? (hit ? "listed" : "missing") : "unknown", url: hit?.url || null, phones: hit ? phonesIn(hit.snippet) : [] };
  });
}

/** Competitors from a "<what you do> <town>" search: the map pack, and the websites ranking (directories left out). */
export function competitorsFrom(serp, myOrigin, max = 4) {
  const sites = [];
  for (const o of serp?.organic || []) {
    let origin; try { origin = new URL(o.url).origin; } catch { continue; }
    if (DIRECTORY_HOSTS.test(hostOf(o.url)) || sameDomain(origin, myOrigin) || sites.some((s) => s.origin === origin)) continue;
    sites.push({ origin, name: o.title.split(/\s[|–—-]\s|\s\||:\s/)[0].trim() || hostOf(origin), position: o.position });
  }
  return { sites: sites.slice(0, max), mapPack: (serp?.local || []).slice(0, 6) };
}

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

// ---------------------------------------------------------------- the audit
/**
 * Run a business audit.
 *  biz: { name, city, category, origin }. scan: the site's newest whole-site scan (for its score, schema facts and pages).
 *  search(queries): [{ q, serp }] in the same order (null serp if a page couldn't be read).
 *  rate(origin): a rateSite result for a competitor's website (or null to skip rating competitors).
 */
export async function runBusinessAudit({ biz, scan, websiteScore = null, search, rate, onProgress = () => {} }) {
  const dirs = directoriesFor(await loadDirectories(), biz.category);
  const plan = auditSearches(biz, dirs);
  onProgress(`Searching Google ${plan.length} times: the profile, competitors and listings…`);
  const got = await search(plan.map((p) => p.q));
  const serpOf = (kind) => got[plan.findIndex((p) => p.kind === kind)]?.serp || null;

  // Google Business Profile
  const profileSerp = serpOf("profile"), rivalSerp = serpOf("rivals");
  const panel = profileSerp?.business && namesBusiness(profileSerp.business.name, biz.name) ? profileSerp.business : null;
  const profile = panel ? auditBusiness(panel, { keyword: biz.category || "", mySite: biz.origin, local: rivalSerp?.local || profileSerp?.local || [] }) : null;

  // Listings
  const listings = [];
  plan.forEach((p, i) => { if (p.kind === "listings") listings.push(...readListings(got[i]?.serp, p.ids.map((id) => dirs.find((d) => d.id === id)), biz)); });
  for (const d of dirs.filter((x) => !x.domain)) listings.push({ id: d.id, status: "unknown", url: null, phones: [] });
  const q = encodeURIComponent(`${biz.name} ${biz.city || ""}`.trim());
  for (const l of listings) Object.assign(l, (({ name, signup, check, steps, core, why, note }) => ({ name, signup, check: check?.replace("{q}", q) || null, steps, core: !!core, why, note }))(dirs.find((d) => d.id === l.id)));
  if (panel) listings.unshift({ id: "google", name: "Google Business Profile", core: true, status: "listed", url: null, phones: panel.phone ? phonesIn(panel.phone) : [] });

  // Consistency, from the site's own schema and what was found
  const ent = scan?.entity || {};
  const site = { phone: ent.phone ?? null, address: ent.address ?? null, hours: ent.hours ?? null };
  const consistency = consistencyChecks({ site, profile: panel, listings });

  // Competitors
  onProgress("Rating competitors' websites…");
  const found = competitorsFrom(rivalSerp, biz.origin);
  const mine = await detectTargets(biz.origin + "/").catch(() => null);
  const myPhrases = (mine?.services || []).map((s) => s.phrase).slice(0, 14);
  const myServices = new Set(myPhrases.flatMap((ph) => terms(ph)));
  const competitors = [];
  for (const c of found.sites) {
    onProgress(`Rating ${hostOf(c.origin)}…`);
    const r = rate ? await rate(c.origin).catch(() => null) : null;
    const t = await detectTargets(c.origin + "/").catch(() => null);
    const services = (t?.services || []).map((s) => s.phrase).slice(0, 14);
    const offers = services.filter((ph) => terms(ph).some((w) => !myServices.has(w))).slice(0, 6);
    competitors.push({ ...c, scores: r?.scores ? { overall: r.scores.overall, seo: r.scores.seo, aeo: r.scores.aeo, geo: r.scores.geo } : null, offers, services,
      pages: r?.pages_rated ?? null, entity: r?.entity || null,
      pack: found.mapPack.find((m) => namesBusiness(m.name, c.name) || namesBusiness(c.name, m.name)) || null });
  }

  // Where everyone is, for the map: coordinates from each site's schema, else its address looked up on OpenStreetMap.
  onProgress("Placing everyone on the map…");
  const locate = async (e) => (e?.lat != null ? { lat: e.lat, lng: e.lng } : e?.address ? await geocode(e.address).catch(() => null) : null);
  const place = (await locate(ent)) || (biz.city ? { ...(await geocode(biz.city).catch(() => null)), approx: true } : null);
  for (const c of competitors) c.place = await locate(c.entity);

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
  const report = { t: new Date().toISOString(), biz, parts, score: businessScore(parts), profile, profileQuery: plan[0].q, listings, consistency, competitors,
    mapPack: found.mapPack, searched: plan.length, unread: got.filter((g) => !g.serp).length,
    me: { services: myPhrases, place: place?.lat != null ? place : null, scores: scan?.scores ? { overall: websiteScore ?? scan.scores.overall, seo: scan.scores.seo, aeo: scan.scores.aeo, geo: scan.scores.geo } : null,
      rating: panel?.rating ?? null, reviews: panel?.reviews ?? null, pages: scan?.pagesRated ?? null } };
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
  const peers = (r.mapPack || []).filter((m) => !namesBusiness(m.name, r.biz.name) && m.reviews != null);
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
