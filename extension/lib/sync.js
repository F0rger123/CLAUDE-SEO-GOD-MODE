/**
 * Sync with the phone app, run by the background worker once sync is on (Settings > Sync with your phone, which shows the sync code).
 *  - Push: whenever the extension saves a tracked site, score history, positions, keyword report or a whole-site scan,
 *    the change is sent a moment later. Only the newest whole-site scan of each site is sent ("scan:<origin>").
 *  - Pull: every minute (and when the panel opens) it fetches what changed since last time, such as a site or
 *    competitor added on the phone, and saves it here. Sites added on the phone are listed in Track to be scanned.
 * Nothing is sent while sync is off.
 */
import { EPOCH, makeCloud, siteFromRow, siteRow } from "./cloud.js";

export const cloud = makeCloud({
  load: async () => (await chrome.storage.local.get("cloud")).cloud || null,
  save: (s) => (s ? chrome.storage.local.set({ cloud: s }) : chrome.storage.local.remove(["cloud", "syncState", "syncStatus"])),
});

const DATA = /^(trend|kwpos|kwreport):https?:\/\//;
const SCANS = /^sitescans:(https?:\/\/.+)$/;
const synced = (k) => k === "tracked" || DATA.test(k) || SCANS.test(k);
// Values this worker just wrote from the cloud, so saving them doesn't send them straight back.
const applying = new Map();
const json = (v) => JSON.stringify(v ?? null);
const queue = { sites: new Map(), keys: new Set() };
let timer = null;

/** chrome.storage.onChanged handler (local area). */
export function onStorageChange(changes, area) {
  if (area !== "local") return;
  let any = false;
  for (const [k, { oldValue, newValue }] of Object.entries(changes)) {
    if (!synced(k)) continue;
    if (applying.has(k) && applying.get(k) === json(newValue)) { applying.delete(k); continue; }
    if (k === "tracked") {
      const before = new Map((oldValue || []).map((s) => [s.origin, s])), after = new Map((newValue || []).map((s) => [s.origin, s]));
      for (const [o, s] of after) if (json(before.get(o)) !== json(s)) queue.sites.set(o, { site: s });
      for (const [o, s] of before) if (!after.has(o)) queue.sites.set(o, { site: s, deleted: true });
    } else queue.keys.add(k);
    any = true;
  }
  if (any) { clearTimeout(timer); timer = setTimeout(() => push().catch(status), 1500); }
}

async function status(e) {
  await chrome.storage.local.set({ syncStatus: { at: Date.now(), error: e ? String(e.message || e) : null } });
  if (e?.signedOut) await chrome.alarms.clear("sync");
}

/** Send queued changes. */
export async function push() {
  const s = await cloud.current();
  if (!s) { queue.sites.clear(); queue.keys.clear(); return; }
  const sites = [...queue.sites.values()]; queue.sites.clear();
  const keys = [...queue.keys]; queue.keys.clear();
  // General sites go last and separately, so a server without that site type yet still takes everything else.
  await cloud.putSites(sites.filter((x) => x.site.role !== "general").map((x) => siteRow(x.site, x.deleted)));
  const general = sites.filter((x) => x.site.role === "general");
  let later = null;
  await cloud.putSites(general.map((x) => siteRow(x.site, x.deleted))).catch((e) => {
    if (!e.needsUpdate) throw e;
    later = e;
    for (const x of general) queue.sites.set(x.site.origin, x);
  });
  const got = keys.length ? await chrome.storage.local.get(keys) : {};
  const rows = keys.map((k) => {
    const m = k.match(SCANS);
    const key = m ? "scan:" + m[1] : k, value = m ? got[k]?.[0] ?? null : got[k] ?? null;
    return { key, value, deleted_at: value == null ? new Date().toISOString() : null };
  });
  if (rows.length) await cloud.putData(rows);
  await status(later);
}

/** Everything here, sent once right after signing in. */
export async function pushAll() {
  const all = await chrome.storage.local.get(null);
  for (const s of all.tracked || []) queue.sites.set(s.origin, { site: s });
  for (const k of Object.keys(all)) if (k !== "tracked" && synced(k)) queue.keys.add(k);
  await push();
}

async function write(key, value) {
  applying.set(key, json(value));
  if (value == null) await chrome.storage.local.remove(key); else await chrome.storage.local.set({ [key]: value });
}

/** Fetch what changed on other devices and save it here. Returns how many rows came in. */
export async function pull() {
  const s = await cloud.current();
  if (!s) return 0;
  const st = (await chrome.storage.local.get("syncState")).syncState || { sites: EPOCH, data: EPOCH };
  const sites = await cloud.changes("sites", st.sites);
  if (sites.length) {
    const { tracked = [], phoneAdded = [] } = await chrome.storage.local.get(["tracked", "phoneAdded"]);
    const map = new Map(tracked.map((x) => [x.origin, x]));
    const added = new Set(phoneAdded);
    for (const r of sites) {
      if (r.deleted_at) { map.delete(r.origin); added.delete(r.origin); continue; }
      if (!map.has(r.origin)) added.add(r.origin);
      map.set(r.origin, { ...map.get(r.origin), ...siteFromRow(r) });
    }
    const next = [...map.values()];
    if (json(next) !== json(tracked)) await write("tracked", next);
    await chrome.storage.local.set({ phoneAdded: [...added].filter((o) => map.has(o)), syncPulledAt: Date.now() });
    st.sites = sites[sites.length - 1].updated_at;
  }
  const data = await cloud.changes("site_data", st.data);
  for (const r of data) {
    const m = r.key.match(/^scan:(https?:\/\/.+)$/);
    if (m) {
      // Add the scan to this site's list if it's new here (newest first), keeping the extension's limit.
      if (!r.value) continue;
      const k = "sitescans:" + m[1];
      const list = (await chrome.storage.local.get(k))[k] || [];
      if (list.some((x) => x.id === r.value.id)) continue;
      await write(k, [r.value, ...list].sort((a, b) => String(b.id).localeCompare(String(a.id))).slice(0, 25));
    } else if (DATA.test(r.key)) await write(r.key, r.deleted_at ? null : r.value);
  }
  if (data.length) st.data = data[data.length - 1].updated_at;
  await chrome.storage.local.set({ syncState: st });
  await status(null);
  return sites.length + data.length;
}

/** Push anything waiting, then pull. Used by the alarm and the panel's "Sync now". */
export async function syncNow() {
  try { await push(); const n = await pull(); return { ok: true, n }; }
  catch (e) { await status(e); return { ok: false, error: String(e.message || e) }; }
}

/** Right after turning sync on (new code or one from another device): send everything, fetch everything, and sync every minute from then on. */
export async function startSync() {
  await chrome.storage.local.remove("syncState");
  try { await pushAll(); } catch (e) { await status(e); return { ok: false, error: String(e.message || e) }; }
  await chrome.alarms.create("sync", { periodInMinutes: 1 });
  return syncNow();
}

export async function stopSync() {
  await chrome.alarms.clear("sync");
  await cloud.signOut();
}
