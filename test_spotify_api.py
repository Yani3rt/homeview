import io, json, os, stat, tempfile, time, unittest, urllib.error
from pathlib import Path
from unittest import mock

import spotify_api as sp

ID = 'A' * 22


class Resp:
    def __init__(self, obj):
        self.b = json.dumps(obj).encode()
    def read(self): return self.b
    def __enter__(self): return self
    def __exit__(self, *a): return False


def http_err(code, body=b'', headers=None):
    return urllib.error.HTTPError('http://x', code, 'err', headers or {}, io.BytesIO(body))


class Handler:
    def __init__(self, path):
        self.path = path; self.out = None
    def _json(self, obj, code=200):
        self.out = (code, obj)


class Base(unittest.TestCase):
    def setUp(self):
        self.d = Path(tempfile.mkdtemp())
        (self.d / 'spotify.json').write_text(json.dumps({'client_id': 'cid', 'client_secret': 'sec'}))
        (self.d / 'spotify_token.json').write_text(json.dumps({'refresh_token': 'R1', 'scope': 'a b', 'obtained_at': int(time.time() - 10 * 86400)}))
        self.ps = [mock.patch.object(sp, 'APP_FILE', self.d / 'spotify.json'),
                   mock.patch.object(sp, 'TOKEN_FILE', self.d / 'spotify_token.json'),
                   mock.patch.object(sp, '_sleep', lambda s: self.sleeps.append(s))]
        self.sleeps = []
        for p in self.ps: p.start()
        sp._tok.update(access=None, exp=0.0); sp._cache.clear()

    def tearDown(self):
        for p in self.ps: p.stop()

    def script(self, *responses):
        """urlopen replacement: each response is an object (returned) or an exception (raised)."""
        calls = []
        it = iter(responses)
        def fake(req, timeout=None):
            calls.append(req)
            assert timeout == 10
            r = next(it)
            if isinstance(r, Exception): raise r
            return Resp(r)
        return mock.patch.object(sp.urllib.request, 'urlopen', fake), calls


class TokenTests(Base):
    def test_refresh_and_cache(self):
        p, calls = self.script({'access_token': 'T1', 'expires_in': 3600})
        with p:
            self.assertEqual(sp.access_token(), 'T1'); self.assertEqual(sp.access_token(), 'T1')
        self.assertEqual(len(calls), 1)
        self.assertTrue(calls[0].get_header('Authorization').startswith('Basic '))
        self.assertIn(b'refresh_token=R1', calls[0].data)

    def test_expiry_triggers_refresh(self):
        p, calls = self.script({'access_token': 'T1', 'expires_in': 30}, {'access_token': 'T2', 'expires_in': 3600})
        with p:
            self.assertEqual(sp.access_token(), 'T1'); self.assertEqual(sp.access_token(), 'T2')
        self.assertEqual(len(calls), 2)

    def test_new_refresh_token_persisted_mode_600(self):
        p, _ = self.script({'access_token': 'T1', 'expires_in': 3600, 'refresh_token': 'R2'})
        with p: sp.access_token()
        f = self.d / 'spotify_token.json'
        t = json.loads(f.read_text())
        self.assertEqual(t['refresh_token'], 'R2'); self.assertEqual(t['scope'], 'a b')
        self.assertEqual(stat.S_IMODE(os.stat(f).st_mode), 0o600)

    def test_invalid_grant(self):
        p, _ = self.script(http_err(400, b'{"error":"invalid_grant"}'))
        with p, self.assertRaises(sp.SpotifyAuthError) as c: sp.access_token()
        self.assertIn('scripts/spotify_auth.py', str(c.exception))

    def test_no_token_file(self):
        (self.d / 'spotify_token.json').unlink()
        with self.assertRaises(sp.SpotifyAuthError): sp.access_token()


