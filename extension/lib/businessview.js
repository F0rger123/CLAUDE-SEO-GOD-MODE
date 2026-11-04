/**
 * The business audit report, shared by the extension and the Android app (styles in sidepanel.css, .ba-*).
 * auditHtml(r) draws it; bindAudit(root, r, { onTrack }) makes it work: section tabs, the map (drawn when opened),
 * numbers that count up, and Track buttons for competitors.
 * Sections: Plan (the biggest levers first, then every fix), Map, Services (who offers what), Compare (side by side),
 * Listings, Details (consistent details and the Google profile).
 */
import { locationsOf, PARTS, serviceMatrix } from "./business.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const st = (n) => (n == null ? "" : n >= 85 ? "s-pass" : n >= 65 ? "s-part" : "s-fail");
const day = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const STATUS = { listed: ["s-pass", "Listed"], missing: ["s-fail", "Not found"], unknown: ["", "Check yourself"] };
const IMPACT = { 3: "Biggest", 2: "Big", 1: "Helps" };
const TABS = { plan: "Plan", map: "Map", services: "Services", compare: "Compare", listings: "Listings", details: "Details" };

const ring = (n) => `<span class="ba-ring ${st(n)}"><svg viewBox="0 0 40 40" aria-hidden="true"><circle class="trk" cx="20" cy="20" r="17" pathLength="100"/>${n == null ? "" : `<circle class="val" cx="20" cy="20" r="17" pathLength="100" style="--v:${n}"/>`}</svg><b ${n == null ? "" : `data-count="${n}"`}>${n ?? "–"}</b><small>Business Score</small></span>`;
const dot = (ok) => `<span class="dot ${ok == null ? "" : ok ? "s-pass" : "s-fail"}"></span>`;

