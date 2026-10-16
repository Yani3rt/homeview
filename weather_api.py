"""Weather (Open-Meteo, no key), air quality (Open-Meteo air quality, no key) and calendars (ICS links)
for GET /api/frame. Fetched on demand and cached in memory; the last good copy is saved to
<data_dir>/frame_cache.json so a restart or a failed fetch still shows the last forecast.

Document shape (what the pages read):
  weather   {temp_f, feels_f, code, is_day, wind_mph, hi_f, lo_f, precip_pct, sunrise, sunset, next_sunrise,
             hourly[7], hours24[24], days[7]}    temperatures are in the configured unit; the _f names are kept
             because every page reads them
  aqi       {us_aqi, band} or null
  calendar_events  [{uid, title, start, end, all_day, location, cal}]  (cal = the calendar's key)
  calendars [{key, name, color, status}]  status: ok | unavailable | needs-package
  stale     true when the weather is older than 30 minutes
"""
import json
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime, time as dtime, timedelta
from zoneinfo import ZoneInfo

import config

UA = "HomeView/1 (+self-hosted kitchen dashboard)"
WEATHER_TTL = 600        # Open-Meteo updates hourly; every 10 minutes is plenty
AQI_TTL = 1800
CAL_TTL = 900
STALE_S = 1800
PAST_DAYS, AHEAD_DAYS = 42, 90

_lock = threading.Lock()
_mem = {}   # name -> (fetched_at, value)


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def tz():
    try:
        return ZoneInfo(config.get("timezone"))
    except Exception:
        return ZoneInfo("UTC")


def weather_url():
    c = config.load()
    loc, units = c["location"], c["units"]
    unit = "celsius" if str(units.get("temperature", "")).lower().startswith("c") else "fahrenheit"
    wind = units.get("wind") if units.get("wind") in ("kmh", "ms", "mph", "kn") else "mph"
    q = {
        "latitude": loc["latitude"], "longitude": loc["longitude"], "timezone": c["timezone"],
        "temperature_unit": unit, "wind_speed_unit": wind,
        "current": "temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m",
        "hourly": "temperature_2m,weather_code,precipitation_probability,is_day,uv_index,wind_speed_10m",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max",
        "minutely_15": "precipitation", "forecast_minutely_15": 16,       # the next 4 hours, for "rain in 20 minutes"
        "forecast_days": 7,
    }
    return "https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(q)


def aqi_url():
    loc = config.get("location")
    q = {"latitude": loc["latitude"], "longitude": loc["longitude"], "current": "us_aqi", "timezone": config.get("timezone")}
    return "https://air-quality-api.open-meteo.com/v1/air-quality?" + urllib.parse.urlencode(q)


RAIN_MM = 0.1        # per 15 minutes: below this it isn't really raining
UV_HIGH = 6          # WHO: 6-7 high, 8-10 very high, 11+ extreme


def uv_doc(hr, day, today):
    """Today's UV: the peak, and the stretch of the day when it's high (6+)."""
    hours = [(t, v) for t, v in zip(hr["time"], hr.get("uv_index") or []) if t.startswith(today) and v is not None]
    if not hours:
        return None
    peak = max(v for _, v in hours)
    high = [t for t, v in hours if v >= UV_HIGH]
    mx = (day.get("uv_index_max") or [None])[0]
    return {"max": round(mx if mx is not None else peak, 1), "high_from": high[0] if high else None,
            "high_until": (high[-1][:11] + "%02d:00" % (int(high[-1][11:13]) + 1)) if high else None,
            "hours": [{"t": t, "uv": round(v, 1)} for t, v in hours]}


