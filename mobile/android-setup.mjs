// Run after `npx cap add android`: lets seogodmode://login links (from the sign-in page) open the app.
import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("./android/app/src/main/AndroidManifest.xml", import.meta.url);
const xml = readFileSync(file, "utf8");
if (!xml.includes('android:scheme="seogodmode"')) {
  const filter = `
            <intent-filter android:autoVerify="false">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="seogodmode" android:host="login" />
            </intent-filter>`;
  const i = xml.indexOf("</intent-filter>");
  if (i < 0) throw new Error("No launcher intent-filter in AndroidManifest.xml");
  writeFileSync(file, xml.slice(0, i + "</intent-filter>".length) + filter + xml.slice(i + "</intent-filter>".length));
}
console.log("sign-in links open the app");
