"""camera_api: settings, the ffmpeg command, error wording and the disabled case (no ffmpeg, no camera)."""
import unittest
import camera_api as C
import config
from testutil import temp_config


class FakeHandler:
    def __init__(self, path): self.path = path; self.out = None; self.code = None
    def _json(self, obj, code=200): self.out, self.code = obj, code


class CameraTest(unittest.TestCase):
    def test_disabled_by_default(self):
        with temp_config():
            self.assertFalse(C.enabled())
            self.assertFalse(config.public()['camera'])
            h = FakeHandler('/api/camera/status'); self.assertTrue(C.dispatch_get(h, '/api/camera/status'))
            self.assertFalse(h.out['enabled'])
            h = FakeHandler('/api/camera/stream.mjpg'); C.dispatch_get(h, '/api/camera/stream.mjpg')
            self.assertEqual(h.code, 404)
            self.assertFalse(C.dispatch_get(h, '/api/hv/state'))

    def test_public_config_hides_url(self):
        url = 'rtsp://me:hunter2@10.0.0.9:554/sub'
        with temp_config(camera={'name': 'Door', 'url': url}):
            pub = config.public()
            self.assertTrue(pub['camera']); self.assertEqual(pub['camera_name'], 'Door')
            self.assertNotIn('hunter2', repr(pub))

    def test_settings_are_clamped(self):
        with temp_config(camera={'url': 'rtsp://x/1', 'fps': 99, 'width': 50, 'quality': 'bad'}):
            s = C.settings()
            self.assertEqual((s['fps'], s['width'], s['quality']), (25, 160, 7))

    def test_command_for_rtsp(self):
        conf = {'url': 'rtsp://u:p@cam/s', 'fps': 10, 'width': 640, 'quality': 7, 'ffmpeg': ''}
        cmd = C.build_cmd(conf, '/usr/bin/ffmpeg')
        self.assertIn('-rtsp_transport', cmd); self.assertEqual(cmd[cmd.index('-i') + 1], conf['url'])
        self.assertEqual(cmd[-3:], ['-f', 'mjpeg', 'pipe:1'])
        self.assertIn("fps=10,scale='min(640,iw)':-2", ' '.join(cmd))

    def test_errors_never_show_the_url(self):
        conf = {'url': 'rtsp://u:secret@10.0.0.9/s'}
        for raw, word in (('[rtsp] method DESCRIBE failed: 401 Unauthorized', 'password'),
                          ('rtsp://u:secret@10.0.0.9/s: Server returned 404 Not Found', 'address'),
                          ('rtsp://u:secret@10.0.0.9/s: Connection timed out', 'answering'),
                          ('rtsp://u:secret@10.0.0.9/s: something odd', '<camera>')):
            msg = C._clean_error(raw, conf)
            self.assertNotIn('secret', msg); self.assertIn(word, msg)

    def test_several_cameras_and_default(self):
        cams = [{'name': 'Front door', 'url': 'rtsp://a:secret1@10.0.0.9/s'},
                {'name': 'Back Yard', 'url': 'rtsp://b:secret2@10.0.0.10/s', 'default': True},
                {'name': 'Unused', 'url': ''},
                {'name': 'Front door', 'url': 'rtsp://10.0.0.11/s'}]
        with temp_config(cameras=cams):
            pub = config.public()
            self.assertTrue(pub['camera'])
            self.assertEqual([c['id'] for c in pub['cameras']], ['frontdoor', 'backyard', 'frontdoor2'])
            self.assertEqual((pub['camera_default'], pub['camera_name']), ('backyard', 'Back Yard'))
            self.assertNotIn('secret', repr(pub))
            self.assertEqual(C.settings()['id'], 'backyard')               # default
            self.assertEqual(C.settings('frontdoor')['url'], cams[0]['url'])
            self.assertEqual(C.settings('nope')['id'], 'backyard')         # unknown: default
            h = FakeHandler('/api/camera/status?cam=frontdoor'); C.dispatch_get(h, '/api/camera/status')
            self.assertEqual((h.out['id'], h.out['default']), ('frontdoor', 'backyard'))
            self.assertEqual(len(h.out['cameras']), 3); self.assertNotIn('secret', repr(h.out))

    def test_first_camera_is_default_and_legacy_still_works(self):
        with temp_config(cameras=[{'name': 'A', 'url': 'rtsp://x/1'}, {'name': 'B', 'url': 'rtsp://x/2'}]):
            self.assertEqual(config.public()['camera_default'], 'a')
        with temp_config(camera={'name': 'Door', 'url': 'rtsp://x/1'}):
            pub = config.public()
            self.assertEqual((pub['cameras'], pub['camera_default']), ([{'id': 'door', 'name': 'Door'}], 'door'))

    def test_camera_is_a_remote_command_screen(self):
        import hv_api
        self.assertIn('camera', hv_api.SCREENS)


if __name__ == '__main__':
    unittest.main()
