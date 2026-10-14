"""Draw the sample "photos" in samples/photos/ (simple generated landscapes, no real photos).

    python3 scripts/make_sample_photos.py

They exist so a fresh copy has something on the photo face and the Photos screen. Point
`photos_dir` in config.json at your own folder to replace them."""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "samples" / "photos"
SCENES = [  # name, sky top, sky bottom, sun, ridge colors (far to near), size
    ("dawn-hills", (54, 76, 140), (247, 178, 120), (255, 226, 170), [(120, 104, 150), (84, 74, 120), (46, 44, 80)], (1600, 1067)),
    ("noon-valley", (66, 140, 222), (178, 214, 245), (255, 252, 230), [(126, 168, 150), (78, 132, 98), (40, 92, 60)], (1600, 1067)),
    ("dusk-lake", (40, 30, 80), (236, 120, 90), (255, 196, 140), [(96, 60, 100), (60, 40, 76), (28, 22, 46)], (1600, 1067)),
    ("winter-ridge", (120, 150, 190), (226, 234, 244), (255, 255, 255), [(170, 184, 206), (128, 146, 172), (86, 100, 128)], (1600, 1067)),
    ("desert-mesa", (90, 150, 210), (250, 214, 160), (255, 244, 210), [(214, 150, 110), (184, 108, 72), (130, 70, 46)], (1600, 1067)),
    ("forest-tall", (70, 120, 170), (200, 220, 230), (255, 250, 220), [(110, 150, 140), (60, 104, 84), (24, 60, 44)], (1067, 1600)),
]


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def ridge(w, h, base, amp, seed):
    rnd = random.Random(seed)
    pts, phase = [], [rnd.uniform(0, 6.3) for _ in range(3)]
    for x in range(0, w + 20, 20):
        y = base + sum(amp / (k + 1) * math.sin(x / (w / (2 + k * 3)) + phase[k]) for k in range(3)) + rnd.uniform(-amp * .04, amp * .04)
        pts.append((x, y))
    return pts + [(w, h), (0, h)]


def scene(name, top, bottom, sun, ridges, size, seed):
    w, h = size
    im = Image.new("RGB", size)
    d = ImageDraw.Draw(im)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=lerp(top, bottom, min(1, y / (h * .7))))
    glow = Image.new("L", size, 0)
    gx, gy, r = int(w * .68), int(h * .38), int(min(w, h) * .07)
    ImageDraw.Draw(glow).ellipse([gx - r * 3, gy - r * 3, gx + r * 3, gy + r * 3], fill=110)
    im.paste(Image.new("RGB", size, sun), mask=glow.filter(ImageFilter.GaussianBlur(r * 1.5)))
    d.ellipse([gx - r, gy - r, gx + r, gy + r], fill=sun)
    for i, col in enumerate(ridges):
        d.polygon(ridge(w, h, h * (.52 + i * .1), h * (.12 - i * .025), seed + i), fill=col)
    im = im.filter(ImageFilter.GaussianBlur(1.2))
    im.save(OUT / f"{name}.jpg", quality=84, optimize=True)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for i, s in enumerate(SCENES):
        scene(*s, seed=i * 11)
    print(f"wrote {len(SCENES)} images to {OUT}")
