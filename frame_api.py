"""Sonos (through soco) and the photo folder, for the Music, Standby and Photos screens.

Sonos: speakers are found on the local network with soco's discovery (cached for 5 minutes), or listed
by IP address in config.json (`sonos.hosts`) when discovery is blocked (for example across VLANs).
Set `sonos.enabled` to false to turn the Sonos routes off entirely.

Photos: every .jpg/.jpeg/.png/.webp under `photos_dir` (config.json), newest first. The frame asks
for the size it draws (?w=), and frame_img.py keeps a resized copy under <data_dir>/photo_cache/.
"""
import hashlib
import json
import re
import threading
import time
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import config

_cache, _locks = {}, {'music': threading.Lock(), 'zones': threading.Lock()}
DISCOVER_TTL = 300
PHOTO_TYPES = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'}


def cached(name, loader, ttl=15):
    with _locks[name]:
        old = _cache.get(name)
        if old and time.monotonic() - old[0] < ttl:
            return old[1]
        value = loader()
        _cache[name] = (time.monotonic(), value)
        return value


def sonos_enabled():
    return bool(config.get('sonos').get('enabled'))


def _discover():
    """{zone_id: {name, ip, uid, model}} for every visible Sonos player."""
    import soco
    soco.config.REQUEST_TIMEOUT = 4
    hosts = config.get('sonos').get('hosts') or []
    players = [soco.SoCo(h) for h in hosts] if hosts else list(soco.discover(timeout=3) or [])
    zones = {}
    for p in players:
        try:
            if not p.is_visible:
                continue
            uid = p.uid
            info = p.get_speaker_info() or {}
            zones[_zone_key(uid)] = {'name': p.player_name, 'ip': p.ip_address, 'uid': uid,
                                     'model': info.get('model_name') or ''}
        except Exception:
            continue
    return zones


def zone_map():
    if not sonos_enabled():
        return {}
    try:
        return cached('zones', _discover, ttl=DISCOVER_TTL)
    except ImportError:
        return {}


def speaker(zone_id):
    import soco
    soco.config.REQUEST_TIMEOUT = 4
    zone = zone_map().get(zone_id)
    if not zone:
        raise ValueError('Unknown Sonos room')
    return soco.SoCo(zone['ip'])

def _secs(hms):
    """'0:03:06' -> 186; '' / 'NOT_IMPLEMENTED' -> None (streams have no duration)."""
    m = re.fullmatch(r'(\d+):(\d{1,2}):(\d{1,2})', hms or '')
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3)) if m else None


def _zone_key(uid):
    return hashlib.sha256(str(uid).encode()).hexdigest()[:12]


# Sonos play modes as (shuffle, repeat) pairs; repeat is 'off' | 'all' | 'one'.
PLAY_MODES = {(False, 'off'): 'NORMAL', (False, 'all'): 'REPEAT_ALL', (False, 'one'): 'REPEAT_ONE',
              (True, 'off'): 'SHUFFLE_NOREPEAT', (True, 'all'): 'SHUFFLE', (True, 'one'): 'SHUFFLE_REPEAT_ONE'}
MODE_PARTS = {v: k for k, v in PLAY_MODES.items()}
PORTABLE = re.compile(r'\b(move|roam)\b', re.I)
# Speaker capabilities do not change between polls; read them once per speaker per 10 minutes.
_caps, _caps_lock = {}, threading.Lock()


def _source(uri):
    """Label for where the music comes from. Spotify Connect (x-sonos-vli:…,spotify:) is told apart from
    the Sonos queue because only the queue can be viewed, reordered or added to from the frame."""
    u = (uri or '').lower()
    if u.startswith('x-sonos-vli:') and ',spotify:' in u:
        return 'Spotify Connect'
    if u.startswith('x-sonos-vli:') and ',airplay:' in u:
        return 'AirPlay'
    if 'spotify' in u:
        return 'Spotify'
    if u.startswith('x-sonos-htastream:'):
        return 'TV audio'
    if u.startswith('x-rincon-stream:'):
        return 'Line-in'
    if 'sid=204&' in u or u.endswith('sid=204'):
        return 'Apple Music'
    if 'sid=303&' in u or u.endswith('sid=303'):
        return 'Sonos Radio'
    return 'Sonos'


