"""Camera: an RTSP camera relayed to the frames as MJPEG (/api/camera/*).

The frames' old WebView cannot play RTSP, and decoding H.264 in the page would be too heavy for them.
So the server runs ONE ffmpeg that reads the camera (use its low-resolution sub-stream) and re-encodes
it to small JPEG frames. Every frame watching gets the same frames over one long HTTP response
(multipart/x-mixed-replace), which an <img> shows natively: no JavaScript decoding on the frame.

ffmpeg runs only while someone watches, plus LINGER seconds (so going back and forth is instant).
The camera URL (with its password) stays in config.json; it is never sent to the frames or put in
an error message.

Several cameras: each has its own ffmpeg, started only while someone watches that camera.

config.json:
  "cameras": [
    {"name": "Front door", "url": "rtsp://10.0.0.50:554/stream2", "username": "user", "password": "pass",
     "fps": 10, "width": 640, "quality": 7, "ffmpeg": "", "default": true},
    {"name": "Backyard", "url": "rtsp://user:pass@10.0.0.51:554/sub"}]
  (the older single "camera": {...} still works). "default": true picks the camera the screen opens on
  (else the first). fps 1-25, width 160-1920 (never upscaled), quality 2 (best) to 31 (smallest);
  ffmpeg = path if not found. A camera's id is its name in lowercase letters and digits ("frontdoor").

Every route takes ?cam=<id> (missing or unknown: the default camera).
GET /api/camera/status        {ok, enabled, id, name, live, age, viewers, error, cameras, default}
                              (?watch=1 keeps that camera running)
GET /api/camera/stream.mjpg   the live MJPEG stream
GET /api/camera/snapshot.jpg  the latest frame (starts the camera if needed)"""
import os, re, shutil, subprocess, threading, time

import config

LINGER = 20          # seconds ffmpeg keeps running after the last viewer leaves
STALL = 10           # no frame for this long: the stream is not live, restart ffmpeg
MAX_VIEWERS = 6
MAX_FRAME = 2_000_000
BOUNDARY = 'hvframe'

_lock = threading.Lock()
_cond = threading.Condition(_lock)
_cams = {}           # camera id -> its state (below)


def _new_state():
    return {'proc': None, 'frame': None, 'seq': 0, 'at': 0.0, 'viewers': 0, 'last_seen': 0.0,
            'error': None, 'detail': None, 'started': 0.0, 'key': None, 'fails': 0, 'watcher': None}


def _st(cid):
    """The state of camera cid (created on first use). Caller holds _lock."""
    if cid not in _cams:
        _cams[cid] = _new_state()
    return _cams[cid]


def _one(c, cid=''):
    def num(k, d, lo, hi):
        try:
            return max(lo, min(hi, int(c.get(k, d))))
        except (TypeError, ValueError):
            return d
    url = str(c.get('url') or '').strip()
    user, pw = str(c.get('username') or ''), str(c.get('password') or '')
    m = re.match(r'^(rtsps?://)(?:[^@/]*@)?(.*)$', url, re.I)
    if user and m:                              # separate username/password (like Home Assistant): put them in the URL, encoded
        from urllib.parse import quote
        url = m.group(1) + quote(user, safe='') + ':' + quote(pw, safe='') + '@' + m.group(2)
    return {'id': cid, 'name': str(c.get('name') or 'Camera')[:40], 'url': url,
            'fps': num('fps', 10, 1, 25), 'width': num('width', 640, 160, 1920),
            'quality': num('quality', 7, 2, 31), 'ffmpeg': str(c.get('ffmpeg') or '').strip()}


def all_settings():
    """Every configured camera's settings, in config order, and the default camera's id."""
    cams = config.camera_list()
    return [_one(c, c['id']) for c in cams], (cams[config.cam_default(cams)]['id'] if cams else '')


def settings(cid=None):
    """One camera's settings: cid, or the default camera when cid is missing or unknown.
    With no camera set up, a disabled placeholder (url '')."""
    cams, dflt = all_settings()
    for c in cams:
        if c['id'] == cid:
            return c
    for c in cams:
        if c['id'] == dflt:
            return c
    return _one({}, '')


def enabled(cid=None):
    return bool(settings(cid)['url'])


def find_ffmpeg(conf=None):
    conf = conf or settings()
    for p in (conf['ffmpeg'], shutil.which('ffmpeg'), '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'):
        if p and os.path.isfile(p) and os.access(p, os.X_OK):
            return p
    return None


