"""Meal planning from TheMealDB (https://www.themealdb.com), a free public recipe database.

What it does
  * search and browse recipes (by name, category or cuisine), through a disk cache so the frames do not
    hit TheMealDB on every poll: list results are kept for `meals.cache_hours` (default a week), a full
    recipe for 30 days. If TheMealDB is down, an expired cached copy is served instead of an error.
  * a dinner plan, one recipe per date, in <data_dir>/meal_plan.json
  * a shopping list of what the household adds by hand (milk, paper towels), with counts and a checked-off
    state. Off by default: with `"shopping": {"from_meals": true}` in config.json the list also gets the
    ingredients of the dinners planned in the next `days` days, merged across recipes
    ("2 cloves garlic" + "3 cloves garlic" -> "5 cloves").

Routes (GET unless marked)
  /api/meals/plan                     {ok, today, tonight, tomorrow, week:[{date, meal}], days:{date: meal}}
  /api/meals/categories               {ok, categories:[{name, thumb, about}], areas:[name]}
  /api/meals/search?q=                {ok, results:[brief]}
  /api/meals/browse?category=|area=   {ok, results:[brief]}
  /api/meals/random                   {ok, results:[brief]}   (one recipe, never cached)
  /api/meals/recipe?id=               {ok, recipe}
  /api/meals/paprika, /api/meals/paprika/photo/<uid>   the household's Paprika recipes (paprika_api.py)
  /api/meals/favorites                {ok, favorites:[brief], usuals:[brief + times, last]}
  /api/meals/shopping?days=7          {ok, start, end, meals:[...], items:[{key, name, amount, meals, checked}]}
  POST /api/meals/plan       {date, id}  plan a recipe on a date;  {date, id: null} clears the date
  POST /api/meals/favorites  {id, on}  heart (on: true) or un-heart a recipe
  POST /api/meals/shopping   {key, checked}  |  {add: "milk"}  |  {remove: key}  |  {clear_checked: true}  |  {clear_all: true}
                             (clearing also drops the hand-added items that were checked off: they're bought)

TheMealDB's terms ask apps to name it as the source of the data; the pages show "Recipes from TheMealDB".
The test key "1" is meant for development and education; set your own supporter key in config.json
(`meals.api_key`) if you use this beyond that. See README.md."""
import hashlib
import json
import re
import threading
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from fractions import Fraction
from zoneinfo import ZoneInfo

import config
import paprika_api

BASE = "https://www.themealdb.com/api/json/v1/{key}/"
UA = "HomeView/1 (+self-hosted kitchen dashboard)"
RECIPE_TTL = 30 * 86400
TIMEOUT = 15
ID_RE = re.compile(r"\d{1,8}")
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
_lock = threading.Lock()


class MealsError(Exception):
    pass


# ---------------------------------------------------------------- HTTP + cache

