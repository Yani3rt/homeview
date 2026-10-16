"""meals_api: TheMealDB client, disk cache, plan store and shopping list. No network: http_get is replaced."""
import json
import time
import unittest
from datetime import date, timedelta
from fractions import Fraction
from unittest import mock

import meals_api as M
from testutil import temp_config


def meal(id, name, ings, instructions="Step one.\r\n\r\nStep two.", **extra):
    m = {"idMeal": id, "strMeal": name, "strCategory": "Chicken", "strArea": "Italian", "strMealThumb": f"https://img.test/{id}.jpg",
         "strInstructions": instructions, "strTags": "Pasta,Easy", "strYoutube": "", "strSource": None}
    for i in range(1, 21):
        m[f"strIngredient{i}"], m[f"strMeasure{i}"] = ("", "")
    for i, (n, q) in enumerate(ings, 1):
        m[f"strIngredient{i}"], m[f"strMeasure{i}"] = n, q
    m.update(extra)
    return m


DB = {
    "1": meal("1", "Garlic Pasta", [("Garlic", "2 cloves"), ("Onion", "1"), ("Olive Oil", "2 tbsp"), ("Salt", "to taste")]),
    "2": meal("2", "Chicken Stew", [("garlic", "3 cloves"), ("Onions", "2"), ("olive oil", "1 tablespoon"), ("Salt", "pinch"), ("Carrots", "1½ cups")]),
    "3": meal("3", "Rice Bowl", [("Rice", "200g"), ("Carrot", "1/2 cup"), ("Soy Sauce", "1 (12 oz.) bottle")]),
}


class FakeAPI:
    """Answers TheMealDB URLs from DB and counts calls."""
    def __init__(self):
        self.calls, self.down = [], False

    def __call__(self, url):
        self.calls.append(url)
        if self.down:
            raise OSError("network down")
        path = url.split("/api/json/v1/", 1)[1].split("/", 1)[1]
        ep, _, qs = path.partition("?")
        q = dict(p.split("=", 1) for p in qs.split("&") if p)
        if ep == "lookup.php":
            return {"meals": [DB[q["i"]]] if q["i"] in DB else None}
        if ep == "search.php":
            hits = [m for m in DB.values() if q.get("s", "").lower() in m["strMeal"].lower()]
            return {"meals": hits or None}
        if ep == "filter.php":
            if "c" in q:
                return {"meals": [{"idMeal": m["idMeal"], "strMeal": m["strMeal"], "strMealThumb": m["strMealThumb"]}
                                  for m in DB.values() if m["strCategory"] == q["c"]] or None}
            if "i" in q:
                return {"meals": [{"idMeal": "2", "strMeal": "Chicken Stew", "strMealThumb": "x"}] if "carrot" in q["i"] else None}
            return {"meals": None}
        if ep == "categories.php":
            return {"categories": [{"idCategory": "1", "strCategory": "Chicken", "strCategoryThumb": "t", "strCategoryDescription": "Birds. More."}]}
        if ep == "list.php":
            return {"meals": [{"strArea": "Italian"}, {"strArea": "Mexican"}]}
        if ep == "random.php":
            return {"meals": [DB["3"]]}
        raise AssertionError("unexpected endpoint " + ep)


class Base(unittest.TestCase):
    def setUp(self):
        self.cm = temp_config(meals={"api_key": "1", "cache_hours": 1})
        self.dir = self.cm.__enter__()
        self.api = FakeAPI()
        self.p = mock.patch.object(M, "http_get", self.api)
        self.p.start()

    def tearDown(self):
        self.p.stop()
        self.cm.__exit__(None, None, None)


