/**
 * Phone-only helpers, used when the app runs inside the Android app (Capacitor). In a normal browser they fall back
 * quietly, so the same code runs in tests.
 *  - Website requests go through Android's own HTTP client, so the app can read any site, like the extension does.
 *    Redirects are followed here, one hop at a time, so a scan knows the final address.
 *  - Haptic feedback on taps, saves and problems.
 *  - Update check: the build workflow publishes latest.json next to the APK; a newer build shows a pop-up.
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
  return latest?.build > (mine.build || 0) && latest.apk ? { ...latest, mine: mine.build || 0 } : null;
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
