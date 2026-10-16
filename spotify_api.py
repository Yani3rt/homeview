"""Spotify Web API client for the Music screen (stdlib only).

The API finds music (search, your playlists, albums, recently played); playback goes to Sonos by
`spotify:` URI (soco ShareLink), or to a Spotify Connect device through the player API.
App keys: your own Spotify developer app, in config.json `spotify.client_id` / `spotify.client_secret`.
Refresh token: <data_dir>/spotify_token.json {refresh_token, scope, obtained_at}, written by
scripts/spotify_auth.py (mode 600). Nothing here logs or returns tokens."""
import base64, json, math, os, re, threading, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

import config

APP_FILE = None      # tests point these at temp files; normally the keys come from config.json
TOKEN_FILE = None
API = 'https://api.spotify.com/v1'
TOKEN_URL = 'https://accounts.spotify.com/api/token'
UA = 'HomeView/1'
TIMEOUT = 10
REFRESH_DAYS = 180
CACHE_MAX = 200
SEARCH_TYPES = ('track', 'album', 'artist', 'playlist', 'show', 'episode')
ID_RE = re.compile(r'[0-9A-Za-z]{22}')


class SpotifyError(Exception):
    pass


class SpotifyAuthError(SpotifyError):
    pass


_lock = threading.RLock()
_tok = {'access': None, 'exp': 0.0}
_cache = {}  # key -> (expires_at, value)
_cache_lock = threading.Lock()


def _sleep(s):
    time.sleep(s)


def _read_json(path):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return None


def token_file():
    return Path(TOKEN_FILE) if TOKEN_FILE else config.data_dir() / 'spotify_token.json'


def _app():
    if APP_FILE:
        return _read_json(APP_FILE)
    sp = config.get('spotify')
    if sp.get('client_id') and sp.get('client_secret'):
        return {'client_id': sp['client_id'], 'client_secret': sp['client_secret']}
    return None


def signed_in():
    t = _read_json(token_file())
    return bool(t and t.get('refresh_token')) and bool(_app())


def _write_private(path, obj):
    path = Path(path)
    tmp = path.with_name(path.name + '.tmp')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(json.dumps(obj))
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)


def _open(req):
    return urllib.request.urlopen(req, timeout=TIMEOUT)


def _refresh():
    app, tok = _app(), _read_json(token_file())
    if not app or not tok or not tok.get('refresh_token'):
        raise SpotifyAuthError('Sign in again: run scripts/spotify_auth.py')
    body = urllib.parse.urlencode({'grant_type': 'refresh_token', 'refresh_token': tok['refresh_token']}).encode()
    basic = base64.b64encode(f"{app['client_id']}:{app['client_secret']}".encode()).decode()
    req = urllib.request.Request(TOKEN_URL, data=body, headers={
        'Authorization': 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA})
    try:
        with _open(req) as r:
            d = json.loads(r.read())
    except urllib.error.HTTPError as e:
        raw = b''
        try:
            raw = e.read()
        except Exception:
            pass
        if e.code in (400, 401) and (b'invalid_grant' in raw or e.code == 400):
            raise SpotifyAuthError('Sign in again: run scripts/spotify_auth.py')
        raise SpotifyError(f'Spotify token endpoint returned {e.code}')
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise SpotifyError(f'Spotify token endpoint unreachable: {type(e).__name__}')
    _tok['access'] = d['access_token']
    _tok['exp'] = time.time() + float(d.get('expires_in', 3600))
    new = d.get('refresh_token')
    if new and new != tok['refresh_token']:
        tok['refresh_token'] = new
        if d.get('scope'):
            tok['scope'] = d['scope']
        _write_private(token_file(), tok)


def access_token(force=False):
    with _lock:
        if force or not _tok['access'] or time.time() >= _tok['exp'] - 60:
            _refresh()
        return _tok['access']


