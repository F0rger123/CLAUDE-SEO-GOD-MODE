#!/usr/bin/env python3
"""One-click updater for the unpacked SEO God Mode Chrome extension. Standard library only.

Chrome won't let an unpacked extension replace its own files, so this installs a tiny helper (a Chrome "native
messaging host") that the extension can call. When you press "Update now" in the extension, the helper downloads the
latest release zip from GitHub, unpacks it over the extension's folder, and the extension reloads itself. Your scans,
tracked sites and history are kept (they live in Chrome's storage, not in the folder).

Install once (the extension shows this command with its own ID filled in):
  python install_updater.py --id <extension id>                 finds the extension's folder from Chrome's settings
  python install_updater.py --id <extension id> --ext-dir "C:/path/to/SEO God Mode extension"
Remove:
  python install_updater.py --uninstall

What it touches: a folder for the helper (Windows %LOCALAPPDATA%/SEOGodMode, macOS/Linux ~/.seo-god-mode), and the
browser's per-user native-messaging registration (Windows HKCU registry keys; macOS/Linux one JSON file per browser).
It only ever writes inside the extension folder you installed it for, and only from the official release URL.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import shutil
import struct
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

HOST = "com.agencyzero.seogodmode_updater"
RAW = "https://raw.githubusercontent.com/F0rger123/CLAUDE-SEO-GOD-MODE/main/scripts/updater/install_updater.py"
ZIP = "https://github.com/F0rger123/CLAUDE-SEO-GOD-MODE/releases/latest/download/seo-god-mode-extension.zip"
VERSION = "1.0"
HOME = Path(os.environ.get("LOCALAPPDATA") or Path.home()) / ("SEOGodMode" if os.name == "nt" else ".seo-god-mode")
CONFIG = HOME / "config.json"

WIN_KEYS = [r"Software\Google\Chrome\NativeMessagingHosts", r"Software\Microsoft\Edge\NativeMessagingHosts",
            r"Software\BraveSoftware\Brave-Browser\NativeMessagingHosts", r"Software\Chromium\NativeMessagingHosts"]
MAC_DIRS = ["Google/Chrome", "Microsoft Edge", "BraveSoftware/Brave-Browser", "Chromium"]
LINUX_DIRS = ["google-chrome", "microsoft-edge", "BraveSoftware/Brave-Browser", "chromium"]
PROFILE_ROOTS = {
    "nt": [r"Google\Chrome\User Data", r"Microsoft\Edge\User Data", r"BraveSoftware\Brave-Browser\User Data", r"Chromium\User Data"],
    "darwin": ["Google/Chrome", "Microsoft Edge", "BraveSoftware/Brave-Browser", "Chromium"],
    "linux": ["google-chrome", "microsoft-edge", "BraveSoftware/Brave-Browser", "chromium"],
}


def load_config() -> dict:
    return json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {"extensions": {}}


def is_extension_dir(p: Path) -> bool:
    m = p / "manifest.json"
    try:
        return m.exists() and "SEO God Mode" in json.loads(m.read_text(encoding="utf-8")).get("name", "")
    except Exception:
        return False


# ---------------------------------------------------------------- host (Chrome runs this)

def read_msg():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    return json.loads(sys.stdin.buffer.read(struct.unpack("=I", raw)[0]).decode("utf-8"))


def send(obj):
    data = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(data)) + data)
    sys.stdout.buffer.flush()


def newer(a: str, b: str) -> bool:
    pa, pb = [int(x) for x in a.split(".")], [int(x) for x in b.split(".")]
    return pa + [0] * (3 - len(pa)) > pb + [0] * (3 - len(pb))


def update(folder: Path, current: str, source: str) -> dict:
    if not is_extension_dir(folder):
        return {"ok": False, "error": f"{folder} doesn't look like the SEO God Mode extension folder."}
    with urllib.request.urlopen(urllib.request.Request(source, headers={"User-Agent": "seo-god-mode-updater"}), timeout=60) as r:
        blob = r.read()
    z = zipfile.ZipFile(io.BytesIO(blob))
    names = z.namelist()
    if "manifest.json" not in names or any(n.startswith(("/", "\\")) or ".." in Path(n).parts for n in names):
        return {"ok": False, "error": "The download isn't a valid extension zip."}
    man = json.loads(z.read("manifest.json").decode("utf-8"))
    if "SEO God Mode" not in man.get("name", ""):
        return {"ok": False, "error": "The download isn't SEO God Mode."}
    latest = man.get("version", "0")
    if not newer(latest, current):
        return {"ok": True, "updated": False, "version": current, "latest": latest}
    with tempfile.TemporaryDirectory() as tmp:
        z.extractall(tmp)
        for src in Path(tmp).rglob("*"):
            if src.is_file():
                dst = folder / src.relative_to(tmp)
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
    return {"ok": True, "updated": True, "version": latest, "previous": current}


def host_main(origin: str):
    cfg = load_config()
    ext_id = origin.replace("chrome-extension://", "").strip("/")
    msg = read_msg() or {}
    folder = cfg.get("extensions", {}).get(ext_id) or cfg.get("extensions", {}).get(msg.get("id", ""))
    try:
        if not folder:
            send({"ok": False, "error": "This extension isn't registered with the updater. Run install_updater.py again."})
        elif msg.get("cmd") == "ping":
            send({"ok": True, "version": VERSION, "folder": folder})
        elif msg.get("cmd") == "update":
            send(update(Path(folder), str(msg.get("current", "0")), cfg.get("source") or ZIP))
        else:
            send({"ok": False, "error": "Unknown command."})
    except Exception as e:
        send({"ok": False, "error": f"{type(e).__name__}: {e}"})


# ---------------------------------------------------------------- install

def find_folder(ext_id: str) -> Path | None:
    plat = "nt" if os.name == "nt" else ("darwin" if sys.platform == "darwin" else "linux")
    base = Path(os.environ.get("LOCALAPPDATA", "")) if plat == "nt" else (Path.home() / "Library/Application Support" if plat == "darwin" else Path.home() / ".config")
    for root in PROFILE_ROOTS[plat]:
        r = base / root
        if not r.exists():
            continue
        for prefs in list(r.glob("*/Secure Preferences")) + list(r.glob("*/Preferences")):
            try:
                ext = json.loads(prefs.read_text(encoding="utf-8")).get("extensions", {}).get("settings", {}).get(ext_id, {})
            except Exception:
                continue
            p = ext.get("path")
            if p and Path(p).is_absolute() and is_extension_dir(Path(p)):
                return Path(p)
    return None


def own_source() -> str:
    try:
        return Path(__file__).read_text(encoding="utf-8")
    except NameError:  # run from `python -c "...exec(urlopen(RAW).read())"`
        return urllib.request.urlopen(RAW, timeout=30).read().decode("utf-8")


def register(manifest: Path):
    if os.name == "nt":
        import winreg
        for k in WIN_KEYS:
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, k + "\\" + HOST) as key:
                winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(manifest))
        return
    dirs = [Path.home() / "Library/Application Support" / d / "NativeMessagingHosts" for d in MAC_DIRS] if sys.platform == "darwin" \
        else [Path.home() / ".config" / d / "NativeMessagingHosts" for d in LINUX_DIRS]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)
        shutil.copy2(manifest, d / f"{HOST}.json")


def unregister():
    if os.name == "nt":
        import winreg
        for k in WIN_KEYS:
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, k + "\\" + HOST)
            except OSError:
                pass
    else:
        dirs = [Path.home() / "Library/Application Support" / d / "NativeMessagingHosts" for d in MAC_DIRS] if sys.platform == "darwin" \
            else [Path.home() / ".config" / d / "NativeMessagingHosts" for d in LINUX_DIRS]
        for d in dirs:
            (d / f"{HOST}.json").unlink(missing_ok=True)
    shutil.rmtree(HOME, ignore_errors=True)


def install(ext_id: str, ext_dir: str | None, source: str | None):
    folder = Path(ext_dir).expanduser().resolve() if ext_dir else find_folder(ext_id)
    if not folder or not is_extension_dir(folder):
        sys.exit("Couldn't find the extension folder. Run again with --ext-dir \"<the folder you loaded in chrome://extensions>\".")
    HOME.mkdir(parents=True, exist_ok=True)
    script = HOME / "updater.py"
    script.write_text(own_source(), encoding="utf-8")
    if os.name == "nt":
        launcher = HOME / "updater.bat"
        launcher.write_text(f'@echo off\r\n"{sys.executable}" -u "{script}" --host %*\r\n', encoding="utf-8")
    else:
        launcher = HOME / "updater.sh"
        launcher.write_text(f'#!/bin/sh\nexec "{sys.executable}" -u "{script}" --host "$@"\n', encoding="utf-8")
        launcher.chmod(0o755)
    cfg = load_config()
    cfg.setdefault("extensions", {})[ext_id] = str(folder)
    if source:
        cfg["source"] = source
    CONFIG.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    manifest = HOME / f"{HOST}.json"
    manifest.write_text(json.dumps({"name": HOST, "description": "SEO God Mode one-click updater", "path": str(launcher), "type": "stdio",
                                    "allowed_origins": [f"chrome-extension://{i}/" for i in cfg["extensions"]]}, indent=2), encoding="utf-8")
    register(manifest)
    print(f"One-click updates are on for {folder}.\nGo back to the extension and press \"Update now\" (or \"Check again\").\n"
          f"To remove: python \"{script}\" --uninstall")


def main():
    if "--host" in sys.argv:
        args = [a for a in sys.argv[1:] if a != "--host"]
        host_main(next((a for a in args if a.startswith("chrome-extension://")), ""))
        return
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--id", help="extension ID (shown in the extension's update panel and in chrome://extensions)")
    ap.add_argument("--ext-dir", help="the folder you loaded with 'Load unpacked'")
    ap.add_argument("--source", help=argparse.SUPPRESS)  # tests: alternative zip URL
    ap.add_argument("--uninstall", action="store_true")
    a = ap.parse_args()
    if a.uninstall:
        unregister()
        print("One-click updater removed.")
        return
    if not a.id:
        ap.error("--id is required (copy the command from the extension's update panel)")
    install(a.id, a.ext_dir, a.source)


if __name__ == "__main__":
    main()
