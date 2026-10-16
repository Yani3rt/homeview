import unittest

import config


class BackpackRules(unittest.TestCase):
    def test_not_set_means_built_in_list(self):
        self.assertIsNone(config.backpack_rules(None))
        self.assertIsNone(config.backpack_rules({"match": "x"}))

    def test_rules_are_cleaned(self):
        r = config.backpack_rules([
            {"match": "snack", "item": "Snack money", "icon": "coin"},
            {"match": "pe|gym", "item": "Sneakers", "note": "PE day", "icon": "rocket"},   # unknown icon
            {"match": "", "item": "Nothing"},                                              # no match: dropped
            {"match": "art"},                                                               # no item: dropped
            "nonsense",
        ])
        self.assertEqual(r, [{"match": "snack", "item": "Snack money", "note": "", "icon": "coin"},
                             {"match": "pe|gym", "item": "Sneakers", "note": "PE day", "icon": "star"}])

    def test_an_empty_list_turns_the_backpack_off(self):
        self.assertEqual(config.backpack_rules([]), [])


if __name__ == "__main__":
    unittest.main()
