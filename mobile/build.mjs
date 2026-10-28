// Builds www/: the app's own files plus the extension's shared code (scoring, summaries, prompts, sync client)
// and its stylesheet, so the phone and the extension always give the same numbers and wording.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const www = join(here, "www"), ext = join(here, "..", "extension");
rmSync(www, { recursive: true, force: true });
mkdirSync(join(www, "lib"), { recursive: true });
cpSync(join(here, "src"), www, { recursive: true });
cpSync(join(ext, "lib"), join(www, "lib"), { recursive: true });
cpSync(join(ext, "sidepanel.css"), join(www, "lib", "sidepanel.css"));
console.log("built", www);
