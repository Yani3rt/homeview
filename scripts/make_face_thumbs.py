# /// script
# dependencies = ["playwright==1.59.0"]
# ///
"""Render a preview of every Standby face for Settings > Standby faces.

    uv run scripts/make_face_thumbs.py [BASE_URL]        # default http://127.0.0.1:8806
    (first time only: uv run --with playwright==1.59.0 playwright install chromium)

Opens /frame/hv/standby/?face=<name>&thumb=1 at 1280x800 against a running server, waits for the data
and photos, and saves frame/hv/faces/thumbs/<name>.jpg at 640x400. The copies in the repository were
made from the sample photos and sample calendar; run this again to show your own data. Your thumbnails
then contain your photos and calendar titles, so do not publish them."""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8806").rstrip("/")
OUT = ROOT / "frame" / "hv" / "faces" / "thumbs"
FACES = {"photos": "photo", "info": "info", "today": "today", "week": "week", "weather": "weather", "tomorrow": "tomorrow", "board": "board", "up": "up",
         "analog": "analog", "numerals": "numerals", "minimal": "minimal", "month": "month", "alert": "alert"}

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=0.5)
        for name, face in FACES.items():
            pg = ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(f"{BASE}/frame/hv/standby/?face={face}&thumb=1", wait_until="networkidle")
            pg.wait_for_timeout(3000)
            pg.screenshot(path=str(OUT / f"{name}.jpg"), type="jpeg", quality=78)
            print(name, (OUT / f"{name}.jpg").stat().st_size // 1024, "KB", ("ERROR " + errs[0]) if errs else "")
            pg.close()
        b.close()
