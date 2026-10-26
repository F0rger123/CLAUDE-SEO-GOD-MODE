/**
 * Settings, the Google overlay switch, and the daily check (new version, tracked sites due a rescan).
 * Shared by the background worker (alarms) and the side panel (buttons), so a button never depends on
 * the worker being awake or on the same version as the panel.
 */
import { scoreHistory, trackedSites } from "./track.js";
import { checkUpdate } from "./update.js";

const OVERLAY_ID = "sgm-google";
const DAY = 864e5;
export const SETTINGS_DEFAULT = { overlay: false, hover: true, autoPositions: true, notify: true, rescanDays: 7 };
export const getSettings = async () => ({ ...SETTINGS_DEFAULT, ...((await chrome.storage.local.get("settings")).settings || {}) });
export async function saveSettings(patch) { await chrome.storage.local.set({ settings: { ...(await getSettings()), ...patch } }); }

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
export const overlayRegistered = async () => (await chrome.scripting.getRegisteredContentScripts({ ids: [OVERLAY_ID] }).catch(() => [])).length > 0;

/**
 * The version on disk, when it's newer than the code Chrome is running (files replaced by an update, extension not
 * reloaded yet). Chrome keeps running the old code until a reload, so callers reload or offer a button.
 */
export async function staleCode() {
  try {
    const disk = await (await fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" })).json();
    return disk.version && disk.version !== chrome.runtime.getManifest().version ? disk.version : null;
  } catch { return null; }
}

/** Tracked sites not scanned within the reminder window. */
export async function dueSites(days) {
  const due = [];
  for (const site of await trackedSites()) {
    const h = await scoreHistory(site.origin);
    const last = h[h.length - 1];
    if (!last || Date.now() - new Date(last.t) > days * DAY) due.push(site.name);
  }
  return due;
}

/** Check GitHub and the tracked sites; set the toolbar badge; notify (if allowed). force skips the one-day cache. */
export async function runDaily(force = false) {
  const s = await getSettings();
  const u = await checkUpdate(force).catch((e) => ({ error: String(e.message || e) }));
  const due = await dueSites(s.rescanDays);
  const update = !!(u?.available && u.installType !== "normal");
  await chrome.action.setBadgeBackgroundColor({ color: "#000000" }).catch(() => {});
  await chrome.action.setBadgeText({ text: update ? "NEW" : due.length ? String(due.length) : "" }).catch(() => {});
  await chrome.action.setTitle({ title: update ? `SEO God Mode: version ${u.latest} is out` : due.length ? `SEO God Mode: ${due.length} site(s) due a rescan` : "SEO God Mode" }).catch(() => {});
  const { notified = {} } = await chrome.storage.local.get("notified");
  const can = s.notify && chrome.notifications && (await chrome.permissions.contains({ permissions: ["notifications"] }));
  if (can && update && notified.version !== u.latest) {
    chrome.notifications.create("sgm-update", { type: "basic", iconUrl: "icons/icon128.png", title: `SEO God Mode ${u.latest} is out`, message: "Open the extension's Settings to update. Your history is kept." });
    notified.version = u.latest;
  }
  const today = new Date().toISOString().slice(0, 10);
  if (can && due.length && notified.rescan !== today && (!notified.rescanAt || Date.now() - notified.rescanAt > s.rescanDays * DAY)) {
    chrome.notifications.create("sgm-rescan", { type: "basic", iconUrl: "icons/icon128.png", title: `${due.length} tracked site${due.length === 1 ? "" : "s"} due a rescan`,
      message: `${due.slice(0, 3).join(", ")}${due.length > 3 ? "…" : ""}. Open Track and press Rescan all.` });
    notified.rescan = today; notified.rescanAt = Date.now();
  }
  await chrome.storage.local.set({ notified, lastDaily: { at: Date.now(), due, latest: u?.latest || null, error: u?.error || null } });
  return { update: u, due };
}
