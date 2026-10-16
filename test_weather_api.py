"""weather_api: Open-Meteo shaping, the last-good cache, and ICS calendars. No network: fetch is replaced."""
import json
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock
from zoneinfo import ZoneInfo

import weather_api as W
from testutil import temp_config

ZONE = ZoneInfo("America/Chicago")


def forecast(now):
    h0 = now.replace(minute=0, second=0, microsecond=0)
    hours = [(h0 + timedelta(hours=i - 2)).strftime("%Y-%m-%dT%H:%M") for i in range(48)]
    days = [(now.date() + timedelta(days=i)).isoformat() for i in range(7)]
    return {
        "current": {"temperature_2m": 61.5, "apparent_temperature": 60.0, "weather_code": 2, "is_day": 1, "wind_speed_10m": 7.2},
        "hourly": {"time": hours, "temperature_2m": [50 + i % 10 for i in range(48)], "weather_code": [1] * 48,
                   "precipitation_probability": [None] + [10] * 47, "is_day": [1] * 48},
        "daily": {"time": days, "weather_code": [2] * 7, "temperature_2m_max": [70 + i for i in range(7)],
                  "temperature_2m_min": [45 + i for i in range(7)], "precipitation_probability_max": [None, 60, 0, 0, 0, 0, 0],
                  "sunrise": [d + "T07:05" for d in days], "sunset": [d + "T18:20" for d in days]},
    }


ICS = b"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:weekly@test
DTSTART:20260105T173000
DTEND:20260105T183000
RRULE:FREQ=WEEKLY;BYDAY=MO
SUMMARY:Practice
END:VEVENT
BEGIN:VEVENT
UID:gone@test
DTSTART:20260106T090000
DTEND:20260106T100000
RRULE:FREQ=DAILY
STATUS:CANCELLED
SUMMARY:Cancelled thing
END:VEVENT
END:VCALENDAR
"""


class FakeNet:
    def __init__(self, now):
        self.now, self.down, self.urls = now, False, []

    def __call__(self, url, timeout=20):
        self.urls.append(url)
        if self.down:
            raise OSError("offline")
        if "air-quality" in url:
            return json.dumps({"current": {"us_aqi": 42}}).encode()
        if "open-meteo" in url:
            return json.dumps(forecast(self.now)).encode()
        if url.endswith(".ics"):
            return ICS
        raise AssertionError(url)


class WeatherTest(unittest.TestCase):
    def setUp(self):
        W._mem.clear()
        self.now = datetime.now(ZONE)
        self.net = FakeNet(self.now)
        self.p = mock.patch.object(W, "fetch", self.net); self.p.start()

    def tearDown(self):
        self.p.stop(); W._mem.clear()

    def test_shape_starts_at_this_hour(self):
        w = W.shape_weather(forecast(self.now), self.now)
        self.assertEqual(w["hourly"][0]["t"][:13], self.now.strftime("%Y-%m-%dT%H"))
        self.assertEqual(len(w["hours24"]), 24)
        self.assertEqual(len(w["days"]), 7)
        self.assertEqual(w["days"][1]["precip_pct"], 60)
        self.assertEqual(w["precip_pct"], 0)          # None becomes 0
        self.assertEqual((w["temp_f"], w["hi_f"], w["lo_f"]), (61.5, 70, 45))

    def test_url_uses_config_location_units_and_zone(self):
        with temp_config(location={"latitude": 51.5, "longitude": -0.12}, timezone="Europe/London", units={"temperature": "celsius", "wind": "kmh"}):
            u = W.weather_url()
        for part in ("latitude=51.5", "longitude=-0.12", "temperature_unit=celsius", "wind_speed_unit=kmh", "timezone=Europe%2FLondon"):
            self.assertIn(part, u)

    def test_doc_has_weather_aqi_and_saves_a_last_good_copy(self):
        with temp_config() as d:
            doc = W.frame_doc()
            self.assertEqual(doc["aqi"], {"us_aqi": 42, "band": "good"})
            self.assertFalse(doc["stale"])
            self.assertTrue((d / "data" / "frame_cache.json").exists())
            W._mem.clear(); self.net.down = True
            doc2 = W.frame_doc()
            self.assertEqual(doc2["weather"]["temp_f"], 61.5)      # from the saved copy
            self.assertIn("warnings", doc2)

    def test_calendar_from_a_local_ics_file_expands_and_drops_cancelled(self):
        with temp_config() as d:
            (d / "cal.ics").write_bytes(ICS)
            with temp_config(calendars=[{"name": "Family Stuff", "color": "#123456", "url": str(d / "cal.ics")}]):
                doc = W.frame_doc()
        self.assertEqual(doc["calendars"][0]["key"], "familystuff")
        if doc["calendars"][0]["status"] == "needs-package":
            self.skipTest("icalendar / recurring-ical-events not installed")
        self.assertEqual(doc["calendars"][0]["status"], "ok")
        titles = {e["title"] for e in doc["calendar_events"]}
        self.assertEqual(titles, {"Practice"})
        self.assertGreater(len(doc["calendar_events"]), 10)       # weekly, over 42 days back and 90 ahead
        self.assertTrue(all(e["cal"] == "familystuff" for e in doc["calendar_events"]))

    def test_unreachable_calendar_does_not_leak_its_url(self):
        def net(url, timeout=20):
            if "secret" in url:
                raise OSError("could not reach https://calendar.example/secret-token.ics")
            return self.net(url)
        with mock.patch.object(W, "fetch", net), temp_config(calendars=[{"name": "Work", "url": "https://calendar.example/secret-token.ics"}]):
            doc = W.frame_doc()
        self.assertEqual(doc["calendars"][0]["status"], "unavailable")
        self.assertNotIn("secret", json.dumps(doc))

    def test_aqi_bands(self):
        self.assertEqual([W.aqi_band(v) for v in (10, 75, 120, 180, 250, 400)],
                         ["good", "moderate", "unhealthy for sensitive groups", "unhealthy", "very unhealthy", "hazardous"])


if __name__ == "__main__":
    unittest.main()
