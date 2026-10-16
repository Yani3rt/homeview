"""One-time Spotify sign-in for the Music screen.

    python3 scripts/spotify_auth.py url            # print the sign-in link
    python3 scripts/spotify_auth.py listen         # wait up to 10 min on 127.0.0.1:8890 for the redirect
    python3 scripts/spotify_auth.py code '<the full 127.0.0.1 URL you were sent to>'

Spotify only redirects to https or to a loopback IP, so the dashboard needs the redirect URI
http://127.0.0.1:8890/callback. If you approve on another computer, its browser lands on a page that
won't load; copy that address bar URL and pass it to `code` here: it carries the one-time code.

App keys: config.json `spotify.client_id` and `spotify.client_secret` (your own app at
https://developer.spotify.com/dashboard). Writes <data_dir>/spotify_token.json
{refresh_token, scope, obtained_at} (mode 600). If the token stops working, run this again."""
import base64, http.server, json, os, secrets, sys, time, urllib.parse, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config  # noqa: E402

CONF = config.data_dir()
REDIRECT = config.get('spotify').get('redirect_uri') or 'http://127.0.0.1:8890/callback'
SCOPES = 'user-read-playback-state user-modify-playback-state user-read-private playlist-read-private playlist-read-collaborative user-library-read user-read-recently-played user-top-read user-follow-read user-read-currently-playing'
STATE_FILE = CONF / 'spotify_auth_state'


def app():
    sp = config.get('spotify')
    if not sp.get('client_id') or not sp.get('client_secret'):
        sys.exit('Put your Spotify app client_id and client_secret in config.json first (see README.md).')
    return sp


def auth_url():
    st = secrets.token_urlsafe(16)
    STATE_FILE.write_text(st); os.chmod(STATE_FILE, 0o600)
    q = {'client_id': app()['client_id'], 'response_type': 'code', 'redirect_uri': REDIRECT, 'scope': SCOPES, 'state': st, 'show_dialog': 'true'}
    return 'https://accounts.spotify.com/authorize?' + urllib.parse.urlencode(q)


def exchange(code):
    a = app()
    body = urllib.parse.urlencode({'grant_type': 'authorization_code', 'code': code, 'redirect_uri': REDIRECT}).encode()
    req = urllib.request.Request('https://accounts.spotify.com/api/token', data=body, headers={
        'Authorization': 'Basic ' + base64.b64encode(f"{a['client_id']}:{a['client_secret']}".encode()).decode(),
        'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'HomeView/1'})
    with urllib.request.urlopen(req, timeout=20) as r:
        tok = json.loads(r.read())
    out = CONF / 'spotify_token.json'
    out.write_text(json.dumps({'refresh_token': tok['refresh_token'], 'scope': tok.get('scope', ''), 'obtained_at': int(time.time())}))
    os.chmod(out, 0o600)
    # prove it works: one read-only call, print only non-secret facts
    me = urllib.request.Request('https://api.spotify.com/v1/me', headers={'Authorization': 'Bearer ' + tok['access_token'], 'User-Agent': 'HomeView/1'})
    with urllib.request.urlopen(me, timeout=20) as r:
        d = json.loads(r.read())
    print('signed in as', d.get('display_name') or d.get('id'), '| product:', d.get('product'), '| scopes:', len(tok.get('scope', '').split()))


def from_url(u):
    q = urllib.parse.parse_qs(urllib.parse.urlparse(u).query)
    if 'error' in q:
        sys.exit('Spotify said: ' + q['error'][0])
    if STATE_FILE.exists() and q.get('state', [''])[0] != STATE_FILE.read_text():
        sys.exit('That link is from a different sign-in attempt; run `url` again.')
    exchange(q['code'][0])


def listen():
    done = {}
    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if not self.path.startswith('/callback'):
                self.send_error(404); return
            try:
                from_url('http://127.0.0.1:8890' + self.path); msg, done['ok'] = 'Signed in. You can close this tab.', True
            except SystemExit as e:
                msg = str(e)
            b = msg.encode(); self.send_response(200); self.send_header('Content-Type', 'text/plain'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
        def log_message(self, *a): pass
    s = http.server.HTTPServer(('127.0.0.1', 8890), H); s.timeout = 5
    end = time.time() + 600
    while time.time() < end and not done:
        s.handle_request()
    print('done' if done else 'timed out waiting for the redirect')


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'url'
    if cmd == 'url':
        print(auth_url())
    elif cmd == 'listen':
        listen()
    elif cmd == 'code':
        from_url(sys.argv[2])