export function auditHtml(r, { tracked = new Set() } = {}) {
  const issues = r.issues || [], lv = r.levers || [], m = serviceMatrix(r);
  const listed = r.listings.filter((l) => l.status === "listed").length, checked = r.listings.filter((l) => l.status !== "unknown").length;
  const placed = [r.me?.place, ...r.competitors.map((c) => c.place)].filter(Boolean).length;
  const who = (o) => esc(r.competitors.find((c) => c.origin === o)?.name || host(o));
  const people = [{ me: true, name: r.biz.name, origin: r.biz.origin, scores: r.me?.scores, reviews: r.me?.reviews, rating: r.me?.rating, pages: r.me?.pages, services: r.me?.services?.length },
    ...r.competitors.map((c) => ({ km: c.km ?? null, name: c.name, origin: c.origin, scores: c.scores, reviews: c.pack?.reviews ?? null, rating: c.pack?.rating ?? null, pages: c.pages, services: c.services?.length, position: c.position }))];
  const maxReviews = Math.max(1, ...people.map((p) => p.reviews || 0), ...(r.mapPack || []).map((x) => x.reviews || 0));
  const counts = { plan: lv.length || issues.length, map: placed, services: m.gaps.length + m.only.length, compare: r.competitors.length, listings: `${listed}/${checked}`, details: r.consistency.filter((c) => c.ok === false).length };

  const plan = `${lv.length ? `<h2 class="sec">Do these first</h2><ol class="ba-levers">${lv.map((x, i) => `<li class="ba-lever i${x.impact}" style="--i:${i}">
        <div class="lv-top"><b>${esc(x.title)}</b><span class="lv-imp">${IMPACT[x.impact]}</span></div><p>${esc(x.detail)}</p>
        <details><summary>How</summary><ol>${x.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>${x.link ? `<a class="btn" href="${esc(x.link)}" target="_blank" rel="noopener">Open ${esc(host(x.link))}</a>` : ""}</details></li>`).join("")}</ol>` : ""}
    <h2 class="sec">Everything to fix <small>${issues.length}</small></h2>
    ${issues.length ? `<div class="ba-issues">${issues.slice(0, 30).map((i, n) => `<details class="ba-issue" style="--i:${Math.min(n, 12)}"><summary><span class="dot ${i.size >= 3 ? "s-fail" : "s-part"}"></span><b>${esc(i.title)}</b><small>${PARTS[i.part]?.label || ""}</small></summary>
        <div class="pad"><p>${esc(i.why)}</p><ol>${i.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>${i.link ? `<a class="btn" href="${esc(i.link)}" target="_blank" rel="noopener">Open ${esc(host(i.link))}</a>` : ""}</div></details>`).join("")}</div>`
      : `<p class="verdict">Nothing to fix in what could be checked.</p>`}`;

  const map = `<div class="ba-mapwrap"><div id="bamap" class="map" role="region" aria-label="Map of ${esc(r.biz.name)} and its competitors"></div></div>
    <div class="legend3"><span class="s-pass"><i></i>85+</span><span class="s-part"><i></i>65–84</span><span class="s-fail"><i></i>under 65</span><span class="s-none"><i></i>no score</span></div>
    <p class="unknowns">Colour is each site's Overall score; a bigger pin means more Google reviews. ${r.me?.place?.approx ? "Your pin is at your town's centre: add your address to the site's schema, or set it in Settings, to place it exactly. " : ""}${placed < people.length ? `${people.length - placed} not placed: ${people.filter((p, i) => !(i ? r.competitors[i - 1].place : r.me?.place)).map((p) => esc(p.name)).join(", ")} (no address on their site).` : ""}</p>`;

  const where = (r.searches || []).length ? `<h2 class="sec">Where you compete <small>${r.searches.length} searches</small></h2>
    <div class="ba-where">${r.searches.map((s, i) => `<div class="wh" style="--i:${i}"><div class="wh-q"><b>${esc(s.q)}</b><span class="wh-me ${s.mine ? (s.mine <= 3 ? "s-pass" : "s-part") : "s-fail"}">${!s.read ? "not read" : s.mine ? `you #${s.mine}` : "you: not in top 10"}</span></div>
      <small>${s.top.length ? s.top.map((x) => `#${x.position} ${esc(x.name)}`).join(" · ") : s.read ? "No competitor websites in the results." : ""}${s.pack.length ? `<br>Map pack: ${s.pack.map(esc).join(", ")}` : ""}</small></div>`).join("")}</div>` : "";
  const chips = (xs, cls, rivals) => xs.length ? `<div class="ba-svc">${xs.map((x, i) => `<span class="svc ${cls}" style="--i:${Math.min(i, 14)}"><b>${esc(x.name)}</b>${rivals ? `<small>${x.rivals.map(who).join(", ")}</small>` : ""}</span>`).join("")}</div>` : "";
  const services = where + (r.competitors.length || r.me?.services?.length ? `
    <h2 class="sec">They offer, you don't <small>${m.gaps.length}</small></h2>${chips(m.gaps, "gap", true) || `<p class="lede">Nothing: you cover everything these competitors list.</p>`}
    <h2 class="sec">Only you <small>${m.only.length}</small></h2>${chips(m.only, "only", false) || `<p class="lede">Every service you list, at least one competitor lists too.</p>`}
    <h2 class="sec">You both offer <small>${m.shared.length}</small></h2>${chips(m.shared, "shared", true) || `<p class="lede">No overlap found.</p>`}
    <p class="unknowns">From the services each website names in its pages and headings. A service missing from a site may still be offered.</p>` : `<p class="lede">No services found on the sites.</p>`);

  const bar = (n, max) => `<span class="ba-bar"><i style="--w:${max ? Math.round((100 * (n || 0)) / max) : 0}%"></i></span>`;
  const compare = `<div class="ba-cmp">${people.map((p, i) => `<div class="cmp-card ${p.me ? "me" : ""}" style="--i:${i}">
      <div class="cmp-head"><b>${esc(p.name)}</b><small>${p.me ? "You" : p.position ? `#${p.position} on Google` : "In the map pack"}${p.origin ? ` · ${esc(host(p.origin))}` : " · no website found"}${p.km != null ? ` · ${p.km} km away` : ""}</small></div>
      <div class="cmp-scores">${["overall", "seo", "aeo", "geo"].map((k) => `<span class="chip ${st(p.scores?.[k])}"><b>${p.scores?.[k] ?? "–"}</b>${k === "overall" ? "All" : k.toUpperCase()}</span>`).join("")}</div>
      <div class="cmp-row"><span>Reviews</span>${bar(p.reviews, maxReviews)}<b>${p.reviews ?? "–"}${p.rating != null ? ` · ${p.rating}★` : ""}</b></div>
      <div class="cmp-row"><span>Pages</span>${bar(p.pages, Math.max(1, ...people.map((x) => x.pages || 0)))}<b>${p.pages ?? "–"}</b></div>
      <div class="cmp-row"><span>Services</span>${bar(p.services, Math.max(1, ...people.map((x) => x.services || 0)))}<b>${p.services ?? "–"}</b></div>
      ${p.me || !p.origin ? "" : tracked.has(p.origin) ? `<small class="cmp-t">Tracked</small>` : `<button data-track="${esc(p.origin)}" data-name="${esc(p.name)}">Track as competitor</button>`}</div>`).join("")}</div>
    ${r.mapPack.length ? `<h2 class="sec">Google map pack <small>${r.searches?.length > 1 ? "all searches" : `"${esc(`${r.biz.category} ${locationsOf(r.biz)[0] || ""}`.trim())}"`}</small></h2>
      <div class="ba-list">${r.mapPack.map((x, i) => `<div class="ba-row"><span class="rk">${i + 1}</span><span><b>${esc(x.name)}</b><small>${x.rating ?? "–"}★${x.category ? ` · ${esc(x.category)}` : ""}</small></span><span class="pack">${bar(x.reviews, maxReviews)}<small>${x.reviews ?? "–"} reviews</small></span></div>`).join("")}</div>` : ""}`;

  const listingsTab = `<div class="ba-list">${r.listings.map((l) => { const [cls, label] = STATUS[l.status]; return `<div class="ba-row"><span class="dot ${cls}"></span><span><b>${esc(l.name)}</b><small>${label}${l.url ? ` · <a href="${esc(l.url)}" target="_blank" rel="noopener">view</a>` : ""}${l.core ? " · important" : ""}</small></span>${l.status !== "listed" && (l.signup || l.check) ? `<a class="btn" href="${esc(l.status === "unknown" ? l.check || l.signup : l.signup)}" target="_blank" rel="noopener">${l.status === "unknown" ? "Check" : "Add free"}</a>` : ""}</div>`; }).join("")}</div>
    <p class="unknowns">Found by searching Google for the business on each site. "Not found" means Google didn't show a listing for it, which usually means there isn't one. Every site here has a free listing.</p>`;

  const details = `<h2 class="sec">Consistent details</h2>
    <div class="ba-list">${r.consistency.map((c) => `<div class="ba-row">${dot(c.ok)}<span><b>${esc(c.label)}</b><small>${esc(c.detail)}</small></span></div>`).join("")}</div>
    ${r.profile ? `<h2 class="sec">Google Business Profile <small>${r.profile.score ?? "–"}/100</small></h2>
      <div class="ba-list">${r.profile.checks.map((c) => `<div class="ba-row">${dot(c.ok)}<span><b>${esc(c.label)}</b><small>${esc(c.detail)}</small></span></div>`).join("")}</div>` : `<p class="lede">No Google Business Profile was found for "${esc(r.profileQuery)}".</p>`}`;

  return `<div class="ba-head ${st(r.score)}">${ring(r.score)}
      <div class="ba-parts">${Object.entries(PARTS).map(([k, p], i) => `<div class="${st(r.parts[k])}" style="--i:${i}"><span>${p.label}</span><b>${r.parts[k] ?? "–"}</b><i style="--w:${r.parts[k] ?? 0}%"></i></div>`).join("")}</div></div>
    <p class="unknowns">${esc(r.biz.name)}${locationsOf(r.biz).length ? `, ${locationsOf(r.biz).map(esc).join(" · ")}` : ""} · ${day(r.t)}. ${r.unread ? `${r.unread} of ${r.searched} Google searches couldn't be read, so some parts are missing. ` : ""}Parts that couldn't be checked are left out of the score.</p>
    ${r.verified ? `<div class="ba-verified"><b>Double-checked</b><span>${[
      r.verified.profileFrom ? `Google profile read from ${esc(r.verified.profileFrom)}` : "No Google profile found",
      r.verified.listingsRechecked ? `${r.verified.listingsRechecked} missing listing${r.verified.listingsRechecked === 1 ? "" : "s"} searched again${r.verified.foundOnSecondLook ? ` (${r.verified.foundOnSecondLook} found)` : ", still not found"}` : "",
      r.verified.dropped?.length ? `${r.verified.dropped.length} result${r.verified.dropped.length === 1 ? "" : "s"} left out: ${r.verified.dropped.map((d) => `${esc(d.name)} (${esc(d.why)})`).join("; ")}` : "Every competitor's website checked",
    ].filter(Boolean).join(" · ")}</span></div>` : ""}
    <div class="segs ba-tabs" role="tablist">${Object.entries(TABS).map(([k, l], i) => `<button role="tab" data-batab="${k}" aria-selected="${i === 0}">${l}<small>${counts[k]}</small></button>`).join("")}</div>
    ${Object.entries({ plan, map, services, compare, listings: listingsTab, details }).map(([k, html], i) => `<section class="ba-pane" data-pane="${k}" ${i ? "hidden" : ""}>${html}</section>`).join("")}`;
}

/** Wire up a drawn report. opts.onTrack(origin, name): a competitor's Track button. opts.onOpenSite(origin): a map pin's Open. */
export function bindAudit(root, r, { onTrack, onOpenSite } = {}) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const count = (el) => {
    const to = +el.dataset.count; if (reduced || document.hidden) return;
    const t0 = performance.now(); el.textContent = 0;
    const step = (t) => { if (!el.isConnected) return; const k = Math.min(1, (t - t0) / 900); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  root.querySelectorAll("[data-count]").forEach(count);
  let mapDrawn = false;
  const show = (tab) => {
    root.querySelectorAll("[data-batab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.batab === tab)));
    root.querySelectorAll("[data-pane]").forEach((p) => { p.hidden = p.dataset.pane !== tab; if (!p.hidden) { p.classList.remove("in"); void p.offsetWidth; p.classList.add("in"); } });
    if (tab === "map" && !mapDrawn) { mapDrawn = true; drawAuditMap(root, r, onOpenSite); }
  };
  root.querySelectorAll("[data-batab]").forEach((b) => (b.onclick = () => {
    show(b.dataset.batab);
    // Bring the section up under the header, and the chosen tab into the middle of its row.
    const tabs = root.querySelector(".ba-tabs"), head = document.querySelector("header")?.offsetHeight || 0;
    window.scrollTo({ top: tabs.getBoundingClientRect().top + window.scrollY - head - 8, behavior: reduced ? "auto" : "smooth" });
    b.scrollIntoView({ inline: "center", block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }));
  root.querySelectorAll("[data-track]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    await onTrack?.(b.dataset.track, b.dataset.name);
    b.replaceWith(Object.assign(document.createElement("small"), { className: "cmp-t", textContent: "Tracked" }));
  }));
  root.querySelector('[data-pane="plan"]')?.classList.add("in");
}

async function drawAuditMap(root, r, onOpenSite) {
  const el = root.querySelector("#bamap");
  if (!el) return;
  const maxReviews = Math.max(1, r.me?.reviews || 0, ...r.competitors.map((c) => c.pack?.reviews || 0));
  const pins = [
    r.me?.place && { origin: r.biz.origin, name: r.biz.name, lat: r.me.place.lat, lng: r.me.place.lng, scores: r.me.scores, me: true, size: (r.me.reviews || 0) / maxReviews, note: r.me.reviews != null ? `${r.me.reviews} reviews` : "" },
    ...r.competitors.filter((c) => c.place).map((c) => ({ origin: c.origin, name: c.name, lat: c.place.lat, lng: c.place.lng, scores: c.scores, size: (c.pack?.reviews || 0) / maxReviews, note: c.pack?.reviews != null ? `${c.pack.reviews} reviews` : "" })),
  ].filter(Boolean);
  const { drawMap } = await import("./map.js");
  drawMap(el, pins, "overall", (o) => o && (onOpenSite ? onOpenSite(o) : window.open(o, "_blank", "noopener")));
}

/** A prompt for an AI assistant with everything to fix, in order. */
export function auditPrompt(r) {
  return `Help me fix my business's online presence (SEO God Mode business audit, ${r.t.slice(0, 10)}). Business: ${r.biz.name}${locationsOf(r.biz).length ? `, ${locationsOf(r.biz).join("; ")}` : ""}${r.biz.category ? ` (${r.biz.category})` : ""}, ${r.biz.origin}. Business Score ${r.score ?? "?"}/100: ${Object.entries(PARTS).map(([k, p]) => `${p.label} ${r.parts[k] ?? "not checked"}`).join(", ")}.

Biggest levers:
${(r.levers || []).map((x, n) => `${n + 1}. ${x.title}: ${x.detail}`).join("\n") || "(none)"}

Every problem, biggest first:
${(r.issues || []).map((i, n) => `${n + 1}. ${i.title}: ${i.why}\n   Steps: ${i.steps.join(" ")}`).join("\n")}

Walk me through them one at a time. Use only facts I confirm; write [CONFIRM: ...] for anything you'd have to guess. Never suggest paying for listings or buying reviews.`;
}

