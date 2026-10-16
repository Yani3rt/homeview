"""weather_api.nowcast / uv_doc and tides_api shaping, with no network."""
import unittest
from datetime import datetime
from zoneinfo import ZoneInfo
import weather_api as W

Z = ZoneInfo('America/New_York')


def slots(start_h, mms):
    out = []
    for i, mm in enumerate(mms):
        m = start_h * 60 + i * 15
        out.append({'t': '2026-10-15T%02d:%02d' % (m // 60, m % 60), 'mm': mm})
    return out


class NowcastTest(unittest.TestCase):
    now = datetime(2026, 10, 15, 15, 5, tzinfo=Z)

    def test_dry(self):
        self.assertIsNone(W.nowcast(slots(15, [0] * 12), self.now))

    def test_rain_starts(self):
        n = W.nowcast(slots(15, [0, 0, 0.4, 3.0, 1.0]), self.now)
        self.assertEqual((n['state'], n['at'], n['mins'], n['heavy']), ('start', '2026-10-15T15:30', 25, True))

    def test_rain_stops(self):
        n = W.nowcast(slots(15, [1.2, 0.8, 0.0, 0.0]), self.now)
        self.assertEqual((n['state'], n['at']), ('stop', '2026-10-15T15:30'))

    def test_keeps_raining(self):
        self.assertEqual(W.nowcast(slots(15, [1] * 12), self.now)['state'], 'rain')

    def test_beyond_two_hours_ignored(self):
        self.assertIsNone(W.nowcast(slots(15, [0] * 10 + [2.0]), self.now))


class UVTest(unittest.TestCase):
    def test_window(self):
        hr = {'time': ['2026-10-15T%02d:00' % h for h in range(24)], 'uv_index': [0] * 10 + [4, 6.5, 8, 7, 6, 3] + [0] * 8}
        u = W.uv_doc(hr, {'uv_index_max': [8.2]}, '2026-10-15')
        self.assertEqual((u['max'], u['high_from'], u['high_until']), (8.2, '2026-10-15T11:00', '2026-10-15T15:00'))


if __name__ == '__main__':
    unittest.main()