def http_get(url):
    """One GET, parsed JSON. Tests replace this."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read() or b"null")


def _cache_dir():
    d = config.data_dir() / "meals_cache"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _url(endpoint, **params):
    key = str(config.get("meals").get("api_key") or "1")
    q = urllib.parse.urlencode(params)
    return BASE.format(key=urllib.parse.quote(key, safe="")) + endpoint + ("?" + q if q else "")


def api(endpoint, ttl=None, **params):
    """GET a TheMealDB endpoint through the disk cache. ttl=0 skips the cache."""
    if ttl is None:
        ttl = float(config.get("meals").get("cache_hours", 168)) * 3600
    url = _url(endpoint, **params)
    # the cache file name leaves out the key, so changing keys keeps the cache
    name = hashlib.sha1((endpoint + "?" + urllib.parse.urlencode(sorted(params.items()))).encode()).hexdigest()
    path = _cache_dir() / (name + ".json")
    cached = None
    if ttl:
        try:
            cached = json.loads(path.read_text())
            if time.time() - cached["at"] < ttl:
                return cached["data"]
        except (OSError, ValueError, KeyError, TypeError):
            cached = None
    try:
        data = http_get(url)
    except Exception as e:
        if cached is not None:
            return cached["data"]           # stale beats nothing
        raise MealsError("TheMealDB did not answer. Check the internet connection.") from e
    if ttl:
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"at": time.time(), "data": data}))
        tmp.replace(path)
    return data


# ---------------------------------------------------------------- normalizing

def brief(m):
    return {"id": str(m.get("idMeal") or ""), "name": (m.get("strMeal") or "").strip(),
            "thumb": m.get("strMealThumb") or "", "category": m.get("strCategory") or "",
            "area": m.get("strArea") or m.get("strCountry") or ""}


def steps(text):
    """Instructions as a list of steps: TheMealDB uses blank lines, 'STEP 1' headings or one paragraph."""
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    parts = [p.strip() for p in re.split(r"\n\s*\n|\n(?=\s*(?:step\s*)?\d+[.):]?\s)", text, flags=re.I)]
    out = []
    for p in parts:
        p = re.sub(r"^\s*(?:step\s*)?\d+\s*[.):]?\s*(?=\S)", "", p, flags=re.I).strip()
        p = re.sub(r"\s*\n\s*", " ", p)
        if p and not re.fullmatch(r"(?:step\s*)?\d+", p, flags=re.I):
            out.append(p)
    if len(out) == 1 and len(out[0]) > 420:          # one long paragraph: split into sentences of ~2-3 each
        sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z])", out[0])
        out, buf = [], ""
        for s in sentences:
            buf = (buf + " " + s).strip()
            if len(buf) > 220:
                out.append(buf); buf = ""
        if buf:
            out.append(buf)
    return out


def recipe_doc(m):
    r = brief(m)
    ings = []
    for i in range(1, 21):
        name = (m.get(f"strIngredient{i}") or "").strip()
        if name:
            ings.append({"name": name, "measure": (m.get(f"strMeasure{i}") or "").strip()})
    r.update(ingredients=ings, steps=steps(m.get("strInstructions")),
             tags=[t.strip() for t in (m.get("strTags") or "").split(",") if t.strip()],
             youtube=m.get("strYoutube") or "", source=m.get("strSource") or "")
    return r


def _meals(data):
    return (data or {}).get("meals") or []


# ---------------------------------------------------------------- reads

def categories():
    cats = [{"name": c.get("strCategory"), "thumb": c.get("strCategoryThumb") or "",
             "about": (c.get("strCategoryDescription") or "").split(". ")[0][:160]}
            for c in (api("categories.php") or {}).get("categories") or []]
    areas = sorted(a.get("strArea") for a in _meals(api("list.php", a="list")) if a.get("strArea"))
    return {"ok": True, "categories": cats, "areas": areas}


def search(q):
    q = str(q or "").strip()[:60]
    if not q:
        return {"ok": True, "results": []}
    mine = paprika_api.search(q)        # the household's own Paprika recipes come first
    try:
        found = [brief(m) for m in _meals(api("search.php", s=q))]
        if not found:      # "chicken thighs" finds nothing by name; try it as a main ingredient
            found = [brief(m) for m in _meals(api("filter.php", i=q.lower().replace(" ", "_")))]
    except MealsError:
        if not mine:
            raise
        found = []
    return {"ok": True, "results": mine + found}


def browse(category=None, area=None):
    if category:
        res = _meals(api("filter.php", c=str(category)[:40]))
    elif area:
        res = _meals(api("filter.php", a=str(area)[:40]))
    else:
        res = _meals(api("filter.php", c="Chicken"))
    out = [brief(m) for m in res]
    for r in out:                      # filter results carry only id, name and photo
        if category and not r["category"]:
            r["category"] = category
    return {"ok": True, "results": out}


def random_pick():
    return {"ok": True, "results": [brief(m) for m in _meals(api("random.php", ttl=0))]}


def recipe(rid):
    rid = str(rid or "")
    if paprika_api.ID_RE.fullmatch(rid):
        return paprika_api.recipe(rid, steps)
    if not ID_RE.fullmatch(rid):
        raise ValueError("Unknown recipe")
    ms = _meals(api("lookup.php", ttl=RECIPE_TTL, i=rid))
    if not ms:
        raise ValueError("That recipe is not in TheMealDB any more")
    return recipe_doc(ms[0])


# ---------------------------------------------------------------- the plan

def _plan_file():
    return config.data_dir() / "meal_plan.json"


def load_plan():
    try:
        d = json.loads(_plan_file().read_text())
    except (OSError, ValueError):
        d = {}
    d.setdefault("days", {}); d.setdefault("checked", {}); d.setdefault("added", {})
    return d


def _save_plan(d):
    p = _plan_file()
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(d, indent=1, sort_keys=True))
    tmp.replace(p)


def today():
    try:
        zone = ZoneInfo(config.get("timezone"))
    except Exception:
        zone = ZoneInfo("UTC")
    return datetime.now(zone).date()


def plan_doc(now=None):
    t = now or today()
    d = load_plan()
    days = {k: v for k, v in d["days"].items() if (t - timedelta(days=14)).isoformat() <= k <= (t + timedelta(days=42)).isoformat()}
    week = [{"date": (t + timedelta(days=i)).isoformat(), "meal": days.get((t + timedelta(days=i)).isoformat())} for i in range(7)]
    return {"ok": True, "today": t.isoformat(), "tonight": days.get(t.isoformat()),
            "tomorrow": days.get((t + timedelta(days=1)).isoformat()), "week": week, "days": days,
            "planned_7": sum(1 for w in week if w["meal"])}


def set_day(day, rid):
    day = str(day or "")
    if not DATE_RE.fullmatch(day):
        raise ValueError("Pick a date")
    date.fromisoformat(day)
    with _lock:
        if rid in (None, ""):
            d = load_plan(); d["days"].pop(day, None); _save_plan(d)
            return plan_doc()
    r = recipe(rid)                         # outside the lock: may fetch
    with _lock:
        d = load_plan()
        d["days"][day] = {"id": r["id"], "name": r["name"], "thumb": r["thumb"], "category": r["category"], "area": r["area"]}
        _save_plan(d)
    return plan_doc()


# ---------------------------------------------------------------- favorites and usuals (chips on Meals)
# Favorites: recipes the household hearted, newest first, in <data_dir>/meal_favorites.json as {"items": [brief]}.
# Usuals: worked out from the plan history (meal_plan.json keeps every past day), most planned first.
MAX_FAVORITES = 60
USUALS_DAYS = 120
MAX_USUALS = 12


def _favorites_file():
    return config.data_dir() / "meal_favorites.json"


def favorites():
    try:
        items = json.loads(_favorites_file().read_text()).get("items")
    except (OSError, ValueError, AttributeError):
        items = None
    return [x for x in items if isinstance(x, dict) and x.get("id")] if isinstance(items, list) else []


def usuals(now=None):
    """Dinners planned in the last USUALS_DAYS days up to today: [{brief.., times, last}], most often, then most recent."""
    t = now or today()
    start = (t - timedelta(days=USUALS_DAYS)).isoformat()
    seen = {}
    for day, m in sorted(load_plan()["days"].items()):
        if not (start <= day <= t.isoformat()) or not isinstance(m, dict) or not m.get("id"):
            continue
        u = seen.setdefault(m["id"], dict(m, times=0))
        u.update(m, times=u["times"] + 1, last=day)
    out = sorted(seen.values(), key=lambda u: (u["times"], u["last"]), reverse=True)
    return out[:MAX_USUALS]


def favorites_doc(now=None):
    return {"ok": True, "favorites": favorites(), "usuals": usuals(now)}


def set_favorite(rid, on=True):
    rid = str(rid or "")
    if not (ID_RE.fullmatch(rid) or paprika_api.ID_RE.fullmatch(rid)):
        raise ValueError("Unknown recipe")
    r = recipe(rid) if on else None          # outside the lock: may fetch
    with _lock:
        items = [x for x in favorites() if x["id"] != rid]
        if on:
            if len(items) >= MAX_FAVORITES:
                raise ValueError("Favorites is full: remove one first")
            items.insert(0, {k: r[k] for k in ("id", "name", "thumb", "category", "area")})
        p = _favorites_file(); tmp = p.with_suffix(".tmp")
        tmp.write_text(json.dumps({"items": items}, indent=1)); tmp.replace(p)
    return favorites_doc()


# ---------------------------------------------------------------- shopping list

UNITS = {
    "tsp": "tsp", "teaspoon": "tsp", "teaspoons": "tsp", "tsps": "tsp",
    "tbsp": "tbsp", "tbs": "tbsp", "tblsp": "tbsp", "tbls": "tbsp", "tablespoon": "tbsp", "tablespoons": "tbsp", "tbsps": "tbsp",
    "cup": "cup", "cups": "cup", "c": "cup",
    "g": "g", "gram": "g", "grams": "g", "gr": "g", "kg": "kg",
    "ml": "ml", "l": "l", "litre": "l", "liter": "l", "litres": "l", "liters": "l",
    "oz": "oz", "ounce": "oz", "ounces": "oz", "lb": "lb", "lbs": "lb", "pound": "lb", "pounds": "lb",
    "clove": "clove", "cloves": "clove", "can": "can", "cans": "can", "tin": "can", "tins": "can",
    "pinch": "pinch", "pinches": "pinch", "slice": "slice", "slices": "slice", "stick": "stick", "sticks": "stick",
    "bunch": "bunch", "bunches": "bunch", "handful": "handful", "sprig": "sprig", "sprigs": "sprig",
}
PLURAL = {"cup": "cups", "clove": "cloves", "can": "cans", "pinch": "pinches", "slice": "slices", "stick": "sticks",
          "bunch": "bunches", "handful": "handfuls", "sprig": "sprigs"}
UNICODE_FRAC = {"½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3", "⅛": "1/8"}
NUM = r"(\d+\s+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?)"


def ingredient_key(name):
    """'Tomatoes', 'tomato ', 'TOMATOES' -> 'tomato'. Light plural folding only; no dictionary."""
    s = re.sub(r"\s+", " ", str(name or "").strip().lower())
    words = s.split(" ")
    w = words[-1]
    if len(w) > 4 and w.endswith("ies"):
        w = w[:-3] + "y"
    elif len(w) > 4 and w.endswith("oes"):
        w = w[:-2]
    elif len(w) > 3 and w.endswith("s") and not w.endswith(("ss", "us", "is")):
        w = w[:-1]
    words[-1] = w
    return " ".join(words)


def parse_measure(text):
    """'1 1/2 cups' -> (Fraction(3, 2), 'cup'); '200g' -> (200, 'g'); '3' -> (3, ''); 'to taste' -> None."""
    s = str(text or "").strip().lower()
    for k, v in UNICODE_FRAC.items():
        s = s.replace(k, " " + v + " ")
    s = re.sub(r"\s+", " ", s).strip()
    m = re.match(NUM + r"\s*([a-z]+)?\.?(?![a-z])(.*)$", s)
    if not m:
        return None
    raw, unit, rest = m.group(1), m.group(2) or "", (m.group(3) or "").strip()
    try:
        qty = sum(Fraction(p) for p in raw.split())
    except (ValueError, ZeroDivisionError):
        return None
    if unit and unit not in UNITS:
        return (qty, "") if not rest and unit in ("large", "medium", "small", "whole") else None
    if rest and re.search(r"\d", rest):    # '1 (12 oz.) can' and the like: too irregular to add up
        return None
    return qty, UNITS.get(unit, "")


METRIC = ("g", "kg", "ml", "l")


def _fmt_qty(q, unit=""):
    if unit in METRIC or unit in ("oz", "lb"):        # 1.2 kg, not 1 1/5 kg
        v = float(q)
        return str(int(v)) if v == int(v) else ("%.2f" % v).rstrip("0").rstrip(".")
    q = Fraction(q).limit_denominator(8)
    whole, part = divmod(q.numerator, q.denominator)
    if not part:
        return str(whole)
    frac = f"{part}/{q.denominator}"
    return f"{whole} {frac}" if whole else frac


def amount_text(sums, texts):
    bits = []
    for unit, q in sums.items():
        n = _fmt_qty(q, unit)
        if unit in PLURAL and q > 1:
            unit = PLURAL[unit]
        bits.append(n + (" " + unit if unit else ""))
    seen = set()
    for t in texts:
        if t.lower() not in seen:
            seen.add(t.lower()); bits.append(t)
    return " + ".join(bits)


def from_meals():
    """Planned dinners' ingredients on the shopping list? Off unless config.json says shopping.from_meals: true."""
    c = config.load().get("shopping")
    return bool(isinstance(c, dict) and c.get("from_meals"))


