"""Tides and water temperature from NOAA CO-OPS (tidesandcurrents.noaa.gov, free, no key) for GET /api/tides.

    config.json: "tides": {"station": "8724580", "king_ft": 2.4}       8724580 = Key West

Doc: {ok, enabled, station, name, events:[{t, type: H|L, ft}] (next 48 h), curve:[{t, ft}] (every 30 min, from
3 h ago to 21 h ahead), water_f, water_at, king:{t, ft}|null, error}. Heights are feet above MLLW (the usual
chart datum). `king` is the first high tide in the next 48 h at or above king_ft: a very high tide (flood-prone
streets), not an official NOAA designation. Predictions are cached 6 h, water temperature 30 min."""
import json, threading, time, urllib.parse, urllib.request
from datetime import datetime, timedelta

import config
import weather_api

API = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
_lock = threading.Lock()
_mem = {}


def settings():
    c = config.load().get('tides')
    c = c if isinstance(c, dict) else {}
    try:
        king = float(c.get('king_ft', 2.4))
    except (TypeError, ValueError):
        king = 2.4
    return {'station': str(c.get('station') or '').strip(), 'king': king}


def _get(**q):
    q.update(application='HomeView', format='json', time_zone='lst_ldt', units='english', datum='MLLW')
    with urllib.request.urlopen(urllib.request.Request(API + '?' + urllib.parse.urlencode(q),
                                headers={'User-Agent': weather_api.UA}), timeout=20) as r:
        d = json.loads(r.read())
    if isinstance(d, dict) and d.get('error'):
        raise ValueError(d['error'].get('message') or 'NOAA error')
    return d


def _cached(name, ttl, loader):
    hit = _mem.get(name)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    try:
        v = loader()
    except Exception:
        if hit:
            return hit[1]                           # NOAA hiccup: keep the last good answer
        raise
    _mem[name] = (time.time(), v)
    return v


def _iso(t):
    return t.replace(' ', 'T')


def tides_doc():
    conf = settings()
    if not conf['station']:
        return {'ok': True, 'enabled': False}
    st = conf['station']
    now = datetime.now(weather_api.tz()).replace(tzinfo=None)
    day = (now - timedelta(hours=3)).strftime('%Y%m%d')
    doc = {'ok': True, 'enabled': True, 'station': st, 'error': None}
    with _lock:
        try:
            hilo = _cached('hilo:' + st + day, 21600, lambda: _get(station=st, product='predictions', interval='hilo',
                                                                   begin_date=day, range=72))
            curve = _cached('curve:' + st + day, 21600, lambda: _get(station=st, product='predictions', interval='30',
                                                                     begin_date=day, range=72))
        except Exception as e:
            return {**doc, 'error': 'NOAA tides did not answer (%s)' % str(e)[:80]}
        try:
            wt = _cached('water:' + st, 1800, lambda: _get(station=st, product='water_temperature', date='latest'))
        except Exception:
            wt = {}
    key = now.strftime('%Y-%m-%d %H:%M')
    lo, hi = (now - timedelta(hours=3)).strftime('%Y-%m-%d %H:%M'), (now + timedelta(hours=21)).strftime('%Y-%m-%d %H:%M')
    ev = [{'t': _iso(p['t']), 'type': p['type'], 'ft': round(float(p['v']), 2)}
          for p in hilo.get('predictions') or [] if key <= p['t'] <= (now + timedelta(hours=48)).strftime('%Y-%m-%d %H:%M')]
    doc['events'] = ev
    doc['curve'] = [{'t': _iso(p['t']), 'ft': round(float(p['v']), 2)} for p in curve.get('predictions') or [] if lo <= p['t'] <= hi]
    doc['king'] = next(({'t': e['t'], 'ft': e['ft']} for e in ev if e['type'] == 'H' and e['ft'] >= conf['king']), None)
    data = (wt or {}).get('data') or []
    doc['name'] = ((wt or {}).get('metadata') or {}).get('name') or 'Tides'
    if data and data[-1].get('v') not in (None, ''):
        doc['water_f'] = round(float(data[-1]['v']), 1); doc['water_at'] = _iso(data[-1]['t'])
    return doc


def dispatch_get(handler, route):
    if route == '/api/tides':
        handler._json(tides_doc()); return True
    return False
