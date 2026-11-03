/**
 * The business audit report as HTML, shared by the extension and the Android app (styles in sidepanel.css, .ba-*).
 * Buttons carry data attributes for the screen to bind: data-track (follow a competitor), data-open-url (open a link).
 */
import { PARTS } from "./business.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const st = (n) => (n == null ? "" : n >= 85 ? "s-pass" : n >= 65 ? "s-part" : "s-fail");
const day = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const STATUS = { listed: ["s-pass", "Listed"], missing: ["s-fail", "Not found"], unknown: ["", "Check yourself"] };

export function auditHtml(r, { tracked = new Set() } = {}) {
  const issues = r.issues || [];
  const listed = r.listings.filter((l) => l.status === "listed").length, checked = r.listings.filter((l) => l.status !== "unknown").length;
  return `<div class="ba-head ${st(r.score)}"><div class="ba-score"><b>${r.score ?? "–"}</b><span>Business Score</span></div>
      <div class="ba-parts">${Object.entries(PARTS).map(([k, p]) => `<div class="${st(r.parts[k])}"><span>${p.label}</span><b>${r.parts[k] ?? "–"}</b></div>`).join("")}</div></div>
    <p class="unknowns">${esc(r.biz.name)}${r.biz.city ? `, ${esc(r.biz.city)}` : ""} · ${day(r.t)}. ${r.unread ? `${r.unread} of ${r.searched} Google searches couldn't be read, so some parts are missing. ` : ""}Parts that couldn't be checked are left out of the score.</p>

    <h2 class="sec">Fix these first <small>${issues.length}</small></h2>
    ${issues.length ? `<div class="ba-issues">${issues.slice(0, 25).map((i, n) => `<details class="ba-issue"${n < 2 ? " open" : ""}><summary><span class="dot ${i.size >= 3 ? "s-fail" : "s-part"}"></span><b>${esc(i.title)}</b><small>${PARTS[i.part]?.label || ""}</small></summary>
        <div class="pad"><p>${esc(i.why)}</p><ol>${i.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>${i.link ? `<a class="btn" href="${esc(i.link)}" target="_blank" rel="noopener">Open ${esc(host(i.link))}</a>` : ""}</div></details>`).join("")}</div>`
      : `<p class="verdict">Nothing to fix in what could be checked.</p>`}

    <h2 class="sec">Listings <small>${listed} of ${checked} found</small></h2>
    <div class="ba-list">${r.listings.map((l) => { const [cls, label] = STATUS[l.status]; return `<div class="ba-row"><span class="dot ${cls}"></span><span><b>${esc(l.name)}</b><small>${label}${l.url ? ` · <a href="${esc(l.url)}" target="_blank" rel="noopener">view</a>` : ""}${l.core ? " · important" : ""}</small></span>${l.status !== "listed" && (l.signup || l.check) ? `<a class="btn" href="${esc(l.signup || l.check)}" target="_blank" rel="noopener">${l.status === "unknown" ? "Check" : "Add free"}</a>` : ""}</div>`; }).join("")}</div>
    <p class="unknowns">Found by searching Google for the business on each site. "Not found" means Google didn't show a listing for it, which usually means there isn't one. Every site here has a free listing.</p>

    <h2 class="sec">Consistent details</h2>
    <div class="ba-list">${r.consistency.map((c) => `<div class="ba-row"><span class="dot ${c.ok == null ? "" : c.ok ? "s-pass" : "s-fail"}"></span><span><b>${esc(c.label)}</b><small>${esc(c.detail)}</small></span></div>`).join("")}</div>

    ${r.profile ? `<h2 class="sec">Google Business Profile <small>${r.profile.score ?? "–"}/100</small></h2>
      <div class="ba-list">${r.profile.checks.map((c) => `<div class="ba-row"><span class="dot ${c.ok == null ? "" : c.ok ? "s-pass" : "s-fail"}"></span><span><b>${esc(c.label)}</b><small>${esc(c.detail)}</small></span></div>`).join("")}</div>` : ""}

    <h2 class="sec">Competitors <small>${r.competitors.length}</small></h2>
    ${r.competitors.length ? `<div class="ba-list">${r.competitors.map((c) => `<div class="ba-comp"><div><b>${esc(c.name)}</b><small>${esc(host(c.origin))} · #${c.position} on Google${c.pack ? ` · ${c.pack.rating ?? "–"}★, ${c.pack.reviews ?? "–"} reviews` : ""}</small>
        ${c.scores ? `<span class="ba-chips">${["overall", "seo", "aeo", "geo"].map((k) => `<span class="chip ${st(c.scores[k])}"><b>${c.scores[k]}</b>${k === "overall" ? "All" : k.toUpperCase()}</span>`).join("")}</span>` : ""}
        ${c.offers.length ? `<small>Offers that you don't list: ${c.offers.map(esc).join(", ")}</small>` : ""}</div>
        ${tracked.has(c.origin) ? `<small>Tracked</small>` : `<button data-track="${esc(c.origin)}" data-name="${esc(c.name)}">Track</button>`}</div>`).join("")}</div>`
      : `<p class="lede">${r.biz.category ? "No competitor websites showed up for that search." : "Add what the business does to find its competitors."}</p>`}
    ${r.mapPack.length ? `<h2 class="sec">Google map pack <small>"${esc(`${r.biz.category} ${r.biz.city || ""}`.trim())}"</small></h2>
      <div class="ba-list">${r.mapPack.map((m, i) => `<div class="ba-row"><span class="rk">${i + 1}</span><span><b>${esc(m.name)}</b><small>${m.rating ?? "–"}★ · ${m.reviews ?? "–"} reviews${m.category ? ` · ${esc(m.category)}` : ""}</small></span></div>`).join("")}</div>` : ""}`;
}

/** A prompt for an AI assistant with everything to fix, in order. */
export function auditPrompt(r) {
  return `Help me fix my business's online presence (SEO God Mode business audit, ${r.t.slice(0, 10)}). Business: ${r.biz.name}${r.biz.city ? `, ${r.biz.city}` : ""}${r.biz.category ? ` (${r.biz.category})` : ""}, ${r.biz.origin}. Business Score ${r.score ?? "?"}/100: ${Object.entries(PARTS).map(([k, p]) => `${p.label} ${r.parts[k] ?? "not checked"}`).join(", ")}.

Problems, biggest first:
${(r.issues || []).map((i, n) => `${n + 1}. ${i.title}: ${i.why}\n   Steps: ${i.steps.join(" ")}`).join("\n")}

Walk me through them one at a time. Use only facts I confirm; write [CONFIRM: ...] for anything you'd have to guess. Never suggest paying for listings or buying reviews.`;
}