def shopping_doc(days=7, now=None):
    t = now or today()
    days = max(1, min(int(days), 21))
    end = t + timedelta(days=days - 1)
    plan = load_plan()
    planned = sorted((k, v) for k, v in plan["days"].items() if t.isoformat() <= k <= end.isoformat()) if from_meals() else []
    items, meals, missing = {}, [], []
    for day, m in planned:
        try:
            r = recipe(m["id"])
        except Exception:
            missing.append(m.get("name") or m.get("id")); continue
        meals.append({"date": day, "id": r["id"], "name": r["name"]})
        for g in r["ingredients"]:
            k = ingredient_key(g["name"])
            it = items.setdefault(k, {"key": k, "name": g["name"].strip()[:1].upper() + g["name"].strip()[1:],
                                       "sums": {}, "texts": [], "meals": []})
            p = parse_measure(g["measure"])
            if p:
                it["sums"][p[1]] = it["sums"].get(p[1], 0) + p[0]
            elif g["measure"]:
                it["texts"].append(g["measure"])
            if r["name"] not in it["meals"]:
                it["meals"].append(r["name"])
    for k, a in plan["added"].items():
        it = items.setdefault(k, {"key": k, "name": a["name"], "sums": {}, "texts": [], "meals": []})
        it["added"] = True; it["qty"] = _qty(a.get("qty")); it["at"] = a.get("at") or 0
    out = []
    for k, it in items.items():
        out.append({"key": k, "name": it["name"], "amount": amount_text(it["sums"], it["texts"]),
                    "meals": it["meals"], "added": bool(it.get("added")), "qty": it.get("qty", 0), "at": it.get("at", 0),
                    "checked": bool(plan["checked"].get(k))})
    # to buy first: newest hand-added on top, then recipe ingredients A-Z; checked items last
    out.sort(key=lambda x: (x["checked"], -(x["at"] or 0), x["name"].lower()))
    return {"ok": True, "from_meals": from_meals(), "start": t.isoformat(), "end": end.isoformat(), "meals": meals, "items": out,
            "missing": missing, "left": sum(1 for x in out if not x["checked"])}


