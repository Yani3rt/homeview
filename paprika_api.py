"""Your Paprika 3 recipes in Meals, synced from your Paprika cloud account (read-only).

Paprika has no public API; this uses the sync API the Paprika apps use (https://www.paprikaapp.com/api/v2/sync),
which people have documented. It only reads: nothing is ever changed in your Paprika account.

config.json
  "paprika": {"email": "you@example.com", "password": "...", "sync_hours": 6}
Empty email turns the whole thing off (Meals shows no Paprika chip). With "meals": {"provider": "paprika"} Meals
uses only these recipes: TheMealDB is never called, and the chips are your most-used Paprika categories.

What it does
  * signs in (POST /api/v2/account/login/ -> bearer token, kept in <data_dir>/paprika/token.json), falling back to
    the older v1 basic auth if that login is refused
  * lists {uid, hash} for every recipe and fetches only new or changed ones; recipes in Paprika's trash are skipped
  * downloads each recipe's photo once (again when photo_hash changes) to <data_dir>/paprika/photos/<uid>.jpg;
    the frames get resized copies through frame_img
  * keeps everything in <data_dir>/paprika/recipes.json, so Meals works when Paprika's servers or the internet don't
  * syncs in a background thread when a page asks and the copy is older than sync_hours (first time: right away)

Recipe ids in HomeView are "p" + Paprika uid, next to TheMealDB's numeric ids.
Routes (GET): /api/meals/paprika?category=   {ok, enabled, syncing, synced, error, categories:[name], results:[brief]}
              /api/meals/paprika/photo/<uid>[/small|medium|large]   the photo as a JPEG"""
import base64
import random
import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import config
import frame_img

HOST = "https://www.paprikaapp.com"
UA = "HomeView/1 (+self-hosted kitchen dashboard)"
TIMEOUT = 30
UID_RE = re.compile(r"[0-9A-Za-z][0-9A-Za-z_-]{7,63}")
ID_RE = re.compile(r"p([0-9A-Za-z][0-9A-Za-z_-]{7,63})")
SIZES = {"small": 320, "medium": 480, "large": 1080}

_lock = threading.Lock()          # the recipes file
_sync_lock = threading.Lock()     # one sync at a time
_state = {"syncing": False, "error": "", "tried": 0.0}


def settings():
    c = config.load().get("paprika") or {}
    return {"email": str(c.get("email") or "").strip(), "password": str(c.get("password") or ""),
            "sync_hours": float(c.get("sync_hours") or 6)}


def enabled():
    s = settings()
    return bool(s["email"] and s["password"])


def _dir():
    d = config.data_dir() / "paprika"
    (d / "photos").mkdir(parents=True, exist_ok=True)
    return d


# ---------------------------------------------------------------- HTTP

def http(url, data=None, headers=None):
    """One request, raw bytes back. Tests replace this."""
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=dict({"User-Agent": UA}, **(headers or {})))
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return r.read()


def _token_file():
    return _dir() / "token.json"


def login(force=False):
    """Auth headers for the sync calls: a v2 bearer token, or v1 basic auth when the v2 login is refused."""
    s = settings()
    if not force:
        try:
            t = json.loads(_token_file().read_text())
            if t.get("email") == s["email"] and t.get("token"):
                return {"Authorization": "Bearer " + t["token"]}, "v2"
        except (OSError, ValueError, AttributeError):
            pass
    try:
        res = json.loads(http(HOST + "/api/v2/account/login/", {"email": s["email"], "password": s["password"]}) or b"{}")
        token = ((res or {}).get("result") or {}).get("token")
    except Exception:
        token = None
    if token:
        tmp = _token_file().with_suffix(".tmp")
        tmp.write_text(json.dumps({"email": s["email"], "token": token})); tmp.replace(_token_file())
        return {"Authorization": "Bearer " + token}, "v2"
    basic = base64.b64encode(f'{s["email"]}:{s["password"]}'.encode()).decode()
    return {"Authorization": "Basic " + basic}, "v1"


def _get(path, auth):
    headers, ver = auth
    raw = http(f"{HOST}/api/{ver}/sync/{path}", headers=headers)
    return (json.loads(raw or b"{}") or {}).get("result")


# ---------------------------------------------------------------- the local copy

def _file():
    return _dir() / "recipes.json"


def load():
    try:
        d = json.loads(_file().read_text())
    except (OSError, ValueError):
        d = {}
    if not isinstance(d, dict):
        d = {}
    d.setdefault("recipes", {}); d.setdefault("categories", {}); d.setdefault("synced", 0)
    return d


