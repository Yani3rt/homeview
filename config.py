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
    return {
        "home_name": c["home_name"],
        "timezone": c["timezone"],
        "place": c["location"].get("name") or c["home_name"],
        "temp_unit": "C" if str(c["units"].get("temperature", "")).lower().startswith("c") else "F",
        "wind_unit": c["units"].get("wind", "mph"),
        "sonos": bool(c["sonos"].get("enabled")),
        "spotify": bool(c["spotify"].get("client_id")),
        "timers": c.get("timers") or [],
        "calendars": [{"key": cal_key(i, x), "name": x.get("name") or f"Calendar {i + 1}",
                       "color": x.get("color") or "#ff9f0a", "holidays": bool(x.get("holidays"))} for i, x in enumerate(c.get("calendars") or [])],
    }


def cal_key(i, cal):
    """Stable short key for a calendar entry: its name, lowercased, letters and digits only."""
    name = "".join(ch for ch in str(cal.get("name") or "").lower() if ch.isalnum())
    return name or f"cal{i + 1}"
