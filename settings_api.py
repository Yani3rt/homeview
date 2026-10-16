"""Household settings the frames can edit (Settings > Household): a small, fixed part of config.json.

    GET  /api/settings   {"ok", "home": {...}, "timers": [...], "calendars": [...]}
    POST /api/settings   {"section": "home", "home_name", "place", "temperature", "wind"}
                         {"section": "timers", "timers": [{"label", "seconds"}, ...]}
                         {"section": "calendars", "calendars": [{"name", "color", "holidays"}, ...]}

Only these values are ever read or written here. Secrets and device addresses (calendar links, cameras,
Home Assistant, Spotify, Sonos, API keys, server, folders, coordinates) are never sent to a frame and a POST
cannot change them. A save rewrites config.json in place (keeping every other key) after copying the old file
to config.json.bak next to it; config.py notices the new file on the next read, so no restart is needed."""
import json
import os
import re
import threading
from urllib.parse import urlparse

import config

TEMPS = ("fahrenheit", "celsius")
WINDS = ("mph", "kmh", "ms", "kn")
COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
MAX_TIMERS = 4   # Tonight shows the first four
MAX_BODY = 8192
_lock = threading.Lock()


def _text(v, field, n):
    s = " ".join(str(v if v is not None else "").split())
    if not s:
        raise ValueError(f"{field} can't be empty")
    if len(s) > n:
        raise ValueError(f"{field} is longer than {n} characters")
    return s


def settings_doc():
    c = config.load()
    temp = "celsius" if str(c["units"].get("temperature", "")).lower().startswith("c") else "fahrenheit"
    wind = c["units"].get("wind") if c["units"].get("wind") in WINDS else "mph"
    return {
        "ok": True,
        "home": {"home_name": c["home_name"], "place": c["location"].get("name") or c["home_name"],
                 "temperature": temp, "wind": wind},
        "timers": [{"label": str(t.get("label") or ""), "seconds": int(t.get("seconds") or 0)}
                   for t in (c.get("timers") or []) if isinstance(t, dict)],
        "calendars": [{"name": x.get("name") or f"Calendar {i + 1}", "color": x.get("color") or "#ff9f0a",
                       "holidays": bool(x.get("holidays"))}
                      for i, x in enumerate(c.get("calendars") or []) if isinstance(x, dict)],
    }


def _apply(raw, payload):
    """Change raw (config.json as written, not merged with defaults) for one section. Raises ValueError."""
    section = payload.get("section")
    if section == "home":
        if payload.get("temperature") not in TEMPS:
            raise ValueError("Pick Fahrenheit or Celsius")
        if payload.get("wind") not in WINDS:
            raise ValueError("Pick a wind unit")
        raw["home_name"] = _text(payload.get("home_name"), "Home name", 40)
        loc = raw.get("location") if isinstance(raw.get("location"), dict) else dict(config.DEFAULTS["location"])
        loc["name"] = _text(payload.get("place"), "Place", 40)
        raw["location"] = loc
        units = raw.get("units") if isinstance(raw.get("units"), dict) else {}
        units["temperature"], units["wind"] = payload["temperature"], payload["wind"]
        raw["units"] = units
    elif section == "timers":
        ts = payload.get("timers")
        if not isinstance(ts, list) or len(ts) > MAX_TIMERS:
            raise ValueError(f"Up to {MAX_TIMERS} timers")
        out = []
        for t in ts:
            if not isinstance(t, dict):
                raise ValueError("Bad timer")
            secs = int(t.get("seconds") or 0)
            if not 30 <= secs <= 4 * 3600:
                raise ValueError("A timer runs from 30 seconds to 4 hours")
            out.append({"label": _text(t.get("label"), "Timer name", 20), "seconds": secs})
        raw["timers"] = out
    elif section == "calendars":
        cur = raw.get("calendars")
        cs = payload.get("calendars")
        if not isinstance(cur, list) or not isinstance(cs, list) or len(cs) != len(cur):
            raise ValueError("The calendars changed on the server. Reload and try again.")
        for x, n in zip(cur, cs):
            if not isinstance(x, dict) or not isinstance(n, dict):
                raise ValueError("Bad calendar")
            color = str(n.get("color") or "")
            if not COLOR.match(color):
                raise ValueError("Bad color")
            x["name"], x["color"] = _text(n.get("name"), "Calendar name", 30), color.lower()
            if n.get("holidays"):
                x["holidays"] = True
            else:
                x.pop("holidays", None)
    else:
        raise ValueError("Unknown settings section")
    return raw


def save(payload):
    with _lock:
        p = config.path()
        text = p.read_text() if p.exists() else "{}"
        raw = json.loads(text)
        if not isinstance(raw, dict):
            raise ValueError("config.json must hold a JSON object")
        raw = _apply(raw, payload)
        p.with_name(p.name + ".bak").write_text(text)
        tmp = p.with_name(p.name + ".tmp")
        tmp.write_text(json.dumps(raw, indent=2, ensure_ascii=False) + "\n")
        os.replace(tmp, p)
        config._cache.update(path=None, mtime=None, value=None)
    return settings_doc()


def dispatch_get(handler, route):
    if route == "/api/settings":
        handler._json(settings_doc())
        return True
    return False


def dispatch_post(handler, route):
    if route != "/api/settings":
        return False
    # browser writes must come from the frame app itself
    if urlparse(handler.headers.get("Origin", "")).netloc != handler.headers.get("Host"):
        handler._json({"ok": False, "error": "Open the frame app to use its controls"}, 403)
        return True
    try:
        size = int(handler.headers.get("Content-Length", "0"))
        if not 0 <= size <= MAX_BODY:
            raise ValueError("Request size is invalid")
        payload = json.loads(handler.rfile.read(size) or b"{}")
        if not isinstance(payload, dict):
            raise ValueError("Expected an object")
        handler._json(save(payload))
    except (ValueError, TypeError) as e:
        handler._json({"ok": False, "error": str(e)}, 400)
    return True