def _kind(uri, source, duration):
    """What the Now Playing face should look like: 'tv', 'podcast' (a Spotify episode, which gets the
    skip-15/30 layout), 'radio' (a stream with no duration) or 'track'."""
    from urllib.parse import unquote
    u = unquote(unquote(uri or '')).lower()
    if source == 'TV audio':
        return 'tv'
    if 'spotify:episode:' in u:
        return 'podcast'
    if not duration and re.match(r'(x-sonosapi-(stream|radio|hls)|x-rincon-mp3radio|aac|hls-radio):', u):
        return 'radio'
    return 'track'


def _read(fn, default=None):
    """A getter that some speakers do not answer (or answer with None): never fail the whole room for it."""
    try:
        return fn()
    except Exception:
        return default


def speaker_caps(s, model=''):
    """What this speaker supports, read from the speaker (soco returns None where a setting is
    unsupported), never assumed from the model name. Battery is only asked of portable models."""
    with _caps_lock:
        hit = _caps.get(s.uid)
        if hit and time.monotonic() - hit[0] < 600:
            return hit[1]
    soundbar = bool(_read(lambda: s.is_soundbar, False))
    caps = {'bass': _read(lambda: s.bass) is not None,
            'treble': _read(lambda: s.treble) is not None,
            'loudness': _read(lambda: s.loudness) is not None,
            'night': soundbar and _read(lambda: s.night_mode) is not None,
            'speech': soundbar and _read(lambda: s.dialog_mode) is not None,
            'sub': _read(lambda: s.sub_gain) is not None,
            'surround': soundbar and _read(lambda: s.surround_level) is not None,
            'tv': soundbar,
            'battery': bool(PORTABLE.search(model or ''))}
    with _caps_lock:
        _caps[s.uid] = (time.monotonic(), caps)
    return caps


def _battery(s):
    try:
        b = s.get_battery_info(timeout=2)
        return {'level': int(b.get('Level')), 'charging': b.get('PowerSource') not in (None, 'BATTERY'),
                'health': b.get('Health')}
    except Exception:
        return None


def music_doc():
    def load():
        rooms = []
        zones = zone_map()
        for key, z in zones.items():
            try:
                s = speaker(key)
                c = s.group.coordinator
                info = c.get_current_transport_info()
                track = c.get_current_track_info()
                uri = track.get('uri') or ''
                source = _source(uri)
                media = _read(lambda: c.get_current_media_info().get('uri') or '', '')
                members = [m for m in s.group.members if _read(lambda: m.is_visible, True)]
                caps = speaker_caps(s, z.get('model', ''))
                mode = _read(lambda: c.play_mode, 'NORMAL')
                shuffle, repeat = MODE_PARTS.get(mode, (False, 'off'))
                pos = track.get('playlist_position')
                rooms.append({'id': key, 'name': z['name'], 'ok': True, 'state': info.get('current_transport_state'),
                              'title': track.get('title') or (source if source in ('TV audio', 'Line-in') else ''), 'artist': track.get('artist') or '',
                              'album': track.get('album') or '',
                              'volume': s.volume,                        # this room only
                              'muted': s.mute,
                              'group_volume': _read(lambda: s.group.volume, s.volume),
                              'art': track.get('album_art') or '',   # http://<speaker>:1400/getaa?... (LAN)
                              'source': source,
                              'queue': media.startswith('x-rincon-queue:'),
                              'group': sorted(set(m.player_name for m in members)),
                              'group_ids': sorted(set(_zone_key(m.uid) for m in members if _zone_key(m.uid) in zones)),
                              'coordinator': _zone_key(c.uid),
                              'position': _secs(track.get('position')), 'duration': _secs(track.get('duration')),
                              'track_no': int(pos) if str(pos or '').isdigit() and int(pos) > 0 else None,
                              'at': time.time(),                         # when position was read
                              'play_mode': mode, 'shuffle': shuffle, 'repeat': repeat,
                              'crossfade': _read(lambda: c.cross_fade),
                              'sleep': _read(lambda: c.get_sleep_timer()),  # seconds left, or None
                              'tv': source == 'TV audio',
                              'kind': _kind(uri, source, _secs(track.get('duration'))),
                              'battery': _battery(s) if caps['battery'] else None,
                              'caps': caps,
                              'model': z.get('model') or '',
                              'actions': c.available_actions})
            except Exception:
                rooms.append({'id': key, 'name': z['name'], 'ok': False, 'state': 'UNAVAILABLE'})
        return {'ok': bool(rooms), 'rooms': rooms}
    return cached('music', load, ttl=12)