def get(path, params=None, ttl=0):
    """GET an API path with Bearer auth. ttl>0 caches the parsed JSON for that many seconds."""
    qs = urllib.parse.urlencode({k: v for k, v in (params or {}).items() if v is not None})
    key = path + '?' + qs
    if ttl:
        with _cache_lock:
            hit = _cache.get(key)
            if hit and hit[0] > time.time():
                return hit[1]
    url = API + path + ('?' + qs if qs else '')
    refreshed = retried = False
    while True:
        req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + access_token(), 'User-Agent': UA, 'Accept': 'application/json'})
        try:
            with _open(req) as r:
                raw = r.read()
            data = json.loads(raw) if raw else {}
            break
        except urllib.error.HTTPError as e:
            if e.code == 401 and not refreshed:
                refreshed = True
                access_token(force=True)
                continue
            if e.code == 429 and not retried:
                retried = True
                try:
                    wait = float(e.headers.get('Retry-After', 1))
                except (TypeError, ValueError, AttributeError):
                    wait = 1.0
                _sleep(min(max(wait, 0), 5))
                continue
            err = SpotifyError(f'Spotify API {e.code} for {path}')
            err.code = e.code
            raise err
        except (urllib.error.URLError, OSError, ValueError) as e:
            raise SpotifyError(f'Spotify API unreachable: {type(e).__name__}')
    if ttl:
        with _cache_lock:
            if len(_cache) >= CACHE_MAX:
                now = time.time()
                for k in [k for k, v in _cache.items() if v[0] <= now] or list(_cache)[:CACHE_MAX // 4]:
                    _cache.pop(k, None)
            _cache[key] = (time.time() + ttl, data)
    return data


# ---------- normalizers ----------

def _image(images, want=300):
    """Smallest image at least `want` px wide; else the largest available."""
    imgs = [i for i in (images or []) if isinstance(i, dict) and i.get('url')]
    if not imgs:
        return None
    sized = [i for i in imgs if (i.get('width') or 0) >= want]
    if sized:
        return min(sized, key=lambda i: i['width'])['url']
    return max(imgs, key=lambda i: i.get('width') or 0)['url']


def _artists(o):
    return ', '.join(a.get('name', '') for a in (o.get('artists') or []) if a.get('name'))


def _doc(o, kind, subtitle, images=None):
    return {'id': o.get('id'), 'uri': o.get('uri'), 'name': o.get('name'), 'subtitle': subtitle,
            'image': _image(images if images is not None else o.get('images')), 'kind': kind}


def norm_track(t, album_images=None):
    if not t or not t.get('id'):
        return None
    alb = t.get('album') or {}
    d = _doc(t, 'track', _artists(t), alb.get('images') or album_images)
    d['album'] = alb.get('name')
    d['duration_ms'] = t.get('duration_ms')
    return d


def norm_album(a):
    if not a or not a.get('id'):
        return None
    sub = _artists(a)
    yr = (a.get('release_date') or '')[:4]
    return _doc(a, 'album', f'{sub} · {yr}' if sub and yr else sub or yr)


def norm_artist(a):
    if not a or not a.get('id'):
        return None
    return _doc(a, 'artist', 'Artist')


def norm_playlist(p):
    if not p or not p.get('id'):
        return None
    owner = (p.get('owner') or {}).get('display_name') or ''
    n = (p.get('tracks') or p.get('items') or {}).get('total') if isinstance(p.get('tracks') or p.get('items'), dict) else None
    sub = owner + (f' · {n} tracks' if n is not None and owner else (f'{n} tracks' if n is not None else ''))
    return _doc(p, 'playlist', sub)


def norm_show(s):
    if not s or not s.get('id'):
        return None
    return _doc(s, 'show', s.get('publisher') or '')


def norm_episode(e):
    if not e or not e.get('id'):
        return None
    sub = ((e.get('show') or {}).get('name') or '')
    return _doc(e, 'episode', sub)


_NORM = {'track': norm_track, 'album': norm_album, 'artist': norm_artist, 'playlist': norm_playlist,
         'show': norm_show, 'episode': norm_episode}


def _items(page, fn):
    return [d for d in (fn(i) for i in ((page or {}).get('items') or []) if i) if d]


def _clamp(n, lo, hi, default):
    try:
        return max(lo, min(hi, int(n)))
    except (TypeError, ValueError):
        return default


# ---------- documents ----------

def search(q, types=SEARCH_TYPES, limit=8):
    q = (q or '').strip()
    if not q:
        raise ValueError('Search text is empty')
    if len(q) > 100:
        raise ValueError('Search text is too long')
    types = [t for t in types if t in SEARCH_TYPES]
    if not types:
        raise ValueError('No valid search types')
    limit = _clamp(limit, 1, 10, 8)  # dev-mode apps cap search at 10
    d = get('/search', {'q': q, 'type': ','.join(types), 'limit': limit}, ttl=120)
    return {t + 's': _items(d.get(t + 's'), _NORM[t]) for t in types}


def my_playlists(limit=50):
    d = get('/me/playlists', {'limit': _clamp(limit, 1, 50, 50)}, ttl=300)
    full = [p for p in d.get('items') or [] if p and ((p.get('tracks') or p.get('items') or {}).get('total') if isinstance(p.get('tracks') or p.get('items'), dict) else None) != 0]
    return _items({'items': full}, norm_playlist)   # empty playlists (Spotify's "My playlist #41") are just clutter


def saved_albums(limit=30):
    d = get('/me/albums', {'limit': _clamp(limit, 1, 50, 30)}, ttl=300)
    return [x for x in (norm_album(i.get('album')) for i in d.get('items') or []) if x]


def saved_tracks(limit=30):
    d = get('/me/tracks', {'limit': _clamp(limit, 1, 50, 30)}, ttl=300)
    return [x for x in (norm_track(i.get('track')) for i in d.get('items') or []) if x]


def recently_played(limit=30):
    d = get('/me/player/recently-played', {'limit': _clamp(limit, 1, 50, 30)}, ttl=60)
    out, seen = [], set()
    for i in d.get('items') or []:
        t = norm_track(i.get('track'))
        if t and t['id'] not in seen:
            seen.add(t['id'])
            t['played_at'] = i.get('played_at')
            out.append(t)
    return out


def top(kind='artists'):
    if kind not in ('artists', 'tracks'):
        raise ValueError('kind must be artists or tracks')
    d = get(f'/me/top/{kind}', {'limit': 30, 'time_range': 'medium_term'}, ttl=300)
    return _items(d, norm_artist if kind == 'artists' else norm_track)


def followed_artists():
    d = get('/me/following', {'type': 'artist', 'limit': 50}, ttl=300)
    return _items(d.get('artists'), norm_artist)


def _check_id(i):
    if not isinstance(i, str) or not ID_RE.fullmatch(i):
        raise ValueError('Invalid Spotify id')
    return i


def artist(id):
    _check_id(id)
    info = norm_artist(get(f'/artists/{id}', ttl=300)) or {}
    try:  # removed for newer dev-mode apps; degrade to albums only
        tt = get(f'/artists/{id}/top-tracks', {'market': 'from_token'}, ttl=300)
        tracks = [x for x in (norm_track(t) for t in tt.get('tracks') or []) if x]
    except SpotifyError as e:
        if getattr(e, 'code', None) not in (403, 404):
            raise
        tracks = []
    al = get(f'/artists/{id}/albums', {'include_groups': 'album,single', 'limit': 10}, ttl=300)  # dev mode: limit > 10 is a 400 (checked 2026-10-13)
    return {**info, 'top_tracks': tracks, 'albums': _items(al, norm_album)}


def _plist_track(i):
    t = i.get('track') or i.get('item') or {}
    return norm_track(t) if t.get('type', 'track') == 'track' else None


def playlist(id):
    _check_id(id)
    info = norm_playlist(get(f'/playlists/{id}', {'fields': 'id,uri,name,images,owner(display_name)'}, ttl=300)) or {}
    last = None
    for sub in ('items', 'tracks'):  # /tracks was renamed /items; accept either
        try:
            d = get(f'/playlists/{id}/{sub}', {'limit': 50}, ttl=300)
            break
        except SpotifyError as e:
            if getattr(e, 'code', None) not in (403, 404):
                raise
            last = e
    else:
        raise last
    return {**info, 'tracks': [x for x in (_plist_track(i) for i in d.get('items') or []) if x]}


def album(id):
    _check_id(id)
    a = get(f'/albums/{id}', ttl=300)
    imgs = a.get('images')
    tracks = [x for x in (norm_track(t, imgs) for t in (a.get('tracks') or {}).get('items') or []) if x]
    for t in tracks:
        t['album'] = t['album'] or a.get('name')
    return {**(norm_album(a) or {}), 'tracks': tracks}


def status():
    tok = _read_json(token_file())
    if not signed_in():
        return {'signed_in': False}
    age = (time.time() - float(tok.get('obtained_at') or 0)) / 86400
    out = {'signed_in': True, 'display_name': None, 'product': None,
           'expires_in_days': max(0, math.ceil(REFRESH_DAYS - age)), 'scopes': (tok.get('scope') or '').split()}
    try:
        me = get('/me', ttl=300)
        out['display_name'] = me.get('display_name') or me.get('id')
        out['product'] = me.get('product')
    except SpotifyAuthError:
        out['signed_in'] = False
        out['error'] = 'Sign in again: run scripts/spotify_auth.py'
    except SpotifyError as e:
        out['error'] = str(e)
    return out


# ---------- routes ----------

def dispatch_get(handler, route):
    if not route.startswith('/api/frame/spotify/'):
        return False
    u = urllib.parse.urlparse(handler.path)
    q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
    name = route[len('/api/frame/spotify/'):].strip('/')
    try:
        if name == 'status':
            handler._json({'ok': True, **status()}); return True
        if not signed_in():
            handler._json({'ok': False, 'error': 'Spotify is not signed in'}, 503); return True
        if name == 'search':
            r = {'results': search(q.get('q', ''))}
        elif name == 'playlists':
            r = {'items': my_playlists()}
        elif name == 'albums':
            r = {'items': saved_albums()}
        elif name == 'tracks':
            r = {'items': saved_tracks()}
        elif name == 'recent':
            r = {'items': recently_played()}
        elif name == 'top':
            r = {'items': top(q.get('kind', 'artists'))}
        elif name == 'artists':
            r = {'items': followed_artists()}
        elif name == 'devices':
            r = {'devices': devices()}
        elif name == 'player':
            r = {'player': player()}
        elif name in ('artist', 'playlist', 'album'):
            r = {name: {'artist': artist, 'playlist': playlist, 'album': album}[name](q.get('id', ''))}
        else:
            return False
        handler._json({'ok': True, **r})
    except ValueError as e:
        handler._json({'ok': False, 'error': str(e)}, 400)
    except SpotifyAuthError as e:
        handler._json({'ok': False, 'error': str(e)}, 503)
    except SpotifyError as e:
        handler._json({'ok': False, 'error': str(e)}, 502)
    return True


# ---------- Spotify Connect (smart speakers, receivers, phones): needs user-*-playback-state ----------

def send(method, path, params=None, body=None):
    """PUT/POST to the player API. 401 or 403 (a token minted before the playback scopes were granted)
    forces one token refresh; 429 waits once. Returns parsed JSON or {} for 204."""
    qs = urllib.parse.urlencode({k: v for k, v in (params or {}).items() if v is not None})
    url = API + path + ('?' + qs if qs else '')
    data = json.dumps(body).encode() if body is not None else b''
    refreshed = retried = False
    while True:
        req = urllib.request.Request(url, data=data, method=method, headers={
            'Authorization': 'Bearer ' + access_token(), 'User-Agent': UA, 'Content-Type': 'application/json'})
        try:
            with _open(req) as r:
                raw = r.read()
            return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            if e.code in (401, 403) and not refreshed:
                refreshed = True; access_token(force=True); continue
            if e.code == 429 and not retried:
                retried = True; _sleep(1); continue
            err = SpotifyError(f'Spotify player {e.code} for {path}'); err.code = e.code
            raise err
        except (urllib.error.URLError, OSError, ValueError) as e:
            raise SpotifyError(f'Spotify API unreachable: {type(e).__name__}')


DEVICE_ID = re.compile(r'[0-9A-Za-z_-]{16,96}')   # some speaker ids are '<uuid>_<suffix>'; others are 40 hex
URI = re.compile(r'spotify:(track|episode|album|playlist|artist|show):[0-9A-Za-z]{22}')


def _check_device(d):
    if not isinstance(d, str) or not DEVICE_ID.fullmatch(d):
        raise ValueError('Unknown device')
    return d


def devices():
    """Spotify Connect devices on the account: smart speakers and their groups, receivers, phones."""
    out = []
    for d in get('/me/player/devices').get('devices', []):
        if d.get('is_restricted') or not d.get('id'):
            continue
        out.append({'id': d['id'], 'name': d.get('name') or 'Device', 'type': d.get('type') or 'Speaker',
                    'active': bool(d.get('is_active')), 'volume': d.get('volume_percent')})
    return out


def play_on(device, uri):
    """Play a track/episode, or a whole album/playlist/artist/show, on a Connect device. A device that has been
    idle may not answer a direct play (404); transfer to it first, then play once more."""
    _check_device(device)
    m = URI.fullmatch(uri or '')
    if not m:
        raise ValueError('Not a Spotify item')
    body = {'uris': [uri]} if m.group(1) in ('track', 'episode') else {'context_uri': uri}
    try:
        send('PUT', '/me/player/play', {'device_id': device}, body)
    except SpotifyError as e:
        if getattr(e, 'code', None) != 404:
            raise
        send('PUT', '/me/player', None, {'device_ids': [device], 'play': False})
        send('PUT', '/me/player/play', {'device_id': device}, body)
    return {'played': uri, 'device': device}


def player():
    """What Spotify is playing right now and where (for music on a Connect device, which Sonos can't see)."""
    d = get('/me/player', {'additional_types': 'episode'})
    if not d:
        return {'playing': False}
    item, dev = d.get('item') or {}, d.get('device') or {}
    kind = item.get('type')
    doc = norm_episode(item) if kind == 'episode' else (norm_track(item) if item else None)
    return {'playing': bool(d.get('is_playing')), 'item': doc, 'progress_ms': d.get('progress_ms'),
            'device': {'id': dev.get('id'), 'name': dev.get('name'), 'type': dev.get('type'), 'volume': dev.get('volume_percent')},
            'shuffle': d.get('shuffle_state'), 'repeat': d.get('repeat_state')}


def control(action, device=None, value=None):
    params = {'device_id': _check_device(device)} if device else None
    if action == 'pause':
        send('PUT', '/me/player/pause', params)
    elif action == 'resume':
        send('PUT', '/me/player/play', params)
    elif action == 'next':
        send('POST', '/me/player/next', params)
    elif action == 'previous':
        send('POST', '/me/player/previous', params)
    elif action == 'volume':
        v = int(value)
        if not 0 <= v <= 100:
            raise ValueError('Volume must be 0-100')
        send('PUT', '/me/player/volume', dict(params or {}, volume_percent=v))
    elif action == 'transfer':
        send('PUT', '/me/player', None, {'device_ids': [_check_device(device)], 'play': True})
    else:
        raise ValueError('Unknown action')
    return {'done': action}


def dispatch_post(handler, route):
    """POST /api/frame/spotify/play {device, uri} and /api/frame/spotify/control {action, device?, value?}."""
    if route not in ('/api/frame/spotify/play', '/api/frame/spotify/control'):
        return False
    origin = handler.headers.get('Origin', '')
    if urllib.parse.urlparse(origin).netloc != handler.headers.get('Host'):
        handler._json({'ok': False, 'error': 'Open the frame app to use its controls'}, 403); return True
    try:
        size = int(handler.headers.get('Content-Length', '0'))
        if not 0 < size <= 2048:
            raise ValueError('Request size is invalid')
        p = json.loads(handler.rfile.read(size))
        if not isinstance(p, dict):
            raise ValueError('Expected an object')
        if not signed_in():
            handler._json({'ok': False, 'error': 'Spotify is not signed in'}, 503); return True
        r = play_on(p.get('device'), p.get('uri')) if route.endswith('/play') else control(p.get('action'), p.get('device'), p.get('value'))
        handler._json({'ok': True, **r})
    except (ValueError, TypeError) as e:
        handler._json({'ok': False, 'error': str(e)}, 400)
    except SpotifyAuthError as e:
        handler._json({'ok': False, 'error': str(e)}, 503)
    except SpotifyError as e:
        msg = 'That device did not answer. Wake it (play something on it once) and try again.' if getattr(e, 'code', None) == 404 else str(e)
        handler._json({'ok': False, 'error': msg}, 502)
    return True