MAX_ADDED = 100
MAX_QTY = 99


def _qty(v):
    try:
        return max(1, min(MAX_QTY, int(v)))
    except (TypeError, ValueError):
        return 1


def split_qty(text):
    """'Milk ×2' / 'Milk x 2' / '2 Milk' / '2x Milk' -> ('Milk', 2); 'Milk' -> ('Milk', None)."""
    s = re.sub(r"\s+", " ", str(text or "")).strip()
    m = re.match(r"^(.*?\S)\s*[×xX]\s*(\d{1,2})$", s)
    if m:
        return m.group(1), _qty(m.group(2))
    m = re.match(r"^(\d{1,2})\s*[×xX]?\s+(\D.*)$", s)
    if m:
        return m.group(2), _qty(m.group(1))
    return s, None


def qty_title(name, qty):
    return name + (" ×%d" % qty if qty and qty > 1 else "")


def add_item(name, set_qty=None):
    """A hand-added item. Keyed like an ingredient, so 'Eggs' added by hand and 'egg' from a recipe are one row.
    Adding something already on the list counts it up (Milk -> Milk ×2); 'Milk ×3' or set_qty sets the count."""
    name, typed = split_qty(name)
    name = name[:60]
    if not name:
        raise ValueError("Type an item to add")
    k = ingredient_key(name)
    with _lock:
        d = load_plan()
        if k not in d["added"] and len(d["added"]) >= MAX_ADDED:
            raise ValueError("The list is full: clear the checked items first")
        cur = d["added"].get(k)
        open_now = cur is not None and not d["checked"].get(k)
        if set_qty is not None or typed is not None:
            q = _qty(set_qty if set_qty is not None else typed)
        else:
            q = _qty(cur.get("qty")) + 1 if open_now else 1
        at = (cur or {}).get("at") if open_now else None
        d["added"][k] = {"name": (cur or {}).get("name") or name[:1].upper() + name[1:], "qty": q,
                         "at": at or round(time.time(), 1)}
        d["checked"].pop(k, None)
        _save_plan(d)
    return {"ok": True, "key": k, "qty": q}


