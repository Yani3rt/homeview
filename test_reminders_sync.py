"""reminders_sync with a fake remindctl (test helper in scratch) and fake recipes: no network, no Mac."""
import json, os, tempfile, unittest
from datetime import timedelta
import meals_api, reminders_sync as RS
from testutil import temp_config

FAKE = os.environ.get('FAKE_REMINDCTL')   # run with FAKE_REMINDCTL=scripts/fake_remindctl.py
RECIPES = {'1': {'id': '1', 'name': 'Curry', 'ingredients': [{'name': 'Chicken', 'measure': '500g'}, {'name': 'Rice', 'measure': '2 cups'}, {'name': 'Salt', 'measure': 'pinch'}]}}


@unittest.skipUnless(FAKE, 'needs FAKE_REMINDCTL')
class SyncTest(unittest.TestCase):
    def setUp(self):
        self.db = tempfile.mktemp(); os.environ['FAKE_REM_DB'] = self.db
        self.cm = temp_config(reminders={'list': 'HomeView Test', 'remindctl': FAKE}, shopping={'from_meals': True}); self.cm.__enter__()
        self.orig = meals_api.recipe; meals_api.recipe = lambda rid: RECIPES[rid]
        d = meals_api.load_plan(); d['days'][meals_api.today().isoformat()] = {'id': '1', 'name': 'Curry'}; meals_api._save_plan(d)
        RS._status.pop('list_ready', None)
    def tearDown(self):
        meals_api.recipe = self.orig; self.cm.__exit__(None, None, None)
    def rem(self): return json.load(open(self.db))['items']
    def titles(self, done=None): return sorted(r['title'] for r in self.rem() if done is None or r['isCompleted'] == done)
    def frame(self): return {i['key']: i for i in meals_api.shopping_doc(7)['items']}

    def test_full_cycle(self):
        meals_api.add_item('Milk')
        RS.sync_once(); self.assertTrue(RS._status['ok'], RS._status)
        self.assertEqual(self.titles(), ['Chicken', 'Milk', 'Rice'])          # salt skipped
        self.assertIn('2 cups', [r for r in self.rem() if r['title'] == 'Rice'][0]['notes'])
        RS.sync_once(); self.assertEqual(len(self.rem()), 3)                  # idempotent
        # phone: add eggs, complete chicken
        db = json.load(open(self.db))
        db['items'].append({'id': 'PHONE1', 'title': 'Eggs', 'notes': None, 'isCompleted': False, 'listName': 'HomeView Test'})
        [r for r in db['items'] if r['title'] == 'Chicken'][0]['isCompleted'] = True
        json.dump(db, open(self.db, 'w'))
        RS.sync_once(); f = self.frame()
        self.assertIn('egg', f); self.assertTrue(f['chicken']['checked'])
        # frame: check milk, uncheck chicken
        meals_api.check_item('milk', True); meals_api.check_item('chicken', False)
        RS.sync_once()
        self.assertEqual(self.titles(True), ['Milk']); self.assertIn('Chicken', self.titles(False))
        # phone deletes eggs -> gone from frame; frame removes milk -> reminder deleted only if open (milk is done: kept)
        db = json.load(open(self.db)); db['items'] = [r for r in db['items'] if r['title'] != 'Eggs']; json.dump(db, open(self.db, 'w'))
        RS.sync_once(); self.assertNotIn('egg', self.frame())
        # dinner removed from the plan -> open ingredient reminders deleted
        d = meals_api.load_plan(); d['days'] = {}; meals_api._save_plan(d)
        RS.sync_once(); self.assertEqual(self.titles(False), [])

    def test_counts(self):
        meals_api.add_item('Milk'); meals_api.add_item('Milk')
        RS.sync_once(); self.assertIn('Milk ×2', self.titles())
        meals_api.set_qty('milk', 3); RS.sync_once(); self.assertIn('Milk ×3', self.titles())
        db = json.load(open(self.db)); [r for r in db['items'] if r['title'] == 'Milk ×3'][0]['title'] = 'Milk ×5'; json.dump(db, open(self.db, 'w'))
        RS.sync_once(); self.assertEqual(self.frame()['milk']['qty'], 5)
        db = json.load(open(self.db)); db['items'].append({'id': 'P2', 'title': '2 Lemons', 'notes': None, 'isCompleted': False, 'listName': 'HomeView Test'}); json.dump(db, open(self.db, 'w'))
        RS.sync_once(); self.assertEqual(self.frame()['lemon']['qty'], 2)
        RS.sync_once(); self.assertEqual(sorted(self.titles()), sorted(['Chicken', 'Rice', 'Milk ×5', '2 Lemons']))

    def test_missing_binary(self):
        with temp_config(reminders={'list': 'X', 'remindctl': '/nope'}):
            RS.shutil.which = lambda n: None
            RS.sync_once(); self.assertFalse(RS._status['ok']); self.assertIn('not installed', RS._status['error'])


if __name__ == '__main__':
    unittest.main()
