#!/usr/bin/env python3
"""Build Chrome Web Store images from the real extension screenshots (assets/extension-*.png).

Outputs to store/images/: screenshot-1..3.png (1280x800) and promo-small.png (440x280).
Run the extension e2e test first so the screenshots are current. Needs Pillow; uses Segoe UI if present.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).resolve().parent / "images"
NAVY, NAVY2, INK, MUTED, ACCENT = (15, 20, 32), (22, 29, 44), (232, 236, 245), (160, 170, 190), (142, 156, 255)


def font(size, bold=False):
    for name in (("segoeuib.ttf" if bold else "segoeui.ttf"), ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf")):
        for d in (Path("C:/Windows/Fonts"), Path("/usr/share/fonts/truetype/dejavu")):
            if (d / name).exists():
                return ImageFont.truetype(str(d / name), size)
    return ImageFont.load_default()


def background(w, h):
    im = Image.new("RGB", (w, h), NAVY)
    d = ImageDraw.Draw(im)
    for y in range(h):  # soft vertical gradient
        t = y / h
        d.line([(0, y), (w, y)], fill=tuple(int(NAVY[i] * (1 - t) + NAVY2[i] * t) for i in range(3)))
    return im


def mark(d, x, y, s):
    d.polygon([(x, y - s), (x + s, y), (x, y + s), (x - s, y)], fill=ACCENT)


def shot(title, lines, src, out):
    W, H = 1280, 800
    im = background(W, H)
    d = ImageDraw.Draw(im)
    mark(d, 92, 96, 13)
    d.text((118, 80), "SEO God Mode", font=font(28, True), fill=INK)
    y = 190
    for line in title:
        d.text((80, y), line, font=font(52, True), fill=INK)
        y += 66
    y += 24
    for line in lines:
        d.ellipse([82, y + 13, 94, y + 25], fill=ACCENT)
        d.text((110, y), line, font=font(26), fill=MUTED)
        y += 48
    panel = Image.open(src).convert("RGB")
    ph = 720
    panel = panel.resize((int(panel.width * ph / panel.height), ph), Image.LANCZOS)
    px, py = W - panel.width - 80, (H - ph) // 2
    shadow = Image.new("L", (panel.width + 60, ph + 60), 0)
    ImageDraw.Draw(shadow).rounded_rectangle([30, 30, panel.width + 30, ph + 30], 18, fill=150)
    im.paste((5, 8, 15), (px - 30, py - 18), shadow.filter(ImageFilter.GaussianBlur(18)))
    maskimg = Image.new("L", panel.size, 0)
    ImageDraw.Draw(maskimg).rounded_rectangle([0, 0, panel.width - 1, ph - 1], 16, fill=255)
    im.paste(panel, (px, py), maskimg)
    im.save(OUT / out)


def promo():
    W, H = 440, 280
    im = background(W, H)
    d = ImageDraw.Draw(im)
    mark(d, 60, 84, 16)
    d.text((88, 64), "SEO God Mode", font=font(30, True), fill=INK)
    d.text((40, 130), "Rate any site for SEO, AEO, GEO", font=font(21), fill=INK)
    d.text((40, 162), "with fixes, fix prompts", font=font(21), fill=MUTED)
    d.text((40, 194), "and before/after proof.", font=font(21), fill=MUTED)
    im.save(OUT / "promo-small.png")


def main():
    OUT.mkdir(exist_ok=True)
    a = ROOT / "assets"
    shot(["See what's holding", "a site back"], ["Rates the whole site or one page", "A plain summary of what to fix and set up",
                                                 "Biggest wins first, with points for each fix"], a / "extension-overview.png", "screenshot-1.png")
    shot(["Fix it step", "by step"], ["Steps for WordPress, Shopify, Wix, Next.js and more", "Filter by SEO, AEO or GEO, or search",
                                       "Links to the full guide for every check"], a / "extension-fix.png", "screenshot-4.png")
    shot(["Tools built", "in"], ["Google result preview, measured in pixels", "Schema inspector and 17-crawler access table",
                                 "Links, images, page facts and quick links"], a / "extension-tools.png", "screenshot-5.png")
    shot(["Copy a fix", "prompt"], ["One prompt per issue, or one for everything", "Lists the pages to fix, with ready snippets",
                                     "No invented facts: unknowns are marked to confirm"], a / "extension-prompt.png", "screenshot-2.png")
    shot(["Prove the", "before and after"], ["Save a before scan, fix, scan again", "See every check that was fixed or slipped",
                                             "Download a dated report for your client"], a / "extension-proof.png", "screenshot-3.png")
    shot(["Why do they", "outrank me?"], ["Open any Google search, compare the top pages", "Keyword ideas and a content brief",
                                          "Google Business Profile audit"], a / "extension-compete.png", "screenshot-6.png")
    shot(["Track it", "over time"], ["Score history for every site you follow", "Keyword positions with charts",
                                     "Export and import your history"], a / "extension-track.png", "screenshot-7.png")
    promo()
    print("Wrote", ", ".join(sorted(p.name for p in OUT.glob("*.png"))))


if __name__ == "__main__":
    main()