def set_qty(key, qty):
    """The stepper: set a hand-added item's count; 0 takes it off the list."""
    key = str(key or "")[:80]
    try:
        n = int(qty)
    except (TypeError, ValueError):
        raise ValueError("Unknown amount")
    if n <= 0:
        return remove_item(key)
    with _lock:
        d = load_plan()
        if key not in d["added"]:
            raise ValueError("Only items added by hand have a count")
        d["added"][key]["qty"] = _qty(n)
        _save_plan(d)
    return {"ok": True, "qty": _qty(n)}


def remove_item(key):
    key = str(key or "")[:80]
    with _lock:
        d = load_plan()
        if key not in d["added"]:
            raise ValueError("Only items added by hand can be removed")
        d["added"].pop(key); d["checked"].pop(key, None)
        _save_plan(d)
    return {"ok": True}


def clear_all():
    """Empty the shopping list: every hand-added item goes (checked or not). With shopping.from_meals on, the
    planned dinners' ingredients can't be removed, so they're checked off instead."""
    keep = [x["key"] for x in shopping_doc()["items"] if not x["added"]] if from_meals() else []
    with _lock:
        d = load_plan()
        n = len(d["added"]) + len(keep)
        d["added"] = {}
        d["checked"] = {k: True for k in keep}
        _save_plan(d)
    return {"ok": True, "cleared": n}


