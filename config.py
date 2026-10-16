"""One place for every per-house value. Reads config.json next to this file (or the path in the
HOMEVIEW_CONFIG environment variable). Copy config.example.json to config.json and edit it.

Anything missing from config.json falls back to DEFAULTS below, so an empty {} file still starts a
working server (weather for the default location, no calendars, no Sonos, no Spotify)."""
import copy
import json
import os
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent

DEFAULTS = {
    "server": {"bind": "0.0.0.0", "port": 8806},
    "home_name": "Home",
    "timezone": "America/New_York",
    "location": {"name": "Home", "latitude": 40.7128, "longitude": -74.0060},
    "units": {"temperature": "fahrenheit", "wind": "mph"},
    "data_dir": "data",
    "photos_dir": "samples/photos",
    "wallpapers_dir": "wallpapers",
    "fonts_dir": "fonts",
    "calendars": [],
    "sonos": {"enabled": False, "hosts": []},
    "spotify": {"client_id": "", "client_secret": "", "redirect_uri": "http://127.0.0.1:8890/callback"},
    "meals": {"provider": "themealdb", "api_key": "1", "cache_hours": 168, "week_starts": "monday"},
    "paprika": {"email": "", "password": "", "sync_hours": 6},
    "camera": {"name": "Camera", "url": ""},
    "home_assistant": {"url": "", "token": "", "title": "Devices", "entities": []},
    "timers": [{"label": "Pasta", "seconds": 600}, {"label": "Eggs", "seconds": 420}, {"label": "Rice", "seconds": 1080}],
}

_lock = threading.Lock()
_cache = {"path": None, "mtime": None, "value": None}


def path():
    return Path(os.environ.get("HOMEVIEW_CONFIG") or (ROOT / "config.json"))


def _merge(base, over):
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def load():
    """The merged config, re-read when config.json changes (no restart needed for most values)."""
    p = path()
    try:
        mtime = p.stat().st_mtime
    except OSError:
        mtime = None
    with _lock:
        if _cache["value"] is not None and _cache["path"] == p and _cache["mtime"] == mtime:
            return _cache["value"]
        raw = {}
        if mtime is not None:
            raw = json.loads(p.read_text())
            if not isinstance(raw, dict):
                raise ValueError(f"{p} must hold a JSON object")
        value = _merge(DEFAULTS, raw)
        _cache.update(path=p, mtime=mtime, value=value)
        return value


def get(*keys):
    v = load()
    for k in keys:
        v = v[k]
    return v


def resolve(rel):
    """A path from the config, relative to the project folder unless it is absolute."""
    p = Path(os.path.expanduser(str(rel)))
    return p if p.is_absolute() else ROOT / p


def data_dir():
    d = resolve(get("data_dir"))
    d.mkdir(parents=True, exist_ok=True)
    return d


def public():
    """The values the pages need (served as /frame/hv/config.js). No keys or URLs that are secrets."""
    c = load()
    cams = camera_list(c)
    return {
        "home_name": c["home_name"],
        "timezone": c["timezone"],
        "place": c["location"].get("name") or c["home_name"],
        "temp_unit": "C" if str(c["units"].get("temperature", "")).lower().startswith("c") else "F",
        "wind_unit": c["units"].get("wind", "mph"),
        "sonos": bool(c["sonos"].get("enabled")),
        "spotify": bool(c["spotify"].get("client_id")),
        "timers": c.get("timers") or [],
        "meals_source": "paprika" if str(c["meals"].get("provider") or "").strip().lower() == "paprika" else "themealdb",
        "paprika": bool(isinstance(c.get("paprika"), dict) and str(c["paprika"].get("email") or "").strip() and c["paprika"].get("password")),
        "camera": bool(cams),
        "camera_name": (cams[cam_default(cams)]["name"] if cams else "Camera"),
        "cameras": [{"id": x["id"], "name": x["name"]} for x in cams],
        "camera_default": (cams[cam_default(cams)]["id"] if cams else ""),
        "ha": bool(isinstance(c.get("home_assistant"), dict) and str(c["home_assistant"].get("url") or "").strip() and str(c["home_assistant"].get("token") or "").strip()),
        "ha_alerts": bool(isinstance(c.get("home_assistant"), dict) and str(c["home_assistant"].get("alerts_entity") or "").strip() and str(c["home_assistant"].get("token") or "").strip()),
        "ha_title": str((c.get("home_assistant") or {}).get("title") or "Devices")[:30] if isinstance(c.get("home_assistant"), dict) else "Devices",
        "calendars": [{"key": cal_key(i, x), "name": x.get("name") or f"Calendar {i + 1}",
                       "color": x.get("color") or "#ff9f0a", "holidays": bool(x.get("holidays"))} for i, x in enumerate(c.get("calendars") or [])],
        "backpack": backpack_rules(c.get("backpack")),
    }


BACKPACK_ICONS = {"coin", "book", "shoe", "music", "art", "shirt", "bus", "home", "bag", "star"}


def backpack_rules(raw):
    """config.json "backpack": what a calendar entry means for tomorrow's backpack (Standby's Tomorrow face).
    A list of {"match": "snack", "item": "Snack money", "note": "", "icon": "coin"}; "match" is a word or
    words (any of them, separated by "|") found in the event title, case-insensitive. None when not set,
    so the face uses its built-in list."""
    if not isinstance(raw, list):
        return None
    out = []
    for r in raw[:30]:
        if not isinstance(r, dict):
            continue
        m, item = str(r.get("match") or "").strip()[:80], str(r.get("item") or "").strip()[:40]
        if not m or not item:
            continue
        ic = str(r.get("icon") or "star").strip().lower()
        out.append({"match": m, "item": item, "note": str(r.get("note") or "").strip()[:60],
                    "icon": ic if ic in BACKPACK_ICONS else "star"})
    return out


def cal_key(i, cal):
    """Stable short key for a calendar entry: its name, lowercased, letters and digits only."""
    name = "".join(ch for ch in str(cal.get("name") or "").lower() if ch.isalnum())
    return name or f"cal{i + 1}"


def camera_list(c=None):
    """The cameras in config.json, in order, with a stable "id" and a "name". Only entries with a "url".
    "cameras": [{...}, {...}] (one may have "default": true), or the older single "camera": {...}.
    Each entry is the camera's own dict (with its url and password): never send these to the pages."""
    c = c or load()
    raw = c.get("cameras")
    if not isinstance(raw, list) or not raw:
        raw = [c.get("camera")] if isinstance(c.get("camera"), dict) else []
    out, seen = [], set()
    for i, x in enumerate(raw[:8]):
        if not isinstance(x, dict) or not str(x.get("url") or "").strip():
            continue
        key = "".join(ch for ch in str(x.get("id") or x.get("name") or "").lower() if ch.isalnum())[:24] or f"cam{i + 1}"
        while key in seen:
            key += "2"
        seen.add(key)
        out.append(dict(x, id=key, name=str(x.get("name") or f"Camera {len(out) + 1}")[:40]))
    return out


def cam_default(cams):
    """Index of the default camera: the first with "default": true, else the first one."""
    for i, x in enumerate(cams):
        if x.get("default") is True:
            return i
    return 0
