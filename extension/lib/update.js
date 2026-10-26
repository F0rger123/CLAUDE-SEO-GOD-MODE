/**
 * Updates. A Chrome Web Store install updates itself. An unpacked install (Load unpacked) can't replace its own files,
 * so this checks GitHub Releases for a newer version and either:
 *  - runs the small "one-click updater" helper (a native messaging host installed once with
 *    scripts/updater/install_updater.py), which downloads the release zip into the extension's folder, then reloads; or
 *  - shows the two manual steps (download and unzip over the folder, press Reload).
 * Your scans and tracked sites are kept: they live in Chrome's storage, not in the extension's folder.
 */
export const HOST = "com.agencyzero.seogodmode_updater";
const API = "https://api.github.com/repos/F0rger123/CLAUDE-SEO-GOD-MODE/releases?per_page=10";
export const ZIP = "https://github.com/F0rger123/CLAUDE-SEO-GOD-MODE/releases/latest/download/seo-god-mode-extension.zip";
const DAY = 864e5;

export const newer = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };

/** {current, latest, available, notes, installType}; cached for a day unless force. */
export async function checkUpdate(force = false) {
  const current = chrome.runtime.getManifest().version;
  const self = await chrome.management.getSelf().catch(() => ({}));
  const base = { current, installType: self.installType || "unknown" };
  const { updateCheck } = await chrome.storage.local.get("updateCheck");
  if (!force && updateCheck && Date.now() - updateCheck.at < DAY) return { ...base, ...updateCheck, available: newer(updateCheck.latest || "0.0.0", current) };
  try {
    const r = await fetch(API, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(10000) });
    const rel = (await r.json()).find((x) => /^extension-v\d/.test(x.tag_name) && !x.draft && !x.prerelease);
    const info = { at: Date.now(), latest: rel ? rel.tag_name.replace("extension-v", "") : current, notes: (rel?.body || "").slice(0, 600), url: rel?.html_url || "" };
    await chrome.storage.local.set({ updateCheck: info });
    return { ...base, ...info, available: newer(info.latest, current) };
  } catch (e) {
    return { ...base, latest: null, available: false, error: "Couldn't reach GitHub to check for updates." };
  }
}

/** Is the one-click helper installed? Needs the optional nativeMessaging permission. */
export async function helperStatus() {
  if (!(await chrome.permissions.contains({ permissions: ["nativeMessaging"] }))) return { installed: false, permission: false };
  try {
    const r = await chrome.runtime.sendNativeMessage(HOST, { cmd: "ping" });
    return { installed: !!r?.ok, permission: true, version: r?.version, folder: r?.folder };
  } catch { return { installed: false, permission: true }; }
}

export async function askHelperPermission() { return chrome.permissions.request({ permissions: ["nativeMessaging"] }); }

/** Ask the helper to install the latest release over this extension's folder, then reload. */
export async function runOneClickUpdate() {
  const r = await chrome.runtime.sendNativeMessage(HOST, { cmd: "update", current: chrome.runtime.getManifest().version, id: chrome.runtime.id });
  if (!r?.ok) throw new Error(r?.error || "The updater didn't answer.");
  if (r.updated) setTimeout(() => chrome.runtime.reload(), 400);
  return r;
}

/** Command that installs the helper for this exact extension (shown in the panel to copy). */
export const installCommand = () =>
  `python -c "import urllib.request,sys;exec(urllib.request.urlopen('https://raw.githubusercontent.com/F0rger123/CLAUDE-SEO-GOD-MODE/main/scripts/updater/install_updater.py').read())" --id ${chrome.runtime.id}`;