class GetTests(Base):
    def test_401_refreshes_once(self):
        p, calls = self.script({'access_token': 'T1', 'expires_in': 3600}, http_err(401),
                               {'access_token': 'T2', 'expires_in': 3600}, {'ok': 1})
        with p: self.assertEqual(sp.get('/me'), {'ok': 1})
        self.assertEqual(calls[-1].get_header('Authorization'), 'Bearer T2')
        self.assertEqual(calls[-1].get_header('User-agent'), sp.UA)

    def test_401_twice_fails(self):
        p, _ = self.script({'access_token': 'T1', 'expires_in': 3600}, http_err(401), {'access_token': 'T2', 'expires_in': 3600}, http_err(401))
        with p, self.assertRaises(sp.SpotifyError): sp.get('/me')

    def test_429_retry_capped(self):
        p, calls = self.script({'access_token': 'T', 'expires_in': 3600}, http_err(429, headers={'Retry-After': '30'}), {'ok': 2})
        with p: self.assertEqual(sp.get('/me'), {'ok': 2})
        self.assertEqual(self.sleeps, [5])

    def test_429_twice_raises(self):
        p, _ = self.script({'access_token': 'T', 'expires_in': 3600}, http_err(429, headers={'Retry-After': '1'}), http_err(429, headers={'Retry-After': '1'}))
        with p, self.assertRaises(sp.SpotifyError): sp.get('/me')

    def test_cache(self):
        p, calls = self.script({'access_token': 'T', 'expires_in': 3600}, {'n': 1}, {'n': 2})
        with p:
            self.assertEqual(sp.get('/x', {'a': 1}, ttl=60), {'n': 1})
            self.assertEqual(sp.get('/x', {'a': 1}, ttl=60), {'n': 1})
            self.assertEqual(sp.get('/x', {'a': 2}, ttl=60), {'n': 2})

    def test_cache_bounded(self):
        with mock.patch.object(sp, 'CACHE_MAX', 5), mock.patch.object(sp, 'access_token', lambda force=False: 'T'):
            with mock.patch.object(sp.urllib.request, 'urlopen', lambda r, timeout=None: Resp({})):
                for i in range(20): sp.get('/x', {'i': i}, ttl=60)
        self.assertLessEqual(len(sp._cache), 5)


IMGS = [{'url': 'big', 'width': 640}, {'url': 'mid', 'width': 300}, {'url': 'small', 'width': 64}]
TRACK = {'id': ID, 'uri': 'spotify:track:' + ID, 'name': 'MakeDamnSure', 'type': 'track', 'duration_ms': 200000,
         'artists': [{'name': 'Taking Back Sunday'}, {'name': 'Guest'}], 'album': {'name': 'Louder Now', 'images': IMGS}}


class NormTests(Base):
    def test_image_choice(self):
        self.assertEqual(sp._image(IMGS), 'mid')
        self.assertEqual(sp._image([{'url': 's', 'width': 64}, {'url': 't', 'width': 100}]), 't')
        self.assertIsNone(sp._image(None))

    def test_track(self):
        t = sp.norm_track(TRACK)
        self.assertEqual((t['kind'], t['subtitle'], t['image'], t['album']), ('track', 'Taking Back Sunday, Guest', 'mid', 'Louder Now'))

    def test_album_playlist_artist(self):
        a = sp.norm_album({'id': ID, 'uri': 'u', 'name': 'A', 'release_date': '2006-01-01', 'artists': [{'name': 'X'}], 'images': IMGS})
        self.assertEqual(a['subtitle'], 'X · 2006')
        p = sp.norm_playlist({'id': ID, 'uri': 'u', 'name': 'P', 'owner': {'display_name': 'Me'}, 'tracks': {'total': 12}, 'images': IMGS})
        self.assertEqual(p['subtitle'], 'Me · 12 tracks')
        self.assertEqual(sp.norm_artist({'id': ID, 'uri': 'u', 'name': 'B', 'images': IMGS})['kind'], 'artist')

    def test_null_items_dropped(self):
        self.assertEqual(sp._items({'items': [None, {'id': None}]}, sp.norm_playlist), [])

    def test_recent_dedupes(self):
        page = {'items': [{'track': TRACK, 'played_at': '1'}, {'track': TRACK, 'played_at': '0'}, {'track': {**TRACK, 'id': 'B' * 22}, 'played_at': '2'}]}
        p, _ = self.script({'access_token': 'T', 'expires_in': 3600}, page)
        with p: r = sp.recently_played(5)
        self.assertEqual([t['id'] for t in r], [ID, 'B' * 22]); self.assertEqual(r[0]['played_at'], '1')

    def test_search(self):
        resp = {'tracks': {'items': [TRACK]}, 'artists': {'items': [{'id': ID, 'uri': 'u', 'name': 'TBS', 'images': IMGS}]}}
        p, calls = self.script({'access_token': 'T', 'expires_in': 3600}, resp)
        with p: r = sp.search('taking back sunday', types=('track', 'artist'), limit=50)
        self.assertEqual(len(r['tracks']), 1); self.assertEqual(r['artists'][0]['name'], 'TBS')
        self.assertIn('limit=10', calls[-1].full_url)

    def test_album_tracks_get_art(self):
        a = {'id': ID, 'uri': 'u', 'name': 'LN', 'images': IMGS, 'artists': [], 'tracks': {'items': [{'id': 'C' * 22, 'uri': 'u', 'name': 'T', 'artists': [{'name': 'X'}]}]}}
        p, _ = self.script({'access_token': 'T', 'expires_in': 3600}, a)
        with p: r = sp.album(ID)
        self.assertEqual((r['tracks'][0]['image'], r['tracks'][0]['album']), ('mid', 'LN'))

    def test_artist_toptracks_removed_degrades(self):
        p, _ = self.script({'access_token': 'T', 'expires_in': 3600}, {'id': ID, 'uri': 'u', 'name': 'X', 'images': IMGS},
                           http_err(403), {'items': [{'id': ID, 'uri': 'u', 'name': 'Al', 'artists': [], 'images': IMGS}]})
        with p: r = sp.artist(ID)
        self.assertEqual((r['top_tracks'], len(r['albums'])), ([], 1))

    def test_playlist_items_shape(self):
        p, _ = self.script({'access_token': 'T', 'expires_in': 3600}, {'id': ID, 'uri': 'u', 'name': 'P', 'owner': {'display_name': 'Me'}},
                           {'items': [{'item': TRACK}, {'track': None}]})
        with p: r = sp.playlist(ID)
        self.assertEqual(len(r['tracks']), 1)

    def test_validation(self):
        for bad in ('', 'short', 'A' * 23, 'A' * 21 + '/', None):
            with self.assertRaises(ValueError): sp.album(bad)
        with self.assertRaises(ValueError): sp.search('')
        with self.assertRaises(ValueError): sp.search('x' * 101)
        with self.assertRaises(ValueError): sp.top('bogus')

    def test_status(self):
        p, _ = self.script({'access_token': 'T', 'expires_in': 3600}, {'display_name': 'Sam', 'product': 'premium'})
        with p: s = sp.status()
        self.assertEqual((s['signed_in'], s['display_name'], s['product'], s['expires_in_days'], s['scopes']), (True, 'Sam', 'premium', 170, ['a', 'b']))
        self.assertNotIn('refresh_token', json.dumps(s))