def settings_doc(zone_id):
    """Current Sonos sound settings for one room, read only when the settings sheet opens.
    A setting this speaker does not support is absent (soco answers None for it)."""
    zone = zone_map().get(zone_id) or {}
    s = speaker(zone_id)
    c = s.group.coordinator
    caps = speaker_caps(s, zone.get('model', ''))
    values = {'bass': _read(lambda: s.bass), 'treble': _read(lambda: s.treble), 'loudness': _read(lambda: s.loudness)}
    if caps['night']:
        values['night'] = _read(lambda: s.night_mode)
    if caps['speech']:
        values['speech'] = _read(lambda: s.dialog_mode)
    if caps['sub']:
        values['sub_gain'] = _read(lambda: s.sub_gain)
    if caps['surround']:
        values['surround_level'] = _read(lambda: s.surround_level)
    return {'ok': True, 'room': zone_id, 'name': zone.get('name', ''), 'caps': caps,
            'values': {k: v for k, v in values.items() if v is not None},
            'crossfade': _read(lambda: c.cross_fade), 'sleep': _read(lambda: c.get_sleep_timer()),
            'battery': _battery(s) if caps['battery'] else None}


def queue_doc(zone_id, start=0, count=20):
    """The group's Sonos queue, a page at a time, with art. index is 0-based (what play/remove take)."""
    c = speaker(zone_id).group.coordinator
    q = c.get_queue(start, count, full_album_art_uri=True)
    track = _read(lambda: c.get_current_track_info(), {}) or {}
    media = _read(lambda: c.get_current_media_info().get('uri') or '', '')
    pos = str(track.get('playlist_position') or '')
    items = [{'index': start + i, 'title': x.title, 'artist': getattr(x, 'creator', '') or '',
              'album': getattr(x, 'album', '') or '', 'art': getattr(x, 'album_art_uri', '') or ''} for i, x in enumerate(q)]
    return {'ok': True, 'room': zone_id, 'items': items, 'start': start,
            'total': getattr(q, 'total_matches', len(items)),
            'current': int(pos) - 1 if pos.isdigit() and int(pos) > 0 and media.startswith('x-rincon-queue:') else None,
            'active': media.startswith('x-rincon-queue:')}


def favorites_doc(zone_id):
    s = speaker(zone_id)
    items = s.music_library.get_sonos_favorites(max_items=100)
    return {'ok': True, 'favorites': [{'id': x.item_id, 'title': x.title, 'art': getattr(x, 'album_art_uri', None) or '',
                                       'kind': getattr(x, 'description', None) or ''} for x in items]}


def _didl_field(meta, tag):
    m = re.search(r'<' + tag + r'(?:\s[^>]*)?>([^<]*)</' + tag + '>', meta or '')
    return m.group(1) if m else ''


