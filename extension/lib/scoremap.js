/**
 * The score map shown with a scan (extension and Android app): the scanned site and its competitors where they are,
 * each pin coloured by the chosen score (Overall, SEO, AEO or GEO). With an area scan saved, each town searched glows
 * by where the business ranks there, and every business that ranks is pinned.
 *  - The site's place comes from a location set for it, its own schema (coordinates or address), or its area scan.
 *  - Switching the score redraws the map in place.
 */
import { drawMap, geocode } from "./map.js";

export const METRICS = { overall: "Overall", seo: "SEO", aeo: "AEO", geo: "GEO" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The map block: score buttons, the map, the legends and a line for what isn't placed. id: the map element's id. */
export function scoreMapHtml(id, name, { metric = "overall", area = null } = {}) {
  return `<div class="metrics" data-mapfor="${id}">${Object.entries(METRICS).map(([k, l]) => `<button data-smetric="${k}" aria-pressed="${k === metric}">${l}</button>`).join("")}</div>
    <div id="${id}" class="map" role="region" aria-label="Map of ${esc(name)} and its competitors, coloured by score"></div>
    <div class="legend3"><span class="s-pass"><i></i>85+</span><span class="s-part"><i></i>65–84</span><span class="s-fail"><i></i>under 65</span><span class="s-none"><i></i>not scanned</span></div>
    ${area ? `<div class="legend3 heat"><b>Your Google Maps rank, by town:</b><span class="s-pass"><i></i>top 3</span><span class="s-part"><i></i>4–10</span><span class="s-fail"><i></i>11+ or not shown</span></div>` : ""}
    <p class="unknowns" id="${id}note"></p>`;
}

/**
 * Where a site is, from what its schema says ({ lat, lng } or an address or town), or null. A town only gives its
 * centre, so that place is marked approx.
 */
export async function placeFromEntity(ent) {
  if (!ent) return null;
  if (ent.lat != null && ent.lng != null) return { lat: ent.lat, lng: ent.lng, label: ent.address || ent.name || "" };
  if (ent.address) { const g = await geocode(ent.address).catch(() => null); if (g) return { ...g, label: ent.address }; }
  if (ent.city) { const g = await geocode(ent.city).catch(() => null); if (g) return { ...g, label: ent.city, approx: true }; }
  return null;
}

/** Add an area scan's businesses (the ones not pinned yet) and, when the site has no pin, its home town. */
export function withArea(pins, area, me) {
  if (!area) return pins;
  const out = [...pins];
  for (const c of area.competitors || []) if (c.lat != null && !out.some((p) => p.origin && c.origin && p.origin === c.origin))
    out.push({ origin: c.origin, name: c.name, lat: c.lat, lng: c.lng, scores: c.scores || null, note: `${c.category || "Competitor"} · in ${c.towns} town${c.towns === 1 ? "" : "s"}, best #${c.best}`, size: 0 });
  if (me && !out.some((p) => p.me)) out.push({ ...me, lat: area.home.lat, lng: area.home.lng, me: true });
  return out;
}

/**
 * Draw the map into the block scoreMapHtml made. pins: [{ origin, name, lat, lng, scores, me, note }]. missing: names
 * not placed. onMetric(k): the score was switched (to remember it). onOpen(origin): a pin's Open button.
 */
export function showScoreMap(root, id, { pins, area = null, metric = "overall", missing = [], approx = false, onMetric, onOpen }) {
  const el = root.querySelector("#" + id);
  if (!el) return;
  // Nothing to place: no map, just the note on how to get the site on it.
  el.hidden = !pins.length;
  root.querySelectorAll(`[data-mapfor="${id}"], #${id} ~ .legend3`).forEach((x) => (x.hidden = !pins.length));
  const note = root.querySelector(`#${id}note`);
  if (note) note.textContent = [
    !pins.some((p) => p.me) ? "This site isn't on the map: it doesn't state its address. Add LocalBusiness schema with the address, or set its location." : "",
    approx ? "Its pin is at its town's centre." : "",
    missing.length ? `Not placed (no address on their site): ${missing.join(", ")}.` : "",
    !pins.some((p) => !p.me) ? "Add competitors to see them here." : "",
  ].filter(Boolean).join(" ");
  const draw = (k) => drawMap(el, pins, k, (o) => o && onOpen?.(o), { focusKm: area ? 0 : 60, heat: area?.towns || null }).catch(() => {});
  root.querySelectorAll(`[data-mapfor="${id}"] [data-smetric]`).forEach((b) => (b.onclick = () => {
    root.querySelectorAll(`[data-mapfor="${id}"] [data-smetric]`).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    onMetric?.(b.dataset.smetric);
    draw(b.dataset.smetric);
  }));
  draw(METRICS[metric] ? metric : "overall");
}
