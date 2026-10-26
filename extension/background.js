/**
 * Background worker.
 *  - Toolbar icon opens the side panel.
 *  - Google overlay (content/google.js, registered only after the user turns it on in the "On Google" view):
 *    quick ratings for hover cards, automatic position recording, and "Open in SEO God Mode".
 *  - Once a day: checks GitHub for a newer extension version and which tracked sites are due a rescan;
 *    shows a badge on the icon and (if the user allowed it) a notification.
 * Messages are only accepted from this extension's own pages and content scripts.
 */
import { quickFacts, quickRate } from "./lib/quick.js";
import { recordPositions, scoreHistory, trackedSites } from "./lib/track.js";
import { checkUpdate } from "./lib/update.js";

const OVERLAY_ID = "sgm-google";
const DAY = 864e5;
export const SETTINGS_DEFAULT = { overlay: false, hover: true, autoPositions: true, notify: true, rescanDays: 7 };
const settings = async () => ({ ...SETTINGS_DEFAULT, ...((await chrome.storage.local.get("settings")).settings || {}) });

chrome.runtime.onInstalled.addListener(async () => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  chrome.alarms.create("daily", { periodInMinutes: 24 * 60, delayInMinutes: 1 });
  if ((await settings()).overlay) syncOverlay(true);
});
chrome.runtime.onStartup.addListener(() => chrome.alarms.create("daily", { periodInMinutes: 24 * 60, delayInMinutes: 1 }));

/** Register or remove the Google results overlay. Needs host access to google.com (asked for in the panel). */
export async function syncOverlay(on) {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [OVERLAY_ID] }).catch(() => []);
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [OVERLAY_ID] });
  if (on && (await chrome.permissions.contains({ origins: ["https://www.google.com/*"] }))) {
    await chrome.scripting.registerContentScripts([{ id: OVERLAY_ID, matches: ["https://www.google.com/search*"], js: ["content/google.js"], runAt: "document_idle", persistAcrossSessions: true }]);
    return true;
  }
  return false;
}

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
    hit = { at: Date.now(), status: r.status, ms: Math.round(performance.now() - t0), facts: quickFacts(html, r.url || u.href) };
    cache.set(key, hit);
    if (cache.size > 200) cache.delete(cache.keys().next().value);
  }
  if (hit.status !== 200) return { status: hit.status };
  return { status: 200, ms: hit.ms, ...quickRate(hit.facts, query, hit.ms) };
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

// ---------------------------------------------------------------- daily: updates and rescan reminders
async function runDaily(force = false) {
  const s = await settings();
  const u = await checkUpdate(force).catch(() => null);
  const sites = await trackedSites();
  const due = [];
  for (const site of sites) {
    const h = await scoreHistory(site.origin);
    const last = h[h.length - 1];
    if (!last || Date.now() - new Date(last.t) > s.rescanDays * DAY) due.push(site.name);
  }
  const update = !!(u?.available && u.installType !== "normal");
  await chrome.action.setBadgeBackgroundColor({ color: update ? "#2f3fbf" : "#a67c00" });
  await chrome.action.setBadgeText({ text: update ? "NEW" : due.length ? String(due.length) : "" });
  await chrome.action.setTitle({ title: update ? `SEO God Mode: version ${u.latest} is out` : due.length ? `SEO God Mode: ${due.length} site(s) due a rescan` : "SEO God Mode" });
  const { notified = {} } = await chrome.storage.local.get("notified");
  const can = s.notify && chrome.notifications && (await chrome.permissions.contains({ permissions: ["notifications"] }));
  if (can && update && notified.version !== u.latest) {
    chrome.notifications.create("sgm-update", { type: "basic", iconUrl: "icons/icon128.png", title: `SEO God Mode ${u.latest} is out`, message: "Open the extension's Track view to update. Your history is kept." });
    notified.version = u.latest;
  }
  const today = new Date().toISOString().slice(0, 10);
  if (can && due.length && notified.rescan !== today && (!notified.rescanAt || Date.now() - notified.rescanAt > s.rescanDays * DAY)) {
    chrome.notifications.create("sgm-rescan", { type: "basic", iconUrl: "icons/icon128.png", title: `${due.length} tracked site${due.length === 1 ? "" : "s"} due a rescan`,
      message: `${due.slice(0, 3).join(", ")}${due.length > 3 ? "…" : ""}. Open Track and press Rescan all.` });
    notified.rescan = today; notified.rescanAt = Date.now();
  }
  await chrome.storage.local.set({ notified });
  return { update: u, due };
}
chrome.alarms.onAlarm.addListener((a) => a.name === "daily" && runDaily());
chrome.notifications?.onClicked.addListener(async (id) => {
  if (!id.startsWith("sgm-")) return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab) chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  await chrome.storage.local.set({ mode: "track", openMode: { mode: "track", at: Date.now() } });
});