def build_cmd(conf, ffmpeg):
    url = conf['url']
    cmd = [ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error']
    if url.lower().startswith(('rtsp://', 'rtsps://')):
        # TCP: no smeared frames on Wi-Fi. timeout (microseconds): give up on a dead camera.
        cmd += ['-rtsp_transport', 'tcp', '-timeout', '5000000']
    elif not re.match(r'^[a-z]+://', url, re.I):
        cmd += ['-re', '-stream_loop', '-1']          # a local video file (testing): play it in real time, forever
    cmd += ['-fflags', 'nobuffer', '-flags', 'low_delay', '-analyzeduration', '1000000', '-probesize', '500000',
            '-i', url, '-an', '-sn', '-dn',
            '-vf', "fps=%d,scale='min(%d,iw)':-2:flags=fast_bilinear" % (conf['fps'], conf['width']),
            '-c:v', 'mjpeg', '-q:v', str(conf['quality']), '-pix_fmt', 'yuvj420p', '-f', 'mjpeg', 'pipe:1']
    return cmd


def _clean_error(text, conf):
    text = (text or '').replace(conf['url'], '<camera>')
    text = re.sub(r'\w+://[^\s]+', '<camera>', text)          # never leak a URL or password
    low = text.lower()
    for keys, msg in ((('401', 'unauthorized'), 'The camera refused the user name or password in config.json'),
                      (('404', 'not found'), 'The camera has no stream at that address (check the path in config.json)'),
                      (('connection refused',), 'The camera refused the connection (check the IP address and port)'),
                      (('timed out', 'timeout', 'no route to host', 'network is unreachable', 'host is down'),
                       'The camera is not answering. Is it on and on the Wi-Fi?')):
        if any(k in low for k in keys):
            return msg
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    return (lines[-1] if lines else 'The camera stopped sending video')[:160]


def _raw_line(text, conf):
    """ffmpeg's own last error line, with the camera URL and any credentials removed (for diagnosis)."""
    text = (text or '').replace(conf['url'], '<camera>')
    text = re.sub(r'\w+://[^\s]+', '<camera>', text)
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    return (lines[-1] if lines else '(no output)')[:200]


def _reader(proc, conf, st):
    """Split ffmpeg's MJPEG output into JPEGs (each starts FFD8 and ends FFD9) and publish the newest."""
    buf = b''
    out = proc.stdout
    while True:
        chunk = out.read1(65536) if hasattr(out, 'read1') else out.read(65536)
        if not chunk:
            break
        buf += chunk
        while True:
            s = buf.find(b'\xff\xd8')
            if s < 0:
                buf = buf[-1:]; break
            e = buf.find(b'\xff\xd9', s + 2)
            if e < 0:
                buf = buf[s:]
                if len(buf) > MAX_FRAME:
                    buf = b''
                break
            jpg = buf[s:e + 2]; buf = buf[e + 2:]
            with _cond:
                if st['proc'] is proc:
                    st['frame'], st['at'] = jpg, time.time()
                    st['seq'] += 1; st['error'] = None; st['fails'] = 0
                    _cond.notify_all()
    err = b''
    try:
        err = proc.stderr.read() or b''
    except Exception:
        pass
    proc.wait()
    with _cond:
        if st['proc'] is proc:
            st['proc'] = None; st['fails'] += 1
            raw = err.decode('utf-8', 'replace')
            st['error'] = _clean_error(raw, conf)
            st['detail'] = _raw_line(raw, conf)
            _cond.notify_all()
    import sys
    sys.stderr.write('camera %s: ffmpeg stopped: %s\n' % (conf['id'], _raw_line(err.decode('utf-8', 'replace'), conf))); sys.stderr.flush()


def _start_locked(cid):
    """Start camera cid's ffmpeg if someone wants video and it is not running. Caller holds _lock."""
    conf = settings(cid)
    st = _st(cid)
    key = (conf['url'], conf['fps'], conf['width'], conf['quality'])
    p = st['proc']
    if p and p.poll() is None and st['key'] == key:
        return
    if p:
        _kill(p)
        st['proc'] = None
    if not conf['url'] or conf['id'] != cid:
        st['error'] = 'No camera is set up in config.json'; return
    ff = find_ffmpeg(conf)
    if not ff:
        st['error'] = 'ffmpeg is not installed on the server (brew install ffmpeg)'; return
    # back off after repeated failures, so a camera that is off is not hammered
    wait = min(8, 2 ** min(st['fails'], 3)) if st['fails'] else 0
    if time.time() - st['started'] < wait:
        return
    try:
        proc = subprocess.Popen(build_cmd(conf, ff), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, bufsize=0)
    except OSError as e:
        st['error'] = 'Could not start ffmpeg: %s' % e.strerror; st['fails'] += 1; st['started'] = time.time(); return
    st.update(proc=proc, key=key, started=time.time())
    threading.Thread(target=_reader, args=(proc, conf, st), daemon=True, name='camera-reader-' + cid).start()


def _kill(p):
    try:
        p.terminate()
        try:
            p.wait(2)
        except subprocess.TimeoutExpired:
            p.kill()
    except Exception:
        pass


def _watch(cid):
    """Stop camera cid's ffmpeg when nobody watched it for LINGER s; restart it when it stalls while watched.
    Also stops it when the camera was removed from config.json."""
    while True:
        time.sleep(2)
        gone = settings(cid)['id'] != cid
        with _cond:
            st = _st(cid); p = st['proc']; now = time.time()
            if gone or (st['viewers'] <= 0 and now - st['last_seen'] > LINGER):
                if p:
                    _kill(p); st['proc'] = None
                st['frame'] = None
                st['watcher'] = None
                return
            if p and now - max(st['at'], st['started']) > STALL:
                _kill(p); st['proc'] = None; st['fails'] += 1
                st['error'] = 'The camera is not sending video'
            if not st['proc'] and (st['viewers'] > 0 or now - st['last_seen'] < LINGER):
                _start_locked(cid)


def _ensure_watcher_locked(cid):
    st = _st(cid)
    if not (st['watcher'] and st['watcher'].is_alive()):
        if not st['proc']:
            st['fails'] = 0                       # a fresh start after an idle spell: no backoff
        st['watcher'] = threading.Thread(target=_watch, args=(cid,), daemon=True, name='camera-watch-' + cid)
        st['watcher'].start()


def _want(cid):
    with _cond:
        _st(cid)['last_seen'] = time.time()
        _ensure_watcher_locked(cid)
        _start_locked(cid)


def status_doc(watch=False, cid=None):
    """watch=True (the Camera page polls with ?watch=1): someone is looking, keep that camera running."""
    cams, dflt = all_settings()
    conf = settings(cid)
    cid = conf['id']
    if watch and conf['url']:
        _want(cid)
    with _cond:
        st = _st(cid)
        now = time.time()
        if st['viewers'] > 0:
            st['last_seen'] = now
        age = round(now - st['at'], 1) if st['frame'] else None
        live = bool(st['proc'] and st['frame'] and age is not None and age < 4)
        return {'ok': True, 'enabled': bool(conf['url']), 'id': cid, 'name': conf['name'], 'live': live, 'age': age,
                'viewers': st['viewers'], 'fps': conf['fps'], 'error': None if live else st['error'],
                'detail': None if live else st.get('detail'), 'ffmpeg': find_ffmpeg(conf),
                'cameras': [{'id': c['id'], 'name': c['name']} for c in cams], 'default': dflt}


def latest(cid=None, timeout=8.0):
    cid = settings(cid)['id']
    _want(cid)
    end = time.time() + timeout
    with _cond:
        st = _st(cid)
        while True:
            if st['frame'] and time.time() - st['at'] < 4:
                return st['frame']
            left = end - time.time()
            if left <= 0:
                return None
            _cond.wait(min(left, 1.0))
            _start_locked(cid)


def stream(handler, cid=None):
    cid = settings(cid)['id']
    with _cond:
        st = _st(cid)
        if st['viewers'] >= MAX_VIEWERS:
            handler._json({'ok': False, 'error': 'Too many screens are watching the camera'}, 503); return
        st['viewers'] += 1; st['last_seen'] = time.time()
        _ensure_watcher_locked(cid)
        _start_locked(cid)
    handler.close_connection = True
    try:
        handler.connection.settimeout(15)         # a frame that went away must not hold a thread forever
        handler.send_response(200)
        handler.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=' + BOUNDARY)
        handler.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        handler.send_header('Pragma', 'no-cache')
        handler.send_header('Connection', 'close')
        handler.end_headers()
        seq = 0
        while True:
            with _cond:
                got = _cond.wait_for(lambda: st['seq'] != seq and st['frame'] is not None
                                     and time.time() - st['at'] < 2, timeout=STALL)
                if not got:
                    break                        # camera stalled: end the response; the page reconnects
                jpg, seq = st['frame'], st['seq']
                st['last_seen'] = time.time()
            handler.wfile.write(b'--' + BOUNDARY.encode() + b'\r\nContent-Type: image/jpeg\r\nContent-Length: '
                                + str(len(jpg)).encode() + b'\r\n\r\n' + jpg + b'\r\n')
            handler.wfile.flush()
    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, TimeoutError, OSError):
        pass
    finally:
        with _cond:
            st['viewers'] = max(0, st['viewers'] - 1); st['last_seen'] = time.time()


