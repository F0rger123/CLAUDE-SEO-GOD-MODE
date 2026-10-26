/*
 * SEO God Mode on Google results pages. Registered only after the user turns it on (Settings → On Google).
 * - Labels results that are your site, a client or a competitor (from Track), on their own line above the result.
 * - Hover a result: a card with its search match score against the pages above it, its full site rating if it was
 *   scanned, why it ranks, a side-by-side with the top results, what they do differently, a fix prompt, and
 *   "See full breakdown", which opens the same breakdown in the side panel.
 * - Records where your tracked sites rank for this search (if that setting is on).
 * Everything is built with DOM methods and textContent inside Shadow DOM; nothing fetched is injected as HTML.
 * Colours follow Google's own theme (light or dark), read from the page.
 */
(() => {
  if (window.__sgmOverlay) return;
  window.__sgmOverlay = true;
  const txt = (el) => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const query = new URLSearchParams(location.search).get("q") || "";
  const ROLE = { mine: ["Your site", "solid"], client: ["Your client", "solid"], competitor: ["Competitor", "outline"] };
  const DIR = /(^|\.)(yelp|angi|homeadvisor|houzz|thumbtack|bbb|facebook|instagram|linkedin|nextdoor|yellowpages|mapquest|reddit|youtube|wikipedia|amazon|tripadvisor|indeed|pinterest|quora)\.[a-z.]+$/i;
  const KEY_ROWS = ["kwTitle", "kwH1", "words", "h2", "questions", "business", "faq", "reviews", "ms"];
  const SHORT = { kwTitle: "Search words in title", kwH1: "Search words in H1", words: "Words", h2: "Sections", questions: "Question headings", business: "Business schema",
    faq: "FAQ schema", reviews: "Review stars", ms: "Load time" };

  // Google's theme, from the page background (Google can be dark while the computer is light, and the other way round).
  const dark = (() => {
    for (const el of [document.body, document.documentElement]) {
      const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
      if (m && !(m.length === 4 && +m[3] === 0)) return 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2] < 128;
    }
    return false;
  })();

  function results() {
    const seen = new Set(), out = [];
    for (const h3 of document.querySelectorAll("#search a h3, #rso a h3")) {
      const a = h3.closest("a");
      const href = a?.href || "";
      if (!/^https?:/.test(href) || /google\.[a-z.]+\/(search|url|maps)|googleadservices/.test(href) || a.closest("#tads, #bottomads, [data-text-ad]")) continue;
      const u = new URL(href); u.hash = "";
      if (seen.has(u.href)) continue;
      seen.add(u.href);
      out.push({ url: u.href, title: txt(h3), a, block: a.closest(".MjjYud, .g, [data-hveid]") || a.parentElement });
    }
    return out;
  }

  // ---- styles shared by every shadow root
  const CSS = `:host{all:initial}*{box-sizing:border-box;font-family:"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,sans-serif}
  .w{--bg:#fff;--fg:#000;--mut:#6b6b6b;--rule:#e3e3e3;--rule2:#cfcfcf;--wash:#f4f4f4;--g:#15803d;--y:#b7791f;--r:#dc2626}
  .w.dark{--bg:#1f1f1f;--fg:#fff;--mut:#a8a8a8;--rule:#3a3a3a;--rule2:#555;--wash:#2a2a2a;--g:#4ade80;--y:#facc15;--r:#f87171}
  .good{--c:var(--g)}.mid{--c:var(--y)}.bad{--c:var(--r)}
  .chip i{width:7px;height:7px;border-radius:50%;background:var(--c,var(--fg))}
  .chipline{display:block;margin:0 0 6px}
  .chip{display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border-radius:99px;font:700 11.5px/1.5 "Segoe UI",system-ui,sans-serif;border:1.5px solid var(--fg)}
  .chip.solid{background:var(--fg);color:var(--bg)}.chip.outline{background:transparent;color:var(--fg)}
  .card{position:fixed;z-index:2147483647;width:390px;max-height:78vh;overflow:auto;background:var(--bg);color:var(--fg);border:1px solid var(--rule2);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.25);font-size:13px;line-height:1.45}
  .top{display:grid;grid-template-columns:62px 1fr;gap:12px;align-items:center;padding:14px;border-bottom:1px solid var(--rule)}
  .ring{width:62px;height:62px;border-radius:50%;border:5px solid var(--c,var(--fg));color:var(--c,var(--fg));display:grid;place-content:center;text-align:center;font:800 21px/1 "Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;letter-spacing:-.03em}
  .ring small{display:block;font:600 9px/1.2 "Segoe UI",system-ui,sans-serif;letter-spacing:0;color:var(--mut)}
  
  .host{font:750 14.5px/1.25 "Segoe UI Variable Display","Segoe UI",system-ui,sans-serif}
  .muted{color:var(--mut);font-size:12px}
  .in{padding:2px 14px 14px}
  .site{margin:10px 0 0;padding:8px 10px;border-radius:10px;background:var(--wash);font-size:12.5px}
  .h{font-weight:750;font-size:12.5px;margin:14px 0 6px}
  ul{margin:0;padding-left:16px}li{margin:3px 0}
  table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:4px 6px;border-bottom:1px solid var(--rule)}
  th{color:var(--mut);font-weight:650}td.me{font-weight:750}tr.behind td:first-child{font-weight:750}tr.behind td.me{color:var(--r)}
  .gap b{display:block;font-size:12.5px}.gap p{margin:1px 0 8px;color:var(--mut);font-size:12px}
  .btns{display:grid;grid-template-columns:1fr 1.3fr;gap:8px;margin-top:14px}
  button{font:650 12.5px "Segoe UI",system-ui,sans-serif;border:1px solid var(--rule2);border-radius:99px;padding:9px 12px;background:transparent;color:var(--fg);cursor:pointer;width:100%}
  button.primary{background:var(--fg);color:var(--bg);border-color:var(--fg)}button:hover{border-color:var(--fg)}
  .launch{position:fixed;right:18px;bottom:18px;z-index:2147483646;display:flex;align-items:center;gap:9px;background:var(--fg);color:var(--bg);border-radius:99px;padding:10px 16px;font:700 13px "Segoe UI",system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);cursor:pointer;border:0;width:auto}
  .launch i{width:10px;height:10px;transform:rotate(45deg);border-radius:2px;background:var(--bg)}
  .launch b{background:var(--bg);color:var(--fg);border-radius:99px;padding:0 8px}.launch b.good,.launch b.mid,.launch b.bad{background:var(--c);color:#000}`;
  const posCls = (p) => (p <= 3 ? "good" : p <= 10 ? "mid" : "bad");
  const shadowHost = (tag = "span") => { const h = document.createElement(tag); const root = h.attachShadow({ mode: "open" }); const st = document.createElement("style"); st.textContent = CSS; root.append(st); return [h, root]; };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const wrap = (child) => { const w = el("div", "w" + (dark ? " dark" : "")); w.append(child); return w; };
  const send = (msg) => chrome.runtime.sendMessage(msg).catch((e) => ({ error: /receiving end|context invalidated/i.test(e.message) ? "SEO God Mode was updated or restarted; reload this page" : String(e.message || e) }));

  // ---- hover card
  const [cardHost, cardRoot] = shadowHost("div");
  cardHost.dataset.sgm = "card";
  document.documentElement.append(cardHost);
  let card = null, timer = null, over = false, list = [];
  const hide = () => { clearTimeout(timer); if (!over && card) { card.parentElement.remove(); card = null; } };
  const open = (focus) => send({ type: "open", focus });
  function show(r, d) {
    card?.parentElement.remove();
    card = el("div", "card");
    card.addEventListener("mouseenter", () => (over = true));
    card.addEventListener("mouseleave", () => { over = false; hide(); });
    // Sit in the free space right of the results column (Google's results are ~650px wide); never cover the result.
    const rect = r.block.getBoundingClientRect();
    const titleRight = Math.min(rect.right, (r.a.getBoundingClientRect().left || 0) + 680);
    card.style.left = Math.max(8, Math.min(window.innerWidth - 406, titleRight + 24)) + "px";
    card.style.top = Math.max(8, Math.min(window.innerHeight - 460, rect.top)) + "px";
    const pos = list.indexOf(r) + 1;
    const head = el("div", "top");
    const ring = el("div", "ring", d?.score != null ? String(d.score) : "…");
    if (d?.score != null) { ring.append(el("small", "", "match")); ring.classList.add(d.score >= 80 ? "good" : d.score < 60 ? "bad" : "mid"); }
    const t = el("div");
    t.append(el("div", "host", host(r.url)), el("div", "muted", `#${pos} for “${query}”`));
    if (d?.tech?.line) t.append(el("div", "muted", d.tech.line));
    if (!d) t.append(el("div", "muted", "Reading it and the pages above it…"));
    head.append(ring, t);
    card.append(head);
    const inner = el("div", "in");
    card.append(inner);
    const add = (...xs) => inner.append(...xs);
    if (d?.needsAccess) add(el("p", "muted", "Allow SEO God Mode to read other websites (Settings → Show on Google results) to see the breakdown here."));
    else if (d?.error) add(el("p", "muted", `Couldn't read this page (${d.error}).`));
    else if (d?.score != null) {
      add(el("div", "site", d.site ? `Full site rating: ${d.site.overall}/100 (SEO ${d.site.seo}, AEO ${d.site.aeo}, GEO ${d.site.geo}), scanned ${new Date(d.site.at).toLocaleDateString()}.`
        : `Search match ${d.score}/100: how this page's on-page SEO stacks up against ${d.relation === "above" ? "the pages ranking above it" : "the next results"}. No full site rating yet; See full breakdown to run one.`));
      add(el("div", "h", "Why it ranks here"));
      const why = el("ul"); (d.why.length ? d.why : ["Nothing on the page stands out; likely links, reviews or brand strength (not measured)"]).forEach((w) => why.append(el("li", "", w))); add(why);
      if (d.rivals.length) {
        add(el("div", "h", d.relation === "above" ? `Compared with the ${d.rivals.length === 1 ? "page" : d.rivals.length + " pages"} above it` : "Compared with the next results"));
        const tb = el("table"), hr = el("tr");
        hr.append(el("th", "", ""), el("th", "", "This"), ...d.rivals.map((x) => { const th = el("th", "", "#" + x.position); th.title = x.host; return th; }));
        tb.append(hr);
        d.rows.filter((row) => KEY_ROWS.includes(row.id)).forEach((row) => { const tr = el("tr", row.behind ? "behind" : "");
          tr.append(el("td", "", SHORT[row.id] || row.label), el("td", "me", row.mine), ...row.them.map((x) => el("td", "", x))); tb.append(tr); });
        add(tb);
      }
      const diff = d.gaps.filter((g) => g.behind).slice(0, 3);
      if (diff.length) { add(el("div", "h", "What the others do differently")); diff.forEach((g) => { const x = el("div", "gap"); x.append(el("b", "", g.label), el("p", "", g.fix)); add(x); }); }
      else if (d.gaps.length) { add(el("div", "h", "To rank higher")); d.gaps.slice(0, 2).forEach((g) => { const x = el("div", "gap"); x.append(el("b", "", g.label), el("p", "", g.fix)); add(x); }); }
    }
    const btns = el("div", "btns");
    if (d?.prompt) { const c = el("button", "", "Copy fix prompt"); c.addEventListener("click", async () => { try { await navigator.clipboard.writeText(d.prompt); c.textContent = "Copied"; } catch { c.textContent = "Couldn't copy"; } }); btns.append(c); }
    const b = el("button", "primary", "See full breakdown");
    b.addEventListener("click", () => open(r.url));
    btns.append(b);
    if (!d?.prompt) btns.style.gridTemplateColumns = "1fr";
    add(btns);
    if (d?.score != null) add(el("p", "muted", "On-page signals only. Backlinks, reviews and site age aren't measured."));
    cardRoot.append(wrap(card));
  }
  const organicFor = () => list.map((x) => ({ url: x.url, title: x.title }));
  function hover(r) {
    r.block.addEventListener("mouseenter", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        show(r, null);
        const d = await send({ type: "quick", url: r.url, query, organic: organicFor() });
        if (card) show(r, d);
      }, 450);
    });
    r.block.addEventListener("mouseleave", () => { clearTimeout(timer); setTimeout(hide, 250); });
  }

  // ---- run
  (async () => {
    const settings = await send({ type: "settings" });
    list = results();
    if (!list.length) return;
    const res = await send({ type: "serp", query, organic: organicFor() });
    const tracked = res?.tracked || [];
    let mine = null;
    list.forEach((r, i) => {
      const t = tracked.find((s) => host(s.origin) === host(r.url));
      if (t) {
        const [label, look] = ROLE[t.role] || ROLE.mine;
        const [h, root] = shadowHost("div");
        h.dataset.sgm = "chip";
        h.style.display = "block";
        const line = el("div", "chipline");
        const chip = el("span", "chip " + look + " " + posCls(i + 1));
        chip.append(el("i"), document.createTextNode(`${label} · #${i + 1}`));
        line.append(chip);
        root.append(wrap(line));
        // Its own line above the result, outside Google's link, so it never sits inside or over the title.
        r.block.prepend(h);
        if (t.role !== "competitor" && !mine) mine = { name: t.name, pos: i + 1 };
      }
      if (settings?.hover !== false && !DIR.test(host(r.url))) hover(r);
    });
    const [lh, lroot] = shadowHost("div");
    lh.dataset.sgm = "launcher";
    const launch = el("button", "launch");
    launch.append(el("i"), el("span", "", "SEO God Mode"));
    const own = tracked.filter((s) => s.role !== "competitor");
    if (own.length) launch.append(el("b", mine ? posCls(mine.pos) : "bad", mine ? `${mine.name}: #${mine.pos}` : `${own[0].name}: not in top ${list.length}`));
    launch.title = "Who ranks for this search and why";
    launch.addEventListener("click", () => open(null));
    lroot.append(wrap(launch));
    document.documentElement.append(lh);
  })();
})();
