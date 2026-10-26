/**
 * Background worker.
 *  - Toolbar icon opens the side panel.
 *  - Google overlay (content/google.js, registered only after the user turns it on in the "On Google" view):
 *    full breakdowns for hover cards (via the offscreen document), automatic position recording, and "Open in SEO God Mode".
 *  - Once a day (lib/daily.js, shared with the panel's buttons): checks GitHub for a newer extension version and which tracked sites are due a rescan;
 *    shows a badge on the icon and (if the user allowed it) a notification.
 * Messages are only accepted from this extension's own pages and content scripts.
 */
import { recordPositions, trackedSites } from "./lib/track.js";
import { getSettings as settings, runDaily, staleCode, syncOverlay } from "./lib/daily.js";
import { history } from "./lib/proof.js";

chrome.runtime.onInstalled.addListener(async () => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  chrome.alarms.create("daily", { periodInMinutes: 24 * 60, delayInMinutes: 1 });
  if ((await settings()).overlay) syncOverlay(true);
});
chrome.runtime.onStartup.addListener(() => chrome.alarms.create("daily", { periodInMinutes: 24 * 60, delayInMinutes: 1 }));

// ---------------------------------------------------------------- hover cards: full breakdown of one result
// The breakdown parses HTML, which needs a DOM, so it runs in an offscreen document (offscreen.js).
let creating = null;
async function ensureOffscreen() {
  if ((await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length) return;
  creating ||= chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["DOM_PARSER"], justification: "Read web pages' HTML to rate Google results in the hover cards." })
    .catch((e) => { if (!/single offscreen/i.test(e.message)) throw e; }).finally(() => (creating = null));
  await creating;
}

/** Breakdown of one result against the results above it, plus the site's full rating if it was scanned before. */
async function quick(url, query, organic) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error("Not a web page.");
  if (!(await chrome.permissions.contains({ origins: [u.origin + "/*"] }))) return { needsAccess: true };
  await ensureOffscreen();
  const b = await chrome.runtime.sendMessage({ target: "offscreen", serp: { query, organic }, url: u.href });
  const scan = (await history(u.origin + "/", "site")).list[0];
  return { ...b, site: scan ? { overall: scan.scores.overall, seo: scan.scores.seo, aeo: scan.scores.aeo, geo: scan.scores.geo, at: scan.page.scannedAt } : null };
}
const cleanOrganic = (xs) => (Array.isArray(xs) ? xs : []).slice(0, 20).map((o, i) => ({ position: i + 1, url: String(o.url), title: String(o.title || "").slice(0, 200) }))
  .filter((o) => /^https?:/.test(o.url));

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  const fromGoogle = sender.tab && /^https:\/\/www\.google\.com\/search/.test(sender.url || "");
  (async () => {
    switch (msg?.type) {
      case "quick": return fromGoogle ? quick(String(msg.url), String(msg.query || ""), cleanOrganic(msg.organic)) : { error: "not allowed" };
      case "serp": {
        if (!fromGoogle) return { error: "not allowed" };
        const s = await settings();
        const organic = cleanOrganic(msg.organic);
        const recorded = s.autoPositions ? await recordPositions({ query: String(msg.query || ""), organic, readAt: new Date().toISOString() }) : [];
        // Files updated on disk but old code still running: reload after answering, so the next search uses the new version.
        staleCode().then((v) => v && setTimeout(() => chrome.runtime.reload(), 1500));
        return { recorded, tracked: await trackedSites() };
      }
      case "open": {
        if (!sender.tab) return { error: "no tab" };
        // Open first: sidePanel.open must run while the user's click still counts as a gesture.
        const opening = chrome.sidePanel.open({ tabId: sender.tab.id });
        const focus = typeof msg.focus === "string" && /^https?:/.test(msg.focus) ? msg.focus : null;
        await chrome.storage.local.set({ mode: "compete", openMode: { mode: "compete", focus, at: Date.now() } });
        await opening;
        return { ok: true };
      }
      case "settings": return settings();
      case "syncOverlay": return { on: await syncOverlay(!!msg.on) };
      case "checkNow": return runDaily(true);
      default: return { error: "unknown" };
    }
  })().then(reply, (e) => reply({ error: String(e.message || e) }));
  return true;
});

// ---------------------------------------------------------------- daily: updates and rescan reminders (lib/daily.js)
chrome.alarms.onAlarm.addListener(async (a) => { if (a.name !== "daily") return; if (await staleCode()) return chrome.runtime.reload(); runDaily(); });
chrome.notifications?.onClicked.addListener(async (id) => {
  if (!id.startsWith("sgm-")) return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab) chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  const mode = id === "sgm-update" ? "google" : "track";
  await chrome.storage.local.set({ mode, openMode: { mode, at: Date.now() } });
});