def check_item(key=None, checked=True, clear_checked=False):
    with _lock:
        d = load_plan()
        if clear_checked:
            for k in [k for k in d["added"] if d["checked"].get(k)]:
                d["added"].pop(k)
            d["checked"] = {}
        else:
            key = str(key or "")[:80]
            if not key:
                raise ValueError("Unknown item")
            if checked:
                d["checked"][key] = True
            else:
                d["checked"].pop(key, None)
        _save_plan(d)
    return {"ok": True}


# ---------------------------------------------------------------- staples ("Buy again" cards on Shopping)
# Things the house buys over and over. One tap on a card adds it to the list (and so to Reminders).
# Kept in <data_dir>/staples.json as {"items": ["Milk", ...]} in the order shown; edited from the frame.
DEFAULT_STAPLES = ["Milk", "Eggs", "Bread", "Bananas", "Coffee", "Butter", "Cheese", "Yogurt", "Apples", "Chicken",
                   "Rice", "Pasta", "Tomatoes", "Onions", "Avocados", "Orange juice", "Paper towels", "Toilet paper",
                   "Dish soap", "Trash bags"]
MAX_STAPLES = 60


def _staples_file():
    return config.data_dir() / "staples.json"


def staples_doc():
    try:
        items = json.loads(_staples_file().read_text()).get("items")
    except (OSError, ValueError, AttributeError):
        items = None
    if not isinstance(items, list):
        items = list(DEFAULT_STAPLES)
    items = [str(x)[:40] for x in items if str(x).strip()]
    return {"ok": True, "items": [{"name": n, "key": ingredient_key(n)} for n in items]}


