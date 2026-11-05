// Builds www/: the app's own files plus the extension's shared code (scoring, summaries, prompts, sync client)
// and its stylesheet, so the phone and the extension always give the same numbers and wording.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const www = join(here, "www"), ext = join(here, "..", "extension");
rmSync(www, { recursive: true, force: true });
mkdirSync(join(www, "lib"), { recursive: true });
cpSync(join(here, "src"), www, { recursive: true });
cpSync(join(ext, "lib"), join(www, "lib"), { recursive: true });
cpSync(join(ext, "sidepanel.css"), join(www, "lib", "sidepanel.css"));
// This build's number (the GitHub run number, also the Android versionCode), so the app can tell when a newer one is out.
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
// The native parts (plugins, app settings, Android extras such as the launch screen, icons): a live update only installs
// over a build with the same ones.
const nativeFiles = ["capacitor.config.json", "android-extras.mjs", "assets/icon-only.png", "assets/icon-foreground.png", "assets/icon-background.png"];
const native = createHash("sha256").update(JSON.stringify(pkg.dependencies)).update(Buffer.concat(nativeFiles.map((f) => readFileSync(join(here, f))))).digest("hex").slice(0, 16);
writeFileSync(join(www, "build.json"), JSON.stringify({ build: Number(process.env.GITHUB_RUN_NUMBER || 0), version: pkg.version, native }));
console.log("built", www);
