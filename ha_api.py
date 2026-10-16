"""Home Assistant: a hand-picked list of entities shown on the Home screen (/api/ha/*).

The server talks to Home Assistant's REST API with a long-lived access token; the frames only get a
small, ETag'd summary of the entities listed in config.json, and can only act on those entities, with a
fixed set of actions per kind. The token and Home Assistant's address never reach the frames.

config.json:
  "home_assistant": {
    "url": "http://10.0.0.10:8123",
    "token": "<long-lived access token>",          (HA > your profile > Security > Long-lived access tokens)
    "title": "Home",
    "entities": [
      {"section": "Kitchen"},                       a heading
      "light.kitchen",                              an entity, named as in Home Assistant
      {"entity": "climate.living_room", "name": "AC"},   or with your own name
      "sensor.outside_temperature", "scene.movie_night", "automation.night_lights"
    ]
  }

Kinds: light / switch / input_boolean / fan -> toggle (lights: brightness too); climate -> setpoint and
mode; scene / script / button / input_button -> run; automation -> enable / disable; anything else
(sensor, binary_sensor, ...) is shown read-only.

GET  /api/ha/state    {ok, enabled, title, items:[...], error}
POST /api/ha/action   {"entity": "light.kitchen", "action": "toggle|on|off|brightness|enable|disable|run|temp|mode", "value": ...}"""
import json, re, threading, time, urllib.error, urllib.request

import config

TIMEOUT = 6
CACHE_S = 1.5
TOGGLE = ('light', 'switch', 'input_boolean', 'fan')
RUN = {'scene': ('scene', 'turn_on'), 'script': ('script', 'turn_on'), 'button': ('button', 'press'),
       'input_button': ('input_button', 'press')}
ENTITY_RE = re.compile(r'^[a-z_]+\.[a-z0-9_]+$')
BINARY_WORDS = {
    ('door', 'window', 'opening', 'garage_door'): ('Open', 'Closed'),
    ('motion', 'occupancy', 'presence'): ('Detected', 'Clear'),
    ('moisture',): ('Wet', 'Dry'),
    ('lock',): ('Unlocked', 'Locked'),
    ('connectivity',): ('Connected', 'Disconnected'),
    ('battery',): ('Low', 'Normal'),
}

_lock = threading.Lock()
_cache = {'at': 0.0, 'states': None, 'error': None, 'key': None, 'unit': None}


class HAError(Exception):
    pass


def settings():
    c = config.load().get('home_assistant')
    c = c if isinstance(c, dict) else {}
    items = []
    for x in c.get('entities') or []:
        if isinstance(x, str) and ENTITY_RE.match(x.strip()):
            items.append({'entity': x.strip()})
        elif isinstance(x, dict) and x.get('section'):
            items.append({'section': str(x['section'])[:40]})
        elif isinstance(x, dict) and ENTITY_RE.match(str(x.get('entity') or '').strip()):
            items.append({'entity': str(x['entity']).strip(), 'name': str(x.get('name') or '')[:40] or None})
    alerts = str(c.get('alerts_entity') or '').strip()
    return {'alerts': alerts if ENTITY_RE.match(alerts) else '',
            'url': str(c.get('url') or '').strip().rstrip('/'), 'token': str(c.get('token') or '').strip(),
            'title': str(c.get('title') or 'Devices')[:30], 'items': items}


def enabled(conf=None):
    conf = conf or settings()
    return bool(conf['url'] and conf['token'])