class ParsingTest(unittest.TestCase):
    def test_parse_measures(self):
        self.assertEqual(M.parse_measure("1 1/2 cups"), (Fraction(3, 2), "cup"))
        self.assertEqual(M.parse_measure("1½ cups"), (Fraction(3, 2), "cup"))
        self.assertEqual(M.parse_measure("200g"), (200, "g"))
        self.assertEqual(M.parse_measure("2 tbs"), (2, "tbsp"))
        self.assertEqual(M.parse_measure("3"), (3, ""))
        self.assertEqual(M.parse_measure("2 large"), (2, ""))
        self.assertIsNone(M.parse_measure("to taste"))
        self.assertIsNone(M.parse_measure("1 (12 oz.) can"))
        self.assertIsNone(M.parse_measure("Juice of 1"))

    def test_amounts_print_metric_as_decimals_and_cups_as_fractions(self):
        self.assertEqual(M.amount_text({"kg": Fraction(6, 5)}, []), "1.2 kg")
        self.assertEqual(M.amount_text({"g": Fraction(250)}, []), "250 g")
        self.assertEqual(M.amount_text({"cup": Fraction(3, 2)}, ["a handful"]), "1 1/2 cups + a handful")
        self.assertEqual(M.amount_text({"tsp": Fraction(1, 2)}, []), "1/2 tsp")

    def test_ingredient_key_folds_case_and_plurals(self):
        for a, b in (("Tomatoes", "tomato"), ("onions", "onion"), (" Garlic ", "garlic"), ("Berries", "berry"),
                     ("Asparagus", "asparagus"), ("Swiss Cheese", "swiss cheese"), ("Glass", "glass")):
            self.assertEqual(M.ingredient_key(a), b)

    def test_steps_split_on_blank_lines_and_numbers(self):
        self.assertEqual(M.steps("Heat oil.\r\n\r\nAdd onion."), ["Heat oil.", "Add onion."])
        self.assertEqual(M.steps("STEP 1\r\nHeat oil.\r\nSTEP 2\r\nAdd onion."), ["Heat oil.", "Add onion."])
        self.assertEqual(M.steps("1. Heat oil.\n2. Add onion."), ["Heat oil.", "Add onion."])
        long = " ".join(["Stir the pot well and keep going until it smells good."] * 12)
        self.assertGreater(len(M.steps(long)), 1)
        self.assertEqual(M.steps(""), [])

    def test_recipe_doc_skips_empty_slots(self):
        r = M.recipe_doc(DB["1"])
        self.assertEqual([g["name"] for g in r["ingredients"]], ["Garlic", "Onion", "Olive Oil", "Salt"])
        self.assertEqual(r["tags"], ["Pasta", "Easy"])
        self.assertEqual(r["area"], "Italian")

    def test_area_falls_back_to_country(self):
        self.assertEqual(M.brief({"idMeal": "9", "strMeal": "X", "strArea": None, "strCountry": "Brazil"})["area"], "Brazil")


class CacheTest(Base):
    def test_second_read_comes_from_disk(self):
        M.recipe("1"); M.recipe("1")
        self.assertEqual(len(self.api.calls), 1)
        self.assertEqual(len(list((self.dir / "data" / "meals_cache").glob("*.json"))), 1)

    def test_expired_cache_refetches_and_stale_copy_survives_an_outage(self):
        M.search("pasta")
        for f in (self.dir / "data" / "meals_cache").glob("*.json"):
            d = json.loads(f.read_text()); d["at"] = time.time() - 7200; f.write_text(json.dumps(d))
        self.api.down = True
        self.assertEqual(M.search("pasta")["results"][0]["name"], "Garlic Pasta")   # stale, but served
        self.assertEqual(len(self.api.calls), 2)

    def test_outage_without_cache_is_a_readable_error(self):
        self.api.down = True
        with self.assertRaises(M.MealsError):
            M.categories()

    def test_key_from_config_is_used_in_the_url(self):
        with temp_config(meals={"api_key": "abc123"}):
            M.random_pick()
        self.assertIn("/api/json/v1/abc123/random.php", self.api.calls[-1])

    def test_random_is_never_cached(self):
        M.random_pick(); M.random_pick()
        self.assertEqual(len(self.api.calls), 2)


