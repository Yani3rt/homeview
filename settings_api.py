"""Household settings the frames can edit (Settings > Household): a small, fixed part of config.json.

    GET  /api/settings   {"ok", "home": {...}, "timers": [...], "calendars": [...]}
    POST /api/settings   {"section": "home", "home_name", "place", "temperature", "wind"}
                         {"section": "timers", "timers": [{"label", "seconds"}, ...]}
                         {"section": "calendars", "calendars": [{"name", "color", "holidays"}, ...]}
                         {"section": "backpack", "backpack": [{"match", "item", "note", "icon", "off"}, ...]}
                         {"section": "backpack", "reset": true}   (back to the built-in list)

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
MAX_TIMERS = 4   # Tonight and the Timer screen show the first four
MAX_BODY = 16384
MAX_RULES = 30
# the Tomorrow face's built-in backpack rules (PACK_DEFAULT in frame/hv/standby/standby.js), used until config.json has "backpack"
BACKPACK_DEFAULT = [
    {"match": "snack", "item": "Snack money", "note": "", "icon": "coin"},
    {"match": "library", "item": "Library books", "note": "Return or renew", "icon": "book"},
    {"match": "physical education|pe|gym", "item": "Gym clothes", "note": "PE day \u00b7 sneakers", "icon": "shoe"},
    {"match": "field trip", "item": "Field trip", "note": "Lunch and permission slip", "icon": "bus"},
    {"match": "picture day|photo day", "item": "Picture day", "note": "A nice outfit", "icon": "star"},
    {"match": "wear|color day|dress up|pajama", "item": "Dress-up day", "note": "", "icon": "shirt"},
    {"match": "art", "item": "Art class", "note": "An old shirt helps", "icon": "art"},
    {"match": "music", "item": "Music class", "note": "", "icon": "music"},
    {"match": "early release|early dismissal|half day", "item": "Early release", "note": "", "icon": "home"},
    {"match": "no school|teacher planning|teacher workday", "item": "No school", "note": "", "icon": "home", "off": True},
]
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
        "backpack": config.backpack_rules(c.get("backpack")) if isinstance(c.get("backpack"), list) else BACKPACK_DEFAULT,
        "backpack_default": not isinstance(c.get("backpack"), list),
        "backpack_icons": sorted(config.BACKPACK_ICONS),
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
    elif section == "backpack":
        if payload.get("reset") is True:
            raw.pop("backpack", None)
            return raw
        rs = payload.get("backpack")
        if not isinstance(rs, list) or len(rs) > MAX_RULES:
            raise ValueError(f"Up to {MAX_RULES} backpack rules")
        out = []
        for r in rs:
            if not isinstance(r, dict):
                raise ValueError("Bad backpack rule")
            words = [w.strip() for w in str(r.get("match") or "").replace(",", "|").split("|") if w.strip()]
            item = _text(r.get("item"), "Backpack item", 40)
            if not words:
                raise ValueError(f"Add the calendar words for {item}")
            match = "|".join(words)
            if len(match) > 80:
                raise ValueError(f"The words for {item} are too long")
            note = " ".join(str(r.get("note") or "").split())
            if len(note) > 60:
                raise ValueError(f"The note for {item} is longer than 60 characters")
            icon = r.get("icon") if r.get("icon") in config.BACKPACK_ICONS else "star"
            rule = {"match": match, "item": item, "note": note, "icon": icon}
            if r.get("off") is True:
                rule["off"] = True
            out.append(rule)
        raw["backpack"] = out
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