def _call(conf, method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(conf['url'] + path, data=data, method=method, headers={
        'Authorization': 'Bearer ' + conf['token'], 'Content-Type': 'application/json', 'User-Agent': 'HomeView/1'})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise HAError('Home Assistant refused the token in config.json')
        if e.code == 404:
            raise HAError('Home Assistant did not know that request (%s)' % path.split('?')[0])
        if e.code == 400:
            raise HAError('Home Assistant could not do that')
        raise HAError('Home Assistant answered %d' % e.code)
    except (urllib.error.URLError, OSError) as e:
        reason = getattr(e, 'reason', e)
        raise HAError('Home Assistant is not answering (%s)' % (getattr(reason, 'strerror', None) or reason))
    try:
        return json.loads(raw or b'null')
    except ValueError:
        raise HAError('Home Assistant sent something unexpected')


def _states(conf, fresh=False):
    """All entity states from HA, cached for CACHE_S (every frame polling shares one request)."""
    key = (conf['url'], conf['token'])
    with _lock:
        if not fresh and _cache['key'] == key and time.time() - _cache['at'] < CACHE_S:
            return _cache['states'], _cache['error']
    states, error = None, None
    try:
        lst = _call(conf, 'GET', '/api/states')
        states = {s['entity_id']: s for s in lst if isinstance(s, dict) and 'entity_id' in s}
        if _cache['unit'] is None or _cache['key'] != key:
            try:
                _cache['unit'] = ((_call(conf, 'GET', '/api/config') or {}).get('unit_system') or {}).get('temperature') or ''
            except HAError:
                _cache['unit'] = ''
    except HAError as e:
        error = str(e)
    with _lock:
        if states is None and _cache['key'] == key and _cache['states'] is not None and time.time() - _cache['at'] < 60:
            states = _cache['states']                 # a short outage: keep showing the last states, with the error
        _cache.update(at=time.time(), states=states, error=error, key=key)
    return states, error


def _num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return int(f) if f == int(f) else round(f, 1)


def _fmt_state(s, domain, a):
    st = s.get('state')
    if domain == 'binary_sensor':
        dc = a.get('device_class') or ''
        for keys, (on, off) in BINARY_WORDS.items():
            if dc in keys:
                return on if st == 'on' else off
        return 'On' if st == 'on' else 'Off'
    n = _num(st)
    unit = a.get('unit_of_measurement') or ''
    if n is not None:
        return ('%s %s' % (n, unit)).strip() if unit and unit not in ('°F', '°C', '%') else '%s%s' % (n, unit)
    return str(st or '').replace('_', ' ').capitalize()


def item_doc(it, s, unit):
    eid = it['entity']; domain = eid.split('.')[0]
    a = (s or {}).get('attributes') or {}
    d = {'id': eid, 'domain': domain, 'name': it.get('name') or a.get('friendly_name') or eid.split('.')[1].replace('_', ' ').capitalize()}
    if s is None:
        d.update(kind='missing', state='Not found in Home Assistant', avail=False); return d
    st = s.get('state')
    d['avail'] = st not in ('unavailable', 'unknown') or domain in RUN
    if domain in TOGGLE:
        d.update(kind='toggle', on=st == 'on')
        if domain == 'light':
            modes = a.get('supported_color_modes') or []
            d['dimmable'] = any(m != 'onoff' for m in modes) or 'brightness' in a
            b = a.get('brightness')
            d['pct'] = int(round(b * 100 / 255.0)) if st == 'on' and isinstance(b, (int, float)) else None
        d['state'] = ('On' + (' · %d%%' % d['pct'] if d.get('pct') is not None else '')) if st == 'on' else 'Off'
    elif domain == 'automation':
        d.update(kind='automation', on=st == 'on', state='Enabled' if st == 'on' else 'Disabled')
    elif domain in RUN:
        d.update(kind='run', state={'scene': 'Scene', 'script': 'Script'}.get(domain, 'Button'))
    elif domain == 'climate':
        modes = [m for m in (a.get('hvac_modes') or []) if isinstance(m, str)]
        is_f = 'F' in (unit or '')
        step = _num(a.get('target_temp_step')) or (1 if is_f else 0.5)
        d.update(kind='climate', mode=st, modes=modes, cur=_num(a.get('current_temperature')), set=_num(a.get('temperature')),
                 low=_num(a.get('target_temp_low')), high=_num(a.get('target_temp_high')), min=_num(a.get('min_temp')),
                 max=_num(a.get('max_temp')), step=step, action=a.get('hvac_action'), on=st not in ('off', 'unavailable', 'unknown'))
        d['state'] = str(st or '').replace('_', ' ').capitalize()
    else:
        d.update(kind='sensor', state=_fmt_state(s, domain, a), dc=a.get('device_class') or '')
        if domain == 'binary_sensor':
            d['on'] = st == 'on'
    if st == 'unavailable' and domain not in RUN:
        d['state'] = 'Unavailable'
    return d


def state_doc():
    conf = settings()
    if not enabled(conf):
        return {'ok': True, 'enabled': False, 'title': conf['title'], 'items': [],
                'error': 'Add home_assistant url and token to config.json'}
    states, error = _states(conf)
    items = []
    for it in conf['items']:
        if 'section' in it:
            items.append({'kind': 'section', 'name': it['section']})
        elif states is not None:
            items.append(item_doc(it, states.get(it['entity']), _cache['unit']))
    if not conf['items']:
        error = error or 'No entities are listed under home_assistant.entities in config.json'
    return {'ok': True, 'enabled': True, 'title': conf['title'], 'items': items, 'error': error}


def _iso_ts(v):
    from datetime import datetime
    try:
        return datetime.fromisoformat(str(v)).timestamp()
    except (TypeError, ValueError):
        return None


def alerts_doc():
    """Active weather alerts from an NWS Alerts sensor (attributes.Alerts), for the red/orange chip on every screen."""
    conf = settings()
    if not (enabled(conf) and conf['alerts']):
        return {'ok': True, 'alerts': []}
    rank = {'Extreme': 0, 'Severe': 1, 'Moderate': 2, 'Minor': 3}
    hc = config.load().get('home_assistant') or {}
    floor = rank.get(str(hc.get('alerts_min_severity') or 'Moderate').capitalize(), 2)   # Minor/Unknown hidden by default
    states, error = _states(conf)
    s = (states or {}).get(conf['alerts']) or {}
    now = time.time(); out = []
    for a in ((s.get('attributes') or {}).get('Alerts') or []):
        if not isinstance(a, dict):
            continue
        end = max([t for t in (_iso_ts(a.get('Ends')), _iso_ts(a.get('Expires'))) if t] or [0])
        if end and end < now:
            continue                                  # already over
        if rank.get(str(a.get('Severity') or ''), 9) > floor:
            continue                                  # below alerts_min_severity
        out.append({k: str(a.get(src) or '')[:4000] for k, src in (
            ('event', 'Event'), ('headline', 'Headline'), ('severity', 'Severity'), ('description', 'Description'),
            ('instruction', 'Instruction'), ('areas', 'AreasAffected'), ('ends', 'Ends'), ('expires', 'Expires'), ('id', 'ID'))})
    out.sort(key=lambda x: rank.get(x['severity'], 4))
    return {'ok': True, 'alerts': out, 'error': error if not out else None}


def action(payload):
    conf = settings()
    if not enabled(conf):
        raise ValueError('Home Assistant is not set up in config.json')
    eid = str(payload.get('entity') or '')
    if eid not in [it.get('entity') for it in conf['items']]:
        raise ValueError('That device is not on the Home screen list')
    domain = eid.split('.')[0]; act = payload.get('action'); val = payload.get('value')
    body = {'entity_id': eid}
    if domain in TOGGLE and act in ('toggle', 'on', 'off'):
        svc = (domain, {'toggle': 'toggle', 'on': 'turn_on', 'off': 'turn_off'}[act])
    elif domain == 'light' and act == 'brightness':
        pct = int(val)
        if not 1 <= pct <= 100:
            raise ValueError('Brightness must be 1 to 100')
        svc = ('light', 'turn_on'); body['brightness_pct'] = pct
    elif domain == 'automation' and act in ('enable', 'disable'):
        svc = ('automation', 'turn_on' if act == 'enable' else 'turn_off')
    elif domain in RUN and act == 'run':
        svc = RUN[domain]
    elif domain == 'climate' and act in ('temp', 'mode'):
        states, err = _states(conf, fresh=True)
        s = (states or {}).get(eid)
        if not s:
            raise HAError(err or 'Home Assistant does not know that device')
        a = s.get('attributes') or {}
        if act == 'temp':
            t = float(val); lo, hi = _num(a.get('min_temp')), _num(a.get('max_temp'))
            if (lo is not None and t < lo) or (hi is not None and t > hi):
                raise ValueError('That temperature is outside the allowed range')
            svc = ('climate', 'set_temperature'); body['temperature'] = t
        else:
            if val not in (a.get('hvac_modes') or []):
                raise ValueError('That mode is not available')
            svc = ('climate', 'set_hvac_mode'); body['hvac_mode'] = val
    else:
        raise ValueError('That action does not apply to this device')
    _call(conf, 'POST', '/api/services/%s/%s' % svc, body)
    with _lock:
        _cache['at'] = 0.0                            # the next poll fetches the new state
    return {'done': '%s.%s' % svc}


def dispatch_get(handler, route):
    if route == '/api/ha/state':
        handler._json(state_doc()); return True
    if route == '/api/ha/alerts':
        handler._json(alerts_doc()); return True
    return False


def dispatch_post(handler, route):
    if route != '/api/ha/action':
        return False
    if not handler._same_origin():
        handler._json({'ok': False, 'error': 'Open the frame app to use its controls'}, 403); return True
    try:
        payload = handler._read_json()
        handler._json({'ok': True, **action(payload)})
    except (ValueError, TypeError) as e:
        handler._json({'ok': False, 'error': str(e)}, 400)
    except HAError as e:
        handler._json({'ok': False, 'error': str(e)}, 503)
    return True
