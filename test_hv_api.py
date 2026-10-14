"""hv_api: timers and remote commands, against a temp data folder (no server, no devices)."""
import io, json, tempfile, time, unittest
from pathlib import Path
import hv_api as HV
from testutil import temp_config


class FakeHandler:
    def __init__(self, body=b'', headers=None):
        self.rfile = io.BytesIO(body); self.headers = headers or {}; self.out = None; self.code = None; self.err = None
    def _json(self, obj, code=200): self.out, self.code = obj, code
    def send_error(self, code): self.err = code


class HVTest(unittest.TestCase):
    def setUp(self):
        self.cm = temp_config(); self.dir = self.cm.__enter__()
    def tearDown(self): self.cm.__exit__(None, None, None)

    def post(self, route, obj, origin='http://frame:8806', host='frame:8806'):
        b = json.dumps(obj).encode()
        h = FakeHandler(b, {'Content-Length': str(len(b)), 'Origin': origin, 'Host': host})
        self.assertTrue(HV.dispatch_post(h, route)); return h

    def test_timer_start_and_cancel(self):
        h = self.post('/api/hv/timer', {'action': 'start', 'label': 'Soup', 'seconds': 900})
        t = h.out['timer']; self.assertAlmostEqual(t['ends'] - time.time(), 900, delta=2)
        self.assertEqual([x['label'] for x in HV.state_doc()['timers']], ['Soup'])
        self.post('/api/hv/timer', {'action': 'cancel', 'id': t['id']})
        self.assertEqual(HV.state_doc()['timers'], [])

    def test_timer_limits(self):
        self.assertEqual(self.post('/api/hv/timer', {'action': 'start', 'seconds': 2}).code, 400)
        for _ in range(HV.MAX_TIMERS):
            self.post('/api/hv/timer', {'action': 'start', 'seconds': 60})
        self.assertEqual(self.post('/api/hv/timer', {'action': 'start', 'seconds': 60}).code, 400)

    def test_finished_timer_kept_one_minute(self):
        HV._save({'timers': [{'id': 'a', 'label': 'x', 'total': 5, 'ends': time.time() - 30},
                             {'id': 'b', 'label': 'y', 'total': 5, 'ends': time.time() - 90}], 'command': None, 'seq': 0})
        self.assertEqual([t['id'] for t in HV.state_doc()['timers']], ['a'])

    def test_command_rejects_unknown_screen(self):
        self.assertEqual(self.post('/api/hv/command', {'action': 'open', 'screen': 'settings'}).code, 400)
        c1 = self.post('/api/hv/command', {'action': 'open', 'screen': 'dinner'}).out['command']
        c2 = self.post('/api/hv/command', {'action': 'open', 'screen': 'standby'}).out['command']
        self.assertEqual(c2['seq'], c1['seq'] + 1)

    def test_browser_write_needs_same_origin(self):
        self.assertEqual(self.post('/api/hv/command', {'action': 'open', 'screen': 'dinner'}, origin='http://evil').code, 403)

    def test_alexa_routes_are_gone(self):
        self.assertFalse(HV.dispatch_post(FakeHandler(b'{}', {'Content-Length': '2'}), '/api/hv/alexa/pasta-timer'))
        self.assertFalse(HV.dispatch_get(FakeHandler(), '/api/hv/alexa/pasta-timer'))

    def test_state_lives_in_the_data_dir(self):
        self.post('/api/hv/timer', {'action': 'start', 'label': 'Tea', 'seconds': 240})
        self.assertTrue((self.dir / 'data' / 'hv_state.json').exists())

    def test_wallpapers_list_and_serve(self):
        W = self.dir / 'walls'; W.mkdir()
        (W / 'Amber-Glow.jpg').write_bytes(b'jpg'); (W / 'notes.txt').write_text('x'); (W / '.hidden.png').write_bytes(b'p')
        self.assertEqual([w['id'] for w in HV.wallpapers_doc()['wallpapers']], ['Amber-Glow.jpg'])
        self.assertEqual(HV.wallpapers_doc()['wallpapers'][0]['name'], 'Amber Glow')
        sent = []
        class H(FakeHandler):
            def send_response(self, c): sent.append(c)
            def send_header(self, *a): pass
            def end_headers(self): pass
        h = H(); h.wfile = io.BytesIO()
        self.assertTrue(HV.dispatch_get(h, '/frame/hv/wallpapers/Amber-Glow.jpg')); self.assertEqual(sent, [200])
        self.assertFalse(HV.dispatch_get(FakeHandler(), '/frame/hv/wallpapers/../hv_api.py'))
        self.assertFalse(HV.dispatch_get(FakeHandler(), '/frame/hv/wallpapers/notes.txt'))

    def test_other_routes_not_claimed(self):
        self.assertFalse(HV.dispatch_post(FakeHandler(), '/api/frame/light'))
        self.assertFalse(HV.dispatch_get(FakeHandler(), '/api/frame'))


if __name__ == '__main__':
    unittest.main()