def _play_queue_at(c, index0):
    """Play the queue from a REAL position. With shuffle on, Sonos reads the position in its shuffled order,
    so a picked song would play some other queued song; turn shuffle off first, keeping repeat."""
    shuffle, repeat = MODE_PARTS.get(_read(lambda: c.play_mode, 'NORMAL'), (False, 'off'))
    if shuffle:
        c.play_mode = PLAY_MODES[(False, repeat)]
    c.play_from_queue(index0)


def play_favorite(c, favorite):
    """Play a Sonos favorite of any kind.

    * Has a resource URI, radio-like (x-sonosapi-stream/radio/hls, …): play_uri with the favorite's
      DIDL so the speaker shows the station name.
    * Has a resource URI, anything else (a Spotify track): append to the queue and play it.
    * No resource at all (Sonos app "shortcuts": Sonos Radio collections, an Apple Music artist):
      queue it as a cloud container, x-rincon-cpcontainer:<item id>, with the favorite's own r:resMD as the
      metadata. The service and account come from the desc token in that metadata, the same way soco's
      ShareLinkPlugin queues Spotify/Apple Music albums. The old code indexed resources[0] and raised
      IndexError (a 503) for these."""
    import soco
    res = list(getattr(favorite, 'resources', None) or [])
    ref = _read(lambda: favorite.reference)
    if not res and ref is not None:
        res = list(getattr(ref, 'resources', None) or [])
    meta = favorite.resource_meta_data or ''
    if res and res[0].uri:
        uri = res[0].uri
        if soco.SoCo.music_source_from_uri(uri) == 'RADIO' or uri.startswith('x-sonosapi-'):
            c.play_uri(uri, meta=meta, title=favorite.title)
            return 'radio'
        index = c.add_to_queue(ref if ref is not None else favorite)
        _play_queue_at(c, index - 1)
        return 'queue'
    item = re.search(r'<item\s[^>]*\bid="([^"]+)"', meta)
    klass = _didl_field(meta, 'upnp:class')
    token = re.search(r'SA_RINCON\d+_', meta)
    if not item or not klass.startswith('object.container') or not token:
        raise ValueError('This favorite is a Sonos app shortcut the frame cannot play. Open it in the Sonos app.')
    from soco.exceptions import SoCoUPnPException
    try:
        response = c.avTransport.AddURIToQueue([
            ('InstanceID', 0), ('EnqueuedURI', 'x-rincon-cpcontainer:' + item.group(1)),
            ('EnqueuedURIMetaData', meta), ('DesiredFirstTrackNumberEnqueued', 0), ('EnqueueAsNext', 0)])
    except SoCoUPnPException as exc:
        raise ValueError('Sonos would not play this favorite from here. Open it in the Sonos app.') from exc
    _play_queue_at(c, int(response['FirstTrackNumberEnqueued']) - 1)
    return 'container'


SPOTIFY_LINK = re.compile(r'https://open\.spotify\.com/(?:intl-[a-z]{2}/)?(?:track|album|playlist|episode|show)/[A-Za-z0-9]+(?:\?[^\s]*)?'
                          r'|spotify:(?:track|album|playlist|episode|show):[A-Za-z0-9]+')
EQ_RANGES = {'bass': (-10, 10), 'treble': (-10, 10), 'sub_gain': (-15, 15), 'surround_level': (-15, 15)}
EQ_TOGGLES = {'loudness': 'loudness', 'night': 'night_mode', 'speech': 'dialog_mode'}
EQ_CAP = {'bass': 'bass', 'treble': 'treble', 'loudness': 'loudness', 'night': 'night', 'speech': 'speech',
          'sub_gain': 'sub', 'surround_level': 'surround'}


def _int(payload, key, lo, hi, what):
    v = payload.get(key)
    if type(v) is not int or not lo <= v <= hi:
        raise ValueError('%s must be %d–%d' % (what, lo, hi))
    return v


