/**
 * Background worker.
 *  - Toolbar icon opens the side panel.
 *  - Google overlay (content/google.js, registered only after the user turns it on in the "On Google" view):
 *    quick ratings for hover cards, automatic position recording, and "Open in SEO God Mode".
 *  - Once a day (lib/daily.js, shared with the panel's buttons): checks GitHub for a newer extension version and which tracked sites are due a rescan;
 *    shows a badge on the icon and (if the user allowed it) a notification.
 * Messages are only accepted from this extension's own pages and content scripts.
 */
import { quickFacts, quickRate } from "./lib/quick.js";
import { recordPositions, trackedSites } from "./lib/track.js";
import { getSettings as settings, runDaily, syncOverlay } from "./lib/daily.js";
import { detectTech, techLine } from "./lib/tech.js";

chrome.runtime.onInstalled.addListener(async () => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  chrome.alarms.create("daily", { periodInMinutes: 24 * 60, delayInMinutes: 1 });
  if ((await settings()).overlay) syncOverlay(true);
});
chrome.runtime.onStartup.addListener(() => chrome.alarms.create("daily", { periodInMinutes: 24 * 60, delayInMinutes: 1 }));

// ---------------------------------------------------------------- quick ratings (hover cards)
const cache = new Map();
async function quick(url, query) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error("Not a web page.");
  if (!(await chrome.permissions.contains({ origins: [u.origin + "/*"] }))) return { needsAccess: true };
  const key = u.href;
  let hit = cache.get(key);
  if (!hit || Date.now() - hit.at > 36e5) {
    const t0 = performance.now();
    const r = await fetch(u.href, { credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(12000) });
    const html = (await r.text()).slice(0, 3e6);
    const tech = detectTech(html, Object.fromEntries([...r.headers].map(([k, v]) => [k.toLowerCase(), v])));
    hit = { at: Date.now(), status: r.status, ms: Math.round(performance.now() - t0), facts: quickFacts(html, r.url || u.href), tech: { line: techLine(tech), tools: tech.tools.slice(0, 4) } };
    cache.set(key, hit);
    if (cache.size > 200) cache.delete(cache.keys().next().value);
  }
  if (hit.status !== 200) return { status: hit.status };
  return { status: 200, ms: hit.ms, tech: hit.tech, ...quickRate(hit.facts, query, hit.ms) };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  const fromGoogle = sender.tab && /^https:\/\/www\.google\.com\/search/.test(sender.url || "");
  (async () => {
    switch (msg?.type) {
      case "quick": return fromGoogle ? quick(String(msg.url), String(msg.query || "")) : { error: "not allowed" };
      case "serp": {
        if (!fromGoogle) return { error: "not allowed" };
        const s = await settings();
        const organic = (msg.organic || []).slice(0, 20).map((o, i) => ({ position: i + 1, url: String(o.url), title: String(o.title || "").slice(0, 200) }));
        const recorded = s.autoPositions ? await recordPositions({ query: String(msg.query || ""), organic, readAt: new Date().toISOString() }) : [];
        return { recorded, tracked: await trackedSites() };
      }
      case "open": {
        if (!sender.tab) return { error: "no tab" };
        // Open first: sidePanel.open must run while the user's click still counts as a gesture.
        const opening = chrome.sidePanel.open({ tabId: sender.tab.id });
        await chrome.storage.local.set({ mode: "compete", openMode: { mode: "compete", at: Date.now() } });
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
chrome.alarms.onAlarm.addListener((a) => a.name === "daily" && runDaily());
chrome.notifications?.onClicked.addListener(async (id) => {
  if (!id.startsWith("sgm-")) return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab) chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  const mode = id === "sgm-update" ? "google" : "track";
  await chrome.storage.local.set({ mode, openMode: { mode, at: Date.now() } });
});
