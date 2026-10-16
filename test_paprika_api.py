"""paprika_api: sign-in, incremental sync, photos, search and recipe shape. No network: http is replaced."""
import json
import unittest
import urllib.error
from unittest import mock

import meals_api as M
import paprika_api as P
from testutil import temp_config

U1, U2, U3 = "AAAA1111-0000-0000-0000-000000000001", "BBBB2222-0000-0000-0000-000000000002", "CCCC3333-0000-0000-0000-000000000003"


def rec(uid, name, ings, h="h1", **extra):
    r = {"uid": uid, "hash": h, "name": name, "ingredients": ings, "directions": "Chop.\n\nCook.", "categories": ["c1"],
         "rating": 0, "on_favorites": False, "in_trash": False, "photo_url": f"https://s3.test/{uid}.jpg", "photo_hash": "ph"}
    r.update(extra)
    return r


class FakePaprika:
    def __init__(self):
        self.calls, self.login_ok, self.recipes = [], True, {
            U1: rec(U1, "Abuela's Arroz con Pollo", "2 cups rice\n1 lb chicken thighs\nFor the sofrito:\n1 onion, diced\nSalt", rating=5),
            U2: rec(U2, "Weeknight Tacos", "1 lb ground beef\n8 tortillas", on_favorites=True),
            U3: rec(U3, "Old soup", "water", in_trash=True)}

    def __call__(self, url, data=None, headers=None):
        self.calls.append(url)
        if url.endswith("/account/login/"):
            if not self.login_ok:
                raise urllib.error.HTTPError(url, 401, "no", {}, None)
            assert data == {"email": "me@test", "password": "pw"}
            return json.dumps({"result": {"token": "TOK"}}).encode()
        if url.startswith("https://s3.test/"):
            return b"\xff\xd8jpegbytes"
        assert (headers or {}).get("Authorization") == "Bearer TOK", headers
        path = url.split("/api/v2/sync/", 1)[1]
        if path == "recipes/":
            return json.dumps({"result": [{"uid": u, "hash": r["hash"]} for u, r in self.recipes.items()]}).encode()
        if path == "categories/":
            return json.dumps({"result": [{"uid": "c1", "name": "Family"}]}).encode()
        if path.startswith("recipe/"):
            return json.dumps({"result": self.recipes[path.split("/")[1]]}).encode()
        raise AssertionError(url)


class Base(unittest.TestCase):
    conf = {"email": "me@test", "password": "pw"}

    def setUp(self):
        self.cm = temp_config(paprika=self.conf, meals={"api_key": "1", "cache_hours": 1})
        self.dir = self.cm.__enter__()
        self.fake = FakePaprika()
        self.p = mock.patch.object(P, "http", self.fake)
        self.p.start()

    def tearDown(self):
        self.p.stop()
        self.cm.__exit__(None, None, None)


class SyncTest(Base):
    def test_sync_keeps_recipes_and_photos_and_skips_trash(self):
        d = P.sync()
        self.assertEqual(sorted(d["recipes"]), [U1, U2])
        self.assertEqual(d["categories"], ["Family"])
        self.assertTrue((self.dir / "data" / "paprika" / "photos" / f"{U1}.jpg").exists())
        self.assertTrue(d["recipes"][U1]["has_photo"])

    def test_second_sync_fetches_only_changed_recipes(self):
        P.sync()
        self.fake.calls.clear()
        self.fake.recipes[U2]["hash"] = "h2"
        self.fake.recipes[U2]["name"] = "Better Tacos"
        P.sync()
        fetched = [c for c in self.fake.calls if "/sync/recipe/" in c]
        self.assertEqual(len(fetched), 1)
        self.assertIn(U2, fetched[0])
        self.assertFalse(any("login" in c for c in self.fake.calls))       # token reused
        self.assertFalse(any("s3.test" in c for c in self.fake.calls))     # same photo_hash: no download
        self.assertEqual(P.load()["recipes"][U2]["name"], "Better Tacos")

    def test_deleted_recipe_and_photo_go(self):
        P.sync()
        del self.fake.recipes[U1]
        P.sync()
        self.assertNotIn(U1, P.load()["recipes"])
        self.assertFalse((self.dir / "data" / "paprika" / "photos" / f"{U1}.jpg").exists())

    def test_list_puts_favorites_and_ratings_first(self):
        P.sync()
        with mock.patch.object(P, "kick"):
            d = P.list_doc()
        self.assertEqual([r["name"] for r in d["results"]], ["Weeknight Tacos", "Abuela's Arroz con Pollo"])
        self.assertEqual(d["results"][0]["id"], "p" + U2)
        self.assertEqual(d["results"][0]["thumb"], f"/api/meals/paprika/photo/{U2}")


class MealsTest(Base):
    def setUp(self):
        super().setUp()
        P.sync()
        self.k = mock.patch.object(P, "kick"); self.k.start()
        self.m = mock.patch.object(M, "http_get", lambda url: {"meals": None}); self.m.start()

    def tearDown(self):
        self.k.stop(); self.m.stop()
        super().tearDown()

    def test_recipe_shape(self):
        r = M.recipe("p" + U1)
        self.assertEqual(r["name"], "Abuela's Arroz con Pollo")
        self.assertEqual(r["ingredients"][0], {"name": "rice", "measure": "2 cups"})
        self.assertEqual(r["ingredients"][1], {"name": "chicken thighs", "measure": "1 lb"})
        self.assertEqual([g["name"] for g in r["ingredients"]][2:], ["onion, diced", "Salt"])   # heading dropped
        self.assertEqual(r["steps"], ["Chop.", "Cook."])

    def test_search_finds_paprika_by_name_and_ingredient(self):
        self.assertEqual([r["name"] for r in M.search("arroz")["results"]], ["Abuela's Arroz con Pollo"])
        self.assertEqual([r["name"] for r in M.search("tortillas")["results"]], ["Weeknight Tacos"])

    def test_plan_and_favorite_a_paprika_recipe(self):
        d = M.set_day(M.today().isoformat(), "p" + U2)
        self.assertEqual(d["tonight"]["name"], "Weeknight Tacos")
        self.assertEqual(M.set_favorite("p" + U2)["favorites"][0]["id"], "p" + U2)

    def test_unknown_paprika_id(self):
        with self.assertRaises(ValueError):
            M.recipe("pZZZZ9999-not-there")


class LoginFallbackTest(Base):
    def test_refused_v2_login_falls_back_to_basic_auth(self):
        self.fake.login_ok = False
        headers, ver = P.login()
        self.assertEqual(ver, "v1")
        self.assertTrue(headers["Authorization"].startswith("Basic "))


class OffTest(Base):
    conf = {"email": "", "password": ""}

    def test_off_without_email(self):
        self.assertFalse(P.enabled())
        self.assertEqual(P.search("rice"), [])
        self.assertEqual(P.sync()["recipes"], {})
        self.assertEqual(self.fake.calls, [])


class IngredientTest(unittest.TestCase):
    def test_lines(self):
        for line, want in (("2 cloves garlic, minced", ("garlic, minced", "2 cloves")), ("1/2 cup milk", ("milk", "1/2 cup")),
                           ("Salt and pepper", ("Salt and pepper", "")), ("3 eggs", ("eggs", "3")), ("1 (14 oz) can beans", ("(14 oz) can beans", "1"))):
            self.assertEqual(P.ingredient(line), {"name": want[0], "measure": want[1]})


if __name__ == "__main__":
    unittest.main()
