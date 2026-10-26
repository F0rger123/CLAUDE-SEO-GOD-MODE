/*
 * SEO God Mode on Google results pages. Registered only after the user turns it on (On Google view).
 * - Labels results that are your business, a client or a competitor (from Track).
 * - Hover a result: a card with a quick rating, the keywords the page targets, why it shows for this search, and gaps.
 * - Records where your tracked sites rank for this search (if that setting is on).
 * - A small launcher opens the full comparison in the side panel.
 * Everything is built with DOM methods and textContent inside a closed-off Shadow DOM; nothing fetched is injected as HTML.
 */
(() => {
  if (window.__sgmOverlay) return;
  window.__sgmOverlay = true;
  const txt = (el) => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const query = new URLSearchParams(location.search).get("q") || "";
  const ROLE = { mine: ["You", "#2f3fbf"], client: ["Client", "#0f7b6c"], competitor: ["Competitor", "#c2334d"] };
  const DIR = /(^|\.)(yelp|angi|homeadvisor|houzz|thumbtack|bbb|facebook|instagram|linkedin|nextdoor|yellowpages|mapquest|reddit|youtube|wikipedia|amazon|tripadvisor|indeed|pinterest|quora)\.[a-z.]+$/i;

  function results() {
    const seen = new Set(), out = [];
    for (const h3 of document.querySelectorAll("#search a h3, #rso a h3")) {
      const a = h3.closest("a");
      const href = a?.href || "";
      if (!/^https?:/.test(href) || /google\.[a-z.]+\/(search|url|maps)|googleadservices/.test(href) || a.closest("#tads, #bottomads, [data-text-ad]")) continue;
      const u = new URL(href); u.hash = "";
      if (seen.has(u.href)) continue;
      seen.add(u.href);
      out.push({ url: u.href, title: txt(h3), a, block: a.closest("[data-hveid], .g, .MjjYud") || a.parentElement });
    }
    return out;
  }

  // ---- styles shared by every shadow root
  const CSS = `:host{all:initial}*{box-sizing:border-box;font-family:"Segoe UI",system-ui,-apple-system,sans-serif}
  .chip{display:inline-flex;align-items:center;gap:4px;margin-left:8px;padding:1px 8px;border-radius:99px;font:600 11px/1.6 "Segoe UI",system-ui,sans-serif;color:#fff;vertical-align:middle}
  .card{position:fixed;z-index:2147483647;width:340px;max-height:70vh;overflow:auto;background:#fff;color:#121a2b;border:1px solid #d9dee8;border-radius:14px;box-shadow:0 12px 40px rgba(18,26,43,.18);padding:14px;font-size:13px;line-height:1.45}
  @media (prefers-color-scheme:dark){.card{background:#161d2c;color:#e8ecf5;border-color:#263044}.muted{color:#8b95a8!important}}
  .top{display:grid;grid-template-columns:54px 1fr;gap:10px;align-items:center}
  .ring{width:54px;height:54px;border-radius:50%;border:5px solid #a67c00;display:grid;place-content:center;font-weight:750;font-size:17px}
  .ring.good{border-color:#0f7b6c}.ring.bad{border-color:#c2334d}
  .muted{color:#5d6779;font-size:12px}.h{font-weight:700;font-size:12px;margin:10px 0 4px}
  ul{margin:0;padding-left:16px}li{margin:2px 0}.kw{display:flex;flex-wrap:wrap;gap:4px}.kw span{background:#e4e8f1;color:#121a2b;border-radius:99px;padding:1px 8px;font-size:12px}
  button{font:600 12px "Segoe UI",system-ui,sans-serif;border:0;border-radius:8px;padding:7px 10px;background:#2f3fbf;color:#fff;cursor:pointer;margin-top:10px;width:100%}
  .launch{position:fixed;right:18px;bottom:18px;z-index:2147483646;display:flex;align-items:center;gap:8px;background:#121a2b;color:#fff;border-radius:99px;padding:9px 14px;font:600 13px "Segoe UI",system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:pointer;border:0;width:auto;margin:0}
  .launch i{width:10px;height:10px;transform:rotate(45deg);border-radius:2px;background:linear-gradient(135deg,#5262e6,#2f3fbf)}
  .launch b{background:#fff;color:#121a2b;border-radius:99px;padding:0 7px}`;
  const shadowHost = (tag = "span") => { const h = document.createElement(tag); const root = h.attachShadow({ mode: "open" }); const st = document.createElement("style"); st.textContent = CSS; root.append(st); return [h, root]; };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // ---- hover card
  const [cardHost, cardRoot] = shadowHost("div");
  cardHost.dataset.sgm = "card";
  document.documentElement.append(cardHost);
  let card = null, timer = null, over = false;
  const hide = () => { clearTimeout(timer); if (!over && card) { card.remove(); card = null; } };
  function show(r, data) {
    card?.remove();
    card = el("div", "card");
    card.addEventListener("mouseenter", () => (over = true));
    card.addEventListener("mouseleave", () => { over = false; hide(); });
    // Sit in the free space right of the results column (Google's results are ~650px wide); never cover the result.
    const rect = r.block.getBoundingClientRect();
    const titleRight = Math.min(rect.right, (r.a.getBoundingClientRect().left || 0) + 680);
    card.style.left = Math.max(8, Math.min(window.innerWidth - 356, titleRight + 24)) + "px";
    card.style.top = Math.max(8, Math.min(window.innerHeight - 380, rect.top)) + "px";
    const head = el("div", "top");
    const ring = el("div", "ring", data?.score != null ? String(data.score) : "…");
    if (data?.score != null) ring.classList.add(data.score >= 80 ? "good" : data.score < 60 ? "bad" : "mid");
    const t = el("div");
    t.append(el("div", "", host(r.url)), el("div", "muted", data?.score != null ? `Quick rating · ${data.words?.toLocaleString?.() ?? "?"} words · ${data.ms ?? "?"} ms` : "Reading the page…"));
    head.append(ring, t);
    card.append(head);
    if (data?.needsAccess) card.append(el("p", "muted", "Allow SEO God Mode to read other websites (Compete → Compare in the side panel) to see quick ratings here."));
    else if (data?.error || (data?.status && data.status !== 200)) card.append(el("p", "muted", `Couldn't read this page (${data.error || "HTTP " + data.status}).`));
    else if (data?.score != null) {
      if (data.keywords?.length) { card.append(el("div", "h", "Keywords it targets")); const k = el("div", "kw"); data.keywords.forEach((w) => k.append(el("span", "", w))); card.append(k); }
      card.append(el("div", "h", `Why it shows for “${query}”`));
      const ul = el("ul"); (data.why.length ? data.why : ["No strong on-page match; likely links, reviews or brand strength (not measured)"]).forEach((w) => ul.append(el("li", "", w))); card.append(ul);
      if (data.gaps?.length) { card.append(el("div", "h", "Gaps")); const g = el("ul"); data.gaps.forEach((w) => g.append(el("li", "", w))); card.append(g); }
      card.append(el("p", "muted", "Estimate from this one page. Backlinks and reviews aren't measured."));
    }
    const b = el("button", "", "Compare all results in SEO God Mode");
    b.addEventListener("click", () => chrome.runtime.sendMessage({ type: "open" }));
    card.append(b);
    cardRoot.append(card);
  }
  function hover(r) {
    r.block.addEventListener("mouseenter", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        show(r, null);
        const data = await chrome.runtime.sendMessage({ type: "quick", url: r.url, query }).catch((e) => ({ error: String(e.message || e) }));
        if (card) show(r, data);
      }, 450);
    });
    r.block.addEventListener("mouseleave", () => { clearTimeout(timer); setTimeout(hide, 250); });
  }

  // ---- run
  (async () => {
    const settings = await chrome.runtime.sendMessage({ type: "settings" }).catch(() => ({}));
    const list = results();
    if (!list.length) return;
    const res = await chrome.runtime.sendMessage({ type: "serp", query, organic: list.map((r) => ({ url: r.url, title: r.title })) }).catch(() => ({}));
    const tracked = res?.tracked || [];
    let mine = null;
    list.forEach((r, i) => {
      const t = tracked.find((s) => host(s.origin) === host(r.url));
      if (t) {
        const [label, color] = ROLE[t.role] || ROLE.mine;
        const [h, root] = shadowHost();
        h.dataset.sgm = "chip";
        const c = el("span", "chip", `${label} · #${i + 1}`); c.style.background = color; root.append(c);
        r.a.querySelector("h3")?.after(h);
        if (t.role !== "competitor" && !mine) mine = { name: t.name, pos: i + 1 };
      }
      if (settings.hover !== false && !DIR.test(host(r.url))) hover(r);
    });
    const [lh, lroot] = shadowHost("div");
    lh.dataset.sgm = "launcher";
    const launch = el("button", "launch");
    launch.append(el("i"), el("span", "", "SEO God Mode"));
    const own = tracked.filter((s) => s.role !== "competitor");
    if (own.length) launch.append(el("b", "", mine ? `${mine.name}: #${mine.pos}` : `${own[0].name}: not in top ${list.length}`));
    launch.title = "Compare these results with your site";
    launch.addEventListener("click", () => chrome.runtime.sendMessage({ type: "open" }));
    lroot.append(launch);
    document.documentElement.append(lh);
  })();
})();
