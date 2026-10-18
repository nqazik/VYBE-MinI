#!/usr/bin/env python3
"""Generate the PWA icons (PNG) and favicon from code. Re-run with: npm run icons

Needs Pillow:  pip install pillow
Edit the colours / glyph below to restyle the app icon.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "public"
OUT.mkdir(exist_ok=True)

A = (139, 92, 246)   # violet
B = (59, 130, 246)   # blue
SS = 4               # supersampling factor for smooth edges


def gradient(size: int) -> Image.Image:
    """Diagonal violet -> blue gradient."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(round(A[i] + (B[i] - A[i]) * t) for i in range(3))
    return img


def glyph(size: int, scale: float) -> Image.Image:
    """A soft white play-triangle with a faint glow, centred; `scale` = fraction of the canvas it may use."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    w = size * scale
    h = w * 1.1
    cx, cy = size / 2 + w * 0.06, size / 2          # nudge right: a triangle's visual centre sits left of its box centre
    pts = [(cx - w / 2, cy - h / 2), (cx - w / 2, cy + h / 2), (cx + w / 2, cy)]
    # rounded corners: draw the triangle, then round it with a blur+threshold trick
    d.polygon(pts, fill=(255, 255, 255, 255))
    r = max(2, int(size * 0.035))
    blurred = layer.filter(ImageFilter.GaussianBlur(r))
    alpha = blurred.getchannel("A").point(lambda v: 255 if v > 150 else 0)
    alpha = alpha.filter(ImageFilter.GaussianBlur(max(1, SS // 2)))
    out = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    out.putalpha(alpha)
    glow = out.filter(ImageFilter.GaussianBlur(size * 0.03))
    final = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    final.alpha_composite(glow)
    final.alpha_composite(out)
    return final


def make(size: int, *, rounded: bool, glyph_scale: float, name: str) -> None:
    big = size * SS
    base = gradient(big).convert("RGBA")
    base.alpha_composite(glyph(big, glyph_scale))
    if rounded:
        mask = Image.new("L", (big, big), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * 0.225), fill=255)
        base.putalpha(mask)
    base = base.resize((size, size), Image.LANCZOS)
    base.save(OUT / name, optimize=True)
    print("wrote", OUT / name)


# "any" icons: rounded square with transparent corners
make(192, rounded=True, glyph_scale=0.42, name="icon-192.png")
make(512, rounded=True, glyph_scale=0.42, name="icon-512.png")
# "maskable": full-bleed, glyph kept inside the central 80% safe zone so any OS mask is fine
make(512, rounded=False, glyph_scale=0.34, name="icon-maskable-512.png")
# iOS: full-bleed square (iOS applies its own rounding)
make(180, rounded=False, glyph_scale=0.4, name="apple-touch-icon.png")

(OUT / "favicon.svg").write_text(
    """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8b5cf6"/>
      <stop offset="1" stop-color="#3b82f6"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="15" fill="url(#g)"/>
  <path d="M25 19.5v25a2 2 0 0 0 3 1.7l20.5-12.5a2 2 0 0 0 0-3.4L28 17.8a2 2 0 0 0-3 1.7z" fill="#fff"/>
</svg>
"""
)
print("wrote", OUT / "favicon.svg")