// ---------------------------------------------------------------- the business's details, editable
const LISTS = { locations: ["Locations", "York, PA"], services: ["Services", "roof repair"], areas: ["Areas you serve", "Hanover"] };

/** The form for a business's details: name, what it does, and lists of locations, services and areas. p: id prefix. */
export function bizEditor(b, p, { canLookup = false } = {}) {
  const chipList = (k) => `<div class="be-chips" data-list="${k}">${(k === "locations" ? locationsOf(b) : b[k] || []).map((x) => `<span class="be-chip">${esc(x)}<button type="button" aria-label="Remove ${esc(x)}" data-rm="${esc(x)}">×</button></span>`).join("")}</div>`;
  return `<div class="be" id="${p}be">
    <div class="be-tools"><button type="button" id="${p}detect">Fill in from my website</button>${canLookup ? `<button type="button" id="${p}google">Look it up on Google</button>` : ""}<small id="${p}dstat" class="be-stat"></small></div>
    <div class="field"><label for="${p}name">Business name</label><input id="${p}name" class="search" value="${esc(b.name || "")}"></div>
    <div class="field"><label for="${p}cat">What it does</label><input id="${p}cat" class="search" placeholder="roofing contractor" value="${esc(b.category || "")}"></div>
    ${Object.entries(LISTS).map(([k, [label, eg]]) => `<div class="field be-list"><label for="${p}-${k}">${label} <small>${k === "locations" ? "where you're based; the first is the main one" : k === "services" ? "what you sell" : "towns you also work in"}</small></label>
      ${chipList(k)}<div class="row"><input id="${p}-${k}" class="search" placeholder="${eg}" data-add="${k}"><button type="button" data-addbtn="${k}">Add</button></div></div>`).join("")}
  </div>`;
}

