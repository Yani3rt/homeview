"""Hurricane watch: active tropical storms from the National Hurricane Center (nhc.noaa.gov, free, no key).

    config.json: "storms": {"basins": ["AL"], "radius_mi": 1500, "near_mi": 400}
      basins     AL = Atlantic (Gulf and Caribbean included), EP = Eastern Pacific, CP = Central Pacific
      radius_mi  storms farther than this from home are left out
      near_mi    a storm this close (or a Hurricane/Tropical Storm/Storm Surge alert from Home Assistant) means "near"

How often NHC is asked (a frame asking /api/storms only triggers a check when one is due):
  * no active storm:          every 3 hours
  * active, not near:         10 minutes after each regular advisory (5, 11 AM and PM Eastern)
  * near (or a watch/warning): every hour, to catch intermediate and special advisories
Every check is conditional (If-Modified-Since / ETag): an unchanged CurrentStorms.json costs a few hundred bytes.
The cone graphic is downloaded once per advisory and kept in <data_dir>/storm_cones/.

GET /api/storms                   {ok, storms:[...], near, checked_at, next_check, error}
GET /api/storms/cone/<id>.jpg     NHC's 5-day cone for that storm (current advisory)
GET /api/storms/qr/<id>.svg       QR code for the storm's NHC page (to open on a phone)"""
import io, json, math, re, threading, time, urllib.error, urllib.request
from datetime import datetime, timedelta

import config
import weather_api

FEED = 'https://www.nhc.noaa.gov/CurrentStorms.json'
CONE = 'https://www.nhc.noaa.gov/storm_graphics/{folder}/{ID}_5day_cone.png'
ADVISORY_SLOTS = ((5, 10), (11, 10), (17, 10), (23, 10))      # Eastern time: 10 min after the 5/11 AM/PM advisories
CLASSES = {'HU': 'Hurricane', 'TS': 'Tropical Storm', 'TD': 'Tropical Depression', 'STS': 'Subtropical Storm',
           'SD': 'Subtropical Depression', 'PTC': 'Potential Tropical Cyclone', 'PC': 'Post-Tropical Cyclone',
           'TY': 'Typhoon', 'MH': 'Major Hurricane'}
ID_RE = re.compile(r'^[a-z]{2}\d{6}$')
_lock = threading.Lock()
_st = {'feed': None, 'etag': None, 'lastmod': None, 'checked': 0.0, 'next': 0.0, 'error': None}


def settings():
    c = config.load().get('storms')
    c = c if isinstance(c, dict) else {}
    def num(k, d):
        try:
            return float(c.get(k, d))
        except (TypeError, ValueError):
            return d
    basins = c.get('basins') if isinstance(c.get('basins'), list) else ['AL']
    return {'enabled': c.get('enabled', True) is not False, 'basins': [str(b).upper()[:2] for b in basins],
            'radius': num('radius_mi', 1500), 'near': num('near_mi', 400)}


def distance_mi(lat1, lon1, lat2, lon2):
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(a))


def bearing(lat1, lon1, lat2, lon2):
    """Compass direction from home to the storm ('WSW')."""
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    b = math.degrees(math.atan2(math.sin(dl) * math.cos(p2), math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)))
    return compass(b)


