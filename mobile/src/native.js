/**
 * Phone-only helpers, used when the app runs inside the Android app (Capacitor). In a normal browser they fall back
 * quietly, so the same code runs in tests.
 *  - Website requests go through Android's own HTTP client, so the app can read any site, like the extension does.
 *    Redirects are followed here, one hop at a time, so a scan knows the final address.
 *  - Haptic feedback on taps, saves and problems.
 *  - Updates: the build workflow publishes latest.json, the APK and the app's screens as web.zip. A newer build with the
 *    same native parts installs in the app (live update); one that changes them offers the APK.
 *  - Google searches for position checks, and ChatGPT questions, in a real browser window on the phone.
 *  - QR scanning (pairing with the extension) through Google's code scanner: no camera permission needed.
 */
const cap = window.Capacitor;
export const isNative = !!cap?.isNativePlatform?.();
const has = (name) => isNative && !!cap.isPluginAvailable?.(name);

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const NO_BODY = new Set([101, 204, 205, 304]);

/** fetch() for GET requests to other websites, through the native HTTP client. */
async function nativeFetch(url, opts = {}) {
  const headers = Object.fromEntries(new Headers(opts.headers || {}).entries());
  const aborted = new Promise((_, rej) => opts.signal?.addEventListener("abort", () => rej(opts.signal.reason || new Error("The request timed out")), { once: true }));
  let cur = String(url);
  for (let hop = 0; hop <= 10; hop++) {
    const r = await Promise.race([aborted, cap.nativePromise("CapacitorHttp", "request", {
      url: cur, method: "GET", headers, responseType: "text", disableRedirects: true, connectTimeout: 15000, readTimeout: 20000 })]);
    const h = Object.fromEntries(Object.entries(r.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    if (REDIRECTS.has(r.status) && h.location && opts.redirect !== "manual") { cur = new URL(h.location, cur).href; continue; }
    const body = NO_BODY.has(r.status) ? null : typeof r.data === "string" ? r.data : JSON.stringify(r.data ?? "");
    const res = new Response(body, { status: r.status, headers: h });
    Object.defineProperty(res, "url", { value: cur });
    Object.defineProperty(res, "redirected", { value: hop > 0 });
    return res;
  }
  throw new Error("Too many redirects");
}

/** Send GET requests to other websites through the native client (no browser cross-site limits). */
export function installNativeFetch(skip = []) {
  if (!isNative) return;
  const web = window.fetch.bind(window);
  window.fetch = (res, opts = {}) => {
    const u = typeof res === "string" ? res : res instanceof URL ? res.href : res.url;
    const get = !opts.method || opts.method.toUpperCase() === "GET";
    return get && /^https?:/i.test(u) && !u.startsWith(location.origin) && !skip.some((s) => u.startsWith(s)) ? nativeFetch(u, opts) : web(res, opts);
  };
  // Lets the site rating check how crawlers see a homepage (it can set User-Agent here).
  globalThis.sgmCanSetUA = true;
}

/** Haptic feedback: "tap" (light), "ok" (success) or "warn". Vibrates briefly where there's no haptics. */
export function haptic(kind = "tap") {
  try {
    if (has("Haptics")) {
      const p = kind === "tap" ? cap.nativePromise("Haptics", "impact", { style: "LIGHT" })
        : cap.nativePromise("Haptics", "notification", { type: kind === "ok" ? "SUCCESS" : "WARNING" });
      p?.catch?.(() => {});
    } else navigator.vibrate?.(kind === "tap" ? 8 : kind === "ok" ? [12, 60, 12] : [30, 50, 30]);
  } catch {}
}

export const LATEST = "https://github.com/F0rger123/CLAUDE-SEO-GOD-MODE/releases/download/android-app/latest.json";

/** {build, version, apk, notes} when a newer build than this one is published, else null. */
export async function newerBuild() {
  const mine = await fetch("./build.json", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ build: 0 }));
  const latest = await fetch(LATEST + "?t=" + Date.now(), { cache: "no-store", signal: AbortSignal.timeout(15000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return latest?.build > (mine.build || 0) && latest.apk ? { ...latest, mine: mine.build || 0, mineNative: mine.native || null } : null;
}

/** Whether this phone can scan QR codes (the Android app, with the scanner plugin). */
export const canScan = has("BarcodeScanner");

/** Scan one QR code with Google's code scanner. Returns its text, or null if cancelled. */
export async function scanQR() {
  try {
    const r = await cap.nativePromise("BarcodeScanner", "scan", { formats: ["QR_CODE"] });
    return r?.barcodes?.[0]?.rawValue || null;
  } catch (e) {
    if (/cancel/i.test(String(e?.message || e))) return null;
    // The scanner comes from Google Play services and downloads once, the first time it's needed.
    const a = await cap.nativePromise("BarcodeScanner", "isGoogleBarcodeScannerModuleAvailable").catch(() => null);
    if (a && !a.available) {
      cap.nativePromise("BarcodeScanner", "installGoogleBarcodeScannerModule").catch(() => {});
      throw new Error("Getting the QR scanner ready (a one-time download). Try again in a minute, or type the code.");
    }
    throw e;
  }
}

/** Whether this phone can open Google or ChatGPT in a browser window to read them (the Android app). */
export const canSearch = () => !!globalThis.sgmTestBrowse || has("InAppBrowser");

/**
 * Open each job's page in a browser window shown on screen, one at a time a few seconds apart, and read it with
 * `read` (run inside the page; may be async). accept(value) says "done", "wait" (keep the page, read again on the next
 * load) or "blocked" (a robot check or sign-in: you deal with it in the window). It never tries to get past one.
 * Returns [{ q, value }] for the jobs done; value is null if that page couldn't be read. Closing the window stops it.
 */
async function browse(jobs, read, { title, accept, blockedText, headers, revealAfter = 0, onProgress = () => {}, onReveal = () => {}, timeout = 120000 }) {
  // The app has no bundler, so there's no registerPlugin(): call the plugin through the native bridge directly.
  const call = (method) => (opts = {}) => cap.nativePromise("InAppBrowser", method, opts);
  const browser = { openWebView: call("openWebView"), setUrl: call("setUrl"), executeScript: call("executeScript"), close: call("close"), show: call("show"), hide: call("hide"),
    addListener: (event, fn) => cap.addListener("InAppBrowser", event, fn) };
  let wake = null, closed = false;
  const code = `Promise.resolve((${read})()).then((v) => window.mobileApp.postMessage({ detail: { value: v } }))`;
  const handles = await Promise.all([
    browser.addListener("browserPageLoaded", () => setTimeout(() => browser.executeScript({ code }).catch(() => {}), 700)),
    browser.addListener("messageFromWebview", (e) => wake?.(e.detail?.value)),
    browser.addListener("closeEvent", () => { closed = true; wake?.(null); }),
  ]);
  // The window works hidden behind the app's own progress screen. It only shows when it needs you: a robot check,
  // or (revealAfter) a page that's taking long, like ChatGPT asking you to sign in. It hides again once read.
  let shown = false;
  const reveal = (why) => { if (shown || closed) return; shown = true; browser.show().catch(() => {}); onReveal(why); };
  const conceal = () => { if (!shown) return; shown = false; browser.hide().catch(() => {}); onReveal(null); };
  const one = (url, first) => new Promise((resolve) => {
    const done = (v) => { clearTimeout(timer); clearTimeout(slow); wake = null; conceal(); resolve(v); };
    const timer = setTimeout(() => done(null), timeout);
    const slow = revealAfter ? setTimeout(() => reveal(blockedText), revealAfter) : null;
    wake = (v) => {
      if (closed || !v) return done(null);
      const a = accept(v);
      if (a === "blocked") { onProgress(blockedText); reveal(blockedText); }
      else if (a === "done") done(v);
    };
    (first ? browser.openWebView({ url, title, isPresentAfterPageLoad: false, hidden: true, invisibilityMode: "FAKE_VISIBLE", toolbarType: "compact",
      toolbarColor: "#000000", toolbarTextColor: "#FFFFFF", ...(headers ? { headers } : {}) }) : browser.setUrl({ url })).catch(() => done(null));
  });
  const out = [];
  try {
    for (const [i, job] of jobs.entries()) {
      if (i) await new Promise((r) => setTimeout(r, 2500 + Math.random() * 1500));
      if (closed) break;
      onProgress(job.label);
      const value = await one(job.url, i === 0);
      if (closed) break;
      out.push({ q: job.q, value });
    }
  } finally {
    if (!closed) await browser.close().catch(() => {});
    handles.forEach((h) => h.remove());
  }
  return out;
}

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

/** Google each keyword. Returns [{ q, serp }]. */
export async function searchGoogle(qs, read, onProgress, onReveal) {
  if (globalThis.sgmTestBrowse) return (await globalThis.sgmTestBrowse("google", qs)).map(({ q, value }) => ({ q, serp: value }));
  const jobs = qs.map((q, i) => ({ q, url: "https://www.google.com/search?q=" + encodeURIComponent(q), label: `Searching Google for “${q}” (${i + 1} of ${qs.length})…` }));
  // Google's phone pages hide each result's address behind an encrypted redirect; its desktop page links them
  // directly, the same page the Chrome extension reads.
  const got = await browse(jobs, read, { title: "Google: solve the check, then this hides again", onProgress, onReveal, headers: { "User-Agent": DESKTOP_UA }, blockedText: "Google is asking for a robot check. Solve it in the window and the check carries on.",
    accept: (v) => (v.blocked ? "blocked" : v.kind === "serp" ? "done" : "wait") });
  return got.map(({ q, value }) => ({ q, serp: value }));
}

/** A business on Google Maps (the full profile: hours, photos, claim status). read: readGoogle. Returns its page read. */
export async function searchMaps(q, read, onProgress, onReveal) {
  if (globalThis.sgmTestBrowse) return (await globalThis.sgmTestBrowse("maps", [q]))[0]?.value || null;
  // Maps fills the place in after the page loads: read again for up to 10 seconds until it's there.
  const waitRead = new Function(`return async function () { for (let i = 0; i < 20; i++) { const r = (${read})(); if (r.business || r.places?.length || i === 19) return r; await new Promise((s) => setTimeout(s, 500)); } }`)();
  const url = /^https?:/.test(q) ? q : "https://www.google.com/maps/search/" + encodeURIComponent(q);
  const got = await browse([{ q, url, label: /^https?:/.test(q) ? "Opening your Google profile…" : `Finding “${q}” on Google Maps…` }], waitRead,
    { title: "Google Maps: solve the check, then this hides again", onProgress, onReveal, headers: { "User-Agent": DESKTOP_UA }, blockedText: "Google is asking for a robot check. Solve it in the window and the check carries on.",
      accept: (v) => (v.blocked ? "blocked" : v.kind === "maps" ? "done" : "wait") });
  return got[0]?.value || null;
}

/** Ask ChatGPT each question in a window on the phone (no account needed; sign in there if it asks). Returns [{ q, answer }]. */
export async function askChatGPT(qs, read, onProgress, onReveal) {
  if (globalThis.sgmTestBrowse) return (await globalThis.sgmTestBrowse("chatgpt", qs)).map(({ q, value }) => ({ q, answer: value }));
  const jobs = qs.map((q, i) => ({ q, url: "https://chatgpt.com/?q=" + encodeURIComponent(q), label: `Asking ChatGPT “${q}” (${i + 1} of ${qs.length})…` }));
  const got = await browse(jobs, read, { title: "ChatGPT: sign in or verify if asked, then this hides again", onProgress, onReveal, timeout: 180000, revealAfter: 25000,
    blockedText: "ChatGPT is taking a while: it may be asking you to sign in or verify. Do that in the window.",
    accept: (v) => (v.kind === "chat" && v.text ? "done" : "wait") });
  return got.map(({ q, value }) => ({ q, answer: value }));
}

/** Live updates: new screens and features arrive inside the app, no reinstall (Capgo updater, from our own release). */
export const canLiveUpdate = has("CapacitorUpdater");
export const liveReady = () => canLiveUpdate && cap.nativePromise("CapacitorUpdater", "notifyAppReady").catch(() => {});
/** Download a web bundle, checked against its SHA-256 (the plugin refuses a download without one). Returns its id. */
export const liveDownload = async (url, version, checksum) => (await cap.nativePromise("CapacitorUpdater", "download", { url, version: String(version), checksum })).id;
/** Switch to a downloaded bundle: now (reloads the app) or the next time it opens. */
export const liveApply = (id, now) => cap.nativePromise("CapacitorUpdater", now ? "set" : "next", { id });

// ---------------------------------------------------------------- long jobs keep running in the background
/** Whether Android can keep a job running with the app in the background (a foreground service, with a notification). */
export const canKeepRunning = has("ForegroundService");
const FG = 4711;
// Android 14+ needs the service's type on every start: data sync (ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC).
const DATA_SYNC = 1;
/** Start keeping the app running, with a notification saying what it's doing. Asks for notification permission once. */
export async function keepRunning(title, body) {
  if (!canKeepRunning) return;
  try {
    const p = await cap.nativePromise("ForegroundService", "checkPermissions");
    if (p?.display !== "granted") await cap.nativePromise("ForegroundService", "requestPermissions");
    await cap.nativePromise("ForegroundService", "startForegroundService", { id: FG, title, body, smallIcon: "ic_stat_sgm", silent: true, serviceType: DATA_SYNC });
  } catch {}
}
// No updating the running notification: the plugin's update restarts the service without the call Android requires
// within seconds, and Android then closes the app. The notification stays as started; another says when it's done.
export const stopKeepRunning = () => canKeepRunning && cap.nativePromise("ForegroundService", "stopForegroundService").catch(() => {});

// ---------------------------------------------------------------- the back gesture
/** Android's back swipe or button: handler() returns true if it went back inside the app; otherwise the app goes to the background. */
export function onBack(handler) {
  if (!has("App")) return;
  cap.addListener("App", "backButton", () => { if (!handler()) cap.nativePromise("App", "minimizeApp").catch(() => {}); });
}
