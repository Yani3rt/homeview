"""HomeView shared state: kitchen timers, remote "open this screen" commands, wallpapers and fonts.

Every frame polls GET /api/hv/state (small, ETag'd by cond.js) every few seconds. It carries
  timers   running kitchen timers, shared by all frames: [{id, label, total, ends}] (ends = unix seconds)
  command  the latest remote command {seq, action, screen?, at} for frames to act on once
  now      server time, so frames can correct their own clock drift for countdowns

Writes (POST, JSON):
  /api/hv/timer    {"action":"start","label":"Pasta","seconds":600} | {"action":"cancel","id":"..."}
  /api/hv/command  {"action":"open","screen":"dinner|shopping|standby|today|timer|meals"}
     e.g. from a phone shortcut or a home automation:  curl -X POST -H 'Origin: http://<host>:<port>' ...

Nothing here talks to a device: it only keeps a small JSON state file, so a bad request can at worst
start a wrong timer or open the wrong screen."""
import json, re, threading, time, uuid
from pathlib import Path
from urllib.parse import urlparse

import config

WALL_TYPES = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'}
MAX_TIMERS = 6
_lock = threading.Lock()

SCREENS = ('dinner', 'shopping', 'standby', 'today', 'timer', 'meals', 'weather', 'calendar', 'music', 'photos')


def _state_file():
    return config.data_dir() / 'hv_state.json'


def _load():
    try:
        d = json.loads(_state_file().read_text())
    except (OSError, ValueError):
        d = {}
    d.setdefault('timers', []); d.setdefault('command', None); d.setdefault('seq', 0)
    now = time.time()
    d['timers'] = [t for t in d['timers'] if t['ends'] > now - 60]   # keep a finished timer a minute so it can ring
    return d


def _save(d):
    p = _state_file()
    tmp = p.with_suffix('.tmp'); tmp.write_text(json.dumps(d)); tmp.replace(p)


def state_doc():
    with _lock:
        d = _load()
    return {'ok': True, 'now': round(time.time(), 1), 'timers': d['timers'], 'command': d['command']}


def start_timer(label, seconds):
    label = str(label or 'Timer').strip()[:24] or 'Timer'
    seconds = int(seconds)
    if not 5 <= seconds <= 6 * 3600:
        raise ValueError('Timer length must be between 5 seconds and 6 hours')
    with _lock:
        d = _load()
        if len(d['timers']) >= MAX_TIMERS:
            raise ValueError('Six timers are already running')
        t = {'id': uuid.uuid4().hex[:8], 'label': label, 'total': seconds, 'ends': round(time.time() + seconds, 1)}
        d['timers'].append(t); _save(d)
    return {'ok': True, 'timer': t}


def cancel_timer(id=None, label=None):
    with _lock:
        d = _load(); before = len(d['timers'])
        d['timers'] = [t for t in d['timers'] if not (t['id'] == id or (label and t['label'] == label))]
        _save(d)
    return {'ok': True, 'removed': before - len(d['timers'])}


def send_command(cmd):
    if cmd.get('action') != 'open' or cmd.get('screen') not in SCREENS:
        raise ValueError('Unknown command')
    with _lock:
        d = _load(); d['seq'] += 1
        d['command'] = {'seq': d['seq'], 'action': 'open', 'screen': cmd['screen'], 'at': round(time.time(), 1)}
        _save(d)
    return {'ok': True, 'command': d['command']}


def _walls():
    return config.resolve(config.get('wallpapers_dir'))


def wallpapers_doc():
    try:
        files = sorted(p for p in _walls().iterdir() if p.suffix.lower() in WALL_TYPES and not p.name.startswith('.'))
    except OSError:
        files = []
    return {'ok': True, 'wallpapers': [{'id': p.name, 'name': p.stem.replace('-', ' ').replace('_', ' '),
                                        'url': '/frame/hv/wallpapers/' + p.name} for p in files]}


def _send_file(handler, path, ctype, cache='public, max-age=86400'):
    try:
        b = path.read_bytes()
    except OSError:
        handler.send_error(404); return
    handler.send_response(200)
    handler.send_header('Content-Type', ctype); handler.send_header('Content-Length', str(len(b)))
    handler.send_header('Cache-Control', cache); handler.end_headers(); handler.wfile.write(b)


def dispatch_get(handler, route):
    if route == '/api/hv/state':
        handler._json(state_doc()); return True
    m = re.fullmatch(r'/frame/hv/fonts/(sf-pro|sf-rounded)\.woff2', route)
    if m:
        _send_file(handler, config.resolve(config.get('fonts_dir')) / f'{m.group(1)}.woff2', 'font/woff2', 'public, max-age=2592000'); return True
    if route == '/api/hv/wallpapers':
        handler._json(wallpapers_doc()); return True
    m = re.fullmatch(r'/frame/hv/wallpapers/([A-Za-z0-9 _.-]{1,120})', route)
    if m and not m.group(1).startswith('.') and '..' not in m.group(1):
        ext = Path(m.group(1)).suffix.lower()
        if ext in WALL_TYPES:
            _send_file(handler, _walls() / m.group(1), WALL_TYPES[ext], 'public, max-age=2592000'); return True
    return False


def dispatch_post(handler, route):
    if route not in ('/api/hv/timer', '/api/hv/command'):
        return False
    # browser writes must come from the frame app itself
    origin = handler.headers.get('Origin', '')
    if urlparse(origin).netloc != handler.headers.get('Host'):
        handler._json({'ok': False, 'error': 'Open the frame app to use its controls'}, 403); return True
    try:
        size = int(handler.headers.get('Content-Length', '0'))
        if not 0 <= size <= 4096:
            raise ValueError('Request size is invalid')
        payload = json.loads(handler.rfile.read(size) or b'{}')
        if not isinstance(payload, dict):
            raise ValueError('Expected an object')
        if route == '/api/hv/timer':
            if payload.get('action') == 'start':
                r = start_timer(payload.get('label'), payload.get('seconds', 0))
            elif payload.get('action') == 'cancel':
                r = cancel_timer(id=str(payload.get('id', '')))
            else:
                raise ValueError('Unknown timer action')
        else:
            r = send_command(payload)
        handler._json(r)
    except (ValueError, TypeError) as e:
        handler._json({'ok': False, 'error': str(e)}, 400)
    return True
