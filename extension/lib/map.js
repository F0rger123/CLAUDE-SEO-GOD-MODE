/**
 * The Compare map: where a business and its competitors are, each pin coloured by its score (green 85+, amber
 * 65–84, red under 65) for the chosen score: Overall, SEO, AEO or GEO.
 *  - Places come from each site's own schema (coordinates, or its address looked up on OpenStreetMap), or from a
 *    location typed in the site's Settings. A site with neither isn't placed, and the list says so.
 *  - Map tiles and address lookups are OpenStreetMap's (credited on the map). Leaflet (BSD-2) draws it.
 */
const NOMINATIM = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=";
let L = null, map = null, lastLookup = 0, drawing = 0;

/** Coordinates for an address, or null. At most one lookup a second, as OpenStreetMap asks. */
export async function geocode(address) {
  const wait = lastLookup + 1100 - Date.now();
  // Android pauses timers while the app is in the background, so there a short wait is counted out instead.
  if (wait > 0) { if (typeof document !== "undefined" && document.hidden) { const end = Date.now() + wait; while (Date.now() < end); } else await new Promise((r) => setTimeout(r, wait)); }
  lastLookup = Date.now();
  const res = await fetch(NOMINATIM + encodeURIComponent(address), { headers: { "Accept-Language": "en", "User-Agent": "SEOGodMode/1.0 (theagencyzero.com)" } });
  if (!res.ok) throw new Error(`Address lookup failed (${res.status})`);
  const [hit] = await res.json();
  return hit ? { lat: +hit.lat, lng: +hit.lon, label: hit.display_name } : null;
}

/** The county and state at a point ({ county, state: "PA" }), or null. Same one-a-second limit as geocode. */
export async function placeOf(lat, lng) {
  const wait = lastLookup + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastLookup = Date.now();
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${lat}&lon=${lng}`, { headers: { "Accept-Language": "en", "User-Agent": "SEOGodMode/1.0 (theagencyzero.com)" } });
  if (!res.ok) return null;
  const a = (await res.json())?.address || {};
  const iso = a["ISO3166-2-lvl4"] || "";
  return { county: a.county || null, state: /^US-[A-Z]{2}$/.test(iso) ? iso.slice(3) : a.state || null };
}

const colour = (n) => (n == null ? "s-none" : n >= 85 ? "s-pass" : n >= 65 ? "s-part" : "s-fail");

/**
 * Draw the map in `el`. pins: [{ origin, name, lat, lng, scores, me }]. metric: "overall" | "seo" | "aeo" | "geo".
 * size: 0–1, optional (pin grows with it, e.g. by review count). onOpen(origin): a pin's popup button was pressed.
 */
export async function drawMap(el, pins, metric, onOpen, { focusKm = 0, heat = null } = {}) {
  // The screen can redraw while the map code loads: only the newest call draws, into the map box on screen now.
  const mine = ++drawing;
  L = L || (await import("./vendor/leaflet/leaflet-src.esm.js"));
  if (mine !== drawing) return;
  el = document.getElementById(el.id) || el;
  if (map) { map.remove(); map = null; }
  if (!el.isConnected) return;
  map = L.map(el, { zoomControl: false, attributionControl: true });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: heat?.length ? "© OpenStreetMap · towns: GeoNames" : "© OpenStreetMap" }).addTo(map);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  const layer = [];
  // Heat: a soft circle on each town searched, coloured by where you rank there (top 3, 4–10, lower or not shown),
  // with your rank on it. Drawn first, so the businesses' pins sit on top.
  if (heat?.length) {
    const css = getComputedStyle(document.documentElement), tone = (v, d) => css.getPropertyValue(v).trim() || d;
    const col = (t) => (!t.read ? "#8a8a8a" : !t.rank ? tone("--fail", "#dc2626") : t.rank <= 3 ? tone("--pass", "#15803d") : t.rank <= 10 ? tone("--part", "#b7791f") : tone("--fail", "#dc2626"));
    for (const t of heat) {
      const c = col(t);
      // Two rings make a glow: wide and faint, then tighter and stronger.
      L.circle([t.lat, t.lng], { radius: 11000, stroke: false, fillColor: c, fillOpacity: 0.2, interactive: false }).addTo(map);
      L.circle([t.lat, t.lng], { radius: 5500, stroke: false, fillColor: c, fillOpacity: 0.32, interactive: false }).addTo(map);
      const label = !t.read ? "?" : t.rank ? `#${t.rank}` : "–";
      L.marker([t.lat, t.lng], { icon: L.divIcon({ className: "", iconSize: [0, 0], html: `<span class="heatlbl" style="--hc:${c}"><b>${label}</b><i>${t.name.replace(/[<>&]/g, "")}</i></span>` }), interactive: false, keyboard: false }).addTo(map);
      layer.push([t.lat, t.lng]);
    }
  }
  for (const p of pins) {
    const n = p.scores?.[metric] ?? null;
    const icon = L.divIcon({ className: "", iconSize: [38, 38], iconAnchor: [19, 19],
      html: `${p.me ? `<span class="pin-you">You</span>` : ""}<span class="pin ${colour(n)} ${p.me ? "me" : ""}" data-pin="${p.origin}" style="--sz:${p.size == null ? 1 : (0.8 + 0.7 * p.size).toFixed(2)}">${n ?? "–"}</span>` });
    const m = L.marker([p.lat, p.lng], { icon, title: p.name }).addTo(map);
    const box = document.createElement("div");
    box.className = "pinpop";
    box.innerHTML = `<b></b><small></small><button class="linkish">Open</button>`;
    box.querySelector("b").textContent = p.name;
    box.querySelector("small").textContent = ["overall", "seo", "aeo", "geo"].map((k) => `${k === "overall" ? "Overall" : k.toUpperCase()} ${p.scores?.[k] ?? "–"}`).join(" · ") + (p.note ? ` · ${p.note}` : "");
    if (p.origin) box.querySelector("button").onclick = () => onOpen(p.origin); else box.querySelector("button").remove();
    m.bindPopup(box);
    layer.push([p.lat, p.lng]);
  }
  // With focusKm: centred on you, showing the others within that distance.
  const me = pins.find((p) => p.me);
  if (me && focusKm) {
    const near = pins.filter((p) => !p.me && Math.hypot((p.lat - me.lat) * 111, (p.lng - me.lng) * 85) <= focusKm).map((p) => [p.lat, p.lng]);
    if (near.length) map.fitBounds([[me.lat, me.lng], ...near], { padding: [40, 40], maxZoom: 13 }); else map.setView([me.lat, me.lng], 11);
  } else if (layer.length === 1) map.setView(layer[0], 13);
  else if (layer.length) map.fitBounds(layer, { padding: [36, 36], maxZoom: 14 });
  else map.setView([39.8, -98.6], 3);
}
