"""frame_api: the photo folder and the Sonos switch. Fakes only; no speaker is contacted."""
import io
import unittest
from unittest.mock import Mock, patch

import frame_api as F
from testutil import temp_config


class FakeHandler:
    def __init__(self, path='/'):
        self.path, self.headers, self.wfile = path, {}, io.BytesIO()
        self.out = self.code = self.err = None; self.sent = []
    def _json(self, obj, code=200): self.out, self.code = obj, code
    def send_error(self, code): self.err = code
    def send_response(self, c): self.sent.append(c)
    def send_header(self, *a): pass
    def end_headers(self): pass


class PhotoTests(unittest.TestCase):
    def setUp(self):
        self.cm = temp_config(); self.dir = self.cm.__enter__()
        from PIL import Image
        p = self.dir / 'photos'; (p / 'trip').mkdir(parents=True); (p / '.hidden').mkdir()
        Image.new('RGB', (1200, 800), '#88aacc').save(p / 'a.jpg')
        Image.new('RGB', (600, 900), '#cc8844').save(p / 'trip' / 'b.png')
        Image.new('RGB', (10, 10)).save(p / '.hidden' / 'c.jpg')
        (p / 'notes.txt').write_text('not a photo')
    def tearDown(self): self.cm.__exit__(None, None, None)

    def test_lists_images_in_subfolders_but_not_dot_folders(self):
        d = F.photos_doc()
        self.assertEqual(sorted((x['w'], x['h']) for x in d['photos']), [(600, 900), (1200, 800)])
        for x in d['photos']:
            self.assertRegex(x['url'], r'^/api/frame/photo/[0-9a-f]{32}\.jpg$')

    def test_serves_a_resized_jpeg_without_writing_into_the_photo_folder(self):
        pid = next(x['id'] for x in F.photos_doc()['photos'] if x['w'] == 600)
        h = FakeHandler('/api/frame/photo/%s.jpg?w=320' % pid)
        self.assertTrue(F.dispatch_get(h, '/api/frame/photo/%s.jpg' % pid))
        self.assertEqual(h.sent, [200]); self.assertTrue(h.wfile.getvalue().startswith(b'\xff\xd8'))
        from PIL import Image
        self.assertEqual(max(Image.open(io.BytesIO(h.wfile.getvalue())).size), 320)
        self.assertFalse(any(p.name.startswith('.w') for p in (self.dir / 'photos').rglob('*')))
        self.assertTrue(any((self.dir / 'data' / 'photo_cache').rglob('*.jpg')))

    def test_blur_sends_a_small_dark_background_copy(self):
        pid = next(x['id'] for x in F.photos_doc()['photos'] if x['w'] == 600)
        h = FakeHandler('/api/frame/photo/%s.jpg?w=1280&blur=1' % pid)
        self.assertTrue(F.dispatch_get(h, '/api/frame/photo/%s.jpg' % pid))
        self.assertEqual(h.sent, [200])
        from PIL import Image
        self.assertEqual(Image.open(io.BytesIO(h.wfile.getvalue())).size, (107, 160))
        self.assertTrue(any((self.dir / 'data' / 'photo_cache' / 'blur').glob('*.jpg')))

    def test_unknown_and_malformed_photo_ids_404(self):
        h = FakeHandler(); F.dispatch_get(h, '/api/frame/photo/' + '0' * 32 + '.jpg'); self.assertEqual(h.err, 404)
        h = FakeHandler(); self.assertFalse(F.dispatch_get(h, '/api/frame/photo/../../config.json'))

    def test_missing_folder_is_an_empty_list(self):
        with temp_config(photos_dir='/nonexistent/folder'):
            self.assertEqual(F.photos_doc()['photos'], [])


class SonosSwitchTests(unittest.TestCase):
    def test_disabled_sonos_answers_without_touching_the_network(self):
        with temp_config(sonos={'enabled': False}), patch.object(F, '_discover', side_effect=AssertionError('no discovery')):
            h = FakeHandler(); self.assertTrue(F.dispatch_get(h, '/api/frame/music'))
            self.assertEqual((h.out['enabled'], h.out['rooms']), (False, []))
            with self.assertRaises(ValueError):
                F.music_post({'room': 'x', 'action': 'pause'})

    def test_hosts_from_config_skip_discovery(self):
        made = []
        class P:
            def __init__(self, ip): made.append(ip); self.ip_address = ip; self.uid = 'RINCON_TEST' + ip[-1]; self.player_name = 'Room ' + ip[-1]; self.is_visible = True
            def get_speaker_info(self): return {'model_name': 'Sonos One'}
        import soco
        with temp_config(sonos={'enabled': True, 'hosts': ['10.0.0.1', '10.0.0.2']}), patch.object(soco, 'SoCo', P), \
                patch.object(soco, 'discover', side_effect=AssertionError('should not discover')), patch.object(F, '_cache', {}):
            z = F.zone_map()
        self.assertEqual(made, ['10.0.0.1', '10.0.0.2'])
        self.assertEqual(sorted(v['name'] for v in z.values()), ['Room 1', 'Room 2'])


class MusicCommandTests(unittest.TestCase):
    def test_invalid_spotify_url_cannot_play(self):
        fake = Mock()
        with patch.object(F, 'speaker', return_value=fake):
            for link in ['http://evil.example/a', 'https://open.spotify.com.evil/track/123', 'https://open.spotify.com/user/me', 'file:///etc/passwd']:
                with self.assertRaises(ValueError):
                    F.music_command({'room': 'a', 'action': 'spotify', 'link': link})
        fake.group.coordinator.play_from_queue.assert_not_called()

    def test_volume_sets_the_group_and_room_volume_one_room(self):
        fake = Mock(); fake.group.coordinator.available_actions = ['Play', 'Pause', 'Next', 'Previous']; fake.volume = 10
        with patch.object(F, 'speaker', return_value=fake):
            F.music_command({'room': 'a', 'action': 'pause'})
            fake.group.coordinator.pause.assert_called_once()
            F.music_command({'room': 'a', 'action': 'volume', 'value': 25})
            self.assertEqual(fake.group.volume, 25); self.assertEqual(fake.volume, 10)
            F.music_command({'room': 'a', 'action': 'room_volume', 'value': 30})
            self.assertEqual(fake.volume, 30)

    def test_sonos_tv_audio_is_not_reported_as_idle(self):
        fake = Mock(); fake.group.coordinator.get_current_transport_info.return_value = {'current_transport_state': 'PLAYING'}
        fake.group.coordinator.get_current_track_info.return_value = {'uri': 'x-sonos-htastream:room:spdif', 'title': ''}
        fake.volume = 42; fake.mute = False; fake.group.members = []; fake.group.coordinator.available_actions = []
        with patch.object(F, 'zone_map', return_value={'a': {'name': 'Den'}}), patch.object(F, 'speaker', return_value=fake), patch.object(F, '_cache', {}):
            d = F.music_doc()
        self.assertEqual(d['rooms'][0]['title'], 'TV audio'); self.assertEqual(d['rooms'][0]['source'], 'TV audio')


if __name__ == '__main__':
    unittest.main()
