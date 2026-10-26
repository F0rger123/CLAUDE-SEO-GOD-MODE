#!/usr/bin/env python3
"""Package the Chrome extension for download and for the Chrome Web Store.

The zip has manifest.json at its root (the Web Store requires that) and leaves out tests.

Usage:
  python scripts/build_extension_zip.py            -> dist/seo-god-mode-extension.zip
"""
from __future__ import annotations

import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "extension"


def main():
    version = json.loads((EXT / "manifest.json").read_text(encoding="utf-8"))["version"]
    out = ROOT / "dist" / "seo-god-mode-extension.zip"
    out.parent.mkdir(exist_ok=True)
    files = sorted(f for f in EXT.rglob("*") if f.is_file() and "tests" not in f.relative_to(EXT).parts
                   and f.name != "README.md")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in files:
            z.write(f, f.relative_to(EXT).as_posix())
    print(f"Wrote {out} (v{version}, {len(files)} files, {out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