def compass(deg):
    pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
    return pts[int(((deg % 360) + 11.25) // 22.5) % 16]


def category(kt, cls):
    if cls not in ('HU', 'MH') or kt < 64:
        return None
    return 1 if kt < 83 else 2 if kt < 96 else 3 if kt < 113 else 4 if kt < 137 else 5


def next_advisory_check(now):
    """The next 'ten minutes after a regular advisory' time, in home time."""
    for day in (0, 1):
        for h, m in ADVISORY_SLOTS:
            t = (now + timedelta(days=day)).replace(hour=h, minute=m, second=0, microsecond=0)
            if t > now:
                return t
    return now + timedelta(hours=6)


def _alert_near():
    """A Hurricane / Tropical Storm / Storm Surge alert from Home Assistant counts as near."""
    try:
        import ha_api
        return any(re.search(r'hurricane|tropical storm|storm surge', a.get('event', ''), re.I)
                   for a in ha_api.alerts_doc().get('alerts') or [])
    except Exception:
        return False


def _fetch_feed():
    h = {'User-Agent': weather_api.UA}
    if _st['etag']:
        h['If-None-Match'] = _st['etag']
    if _st['lastmod']:
        h['If-Modified-Since'] = _st['lastmod']
    try:
        with urllib.request.urlopen(urllib.request.Request(FEED, headers=h), timeout=20) as r:
            _st['feed'] = json.loads(r.read())
            _st['etag'], _st['lastmod'] = r.headers.get('ETag'), r.headers.get('Last-Modified')
    except urllib.error.HTTPError as e:
        if e.code != 304:                              # 304: unchanged since our copy
            raise


def storm_list(conf, feed):
    home = config.get('location')
    out = []
    for s in (feed or {}).get('activeStorms') or []:
        sid = str(s.get('id') or '').lower()
        if not ID_RE.match(sid) or sid[:2].upper() not in conf['basins']:
            continue
        try:
            lat, lon = float(s['latitudeNumeric']), float(s['longitudeNumeric'])
            kt = int(float(s.get('intensity') or 0))
        except (KeyError, TypeError, ValueError):
            continue
        dist = distance_mi(home['latitude'], home['longitude'], lat, lon)
        if dist > conf['radius']:
            continue
        cls = str(s.get('classification') or '')
        adv = s.get('publicAdvisory') or {}
        mv = s.get('movementSpeed')
        out.append({
            'id': sid, 'name': s.get('name') or sid.upper(), 'cls': cls, 'label': CLASSES.get(cls, 'Tropical system'),
            'cat': category(kt, cls), 'wind_mph': round(kt * 1.15078 / 5) * 5, 'pressure': s.get('pressure'),
            'dist_mi': int(round(dist / 10.0) * 10), 'dir': bearing(home['latitude'], home['longitude'], lat, lon),
            'moving': (compass(s['movementDir']) + ' at %d mph' % round(float(mv) * 1.15078)) if s.get('movementDir') is not None and mv else 'stationary',
            'adv_num': str(adv.get('advNum') or ''), 'adv_time': adv.get('issuance'),
            'page': (s.get('forecastGraphics') or {}).get('url') or 'https://www.nhc.noaa.gov/',
            'cone': '/api/storms/cone/%s.jpg?a=%s' % (sid, adv.get('advNum') or ''),
            'near': dist <= conf['near']})
    out.sort(key=lambda x: x['dist_mi'])
    return out


def storms_doc(force=False):
    conf = settings()
    if not conf['enabled']:
        return {'ok': True, 'enabled': False, 'storms': []}
    now_t = time.time()
    with _lock:
        if force or now_t >= _st['next']:
            try:
                _fetch_feed(); _st['error'] = None
            except Exception as e:
                _st['error'] = 'The Hurricane Center did not answer (%s)' % str(e)[:60]
            _st['checked'] = now_t
            storms = storm_list(conf, _st['feed'])
            near = any(s['near'] for s in storms) or (bool(storms) and _alert_near())
            now = datetime.now(weather_api.tz())
            if _st['error']:
                nxt = now + timedelta(minutes=20)          # try again soon after a failure
            elif not storms:
                nxt = now + timedelta(hours=3)
            elif near:
                nxt = now + timedelta(hours=1)
            else:
                nxt = next_advisory_check(now)
            _st['next'] = nxt.timestamp(); _st['near'] = near
        storms = storm_list(conf, _st['feed'])
        return {'ok': True, 'enabled': True, 'storms': storms, 'near': bool(_st.get('near')),
                'checked_at': round(_st['checked']), 'next_check': round(_st['next']), 'error': _st['error']}


def _cone_file(sid, adv):
    d = config.data_dir() / 'storm_cones'
    d.mkdir(parents=True, exist_ok=True)
    return d / ('%s_%s.jpg' % (sid, re.sub(r'\W', '', adv) or 'x'))


def cone_jpeg(sid):
    """The 5-day cone for the storm's current advisory: fetched once per advisory, kept as a JPEG."""
    s = next((x for x in storm_list(settings(), _st['feed']) if x['id'] == sid), None)
    if not s:
        return None
    f = _cone_file(sid, s['adv_num'])
    if f.exists():
        return f.read_bytes()
    url = CONE.format(folder=sid[:2].upper() + sid[2:4], ID=sid.upper())
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': weather_api.UA}), timeout=30) as r:
        raw = r.read()
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(raw)).convert('RGB'); buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=86, optimize=True); out = buf.getvalue()
    except Exception:
        out = raw
    f.write_bytes(out)
    return out


def dispatch_get(handler, route):
    if route == '/api/storms':
        handler._json(storms_doc()); return True
    m = re.fullmatch(r'/api/storms/cone/([a-z]{2}\d{6})\.jpg', route)
    if m:
        try:
            b = cone_jpeg(m.group(1))
        except Exception:
            b = None
        if not b:
            handler._json({'ok': False, 'error': 'No cone for that storm right now'}, 404); return True
        handler.send_response(200); handler.send_header('Content-Type', 'image/jpeg' if b[:2] == b'\xff\xd8' else 'image/png')
        handler.send_header('Content-Length', str(len(b))); handler.send_header('Cache-Control', 'public, max-age=1800')
        handler.end_headers(); handler.wfile.write(b); return True
    m = re.fullmatch(r'/api/storms/qr/([a-z]{2}\d{6})\.svg', route)
    if m:
        s = next((x for x in storm_list(settings(), _st['feed']) if x['id'] == m.group(1)), None)
        try:
            import segno
            buf = io.BytesIO()
            segno.make((s or {}).get('page') or 'https://www.nhc.noaa.gov/', error='m').save(
                buf, kind='svg', scale=8, border=2, dark='#111', light='#fff', xmldecl=False)
            b = buf.getvalue()
        except Exception:
            handler._json({'ok': False, 'error': 'QR codes need the segno package'}, 503); return True
        handler.send_response(200); handler.send_header('Content-Type', 'image/svg+xml')
        handler.send_header('Content-Length', str(len(b))); handler.end_headers(); handler.wfile.write(b); return True
    return False