def _on_tv(sp):
    """True when this speaker is a soundbar playing its TV input. Pulling it into another group would
    cut the TV's sound, so grouping refuses it."""
    return bool(_read(lambda: sp.is_soundbar, False)) and bool(_read(lambda: sp.is_playing_tv, False))


def _tv_guard(c, room, payload):
    """Starting music on a soundbar that is playing the TV cuts the TV's sound. Refuse unless the person
    confirmed on the frame (over_tv). c is the group's coordinator, so a room grouped under the TV is covered."""
    if _on_tv(c) and payload.get('over_tv') is not True:
        name = (zone_map().get(room) or {}).get('name') or _read(lambda: c.player_name, 'That room')
        raise ValueError(name + ' is playing the TV. Music there would cut the TV sound.')


def _group_command(s, room, payload, zones):
    """Make `room`'s group exactly payload['members'] (zone ids; `room` is always kept).
    Every check runs before the first write, so a refused request changes nothing."""
    members = payload.get('members')
    if not isinstance(members, list) or not all(isinstance(m, str) for m in members) or len(members) > 20:
        raise ValueError('Choose the rooms to group')
    want = set(members) | {room}
    unknown = want - set(zones)
    if unknown:
        raise ValueError('Unknown Sonos room')
    c = s.group.coordinator
    current = set(_zone_key(m.uid) for m in s.group.members if _zone_key(m.uid) in zones)
    coord = _zone_key(c.uid)
    master_id = coord if coord in want else room
    joining = sorted(want - (current if master_id == coord else {room}) - {master_id})
    speakers = {k: speaker(k) for k in (want | current) - {room}}
    speakers[room] = s
    for k in joining:
        if _on_tv(speakers[k]):
            raise ValueError(zones[k]['name'] + ' is playing TV sound, so it stays out of groups. Switch it to music first.')
    master = c if master_id == coord else s
    if master_id != coord:
        s.unjoin()                                    # room leaves its old group and becomes the new master
    for k in sorted(current - want):
        if k != master_id:
            speakers[k].unjoin()
    for k in joining:
        speakers[k].join(master)
    return {'joined': joining, 'left': sorted(current - want - {master_id})}


