#!/usr/bin/env python3
"""Package the skill as a .zip for uploading to Claude apps that accept custom skill uploads (claude.ai / Desktop).

The zip holds one top-level folder `seo-god-mode/` with SKILL.md at its root plus the scripts, workflows,
references, templates, and sub-skills it points to. Tests, CI, plugin manifests, and the MCP server are left out.

Usage:
  python scripts/build_skill_zip.py            -> dist/seo-god-mode-skill.zip
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INCLUDE = ["SKILL.md", "RULES.md", "LICENSE", "README.md", "skills", "workflows", "references", "templates", "scripts", "docs"]
SKIP_PARTS = {"__pycache__", ".git", "dist"}


def main():
    out = ROOT / "dist" / "seo-god-mode-skill.zip"
    out.parent.mkdir(exist_ok=True)
    n = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for item in INCLUDE:
            p = ROOT / item
            files = [p] if p.is_file() else sorted(x for x in p.rglob("*") if x.is_file())
            for f in files:
                if SKIP_PARTS & set(f.relative_to(ROOT).parts) or f.suffix == ".pyc":
                    continue
                z.write(f, Path("seo-god-mode") / f.relative_to(ROOT))
                n += 1
    print(f"Wrote {out} ({n} files, {out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    sys.exit(main())