def _save(d):
    tmp = _file().with_suffix(".tmp")
    tmp.write_text(json.dumps(d, sort_keys=True)); tmp.replace(_file())


def _keep(r, cats):
    """The fields Meals uses, from Paprika's recipe JSON."""
    return {"uid": r["uid"], "hash": r.get("hash") or "", "name": (r.get("name") or "").strip() or "Untitled recipe",
            "ingredients": r.get("ingredients") or "", "directions": r.get("directions") or "",
            "description": r.get("description") or "", "notes": r.get("notes") or "",
            "servings": r.get("servings") or "", "total_time": r.get("total_time") or "",
            "source": r.get("source") or "", "source_url": r.get("source_url") or "",
            "categories": [cats[c] for c in (r.get("categories") or []) if c in cats],
            "rating": int(r.get("rating") or 0), "favorite": bool(r.get("on_favorites")),
            "photo_hash": r.get("photo_hash") or "", "has_photo": False}


def sync():
    """Bring the local copy up to date with the Paprika account. Raises on a failed sign-in or network error."""
    if not enabled():
        return load()
    auth = login()
    try:
        listing = _get("recipes/", auth)
    except urllib.error.HTTPError as e:
        if e.code not in (401, 403):
            raise
        auth = login(force=True)
        listing = _get("recipes/", auth)
    if not isinstance(listing, list):
        raise ValueError("Paprika did not send a recipe list")
    cats = {c.get("uid"): c.get("name") for c in (_get("categories/", auth) or []) if isinstance(c, dict) and c.get("name")}
    d = load()
    old, new, trash = d["recipes"], {}, {}
    old_trash = d.get("trash") or {}                 # trashed recipes' hashes, so they are not fetched every sync
    for item in listing:
        uid = str((item or {}).get("uid") or "")
        if not UID_RE.fullmatch(uid):
            continue
        prev = old.get(uid)
        if prev and prev.get("hash") == item.get("hash") and prev.get("hash"):
            new[uid] = prev
            continue
        if item.get("hash") and old_trash.get(uid) == item.get("hash"):
            trash[uid] = item["hash"]
            continue
        r = _get(f"recipe/{uid}/", auth)
        if not isinstance(r, dict):
            continue
        if r.get("in_trash"):
            trash[uid] = item.get("hash") or ""
            continue
        doc = _keep(dict(r, uid=uid), cats)
        photo = _dir() / "photos" / f"{uid}.jpg"
        if prev and prev.get("has_photo") and prev.get("photo_hash") == doc["photo_hash"] and photo.exists():
            doc["has_photo"] = True
        elif r.get("photo_url"):
            try:
                data = http(r["photo_url"])
                tmp = photo.with_suffix(".tmp"); tmp.write_bytes(data); tmp.replace(photo)
                doc["has_photo"] = True
            except Exception:
                pass
        new[uid] = doc
    for uid in set(old) - set(new):                  # deleted or trashed in Paprika
        try:
            (_dir() / "photos" / f"{uid}.jpg").unlink()
        except OSError:
            pass
    with _lock:
        d = {"recipes": new, "trash": trash, "categories": sorted(set(cats.values()), key=str.lower), "synced": time.time()}
        _save(d)
    return d


def _run_sync():
    try:
        sync()
        _state["error"] = ""
    except urllib.error.HTTPError as e:
        _state["error"] = "Paprika refused the sign-in. Check paprika.email and password in config.json." if e.code in (401, 403) \
            else f"Paprika did not answer ({e.code})"
    except Exception:
        _state["error"] = "Paprika did not answer. Check the internet connection."
    finally:
        _state["syncing"] = False
        _sync_lock.release()


def kick(force=False):
    """Start a background sync when the copy is stale (or force). Retries a failed sync after 10 minutes."""
    if not enabled():
        return
    d = load()
    stale = time.time() - d["synced"] > settings()["sync_hours"] * 3600
    retry_ok = time.time() - _state["tried"] > 600
    if not (force or (stale and retry_ok)) or not _sync_lock.acquire(blocking=False):
        return
    _state.update(syncing=True, tried=time.time())
    threading.Thread(target=_run_sync, name="paprika-sync", daemon=True).start()


# ---------------------------------------------------------------- what Meals reads

def thumb(r):
    return f"/api/meals/paprika/photo/{r['uid']}" if r.get("has_photo") else ""


def brief(r):
    return {"id": "p" + r["uid"], "name": r["name"], "thumb": thumb(r), "category": (r["categories"] or [""])[0],
            "area": "Paprika", "source": "paprika", "favorite": r.get("favorite", False), "rating": r.get("rating", 0)}