def _query(handler):
    from urllib.parse import parse_qs
    return parse_qs((handler.path.split('?', 1) + [''])[1])


def dispatch_get(handler, route):
    if not route.startswith('/api/camera/'):
        return False
    q = _query(handler)
    cid = (q.get('cam') or [None])[0]
    if route == '/api/camera/status':
        handler._json(status_doc(watch=(q.get('watch') or [''])[0] == '1', cid=cid)); return True
    if not enabled(cid):
        handler._json({'ok': False, 'error': 'No camera is set up in config.json'}, 404); return True
    if route == '/api/camera/stream.mjpg':
        stream(handler, cid); return True
    if route == '/api/camera/snapshot.jpg':
        jpg = latest(cid)
        if not jpg:
            handler._json({'ok': False, 'error': status_doc(cid=cid)['error'] or 'The camera did not answer'}, 503); return True
        handler.send_response(200)
        handler.send_header('Content-Type', 'image/jpeg'); handler.send_header('Content-Length', str(len(jpg)))
        handler.send_header('Cache-Control', 'no-store'); handler.end_headers(); handler.wfile.write(jpg)
        return True
    handler._json({'ok': False, 'error': 'Not found'}, 404); return True


def stop():
    with _cond:
        for st in _cams.values():
            if st['proc']:
                _kill(st['proc']); st['proc'] = None
