/**
 * Reads the Google page the user is looking at: a search results page (organic results, map pack, People also ask,
 * related searches, the business panel) or a Google Maps place page. Runs inside that tab via chrome.scripting, so it
 * must stay self-contained (no imports). It only reads what's on screen; it never searches or clicks.
 * Google's markup changes often, so every field has fallbacks (aria labels, data attributes, visible text) and a
 * field that can't be found comes back null instead of a guess.
 */
export function readGoogle() {
  // Google prefixes fields with icon-font glyphs (private-use characters); drop them.
  const txt = (el) => (el?.innerText || el?.textContent || "").replace(/[-]/g, "").replace(/\s+/g, " ").trim();
  const num = (s) => { const m = String(s || "").replace(/,/g, "").match(/\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
  // "522", "3K", "1.2K" -> number
  const count = (s) => { const m = String(s || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([KM])?/i); return m ? Math.round(Number(m[1]) * (m[2] ? (/k/i.test(m[2]) ? 1e3 : 1e6) : 1)) : null; };
  const unlabel = (s) => (s || "").replace(/^(Address|Phone|Hours|Areas served|Service area|Appointments):\s*/i, "").trim() || null;
  const host = location.hostname, path = location.pathname;
  const isMaps = /google\.[a-z.]+$/.test(host) && path.startsWith("/maps");
  const isSerp = /google\.[a-z.]+$/.test(host) && path === "/search";
  const out = { kind: isMaps ? "maps" : isSerp ? "serp" : "other", url: location.href, readAt: new Date().toISOString() };
  if (!isMaps && !isSerp) return out;

  /** A business panel: Maps place page or the knowledge panel beside search results. */
  function business(root) {
    if (!root) return null;
    const attr = (k) => root.querySelector(`[data-attrid*="${k}"]`);
    const item = (k) => root.querySelector(`[data-item-id^="${k}"]`);
    const label = (re) => [...root.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label")).find((l) => re.test(l)) || "";
    const name = txt(root.querySelector("h1")) || txt(attr("title")) || txt(root.querySelector('[data-attrid="title"], h2[data-attrid]')) || null;
    if (!name) return null;
    const ratingLabel = label(/(\d[.,]\d)\s*(stars?|out of 5)/i) || label(/rated\s*\d/i);
    const rating = num((ratingLabel.match(/\d[.,]\d/) || [null])[0]?.replace(",", ".")) ?? num(txt(root.querySelector(".F7nice span, [data-attrid*='rating'] span")));
    // Review count from an element that says only "522 reviews" / "522 Google reviews". The search panel glues the
    // rating onto it in its subtitle ("4.9522 Google reviews"), so matching the whole text would read 9522.
    const reviewEl = [...root.querySelectorAll("a, span, button")].map(txt).find((t) => /^\(?[\d,.]+\s*[KM]?\)?\s+(Google\s+)?reviews?$/i.test(t));
    const reviews = count((label(/^[\d,.]+\s*[KM]?\s+reviews?/i) || reviewEl || "").replace(/[()]/g, "")) ?? count((txt(root.querySelector(".F7nice")).match(/\(([\d,.]+\s*[KM]?)\)/i) || [])[1]);
    // Panel subtitle reads "4.9522 Google reviews Roofing contractor in Parkville, Pennsylvania".
    const subtitle = txt(attr("subtitle")).replace(/^.*\breviews?\s*/i, "").replace(/\s+in\s+[A-Z].*$/, "");
    const category = txt(root.querySelector('button[jsaction*="category"]')) || subtitle || null;
    const address = unlabel(txt(item("address")) || txt(attr("location:address")) || txt(attr("service_area")) || label(/^Address:/i));
    const phone = (item("phone:tel:")?.getAttribute("data-item-id") || "").replace("phone:tel:", "") || unlabel(txt(attr("phone")));
    const site = root.querySelector('a[data-item-id="authority"]')?.href || [...root.querySelectorAll("a")].find((a) => /^website$/i.test(txt(a)) || /website/i.test(a.getAttribute("aria-label") || ""))?.href || null;
    const hours = !!(item("oh") || attr("hours") || label(/hours/i));
    const photos = root.querySelectorAll('button[aria-label^="Photo of"], [data-photo-index], img[src*="googleusercontent"]').length;
    const all = txt(root);
    const description = txt(root.querySelector('[data-attrid*="merchant_description"], .PYvSYb')).replace(/^From\s.+?\s"/, "").replace(/"$/, "") || null;
    return {
      name, rating, reviews, category, address, phone, website: site, hasHours: hours, photos, description,
      // "Claim this business" means unclaimed. "Own this business?" also shows on claimed profiles, so it proves nothing.
      claimed: /claim this business/i.test(all) ? false : null,
      hasUpdates: !!attr("local:posts") || /from the owner|updates from/i.test(all), hasQA: /questions?\s*(&|and)\s*answers?/i.test(all),
      profiles: unlabel(txt(attr("social media presence")).replace(/^Profiles\s*/i, "")),
      bookingLink: !!(attr("appointment") || root.querySelector('a[data-item-id*="action"], a[aria-label*="Book"], a[aria-label*="Appointment"]')),
      attributes: [...root.querySelectorAll('[aria-label^="Has "], [aria-label^="Identifies as"]')].map((e) => e.getAttribute("aria-label")).slice(0, 12),
    };
  }

  if (isMaps) {
    out.business = business(document.querySelector('[role="main"]') || document.body);
    out.query = decodeURIComponent((path.match(/\/maps\/(?:place|search)\/([^/@]+)/) || [])[1] || "").replace(/\+/g, " ") || null;
    return out;
  }

  // ---- search results page
  out.query = new URLSearchParams(location.search).get("q") || txt(document.querySelector("textarea[name=q], input[name=q]")) || "";
  const seen = new Set();
  const organic = [];
  for (const h3 of document.querySelectorAll('#search a h3, #rso a h3, #rso a [role="heading"]')) {
    const a = h3.closest("a");
    const href = a?.href || "";
    if (!/^https?:/.test(href) || /google\.[a-z.]+\/(search|url|maps)|googleadservices|webcache/.test(href)) continue;
    if (a.closest('[data-text-ad], #tads, #bottomads, [aria-label="Ads"]')) continue;
    const u = new URL(href); u.hash = "";
    const key = u.href;
    if (seen.has(key)) continue;
    seen.add(key);
    const block = a.closest("[data-hveid], .g, [jscontroller]") || a.parentElement;
    const snippet = txt(block?.querySelector('[data-sncf], .VwiC3b, [style*="-webkit-line-clamp"]')) || "";
    organic.push({ position: organic.length + 1, url: u.href, title: txt(h3), snippet: snippet.slice(0, 300) });
  }
  out.organic = organic.slice(0, 20);
  out.ads = document.querySelectorAll('#tads [data-text-ad], #tads .uEierd, [data-text-ad]').length;

  // Map pack: blocks with a star rating and a link to a Maps place or a local result.
  const local = [];
  for (const r of document.querySelectorAll('[role="img"][aria-label*="out of 5"], [role="img"][aria-label*="stars"], span[aria-label^="Rated"]')) {
    const block = r.closest('[data-cid], [jscontroller][data-hveid], .VkpGBb, [role="listitem"], .rllt__details')?.closest("div") || r.parentElement?.parentElement;
    if (!block || block.closest("#rhs")) continue;
    const name = txt(block.querySelector('[role="heading"], .OSrXXb, .dbg0pd')) || txt(block).split(/\s*\d[.,]\d\s*\(/)[0].slice(0, 80);
    if (!name || local.some((l) => l.name === name)) continue;
    const label = r.getAttribute("aria-label") || "";
    const t = txt(block);
    local.push({ position: local.length + 1, name, rating: num((label.match(/\d[.,]\d/) || [])[0]?.replace(",", ".")),
      // "Bealing Roofing 4.9 (522) · Roofers 19+ years in business" / "(3K)"
      reviews: count((t.match(/\(([\d,.]+\s*[KM]?)\)/i) || [])[1]), category: (t.match(/\)\s*·\s*([A-Za-z][A-Za-z &]*?[A-Za-z])(?=\s*\d|\s*·|$)/) || [])[1] || null });
    if (local.length >= 6) break;
  }
  out.local = local;
  out.paa = [...new Set([...document.querySelectorAll("[data-q]")].map((e) => e.getAttribute("data-q")).filter(Boolean))].slice(0, 12);
  if (!out.paa.length) out.paa = [...document.querySelectorAll('[jsname] [role="button"] span, .related-question-pair span')].map(txt).filter((s) => /\?$/.test(s) && s.length < 140).slice(0, 12);
  const relatedRoot = [...document.querySelectorAll("#botstuff, #bres, [data-abe]")];
  out.related = [...new Set(relatedRoot.flatMap((r) => [...r.querySelectorAll('a[href*="/search?"]')]).map(txt).filter((s) => s && s.length < 90 && s.toLowerCase() !== out.query.toLowerCase()))].slice(0, 12);
  out.business = business(document.querySelector("#rhs [data-attrid], #rhs") ? document.querySelector("#rhs") : null);
  out.blocked = !!document.querySelector('form[action*="sorry"], #captcha-form');
  return out;
}