class RouteTests(Base):
    def call(self, path, *responses):
        h = Handler(path)
        p, _ = self.script(*responses)
        with p: handled = sp.dispatch_get(h, path.split('?')[0])
        return handled, h.out

    def test_not_signed_in_503(self):
        (self.d / 'spotify_token.json').unlink()
        self.assertEqual(self.call('/api/frame/spotify/playlists')[1][0], 503)
        h, out = self.call('/api/frame/spotify/status')
        self.assertEqual(out, (200, {'ok': True, 'signed_in': False}))

    def test_unrelated_route(self):
        self.assertEqual(self.call('/api/frame/music')[0], False)
        self.assertEqual(self.call('/api/frame/spotify/nope')[0], False)

    def test_search_route(self):
        _, (code, body) = self.call('/api/frame/spotify/search?q=tbs', {'access_token': 'T', 'expires_in': 3600}, {'tracks': {'items': [TRACK]}})
        self.assertEqual(code, 200); self.assertTrue(body['ok']); self.assertEqual(body['results']['tracks'][0]['id'], ID)

    def test_bad_inputs_400(self):
        self.assertEqual(self.call('/api/frame/spotify/search?q=')[1][0], 400)
        self.assertEqual(self.call('/api/frame/spotify/album?id=nope')[1][0], 400)
        self.assertEqual(self.call('/api/frame/spotify/top?kind=x')[1][0], 400)

    def test_invalid_grant_503(self):
        _, (code, body) = self.call('/api/frame/spotify/recent', http_err(400, b'{"error":"invalid_grant"}'))
        self.assertEqual(code, 503); self.assertFalse(body['ok']); self.assertIn('Sign in again', body['error'])

    def test_upstream_error_502(self):
        self.assertEqual(self.call('/api/frame/spotify/playlists', {'access_token': 'T', 'expires_in': 3600}, http_err(500))[1][0], 502)


