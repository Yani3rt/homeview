"""HomeView server: the frame pages under /frame/ and their small JSON API.

    python3 server.py                     # uses config.json (copy config.example.json first)
    python3 server.py --port 8806         # override the port from config.json
    HOMEVIEW_CONFIG=/path/to/config.json python3 server.py

Only files under frame/ are served. config.json, data/ and photos are never served as files; photos go
out through /api/frame/photo/<id>.jpg, resized.

Writes (every POST) must carry an Origin header that matches the Host, which a browser does for the
pages served here; a page on another site cannot drive the frames."""
import argparse
import hashlib
import json
import os
import sys
import urllib.parse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import camera_api
import config
import frame_api
import ha_api
import reminders_sync
import tides_api
import storms_api
import hv_api
import meals_api
import spotify_api
import weather_api

ROOT = Path(__file__).resolve().parent
MAX_JSON = 8192


class Handler(SimpleHTTPRequestHandler):
    server_version = "HomeView/1"

    def _json(self, obj, code=200):
        body = json.dumps(obj, default=str).encode()
        # ETag + 304: frames poll the same documents every few seconds; unchanged answers send no body.
        etag = '"%s"' % hashlib.md5(body).hexdigest()
        if code == 200 and self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        self.send_response(code)
        if code == 200:
            self.send_header("ETag", etag)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _route(self):
        return urllib.parse.urlparse(self.path).path

    def _same_origin(self):
        origin = urllib.parse.urlparse(self.headers.get("Origin", ""))
        return origin.scheme in ("http", "https") and origin.netloc == self.headers.get("Host")

    def _read_json(self):
        size = int(self.headers.get("Content-Length", "0") or 0)
        if not 0 <= size <= MAX_JSON:
            raise ValueError("Request size is invalid")
        payload = json.loads(self.rfile.read(size) or b"{}")
        if not isinstance(payload, dict):
            raise ValueError("Expected an object")
        return payload

    # ------------------------------------------------------------ GET
    def do_GET(self):
        route = self._route()
        if route in ("", "/", "/frame", "/frame/"):
            self.send_response(302)
            self.send_header("Location", "/frame/hv/")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if route == "/frame/hv/config.js":
            body = ("window.HV_CONFIG=" + json.dumps(config.public()) + ";\n").encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(body)
            return
        if route == "/api/health":
            self._json({"ok": True})
            return
        if route in ("/api/frame", "/api/frame/"):
            self._json(weather_api.frame_doc())
            return
        for mod in (hv_api, meals_api, spotify_api, frame_api, camera_api, ha_api, reminders_sync, tides_api, storms_api):
            if mod.dispatch_get(self, route):
                return
        if route.startswith("/api/"):
            self._json({"ok": False, "error": "Not found"}, 404)
            return
        return super().do_GET()

    def do_HEAD(self):
        route = self._route()
        if route.startswith("/api/"):
            self.send_error(405)
            return
        return super().do_HEAD()

    # ------------------------------------------------------------ POST
    def do_POST(self):
        route = self._route()
        if hv_api.dispatch_post(self, route) or spotify_api.dispatch_post(self, route) or ha_api.dispatch_post(self, route):
            return
        if route not in ("/api/meals/plan", "/api/meals/shopping", "/api/meals/staples", "/api/frame/music"):
            self._json({"ok": False, "error": "Not found"}, 404)
            return
        if not self._same_origin():
            self._json({"ok": False, "error": "Open the frame app to use its controls"}, 403)
            return
        try:
            payload = self._read_json()
            if route == "/api/frame/music":
                result = frame_api.music_post(payload)
            else:
                result = meals_api.dispatch_post(self, route, payload)
                reminders_sync.kick()
            self._json({"ok": True, **(result or {})})
        except (ValueError, TypeError) as e:
            self._json({"ok": False, "error": str(e)}, 400)
        except meals_api.MealsError as e:
            self._json({"ok": False, "error": str(e)}, 503)
        except Exception:
            self._json({"ok": False, "error": "The device or service did not respond. Try again."}, 503)

    # ------------------------------------------------------------ static files
    def translate_path(self, path):
        """Serve only files under frame/. Anything else maps to a path that does not exist."""
        blocked = str(ROOT / "frame" / ".not-served")
        if not urllib.parse.urlparse(path).path.startswith("/frame/"):
            return blocked
        out = Path(super().translate_path(path)).resolve()
        frame = (ROOT / "frame").resolve()
        if out != frame and frame not in out.parents:      # "/frame/../config.json" and the like
            return blocked
        return str(out)

    def end_headers(self):
        # pages ask before reusing a cached copy, so an update shows up on the next load
        if self.path.startswith("/frame/") and self.command == "GET" and "Cache-Control" not in "".join(
                str(h) for h in getattr(self, "_headers_buffer", [])):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def guess_type(self, path):
        t = super().guess_type(path)
        if t in ("text/html", "text/css", "application/javascript", "text/javascript"):
            return t + "; charset=utf-8"
        return t

    def log_message(self, fmt, *args):
        # one line per API call; static files are not logged. str() because send_error passes an int.
        if "/api/" in str(args[0] if args else ""):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main(argv=None):
    ap = argparse.ArgumentParser(description="HomeView kitchen-frame server")
    ap.add_argument("--port", type=int)
    ap.add_argument("--bind")
    a = ap.parse_args(argv)
    if not config.path().exists():
        print(f"No {config.path().name} found; using built-in defaults. "
              "Copy config.example.json to config.json and edit it.", file=sys.stderr)
    srv_conf = config.get("server")
    bind, port = a.bind or srv_conf.get("bind", "0.0.0.0"), a.port or int(srv_conf.get("port", 8806))
    srv = ThreadingHTTPServer((bind, port), partial(Handler, directory=str(ROOT)))
    reminders_sync.start()
    print(f"HomeView -> http://{'localhost' if bind in ('0.0.0.0', '') else bind}:{port}/frame/hv/", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    os.chdir(ROOT)
    main()
