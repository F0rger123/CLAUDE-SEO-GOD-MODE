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

// The mark: a diamond ring around a diamond core (squares turned 45°, rounded corners), the same shapes as the header logo.
const square = (h, r) => `M${r - h},${-h} H${h - r} A${r},${r} 0 0 1 ${h},${r - h} V${h - r} A${r},${r} 0 0 1 ${h - r},${h} H${r - h} A${r},${r} 0 0 1 ${-h},${h - r} V${r - h} A${r},${r} 0 0 1 ${r - h},${-h} Z`;
const RING = square(100, 18) + " " + square(74, 5), CORE = square(40, 8);

// Status-bar icon: the mark, white on transparent (Android tints it).
const drawable = join(res, "res", "drawable");
mkdirSync(drawable, { recursive: true });
writeFileSync(join(drawable, "ic_stat_sgm.xml"), `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <group android:translateX="12" android:translateY="12" android:rotation="45" android:scaleX="0.074" android:scaleY="0.074">
    <path android:fillColor="#FFFFFFFF" android:fillType="evenOdd" android:pathData="${RING}" />
    <path android:fillColor="#FFFFFFFF" android:pathData="${CORE}" />
  </group>
</vector>
`);
// Launch screen icon (Android 12+): the ring turns and settles while the core pops in, then it holds until the app is drawn.
// 240dp canvas, the mark about 130dp tip to tip so it sits inside the launch screen's circle.
const S = 0.48;
const anim = (target, ...animators) => `  <target android:name="${target}">
    <aapt:attr name="android:animation">
      <set>
${animators.map((a) => `        <objectAnimator ${a} />`).join("\n")}
      </set>
    </aapt:attr>
  </target>`;
const MARK_VECTOR = `    <vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="240dp" android:height="240dp" android:viewportWidth="240" android:viewportHeight="240">
      <group android:translateX="120" android:translateY="120">
        <group android:name="ring" android:rotation="45" android:scaleX="${S}" android:scaleY="${S}">
          <path android:name="ringpath" android:fillColor="#FFFFFFFF" android:fillType="evenOdd" android:pathData="${RING}" />
        </group>
        <group android:name="core" android:rotation="45" android:scaleX="${S}" android:scaleY="${S}">
          <path android:fillColor="#FFFFFFFF" android:pathData="${CORE}" />
        </group>
      </group>
    </vector>
`;
// The same mark standing still, on black: the window shows it for the moment between the launch screen and the app's first frame.
writeFileSync(join(drawable, "splash_mark_still.xml"), `<?xml version="1.0" encoding="utf-8"?>
${MARK_VECTOR}`);
writeFileSync(join(drawable, "splash_handoff.xml"), `<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:drawable="@android:color/black" />
  <item android:drawable="@drawable/splash_mark_still" android:gravity="center" android:width="288dp" android:height="288dp" />
</layer-list>
`);
writeFileSync(join(drawable, "splash_mark.xml"), `<animated-vector xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt">
  <aapt:attr name="android:drawable">
${MARK_VECTOR}  </aapt:attr>
${anim("ring",
  'android:propertyName="rotation" android:duration="760" android:valueFrom="-45" android:valueTo="45" android:valueType="floatType" android:interpolator="@android:interpolator/fast_out_slow_in"',
  `android:propertyName="scaleX" android:duration="760" android:valueFrom="0.2" android:valueTo="${S}" android:valueType="floatType" android:interpolator="@android:interpolator/fast_out_slow_in"`,
  `android:propertyName="scaleY" android:duration="760" android:valueFrom="0.2" android:valueTo="${S}" android:valueType="floatType" android:interpolator="@android:interpolator/fast_out_slow_in"`)}
${anim("ringpath",
  'android:propertyName="fillAlpha" android:duration="260" android:valueFrom="0" android:valueTo="1" android:valueType="floatType"')}
${anim("core",
  'android:propertyName="scaleX" android:duration="0" android:valueFrom="0" android:valueTo="0" android:valueType="floatType"',
  'android:propertyName="scaleY" android:duration="0" android:valueFrom="0" android:valueTo="0" android:valueType="floatType"',
  `android:propertyName="scaleX" android:startOffset="380" android:duration="420" android:valueFrom="0" android:valueTo="${S}" android:valueType="floatType" android:interpolator="@android:anim/overshoot_interpolator"`,
  `android:propertyName="scaleY" android:startOffset="380" android:duration="420" android:valueFrom="0" android:valueTo="${S}" android:valueType="floatType" android:interpolator="@android:anim/overshoot_interpolator"`)}
</animated-vector>
`);
// Launch screen (Android 12+): black, with the moving mark, the same in light and dark mode. No picture behind it,
// so nothing else shows between the launch screen and the app's own opening.
const styles = join(res, "res", "values", "styles.xml");
if (existsSync(styles)) {
  let s = readFileSync(styles, "utf8");
  s = s.replace(/\s*<item name="windowSplashScreen(Background|AnimatedIcon|AnimationDuration)">[^<]*<\/item>/g, "")
    .replace(/\s*<item name="android:background">@drawable\/splash<\/item>/, "")
    .replace(/(<style name="AppTheme.NoActionBarLaunch"[^>]*>)/, `$1
        <item name="windowSplashScreenBackground">#000000</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/splash_mark</item>
        <item name="windowSplashScreenAnimationDuration">800</item>
        <item name="android:windowBackground">@android:color/black</item>`);
  writeFileSync(styles, s);
}
// Launch screen to app with no blank or white frame: the window behind the app shows the same still mark on black, and
// the web view is see-through until the page paints its own copy of the mark (same place), which then starts the opening.
const activity = join(res, "java", "com", "theagencyzero", "seogodmode", "MainActivity.java");
writeFileSync(activity, `package com.theagencyzero.seogodmode;

import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        long shown = System.currentTimeMillis();
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        // Let the launch animation finish on fast phones.
        splash.setKeepOnScreenCondition(() -> System.currentTimeMillis() - shown < 850);
        View decor = getWindow().getDecorView();
        decor.setBackgroundResource(R.drawable.splash_handoff);
        // Capacitor's system-bars setup repaints the window just after start; paint the mark again after it, and keep
        // what it set for later.
        Drawable[] before = { null };
        decor.post(() -> {
            before[0] = decor.getBackground();
            decor.setBackgroundResource(R.drawable.splash_handoff);
        });
        bridge.getWebView().setBackgroundColor(Color.TRANSPARENT);
        // No fade out: a straight cut to the same picture is seamless.
        splash.setOnExitAnimationListener(view -> view.remove());
        // The window goes back to normal once the page is drawn and its opening (about 1.2 seconds) is over.
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                webView.postVisualStateCallback(0, new WebView.VisualStateCallback() {
                    @Override
                    public void onComplete(long requestId) {
                        decor.postDelayed(() -> decor.setBackground(before[0]), 1600);
                    }
                });
            }
        });
    }
}
`);
console.log("android extras applied");
