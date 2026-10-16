"""server.py end to end on a random port: pages, config.js, the same-origin rule and what is never served.
Network calls (Open-Meteo, TheMealDB) are replaced, so this runs offline."""
import http.client
import json
import threading
import unittest
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

import meals_api
import server
import weather_api
from testutil import temp_config
from test_meals_api import FakeAPI


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cm = temp_config(home_name="Test Home", calendars=[{"name": "Family", "color": "#ff9f0a", "url": "https://cal.example/x.ics"}])
        cls.dir = cls.cm.__enter__()
        cls.patches = [mock.patch.object(meals_api, "http_get", FakeAPI()),
                       mock.patch.object(weather_api, "fetch", side_effect=OSError("offline"))]
        for p in cls.patches:
            p.start()
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), partial(server.Handler, directory=str(server.ROOT)))
        cls.host = "127.0.0.1:%d" % cls.srv.server_port
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown(); cls.srv.server_close()
        for p in cls.patches:
            p.stop()
        cls.cm.__exit__(None, None, None)

    def req(self, method, path, body=None, headers=None):
        c = http.client.HTTPConnection(self.host, timeout=10)
        c.request(method, path, body, headers or {})
        r = c.getresponse(); data = r.read(); c.close()
        return r.status, r.getheader("Content-Type") or "", data, r

    def post(self, path, obj, origin=True):
        h = {"Content-Type": "application/json"}
        if origin:
            h["Origin"] = "http://" + self.host
        return self.req("POST", path, json.dumps(obj), h)

    def test_every_screen_answers(self):
        pages = sorted(p.parent.name for p in (server.ROOT / "frame" / "hv").glob("*/index.html"))
        self.assertGreater(len(pages), 10)
        for name in ["."] + pages:
            path = "/frame/hv/" + ("" if name == "." else name + "/")
            st, ct, body, _ = self.req("GET", path)
            self.assertEqual(st, 200, path); self.assertIn("text/html", ct)
            self.assertIn(b"/frame/hv/config.js", body) if name != "send" else None

    def test_root_redirects_to_the_launcher(self):
        st, _, _, r = self.req("GET", "/")
        self.assertEqual((st, r.getheader("Location")), (302, "/frame/hv/"))

    def test_config_js_has_public_values_only(self):
        st, ct, body, _ = self.req("GET", "/frame/hv/config.js")
        self.assertEqual(st, 200); self.assertIn("javascript", ct)
        cfg = json.loads(body.decode().split("=", 1)[1].rstrip(";\n"))
        self.assertEqual(cfg["home_name"], "Test Home")
        self.assertEqual(cfg["calendars"][0]["key"], "family")
        self.assertNotIn("cal.example", body.decode())        # calendar URLs can be secret
        self.assertNotIn("client_secret", body.decode())

    def test_private_files_are_not_served(self):
        for p in ("/config.json", "/config.example.json", "/server.py", "/data/meal_plan.json",
                  "/frame/../config.json", "/frame/%2e%2e/config.json", "/frame/hv/../../server.py", "/samples/photos/dawn-hills.jpg"):
            c = http.client.HTTPConnection(self.host, timeout=10)
            c.putrequest("GET", p, skip_accept_encoding=True); c.endheaders()
            r = c.getresponse(); r.read(); c.close()
            self.assertEqual(r.status, 404, p)

    def test_frame_doc_works_offline(self):
        st, _, body, _ = self.req("GET", "/api/frame")
        d = json.loads(body)
        self.assertEqual(st, 200)
        self.assertEqual(d["calendars"][0]["status"] in ("unavailable", "needs-package"), True)

    def test_meal_plan_round_trip_and_origin_rule(self):
        t = meals_api.today().isoformat()
        st, _, body, _ = self.post("/api/meals/plan", {"date": t, "id": "1"}, origin=False)
        self.assertEqual(st, 403)
        st, _, body, _ = self.post("/api/meals/plan", {"date": t, "id": "1"})
        self.assertEqual(st, 200); self.assertEqual(json.loads(body)["tonight"]["name"], "Garlic Pasta")
        st, _, body, _ = self.req("GET", "/api/meals/shopping")
        self.assertNotIn("Garlic", [x["name"] for x in json.loads(body)["items"]])   # dinners stay off the list by default
        st, _, body, _ = self.post("/api/meals/plan", {"date": "nope", "id": "1"})
        self.assertEqual(st, 400)
        st, _, _, _ = self.post("/api/meals/plan", {"date": t, "id": None})

    def test_etag_gives_304(self):
        st, _, _, r = self.req("GET", "/api/meals/plan")
        tag = r.getheader("ETag")
        st2, _, body, _ = self.req("GET", "/api/meals/plan", headers={"If-None-Match": tag})
        self.assertEqual((st, st2, body), (200, 304, b""))

    def test_unknown_api_route_is_json_404(self):
        st, ct, body, _ = self.req("GET", "/api/frame/house")
        self.assertEqual(st, 404); self.assertIn("json", ct)
        st, _, _, _ = self.post("/api/frame/light", {})
        self.assertEqual(st, 404)


if __name__ == "__main__":
    unittest.main()