/** Make the editor work. Returns { get() } for the current details. hooks.onDetect / hooks.onGoogle run the fill-in buttons. */
export function bindBizEditor(root, p, b, { onDetect, onGoogle } = {}) {
  const state = { ...b, locations: locationsOf(b), services: [...(b.services || [])], areas: [...(b.areas || [])] };
  delete state.city;
  const box = root.querySelector(`#${p}be`);
  const draw = (k) => { const el = box.querySelector(`[data-list="${k}"]`); el.innerHTML = state[k].map((x) => `<span class="be-chip">${esc(x)}<button type="button" aria-label="Remove ${esc(x)}" data-rm="${esc(x)}">×</button></span>`).join(""); bindRm(k); };
  const bindRm = (k) => box.querySelectorAll(`[data-list="${k}"] [data-rm]`).forEach((x) => (x.onclick = () => { state[k] = state[k].filter((v) => v !== x.dataset.rm); draw(k); }));
  const add = (k) => { const inp = box.querySelector(`[data-add="${k}"]`); const vals = inp.value.split(/[,;]/).map((s) => s.trim()).filter(Boolean); if (!vals.length) return; state[k] = [...new Set([...state[k], ...vals])]; inp.value = ""; draw(k); };
  for (const k of Object.keys(LISTS)) {
    bindRm(k);
    box.querySelector(`[data-addbtn="${k}"]`).onclick = () => add(k);
    box.querySelector(`[data-add="${k}"]`).onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); add(k); } };
  }
  const get = () => ({ ...state, name: box.querySelector(`#${p}name`).value.trim(), category: box.querySelector(`#${p}cat`).value.trim() });
  const set = (next) => { Object.assign(state, next); box.querySelector(`#${p}name`).value = state.name || ""; box.querySelector(`#${p}cat`).value = state.category || ""; Object.keys(LISTS).forEach(draw); };
  const stat = (msg) => { const el = box.querySelector(`#${p}dstat`); if (el) el.textContent = msg; };
  const run = async (btn, fn, busyText) => {
    if (!fn) return;
    btn.disabled = true; stat(busyText);
    try { const found = await fn(get()); if (found) { set(found.merged); stat(found.note); } else stat("Nothing new found."); }
    catch (e) { stat(String(e.message || e)); }
    btn.disabled = false;
  };
  const d = box.querySelector(`#${p}detect`); if (d) d.onclick = () => run(d, onDetect, "Reading your website…");
  const g = box.querySelector(`#${p}google`); if (g) g.onclick = () => run(g, onGoogle, "Searching Google for your business…");
  return { get, set, stat };
}