def music_command(payload):
    room = payload.get('room')
    s = speaker(room)
    c = s.group.coordinator
    action = payload.get('action')
    extra = {}
    if action == 'volume':                            # the group's volume (the hero slider)
        s.group.volume = _int(payload, 'value', 0, 100, 'Volume')
    elif action == 'volume_step':
        extra['volume'] = s.group.set_relative_volume(_int(payload, 'delta', -20, 20, 'Volume step'))
    elif action == 'room_volume':                     # one room inside the group
        s.volume = _int(payload, 'value', 0, 100, 'Volume')
    elif action in ('play', 'pause', 'next', 'previous'):
        if action.title() not in c.available_actions:
            raise ValueError('This source does not support that action')
        getattr(c, action)()
    elif action == 'seek':
        position = _int(payload, 'position', 0, 86399, 'Position')
        if 'SeekTime' not in c.available_actions:
            raise ValueError('This source cannot jump to a time')
        c.seek('%d:%02d:%02d' % (position // 3600, position // 60 % 60, position % 60))
    elif action == 'play_mode':
        shuffle, repeat = MODE_PARTS.get(c.play_mode, (False, 'off'))
        if 'shuffle' in payload:
            if type(payload['shuffle']) is not bool:
                raise ValueError('shuffle must be true or false')
            shuffle = payload['shuffle']
        if 'repeat' in payload:
            if payload['repeat'] not in ('off', 'all', 'one'):
                raise ValueError('repeat must be off, all or one')
            repeat = payload['repeat']
        if 'shuffle' not in payload and 'repeat' not in payload:
            raise ValueError('Choose shuffle or repeat')
        c.play_mode = PLAY_MODES[(shuffle, repeat)]
    elif action == 'crossfade':
        if type(payload.get('on')) is not bool:
            raise ValueError('on must be true or false')
        c.cross_fade = payload['on']
    elif action == 'group':
        extra = _group_command(s, room, payload, zone_map())
    elif action == 'ungroup':
        s.unjoin()
    elif action == 'queue_play':
        _play_queue_at(c, _int(payload, 'index', 0, 9999, 'Track'))
    elif action == 'queue_remove':
        c.remove_from_queue(_int(payload, 'index', 0, 9999, 'Track'))
    elif action == 'queue_clear':
        c.clear_queue()
    elif action == 'sleep':
        minutes = payload.get('minutes')
        if minutes is not None:
            minutes = _int(payload, 'minutes', 1, 720, 'Sleep timer minutes')
        c.set_sleep_timer(None if minutes is None else minutes * 60)
    elif action == 'eq':
        setting = payload.get('setting')
        if setting not in EQ_CAP:
            raise ValueError('Unknown Sonos setting')
        zone = zone_map().get(room) or {}
        if not speaker_caps(s, zone.get('model', '')).get(EQ_CAP[setting]):
            raise ValueError('This speaker does not have that setting')
        if setting in EQ_RANGES:
            lo, hi = EQ_RANGES[setting]
            setattr(s, setting, _int(payload, 'value', lo, hi, setting.replace('_', ' ').capitalize()))
        else:
            if type(payload.get('value')) is not bool:
                raise ValueError('value must be true or false')
            setattr(s, EQ_TOGGLES[setting], payload['value'])
    elif action == 'favorite':
        _tv_guard(c, room, payload)
        items = s.music_library.get_sonos_favorites(max_items=100)
        favorite = next((x for x in items if x.item_id == payload.get('favorite')), None)
        if favorite is None:
            raise ValueError('Favorite not found')
        extra['how'] = play_favorite(c, favorite)
    elif action == 'spotify':
        link = payload.get('link', '')
        if not isinstance(link, str) or not SPOTIFY_LINK.fullmatch(link):
            raise ValueError('Paste a Spotify track, album, playlist, podcast or episode link')
        from soco.plugins.sharelink import ShareLinkPlugin
        link = re.sub(r'/intl-[a-z]{2}/', '/', link.split('?')[0])
        _tv_guard(c, room, payload)
        single = re.search(r'(track|episode)[:/]', link) is not None
        if not single:                                # an album/playlist/show replaces the queue, like Sonos "Replace queue"
            c.clear_queue()
        index = ShareLinkPlugin(c).add_share_link_to_queue(link, as_next=single)
        _play_queue_at(c, index - 1)
    else:
        raise ValueError('Unknown music action')
    _cache.pop('music', None)
    out = {'ok': True, 'pending_confirmation': True}
    out.update(extra)
    return out



# ---------------------------------------------------------------- photos

_shape_cache = {}


def photo_dir():
    return config.resolve(config.get('photos_dir'))


def _shape(path):
    """(w, h) from the image header, cached by name+mtime, so pages can place a photo without loading it."""
    try:
        st = path.stat()
    except OSError:
        return None, None
    key = (str(path), st.st_mtime)
    if key not in _shape_cache:
        try:
            from PIL import Image, ImageOps
            with Image.open(path) as im:
                w, h = im.size
                if (im.getexif() or {}).get(0x0112) in (5, 6, 7, 8):   # rotated by EXIF: report as displayed
                    w, h = h, w
                _shape_cache[key] = (w, h)
        except Exception:
            _shape_cache[key] = (None, None)
    return _shape_cache[key]


def photo_id(rel):
    return hashlib.sha1(str(rel).encode()).hexdigest()[:32]


def photo_files():
    """{id: Path} for every photo under photos_dir, skipping dot folders."""
    root = photo_dir()
    out = {}
    if not root.is_dir():
        return out
    for p in root.rglob('*'):
        rel = p.relative_to(root)
        if p.suffix.lower() in PHOTO_TYPES and p.is_file() and not any(part.startswith('.') for part in rel.parts):
            out[photo_id(rel.as_posix())] = p
    return out


def photos_doc():
    files = photo_files()
    items = []
    for pid, p in files.items():
        w, h = _shape(p)
        items.append({'id': pid, 'kind': 'photo', 'url': '/api/frame/photo/' + pid + '.jpg', 'w': w, 'h': h,
                      't': p.stat().st_mtime})
    items.sort(key=lambda m: m['t'], reverse=True)
    return {'ok': True, 'photos': items, 'media': items, 'folder': str(config.get('photos_dir'))}


def send_photo(handler, pid, w, blur=False):
    import frame_img
    p = photo_files().get(pid)
    if not p:
        handler.send_error(404); return
    cache = config.data_dir() / 'photo_cache'
    if not frame_img.send(handler, p, w or 1600, 'private, max-age=86400', cache_dir=cache, blur=blur):
        handler.send_error(404)

def send_qr_svg(host, path='/frame/hv/music/send/'):
    """QR for a phone page at the address this frame reached us by."""
    import segno
    url = 'http://' + host + path
    import io
    buf = io.BytesIO()
    # save(), not svg_inline(): inline SVG omits xmlns, and an <img> pointing
    # at an SVG without it renders as a broken image.
    segno.make(url, error='m').save(buf, kind='svg', scale=8, border=2, dark='#111', light='#fff', xmldecl=False)
    return buf.getvalue().decode(), url




def dispatch_get(handler, route):
    if route == '/api/frame/photos':
        handler._json(photos_doc()); return True
    m = re.fullmatch(r'/api/frame/photo/([0-9a-f]{32})\.jpg', route)
    if m:
        q = parse_qs(urlparse(handler.path).query)
        send_photo(handler, m.group(1), (q.get('w') or [''])[0], (q.get('blur') or [''])[0] == '1'); return True
    if route == '/api/frame/music-qr.svg':
        svg, _ = send_qr_svg(handler.headers.get('Host', ''), '/frame/hv/music/send/')
        body = svg.encode()
        handler.send_response(200)
        handler.send_header('Content-Type', 'image/svg+xml')
        handler.send_header('Content-Length', str(len(body)))
        handler.send_header('Cache-Control', 'no-cache')
        handler.end_headers()
        handler.wfile.write(body)
        return True
    if not route.startswith(('/api/frame/music', '/api/frame/favorites/')):
        return False
    if not sonos_enabled():
        handler._json({'ok': False, 'enabled': False, 'rooms': [], 'error': 'Sonos is turned off in config.json'})
        return True
    if route == '/api/frame/music':
        handler._json(music_doc())
    elif route.startswith(('/api/frame/music/queue/', '/api/frame/music/settings/')):
        zone_id = route.rsplit('/', 1)[1]
        try:
            if '/queue/' in route:
                start = (parse_qs(urlparse(handler.path).query).get('start') or ['0'])[0]
                start = int(start) if start.isdigit() and int(start) < 10000 else 0
                handler._json(queue_doc(zone_id, start))
            else:
                handler._json(settings_doc(zone_id))
        except ValueError as exc:
            handler._json({'ok': False, 'error': str(exc)}, 404)
        except Exception:
            handler._json({'ok': False, 'error': 'The speaker did not respond'}, 503)
    elif route.startswith('/api/frame/favorites/'):
        try:
            handler._json(favorites_doc(route.rsplit('/', 1)[1]))
        except Exception:
            handler._json({'ok': False, 'error': 'Sonos favorites are unavailable'}, 503)
    else:
        return False
    return True


def music_post(payload):
    if not sonos_enabled():
        raise ValueError('Sonos is turned off in config.json')
    return music_command(payload)
