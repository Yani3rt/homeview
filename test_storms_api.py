"""storms_api: check schedule, storm shaping and filtering, with no network."""
import unittest
from datetime import datetime
from zoneinfo import ZoneInfo
import storms_api as S
from testutil import temp_config

Z = ZoneInfo('America/New_York')
FEED = {'activeStorms': [
    {'id': 'al142026', 'name': 'Milton', 'classification': 'HU', 'intensity': '105', 'pressure': '950',
     'latitudeNumeric': 23.0, 'longitudeNumeric': -84.5, 'movementDir': 45, 'movementSpeed': 10,
     'publicAdvisory': {'advNum': '012A', 'issuance': '2026-10-15T15:00:00.000Z'}, 'forecastGraphics': {'url': 'https://www.nhc.noaa.gov/graphics_at4.shtml'}},
    {'id': 'al152026', 'name': 'Far', 'classification': 'TS', 'intensity': '45', 'latitudeNumeric': 40.0, 'longitudeNumeric': -30.0},
    {'id': 'ep212026', 'name': 'Trudy', 'classification': 'HU', 'intensity': '80', 'latitudeNumeric': 13.1, 'longitudeNumeric': -101.6}]}


class StormsTest(unittest.TestCase):
    def test_next_advisory_slot(self):
        self.assertEqual(S.next_advisory_check(datetime(2026, 10, 15, 12, 20, tzinfo=Z)).strftime('%H:%M'), '17:10')
        self.assertEqual(S.next_advisory_check(datetime(2026, 10, 15, 23, 30, tzinfo=Z)).strftime('%d %H:%M'), '16 05:10')

    def test_category(self):
        self.assertEqual([S.category(k, 'HU') for k in (64, 83, 96, 113, 137)], [1, 2, 3, 4, 5])
        self.assertIsNone(S.category(50, 'TS'))

    def test_list_filters_and_shapes(self):
        with temp_config(location={'name': 'Key West', 'latitude': 24.56, 'longitude': -81.80}, storms={'basins': ['AL']}):
            ls = S.storm_list(S.settings(), FEED)
        self.assertEqual([s['name'] for s in ls], ['Milton'])        # Pacific and far-away storms left out
        m = ls[0]
        self.assertEqual((m['label'], m['cat'], m['dir'], m['near']), ('Hurricane', 3, 'WSW', True))
        self.assertEqual(m['moving'], 'NE at 12 mph')
        self.assertTrue(m['cone'].startswith('/api/storms/cone/al142026.jpg'))

    def test_disabled(self):
        with temp_config(storms={'enabled': False}):
            self.assertFalse(S.storms_doc()['enabled'])


if __name__ == '__main__':
    unittest.main()
