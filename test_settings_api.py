"""settings_api: the household settings a frame may edit, against a temp config.json."""
import io, json, unittest
import config
import settings_api as S
from testutil import temp_config

CALS = [{"name": "Family", "color": "#ff9f0a", "url": "https://example.com/private.ics"},
        {"name": "Holidays", "color": "#34c759", "holidays": True, "url": "https://example.com/h.ics"}]


class FakeHandler:
    def __init__(self, body=b'', headers=None):
        self.rfile = io.BytesIO(body); self.headers = headers or {}; self.out = None; self.code = None
    def _json(self, obj, code=200): self.out, self.code = obj, code


class SettingsTest(unittest.TestCase):
    def setUp(self):
        self.cm = temp_config(calendars=CALS, home_assistant={"url": "http://ha", "token": "SECRET"},
                              cameras=[{"name": "Door", "url": "rtsp://u:p@cam"}])
        self.dir = self.cm.__enter__()
    def tearDown(self): self.cm.__exit__(None, None, None)

    def post(self, obj, origin='http://frame:8806', host='frame:8806'):
        b = json.dumps(obj).encode()
        h = FakeHandler(b, {'Content-Length': str(len(b)), 'Origin': origin, 'Host': host})
        self.assertTrue(S.dispatch_post(h, '/api/settings')); return h

    def raw(self): return json.loads(config.path().read_text())

    def test_get_never_sends_secrets(self):
        h = FakeHandler(); S.dispatch_get(h, '/api/settings')
        text = json.dumps(h.out)
        for s in ("SECRET", "private.ics", "rtsp", "http://ha"):
            self.assertNotIn(s, text)
        self.assertEqual([c["name"] for c in h.out["calendars"]], ["Family", "Holidays"])

    def test_home_saves_and_keeps_other_keys(self):
        h = self.post({"section": "home", "home_name": " Our  house ", "place": "Key West", "temperature": "celsius", "wind": "kmh"})
        self.assertEqual(h.code, 200, h.out)
        r = self.raw()
        self.assertEqual((r["home_name"], r["location"]["name"], r["location"]["latitude"]), ("Our house", "Key West", 41.0))
        self.assertEqual(r["units"], {"temperature": "celsius", "wind": "kmh"})
        self.assertEqual(r["home_assistant"]["token"], "SECRET")
        self.assertEqual(config.public()["temp_unit"], "C")
        self.assertTrue(config.path().with_name("config.json.bak").exists())

    def test_timers(self):
        self.assertEqual(self.post({"section": "timers", "timers": [{"label": "Tea", "seconds": 240}]}).code, 200)
        self.assertEqual(self.raw()["timers"], [{"label": "Tea", "seconds": 240}])
        self.assertEqual(self.post({"section": "timers", "timers": [{"label": "x", "seconds": 5}]}).code, 400)
        self.assertEqual(self.post({"section": "timers", "timers": [{"label": "", "seconds": 60}]}).code, 400)
        self.assertEqual(self.post({"section": "timers", "timers": [{"label": "a", "seconds": 60}] * 5}).code, 400)

    def test_calendars_keep_their_links(self):
        h = self.post({"section": "calendars", "calendars": [{"name": "Kids", "color": "#0A84FF", "holidays": True},
                                                             {"name": "Holidays", "color": "#34c759", "holidays": False}]})
        self.assertEqual(h.code, 200, h.out)
        r = self.raw()["calendars"]
        self.assertEqual(r[0], {"name": "Kids", "color": "#0a84ff", "url": "https://example.com/private.ics", "holidays": True})
        self.assertNotIn("holidays", r[1]); self.assertEqual(r[1]["url"], "https://example.com/h.ics")
        self.assertEqual(self.post({"section": "calendars", "calendars": [{"name": "A", "color": "#000000"}]}).code, 400)
        self.assertEqual(self.post({"section": "calendars", "calendars": [{"name": "A", "color": "red"}, {"name": "B", "color": "#000000"}]}).code, 400)

    def test_cannot_touch_anything_else(self):
        before = self.raw()
        self.assertEqual(self.post({"section": "home_assistant", "token": "x"}).code, 400)
        self.assertEqual(self.post({"section": "home", "home_name": "a", "place": "b", "temperature": "kelvin", "wind": "mph"}).code, 400)
        self.assertEqual(self.raw(), before)

    def test_browser_write_needs_same_origin(self):
        h = self.post({"section": "timers", "timers": []}, origin='http://evil')
        self.assertEqual(h.code, 403)


if __name__ == '__main__':
    unittest.main()