class ReadTest(Base):
    def test_search_falls_back_to_main_ingredient(self):
        r = M.search("carrot")
        self.assertEqual([x["id"] for x in r["results"]], ["2"])
        self.assertIn("filter.php?i=carrot", self.api.calls[-1])

    def test_empty_search_does_not_call_the_api(self):
        self.assertEqual(M.search("  ")["results"], [])
        self.assertEqual(self.api.calls, [])

    def test_categories_and_areas(self):
        d = M.categories()
        self.assertEqual(d["categories"][0]["name"], "Chicken")
        self.assertEqual(d["areas"], ["Italian", "Mexican"])

    def test_bad_recipe_ids_never_reach_the_api(self):
        for bad in ("", "../etc", "1;2", "x" * 20):
            with self.assertRaises(ValueError):
                M.recipe(bad)
        self.assertEqual(self.api.calls, [])
        with self.assertRaises(ValueError):
            M.recipe("999")


class PlanTest(Base):
    def test_plan_tonight_and_clear(self):
        t = M.today().isoformat()
        d = M.set_day(t, "1")
        self.assertEqual(d["tonight"]["name"], "Garlic Pasta")
        self.assertEqual(d["planned_7"], 1)
        self.assertEqual(d["week"][0]["date"], t)
        d = M.set_day(t, None)
        self.assertIsNone(d["tonight"])
        self.assertTrue((self.dir / "data" / "meal_plan.json").exists())

    def test_bad_dates_rejected(self):
        for bad in ("tomorrow", "2026-13-01", "", None):
            with self.assertRaises(ValueError):
                M.set_day(bad, "1")

    def test_unknown_recipe_is_not_planned(self):
        with self.assertRaises(ValueError):
            M.set_day(M.today().isoformat(), "999")
        self.assertEqual(M.load_plan()["days"], {})


class FavoritesTest(Base):
    def test_heart_and_unheart(self):
        d = M.set_favorite("1")
        self.assertEqual([f["name"] for f in d["favorites"]], ["Garlic Pasta"])
        M.set_favorite("2")
        self.assertEqual([f["id"] for f in M.favorites()], ["2", "1"])
        M.set_favorite("2")                                  # hearting again moves it to the top, no duplicate
        self.assertEqual([f["id"] for f in M.favorites()], ["2", "1"])
        d = M.set_favorite("1", on=False)
        self.assertEqual([f["id"] for f in d["favorites"]], ["2"])

    def test_bad_or_unknown_ids(self):
        for bad in ("", None, "abc", "999"):
            with self.assertRaises(ValueError):
                M.set_favorite(bad)
        self.assertEqual(M.favorites(), [])

    def test_usuals_count_past_dinners_only(self):
        t = M.today()
        for off, rid in ((-20, "1"), (-10, "2"), (-5, "1"), (0, "3"), (2, "2"), (-200, "2")):
            M.set_day((t + timedelta(days=off)).isoformat(), rid)
        u = M.usuals()
        self.assertEqual([(x["id"], x["times"]) for x in u], [("1", 2), ("3", 1), ("2", 1)])
        self.assertEqual(u[0]["last"], (t - timedelta(days=5)).isoformat())


class ShoppingOffTest(Base):
    def test_planned_dinners_stay_off_the_list_by_default(self):
        M.set_day(M.today().isoformat(), "1")
        M.add_item("Milk")
        d = M.shopping_doc()
        self.assertFalse(d["from_meals"]); self.assertEqual(d["meals"], [])
        self.assertEqual([x["key"] for x in d["items"]], ["milk"])

    def test_clear_all_empties_the_list(self):
        M.add_item("Milk"); M.add_item("Eggs"); M.check_item("eggs", True)
        self.assertEqual(M.clear_all()["cleared"], 2)
        d = M.shopping_doc(); self.assertEqual(d["items"], []); self.assertEqual(d["left"], 0)