class EmptyPlaylistTests(unittest.TestCase):
    def test_empty_playlists_hidden(self):
        page = {'items': [{'id': ID, 'name': 'Full', 'owner': {'display_name': 'sam'}, 'tracks': {'total': 20}},
                          {'id': 'B' * 22, 'name': 'My playlist #41', 'owner': {'display_name': 'sam'}, 'tracks': {'total': 0}},
                          {'id': 'C' * 22, 'name': 'No count', 'owner': {'display_name': 'sam'}}]}
        with mock.patch.object(sp, 'get', return_value=page):
            self.assertEqual([p['name'] for p in sp.my_playlists()], ['Full', 'No count'])


if __name__ == '__main__':
    unittest.main()


class ConnectTests(unittest.TestCase):
    """Spotify Connect: speaker and group devices. No network: send/get are patched."""
    DEV = 'a' * 40

    def test_devices_drop_restricted(self):
        with mock.patch.object(sp, 'get', return_value={'devices': [
                {'id': self.DEV, 'name': 'Kitchen', 'type': 'Speaker', 'is_active': False, 'volume_percent': 40},
                {'id': 'b' * 40, 'name': 'Locked', 'is_restricted': True}]}):
            self.assertEqual([d['name'] for d in sp.devices()], ['Kitchen'])

    def test_play_track_uses_uris_and_album_uses_context(self):
        calls = []
        with mock.patch.object(sp, 'send', side_effect=lambda *a: calls.append(a) or {}):
            sp.play_on(self.DEV, 'spotify:track:4kbj5MwxO1bq9wjT5g9HaA')
            sp.play_on(self.DEV, 'spotify:album:6wiUBliPe76YAVpNEdidpY')
        self.assertEqual(calls[0], ('PUT', '/me/player/play', {'device_id': self.DEV}, {'uris': ['spotify:track:4kbj5MwxO1bq9wjT5g9HaA']}))
        self.assertEqual(calls[1][3], {'context_uri': 'spotify:album:6wiUBliPe76YAVpNEdidpY'})

    def test_sleeping_echo_gets_a_transfer_then_play(self):
        calls, n = [], {'i': 0}
        def fake(*a):
            calls.append(a); n['i'] += 1
            if n['i'] == 1:
                e = sp.SpotifyError('404'); e.code = 404; raise e
            return {}
        with mock.patch.object(sp, 'send', side_effect=fake):
            sp.play_on(self.DEV, 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')
        self.assertEqual([c[1] for c in calls], ['/me/player/play', '/me/player', '/me/player/play'])
        self.assertEqual(calls[1][3], {'device_ids': [self.DEV], 'play': False})

    def test_real_device_id_shapes(self):
        # some smart-speaker ids have hyphens and an _<suffix>; the first check rejected them all
        calls = []
        with mock.patch.object(sp, 'send', side_effect=lambda *a: calls.append(a) or {}):
            for dev in ('00000000-1111-4222-8333-444444444444_grp_2', '1f6b0a3c5e7d9f1a3c5e7d9f1a3c5e7d9f1a3c5e'):
                sp.play_on(dev, 'spotify:playlist:6fUFTYCX6PT9mRQ6dMqJA0')
        self.assertEqual([c[2]['device_id'] for c in calls], ['00000000-1111-4222-8333-444444444444_grp_2', '1f6b0a3c5e7d9f1a3c5e7d9f1a3c5e7d9f1a3c5e'])
        for bad in ('../etc', 'a b', 'x' * 200, ''):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                sp.play_on(bad, 'spotify:playlist:6fUFTYCX6PT9mRQ6dMqJA0')

    def test_bad_input(self):
        for dev, uri in (('nope', 'spotify:track:4kbj5MwxO1bq9wjT5g9HaA'), (self.DEV, 'https://evil'), (self.DEV, 'spotify:user:x')):
            with self.subTest(dev=dev, uri=uri), self.assertRaises(ValueError):
                sp.play_on(dev, uri)
        with self.assertRaises(ValueError):
            sp.control('volume', self.DEV, 150)
        with self.assertRaises(ValueError):
            sp.control('format_disk', self.DEV)

    def test_post_route_needs_same_origin(self):
        class H:
            def __init__(s, body, origin):
                import io
                s.rfile = io.BytesIO(body); s.headers = {'Origin': origin, 'Host': 'frame:8806', 'Content-Length': str(len(body))}; s.out = None
            def _json(s, o, c=200): s.out = (c, o)
        h = H(b'{"device":"x","uri":"y"}', 'http://elsewhere')
        self.assertTrue(sp.dispatch_post(h, '/api/frame/spotify/play')); self.assertEqual(h.out[0], 403)
        self.assertFalse(sp.dispatch_post(h, '/api/frame/music'))