def nowcast(min15, now):
    """From 15-minute precipitation: is it raining now, when does it start or stop (within the next 2 hours)."""
    if not min15:
        return None
    key = now.strftime("%Y-%m-%dT%H:%M")
    slots = [s for s in min15 if s["t"] >= (now - timedelta(minutes=15)).strftime("%Y-%m-%dT%H:%M")]
    cur = [s for s in slots if s["t"] <= key]
    ahead = [s for s in slots if s["t"] > key][:8]
    raining = bool(cur) and (cur[-1]["mm"] or 0) >= RAIN_MM
    def mins(t):
        return max(0, int((datetime.fromisoformat(t).replace(tzinfo=now.tzinfo) - now).total_seconds() // 60))
    if raining:
        dry = next((s for s in ahead if (s["mm"] or 0) < RAIN_MM), None)
        return {"state": "stop", "at": dry["t"], "mins": mins(dry["t"])} if dry else {"state": "rain"}
    wet = next((s for s in ahead if (s["mm"] or 0) >= RAIN_MM), None)
    if wet:
        heavy = max((s["mm"] or 0) for s in ahead) >= 2.5
        return {"state": "start", "at": wet["t"], "mins": mins(wet["t"]), "heavy": heavy}
    return None


def shape_weather(d, now):
    cur, hr, day = d["current"], d["hourly"], d["daily"]
    this_hour = now.replace(minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M")
    start = hr["time"].index(this_hour) if this_hour in hr["time"] else 0

    def hour(i):
        ws = hr.get("wind_speed_10m") or []
        return {"t": hr["time"][i], "temp_f": hr["temperature_2m"][i], "code": hr["weather_code"][i],
                "is_day": hr["is_day"][i], "precip_pct": hr["precipitation_probability"][i] or 0,
                "wind": ws[i] if i < len(ws) else None}

    return {
        "temp_f": cur["temperature_2m"],
        "temp_source": "open-meteo",
        "feels_f": cur["apparent_temperature"],
        "code": cur["weather_code"],
        "is_day": cur["is_day"],
        "wind_mph": cur["wind_speed_10m"],
        "hi_f": day["temperature_2m_max"][0],
        "lo_f": day["temperature_2m_min"][0],
        "precip_pct": day["precipitation_probability_max"][0] or 0,
        "sunrise": day["sunrise"][0],
        "sunset": day["sunset"][0],
        "next_sunrise": day["sunrise"][1] if len(day["sunrise"]) > 1 else None,
        "hourly": [hour(i) for i in range(start, min(start + 7, len(hr["time"])))],
        "hours24": [hour(i) for i in range(start, min(start + 24, len(hr["time"])))],
        "uv": uv_doc(hr, day, now.date().isoformat()),
        "min15": [{"t": t, "mm": v} for t, v in zip((d.get("minutely_15") or {}).get("time") or [],
                                                     (d.get("minutely_15") or {}).get("precipitation") or [])],
        "days": [{"date": day["time"][i], "code": day["weather_code"][i],
                  "hi_f": day["temperature_2m_max"][i], "lo_f": day["temperature_2m_min"][i],
                  "precip_pct": day["precipitation_probability_max"][i] or 0,
                  # every hour of that day, for the tap-a-day sheet on the Weather screen
                  "hours": [hour(j) for j in range(len(hr["time"])) if hr["time"][j].startswith(day["time"][i])]}
                 for i in range(len(day["time"]))],
    }


def aqi_band(v):
    if v is None:
        return None
    for limit, name in ((50, "good"), (100, "moderate"), (150, "unhealthy for sensitive groups"),
                        (200, "unhealthy"), (300, "very unhealthy")):
        if v <= limit:
            return name
    return "hazardous"


# ---------------------------------------------------------------- calendars

def _local(v, zone):
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=zone)
        return v.astimezone(zone), False
    return datetime.combine(v, dtime.min, zone), True


def events_between(ics_bytes, cal_key, start, end, zone):
    """Every occurrence overlapping [start, end), recurrences expanded. Needs icalendar + recurring-ical-events."""
    import icalendar
    import recurring_ical_events
    cal = icalendar.Calendar.from_ical(ics_bytes)
    out = []
    for ev in recurring_ical_events.of(cal).between(start, end):
        if str(ev.get("STATUS", "")).upper() == "CANCELLED":
            continue
        s, all_day = _local(ev["DTSTART"].dt, zone)
        if ev.get("DTEND") is not None:
            e, _ = _local(ev["DTEND"].dt, zone)
        elif ev.get("DURATION") is not None:
            e = s + ev["DURATION"].dt
        else:
            e = s + (timedelta(days=1) if all_day else timedelta(0))
        out.append({"uid": str(ev.get("UID", "")), "title": str(ev.get("SUMMARY", "")).strip() or "(busy)",
                    "start": s.isoformat(), "end": e.isoformat(), "all_day": all_day,
                    "location": str(ev.get("LOCATION", "")).strip() or None, "cal": cal_key})
    return out


def dedupe(events):
    """The same event on two calendars shows once, on the first calendar listed in config.json."""
    seen, out = set(), []
    for e in events:
        k = (e.get("uid") or e["title"].casefold(), e["start"])
        if k not in seen:
            seen.add(k)
            out.append(e)
    return out


def _read_ics(ref):
    ref = str(ref)
    if ref.startswith(("https://", "http://", "webcal://")):
        return fetch(ref.replace("webcal://", "https://", 1))
    return config.resolve(ref).read_bytes()      # a local .ics file, handy for testing


def gather_calendars(now, previous=None):
    zone = now.tzinfo
    day0 = datetime.combine(now.date(), dtime.min, zone)
    start, end = day0 - timedelta(days=PAST_DAYS), day0 + timedelta(days=AHEAD_DAYS)
    previous = previous or {}
    events, meta = [], []
    for i, cal in enumerate(config.get("calendars") or []):
        key = config.cal_key(i, cal)
        m = {"key": key, "name": cal.get("name") or key, "color": cal.get("color") or "#ff9f0a"}
        try:
            evs = events_between(_read_ics(cal["url"]), key, start, end, zone)
            m["status"] = "ok"
        except ImportError:
            evs, m["status"] = [], "needs-package"
        except Exception:
            # never put the exception text in the document: it can carry the private feed URL
            evs, m["status"] = previous.get(key, []), "unavailable"
        events.extend(evs)
        meta.append(m)
    events = sorted(dedupe(events), key=lambda e: (not e["all_day"], e["start"], e["title"]))
    return events, meta


# ---------------------------------------------------------------- document

def _cache_file():
    return config.data_dir() / "frame_cache.json"


def _saved():
    try:
        return json.loads(_cache_file().read_text())
    except (OSError, ValueError):
        return {}


def _save(doc):
    p = _cache_file()
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(doc))
    tmp.replace(p)


def _cached(name, ttl, loader):
    hit = _mem.get(name)
    if hit and time.time() - hit[0] < ttl:
        return hit[1], hit[0]
    value = loader()
    _mem[name] = (time.time(), value)
    return value, _mem[name][0]


def frame_doc():
    now = datetime.now(tz())
    with _lock:
        saved = _saved()
        doc = {"ok": True, "date": now.date().isoformat(), "collected_at": now.isoformat()}
        try:
            w, at = _cached("weather", WEATHER_TTL, lambda: shape_weather(json.loads(fetch(weather_url())), now))
            w = dict(w); w["nowcast"] = nowcast(w.get("min15"), now)       # worked out fresh on every request
            doc["weather"], doc["weather_at"] = w, at
        except Exception:
            doc["weather"], doc["weather_at"] = saved.get("weather"), saved.get("weather_at")
            doc["warnings"] = ["Weather is unavailable; showing the last forecast"]
        try:
            a, _ = _cached("aqi", AQI_TTL, lambda: json.loads(fetch(aqi_url())).get("current", {}).get("us_aqi"))
            doc["aqi"] = {"us_aqi": a, "band": aqi_band(a)} if a is not None else None
        except Exception:
            doc["aqi"] = saved.get("aqi")
        prev = {}
        for e in saved.get("calendar_events") or []:
            prev.setdefault(e.get("cal"), []).append(e)
        (events, meta), _ = _cached("calendars", CAL_TTL, lambda: gather_calendars(now, prev))
        doc["calendar_events"], doc["calendars"] = events, meta
        doc["sources"] = {m["key"]: m["status"] for m in meta}
        doc["stale"] = not doc.get("weather_at") or time.time() - doc["weather_at"] > STALE_S
        if doc.get("weather"):
            _save({k: doc.get(k) for k in ("weather", "weather_at", "aqi", "calendar_events")})
        return doc
