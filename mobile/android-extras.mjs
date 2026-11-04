// Android settings the generated project needs, applied after `npx cap add android` / `cap sync` (CI and local builds):
//  - Google's QR scanner downloads with the app.
//  - A foreground service, so a business audit keeps running while the app is in the background (with a notification).
//  - Notifications (Android 13+ asks first), and a small status-bar icon for them.
// Safe to run more than once.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const res = join(here, "android", "app", "src", "main");
const manifestPath = join(res, "AndroidManifest.xml");
if (!existsSync(manifestPath)) throw new Error("Run `npx cap add android` first.");
let m = readFileSync(manifestPath, "utf8");

const permissions = ["FOREGROUND_SERVICE", "FOREGROUND_SERVICE_DATA_SYNC", "WAKE_LOCK", "POST_NOTIFICATIONS"];
for (const p of permissions) {
  const line = `<uses-permission android:name="android.permission.${p}" />`;
  if (!m.includes(`android.permission.${p}"`)) m = m.replace("</manifest>", `    ${line}\n</manifest>`);
}
const inApp = [
  '<meta-data android:name="com.google.mlkit.vision.DEPENDENCIES" android:value="barcode_ui" />',
  '<receiver android:name="io.capawesome.capacitorjs.plugins.foregroundservice.NotificationActionBroadcastReceiver" />',
  '<service android:name="io.capawesome.capacitorjs.plugins.foregroundservice.AndroidForegroundService" android:foregroundServiceType="dataSync" />',
];
for (const tag of inApp) {
  const key = tag.match(/android:name="([^"]+)"/)[1];
  if (!m.includes(`"${key}"`)) m = m.replace("</application>", `    ${tag}\n    </application>`);
}
writeFileSync(manifestPath, m);

// Status-bar icon: the app's diamond mark, white on transparent (Android tints it).
const drawable = join(res, "res", "drawable");
mkdirSync(drawable, { recursive: true });
writeFileSync(join(drawable, "ic_stat_sgm.xml"), `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFFFF" android:fillType="evenOdd" android:pathData="M12,1.5 L22.5,12 L12,22.5 L1.5,12 Z M12,6 L6,12 L12,18 L18,12 Z M12,9.4 L9.4,12 L12,14.6 L14.6,12 Z" />
</vector>
`);
// Launch screen (Android 12+): black, with the app's mark, the same in light and dark mode.
const styles = join(res, "res", "values", "styles.xml");
if (existsSync(styles)) {
  let s = readFileSync(styles, "utf8");
  if (!s.includes("windowSplashScreenBackground")) s = s.replace(/(<style name="AppTheme.NoActionBarLaunch"[^>]*>)/,
    `$1
        <item name="windowSplashScreenBackground">#000000</item>
        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>`);
  writeFileSync(styles, s);
}
console.log("android extras applied");
