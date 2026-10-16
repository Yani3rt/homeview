"""Resized copies of photos, for the frames' small WebViews.

The browser decodes every picture at its full pixel size, whatever size it is drawn at, so a
1600 px photo shown as a 480 px tile still costs about 7 MB of decoded bitmap. The pages ask for the
size they draw (`?w=<long edge in px>`) and this module returns a cached JPEG at that size.

Allowed widths are a short list so the cache stays small. Copies go in `cache_dir/w<N>/` (or a
`.w<N>/` folder beside the source when no cache_dir is given) and are rebuilt when the source is newer.
EXIF rotation is applied, and the copy carries no EXIF (no GPS, no camera data).
"""
import io
from pathlib import Path

WIDTHS = (48, 96, 160, 320, 480, 640, 800, 1080, 1280, 1600)


def snap(w):
    """Smallest allowed width that is >= w (None when w is not a usable number)."""
    try:
        w = int(w)
    except (TypeError, ValueError):
        return None
    if w <= 0:
        return None
    for a in WIDTHS:
        if a >= w:
            return a
    return WIDTHS[-1]


def resized(src, w, cache_dir=None):
    """Path of the file to send for `src` at long edge `w`: a cached copy, or `src` itself."""
    w = snap(w)
    if not w:
        return src
    src = Path(src)
    import hashlib
    out = (Path(cache_dir) / f'w{w}' / (hashlib.sha1(str(src).encode()).hexdigest()[:20] + '.jpg')) if cache_dir else src.parent / f'.w{w}' / src.name
    try:
        st = src.stat()
        if out.exists() and out.stat().st_mtime >= st.st_mtime:
            return out
        from PIL import Image
        with Image.open(src) as im:
            from PIL import ImageOps
            if max(im.size) <= w and src.suffix.lower() in ('.jpg', '.jpeg') and not cache_dir:
                return src
            im.draft('RGB', (w, w))  # JPEG decodes at 1/2, 1/4, 1/8 size when the target is small
            im = ImageOps.exif_transpose(im).convert('RGB')
            im.thumbnail((w, w), Image.LANCZOS)
            out.parent.mkdir(parents=True, exist_ok=True)
            tmp = out.with_suffix('.tmp')
            im.save(tmp, format='JPEG', quality=86 if w >= 640 else 80, optimize=True)
        tmp.replace(out)
        return out
    except Exception:
        return src


def send(handler, src, w, cache='public, max-age=86400', cache_dir=None):
    """Send `src` at width `w` as a JPEG. False when the file cannot be read."""
    path = resized(src, w, cache_dir)
    try:
        data = Path(path).read_bytes()
    except OSError:
        return False
    handler.send_response(200)
    handler.send_header('Content-Type', 'image/jpeg')
    handler.send_header('Content-Length', str(len(data)))
    handler.send_header('Cache-Control', cache)
    handler.end_headers()
    handler.wfile.write(data)
    return True