def _save_staples(names):
    p = _staples_file(); tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps({"items": names}, indent=1)); tmp.replace(p)


def staples_post(payload):
    with _lock:
        names = [x["name"] for x in staples_doc()["items"]]
        if "add" in payload:
            n = re.sub(r"\s+", " ", str(payload.get("add") or "")).strip()[:40]
            if not n:
                raise ValueError("Type an item to keep")
            n = n[:1].upper() + n[1:]
            if ingredient_key(n) in [ingredient_key(x) for x in names]:
                raise ValueError(n + " is already in Buy again")
            if len(names) >= MAX_STAPLES:
                raise ValueError("Buy again is full: remove one first")
            names.append(n)
        elif "remove" in payload:
            k = ingredient_key(payload.get("remove"))
            names = [x for x in names if ingredient_key(x) != k]
        else:
            raise ValueError("Unknown change")
        _save_staples(names)
    return {"items": staples_doc()["items"]}


# ---------------------------------------------------------------- HTTP dispatch

def _query(handler):
    return {k: v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlparse(handler.path).query).items()}


def dispatch_get(handler, route):
    if not route.startswith("/api/meals/"):
        return False
    if paprika_api.dispatch_get(handler, route):
        return True
    q = _query(handler)
    try:
        if route == "/api/meals/plan":
            handler._json(plan_doc())
        elif route == "/api/meals/categories":
            handler._json(categories())
        elif route == "/api/meals/search":
            handler._json(search(q.get("q")))
        elif route == "/api/meals/browse":
            handler._json(browse(q.get("category"), q.get("area")))
        elif route == "/api/meals/random":
            handler._json(random_pick())
        elif route == "/api/meals/recipe":
            handler._json({"ok": True, "recipe": recipe(q.get("id"))})
        elif route == "/api/meals/staples":
            handler._json(staples_doc())
        elif route == "/api/meals/favorites":
            handler._json(favorites_doc())
        elif route == "/api/meals/shopping":
            n = q.get("days", "7")
            handler._json(shopping_doc(int(n) if n.isdigit() else 7))
        else:
            handler._json({"ok": False, "error": "Not found"}, 404)
    except ValueError as e:
        handler._json({"ok": False, "error": str(e)}, 404)
    except MealsError as e:
        handler._json({"ok": False, "error": str(e)}, 503)
    return True


def dispatch_post(handler, route, payload):
    if route == "/api/meals/staples":
        return staples_post(payload)
    if route == "/api/meals/favorites":
        return set_favorite(payload.get("id"), bool(payload.get("on", True)))
    if route == "/api/meals/plan":
        return set_day(payload.get("date"), payload.get("id"))
    if route == "/api/meals/shopping" and "add" in payload:
        return add_item(payload.get("add"))
    if route == "/api/meals/shopping" and "qty" in payload:
        return set_qty(payload.get("key"), payload.get("qty"))
    if route == "/api/meals/shopping" and payload.get("clear_all"):
        return clear_all()
    if route == "/api/meals/shopping" and "remove" in payload:
        return remove_item(payload.get("remove"))
    if route == "/api/meals/shopping":
        return check_item(payload.get("key"), bool(payload.get("checked", True)), bool(payload.get("clear_checked")))
    return None