class ShoppingTest(Base):
    def setUp(self):
        super().setUp()
        self.cm2 = temp_config(meals={"api_key": "1", "cache_hours": 1}, shopping={"from_meals": True})
        self.cm2.__enter__()

    def tearDown(self):
        self.cm2.__exit__(None, None, None)
        super().tearDown()

    def plan(self, offsets_ids):
        t = M.today()
        for off, rid in offsets_ids:
            M.set_day((t + timedelta(days=off)).isoformat(), rid)

    def test_merges_the_same_ingredient_across_recipes(self):
        self.plan([(0, "1"), (1, "2"), (3, "3")])
        d = M.shopping_doc()
        by = {x["key"]: x for x in d["items"]}
        self.assertEqual(by["garlic"]["amount"], "5 cloves")
        self.assertEqual(by["onion"]["amount"], "3")
        self.assertEqual(by["olive oil"]["amount"], "3 tbsp")
        self.assertEqual(by["salt"]["amount"], "to taste + pinch")
        self.assertEqual(by["carrot"]["amount"], "2 cups")                 # 1 1/2 cups + 1/2 cup
        self.assertEqual(by["soy sauce"]["amount"], "1 (12 oz.) bottle")   # kept as written
        self.assertEqual(sorted(by["garlic"]["meals"]), ["Chicken Stew", "Garlic Pasta"])
        self.assertEqual(len(d["meals"]), 3)
        self.assertEqual(d["left"], len(d["items"]))

    def test_range_excludes_days_outside_it(self):
        self.plan([(0, "1"), (9, "2")])
        self.assertEqual([m["id"] for m in M.shopping_doc(7)["meals"]], ["1"])
        self.assertEqual([m["id"] for m in M.shopping_doc(14)["meals"]], ["1", "2"])

    def test_check_off_and_clear(self):
        self.plan([(0, "1")])
        M.check_item("garlic", True)
        d = M.shopping_doc()
        self.assertTrue(next(x for x in d["items"] if x["key"] == "garlic")["checked"])
        self.assertEqual(d["items"][-1]["key"], "garlic")      # checked items sort last
        self.assertEqual(d["left"], len(d["items"]) - 1)
        M.check_item(clear_checked=True)
        self.assertEqual(M.shopping_doc()["left"], len(d["items"]))
        with self.assertRaises(ValueError):
            M.check_item("")

    def test_added_items_show_without_any_dinners(self):
        M.add_item("  paper   towels ")
        d = M.shopping_doc()
        self.assertEqual([(x["name"], x["added"], x["meals"]) for x in d["items"]], [("Paper towels", True, [])])
        self.assertEqual(d["left"], 1)

    def test_added_item_merges_with_the_same_recipe_ingredient(self):
        self.plan([(0, "1")])
        M.add_item("Garlic")
        by = {x["key"]: x for x in M.shopping_doc()["items"]}
        self.assertTrue(by["garlic"]["added"])
        self.assertTrue(by["garlic"]["meals"])           # still says which dinner needs it
        self.assertEqual(sum(1 for k in by if k == "garlic"), 1)

    def test_remove_and_clear(self):
        self.plan([(0, "1")])
        M.add_item("milk"); M.add_item("eggs")
        M.remove_item("milk")
        keys = [x["key"] for x in M.shopping_doc()["items"]]
        self.assertNotIn("milk", keys); self.assertIn("egg", keys)
        with self.assertRaises(ValueError):
            M.remove_item("garlic")                        # recipe ingredients are not removable
        M.check_item("egg", True); M.check_item("garlic", True)
        M.check_item(clear_checked=True)                   # bought: the hand-added egg goes, garlic stays unchecked
        by = {x["key"]: x for x in M.shopping_doc()["items"]}
        self.assertNotIn("egg", by)
        self.assertFalse(by["garlic"]["checked"])

    def test_add_validates(self):
        with self.assertRaises(ValueError):
            M.add_item("   ")
        self.assertEqual(len(M.add_item("x" * 200)["key"]), 60)
        for i in range(M.MAX_ADDED - 1):
            M.add_item("item %d" % i)
        with self.assertRaises(ValueError):
            M.add_item("one too many")
        M.add_item("item 3")                               # re-adding an existing one is fine

    def test_empty_plan_gives_an_empty_list(self):
        d = M.shopping_doc()
        self.assertEqual((d["items"], d["meals"], d["left"]), ([], [], 0))


if __name__ == "__main__":
    unittest.main()