def _order(rs):
    return sorted(rs, key=lambda r: (not r.get("favorite"), -r.get("rating", 0), r["name"].lower()))


def top_categories(d=None):
    """Paprika categories, most-used first: [(name, count)]."""
    n = {}
    for r in (d or load())["recipes"].values():
        for c in r["categories"]:
            n[c] = n.get(c, 0) + 1
    return sorted(n.items(), key=lambda x: (-x[1], x[0].lower()))


def random_pick():
    kick()
    rs = list(load()["recipes"].values())
    return [brief(random.choice(rs))] if rs else []


def list_doc(category=None):
    kick()
    d = load()
    rs = list(d["recipes"].values())
    if category:
        rs = [r for r in rs if category in r["categories"]]
    return {"ok": True, "enabled": enabled(), "syncing": _state["syncing"], "synced": d["synced"], "error": _state["error"],
            "count": len(d["recipes"]), "categories": [c for c, _ in top_categories(d)], "results": [brief(r) for r in _order(rs)]}


def search(q):
    """Paprika recipes whose name (first) or ingredients mention every word of q."""
    if not enabled():
        return []
    kick()
    words = [w for w in re.split(r"\W+", str(q or "").lower()) if w]
    if not words:
        return []
    named, other = [], []
    for r in load()["recipes"].values():
        name = r["name"].lower()
        if all(w in name for w in words):
            named.append(r)
        elif all(w in name or w in r["ingredients"].lower() for w in words):
            other.append(r)
    return [brief(r) for r in _order(named) + _order(other)]


_QTY = r"(?:\d+(?:[.,/]\d+)?|[½¼¾⅓⅔⅛])(?:\s*(?:-|to)\s*\d+(?:[.,/]\d+)?)?(?:\s+\d/\d)?"
_UNIT = (r"(?:cups?|c\.|tablespoons?|tbsps?\.?|tbs\.?|T\b|teaspoons?|tsps?\.?|t\b|ounces?|oz\.?|pounds?|lbs?\.?|grams?|g\b|kg|"
         r"kilograms?|ml|millilit(?:er|re)s?|l\b|lit(?:er|re)s?|cloves?|cans?|pinch(?:es)?|dash(?:es)?|slices?|sticks?|packages?|pkgs?\.?|bunch(?:es)?|"
         r"handfuls?|sprigs?|quarts?|qts?\.?|pints?|pts?\.?)")
_ING_RE = re.compile(rf"^\s*((?:{_QTY})(?:\s*{_UNIT})?\.?)\s+(?:of\s+)?(.+)$", re.I)


def ingredient(line):
    """'2 cloves garlic, minced' -> {'name': 'garlic, minced', 'measure': '2 cloves'}; a line with no amount keeps it all."""
    line = re.sub(r"\s+", " ", line).strip()
    m = _ING_RE.match(line)
    return {"name": m.group(2), "measure": m.group(1)} if m else {"name": line, "measure": ""}


def recipe(rid, steps):
    """A Paprika recipe in the same shape as meals_api.recipe_doc. `steps` is meals_api.steps."""
    m = ID_RE.fullmatch(str(rid or ""))
    r = load()["recipes"].get(m.group(1)) if m else None
    if not r:
        raise ValueError("That recipe is not in Paprika any more")
    out = brief(r)
    lines = [x for x in r["ingredients"].replace("\r", "\n").split("\n") if x.strip()]
    out.update(ingredients=[ingredient(x) for x in lines if not x.strip().endswith(":")],   # "For the sauce:" headings dropped
               steps=steps(r["directions"]), tags=list(r["categories"]), youtube="",
               source=r["source_url"] or r["source"], servings=r["servings"], total_time=r["total_time"],
               description=r["description"], notes=r["notes"])
    return out


def dispatch_get(handler, route):
    if route.startswith("/api/meals/paprika/photo/"):
        parts = route[len("/api/meals/paprika/photo/"):].strip("/").split("/")
        uid, size = parts[0], (parts[1] if len(parts) > 1 else "large")
        src = _dir() / "photos" / f"{uid}.jpg"
        if not UID_RE.fullmatch(uid) or size not in SIZES or not frame_img.send(handler, src, SIZES[size], cache_dir=_dir() / "sized"):
            handler._json({"ok": False, "error": "Not found"}, 404)
        return True
    if route == "/api/meals/paprika":
        q = {k: v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlparse(handler.path).query).items()}
        handler._json(list_doc(q.get("category")))
        return True
    return False
