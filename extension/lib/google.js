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
  // Google's robot check sends the search to its own page (/sorry/…): say so, so the window can be shown to solve it.
  if (/google\.[a-z.]+$/.test(host) && (path.startsWith("/sorry") || document.querySelector('form[action*="sorry"], #captcha-form, iframe[src*="recaptcha"]'))) return { ...out, kind: isMaps ? "maps" : "serp", blocked: true };
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
    // A search with several matches shows a list ("Results") instead of one place: read each entry.
    const feed = document.querySelector('[role="feed"]');
    if (feed) {
      out.places = [...feed.querySelectorAll('a[href*="/maps/place/"][aria-label]')].slice(0, 20).map((a) => {
        const card = a.parentElement;
        // Rows read "Plumber · 2125 Montana Ave" / "Open 24 hours · (513) 631-0595".
        const parts = [...card.querySelectorAll(".W4Efsd > *")].map(txt).flatMap((s) => s.split("·")).map((s) => s.trim()).filter(Boolean);
        const category = parts.find((s) => /^[A-Za-z][A-Za-z &',/-]+$/.test(s) && !/^(open|closed|opens|closes|temporarily|permanently|website|directions|book online|order online)\b/i.test(s)) || null;
        // "4.8 stars 30 Reviews"; the place link carries its coordinates ("!3d39.96!4d-76.77").
        const stars = card.querySelector('[role="img"][aria-label]')?.getAttribute("aria-label") || "";
        const at = a.href.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/);
        return { name: a.getAttribute("aria-label"), category, rating: num((stars.match(/\d[.,]\d/) || [])[0]?.replace(",", ".")),
          reviews: count((stars.match(/([\d,.]+\s*[KM]?)\s+reviews?/i) || [])[1]), lat: at ? +at[1] : null, lng: at ? +at[2] : null,
          address: parts.find((s) => /^\d+\s+\S/.test(s) && !/\(\d{3}\)/.test(s)) || null,
          website: [...card.querySelectorAll("a")].find((x) => /website/i.test(x.getAttribute("aria-label") || "") || /^website$/i.test(txt(x)))?.href || null };
      }).filter((p) => p.name).map((p, i) => ({ ...p, position: i + 1 }));
      return out;
    }
    out.business = business(document.querySelector('[role="main"]') || document.body);
    const at = location.href.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/) || location.href.match(/@(-?[\d.]+),(-?[\d.]+),/);
    if (out.business && at) Object.assign(out.business, { lat: +at[1], lng: +at[2] });
    out.query = decodeURIComponent((path.match(/\/maps\/(?:place|search)\/([^/@]+)/) || [])[1] || "").replace(/\+/g, " ") || null;
    return out;
  }

  // ---- search results page
  out.query = new URLSearchParams(location.search).get("q") || txt(document.querySelector("textarea[name=q], input[name=q]")) || "";
  const seen = new Set();
  const organic = [];
  for (const h3 of document.querySelectorAll('#search a h3, #rso a h3, #rso a [role="heading"]')) {
    const a = h3.closest("a");
    let href = a?.href || "";
    // Google sometimes wraps each result in an encrypted redirect (/goto?url=…, /url?…). The address it shows under
    // the title ("https://example.com › services › roofing") still names the site, so read that instead.
    // Path parts stop at the first shortened ("…") or worded ("Home Services") one.
    if (/google\.[a-z.]+\/(goto|url)/.test(href)) {
      const q = new URL(href).searchParams, direct = q.get("q") || q.get("url") || "";
      const cite = (a.closest("[data-hveid], .g, [jscontroller]")?.querySelector("cite")?.textContent || "").trim();
      const m = cite.match(/^(https?:\/\/)?([a-z0-9.-]+\.[a-z]{2,})((?:\s*›\s*[^›…]+)*)/i);
      href = /^https?:\/\//.test(direct) ? direct : m ? `${m[1] || "https://"}${m[2]}/${(() => { const segs = m[3].split("›").map((s) => s.trim()).filter(Boolean), cut = segs.findIndex((s) => !/^[a-z0-9._~%-]+$/i.test(s)); return (cut < 0 ? segs : segs.slice(0, cut)).map(encodeURIComponent).join("/"); })()}`.replace(/\/$/, "/") : "";
    }
    if (!/^https?:/.test(href) || /google\.[a-z.]+\/(search|url|maps|goto)|googleadservices|webcache/.test(href)) continue;
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
    // A star rating inside an ordinary result (a directory's or a site's own reviews) isn't the map pack.
    // Only the map pack's own entries: shopping and product cards have star ratings too.
    if (!r.closest(".rllt__details, .VkpGBb")) continue;
    const name = txt(block.querySelector('[role="heading"], .OSrXXb, .dbg0pd')) || txt(block).split(/\s*\d[.,]\d\s*\(/)[0].slice(0, 80);
    if (!name || local.some((l) => l.name === name)) continue;
    const label = r.getAttribute("aria-label") || "";
    const t = txt(block);
    // Its Website and Directions links sit a few levels up, in the box that holds only this business.
    // Climb until the box has its Website or Directions link, without taking in another business (another heading).
    const linkish = (el) => [...el.querySelectorAll("a")].some((a) => /^(website|directions)$/i.test(txt(a)) || /\/maps\/dir\//.test(a.getAttribute("data-url") || a.getAttribute("href") || ""));
    const headings = (el) => new Set([...el.querySelectorAll('[role="heading"], .OSrXXb, .dbg0pd')].map(txt).filter(Boolean)).size;
    let box = block;
    for (let i = 0; i < 8 && !linkish(box) && box.parentElement && headings(box.parentElement) <= 1; i++) box = box.parentElement;
    const links = linkish(box) ? [...box.querySelectorAll("a")] : [];
    const siteLink = links.find((a) => /^website$/i.test(txt(a)) || /website/i.test(a.getAttribute("aria-label") || ""));
    const dir = links.map((a) => a.getAttribute("data-url") || a.getAttribute("href") || "").find((h) => h.includes("/maps/dir/"));
    // "/maps/dir//Wagler+Steel,+6+Township+Dr,+Paradise,+PA+17562/data=…" -> "6 Township Dr, Paradise, PA 17562"
    const dirText = dir ? decodeURIComponent((dir.split("/maps/dir//")[1] || "").split("/")[0].replace(/\+/g, " ")) : "";
    const address = dirText.includes(",") ? dirText.split(",").slice(1).join(",").trim() || null : null;
    local.push({ position: local.length + 1, name, rating: num((label.match(/\d[.,]\d/) || [])[0]?.replace(",", ".")), website: siteLink?.href || null, address,
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
