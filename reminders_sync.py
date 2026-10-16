"""Two-way sync between the Shopping list and an Apple Reminders list, through remindctl (EventKit) on the Mac.

    config.json:  "reminders": {"list": "Groceries", "days": 7, "interval": 30,
                                "skip": ["water", "salt", "pepper"], "remindctl": ""}

What syncs (every `interval` seconds, and a few seconds after any change on a frame):
  * every unchecked Shopping item (hand-added items; planned-dinner ingredients for the next `days` days too
    when shopping.from_meals is on)
    becomes a reminder in the list; the amount and the dinners go in its notes. Pantry staples in `skip` are left out.
  * a reminder added on a phone / Mac / Siri becomes a hand-added item on the frames.
  * checking off on either side checks off on the other (if both changed since the last sync, done wins).
  * a reminder deleted on the phone removes the hand-added item (an ingredient is checked off instead).
  * an item that leaves the list on the frame (removed, cleared, or its dinner changed) deletes its open reminder.
Runs remindctl as a subprocess; HomeView.app must have Reminders access (install-mac-native.sh asks for it).
State: <data_dir>/reminders_sync.json  {map: {item key: reminder id}, fdone: {key: bool}, rdone: {id: bool}}"""
import json, os, re, shutil, subprocess, sys, threading, time

import config
import meals_api

DEFAULT_SKIP = ["water", "cold water", "warm water", "hot water", "boiling water", "salt", "pepper", "black pepper",
                "salt and pepper", "ice", "ice cubes"]
MARK = "Added by HomeView"
MAX_CREATE = 60                       # per sync, so a first sync of a big plan can't run away

_lock = threading.Lock()
_kick = threading.Event()
_status = {'enabled': False, 'ok': None, 'error': None, 'last': None, 'list': None, 'items': 0}


class RemindError(Exception):
    pass


def settings():
    c = config.load().get('reminders')
    c = c if isinstance(c, dict) else {}
    try:
        days = max(1, min(21, int(c.get('days', 7))))
    except (TypeError, ValueError):
        days = 7
    try:
        interval = max(10, min(600, int(c.get('interval', 30))))
    except (TypeError, ValueError):
        interval = 30
    skip = c.get('skip')
    skip = [str(s) for s in skip] if isinstance(skip, list) else DEFAULT_SKIP
    return {'list': str(c.get('list') or '').strip(), 'days': days, 'interval': interval,
            'skip': {meals_api.ingredient_key(s) for s in skip}, 'bin': str(c.get('remindctl') or '').strip()}


def find_bin(conf):
    for p in (conf['bin'], shutil.which('remindctl'), '/opt/homebrew/bin/remindctl', '/usr/local/bin/remindctl'):
        if p and os.path.isfile(p) and os.access(p, os.X_OK):
            return p
    return None


def run(conf, *args, want_json=True):
    exe = find_bin(conf)
    if not exe:
        raise RemindError('remindctl is not installed on the server (brew install steipete/tap/remindctl)')
    cmd = [exe] + list(args) + (['--json'] if want_json else []) + ['--no-input', '--no-color']
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=30, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        raise RemindError('remindctl did not answer in time')
    if p.returncode != 0:
        msg = (p.stderr or p.stdout or '').strip().splitlines()
        msg = msg[-1] if msg else 'remindctl failed'
        if re.search(r'denied|not authori|permission|access', msg, re.I):
            msg = 'HomeView has no access to Reminders (System Settings > Privacy & Security > Reminders)'
        raise RemindError(msg[:200])
    if not want_json:
        return None
    try:
        return json.loads(p.stdout or 'null')
    except ValueError:
        raise RemindError('remindctl sent something unexpected')


# ------------------------------------------------------------------ state
def _state_file():
    return config.data_dir() / 'reminders_sync.json'


def _load():
    try:
        d = json.loads(_state_file().read_text())
    except (OSError, ValueError):
        d = {}
    for k in ('map', 'fdone', 'rdone', 'rtitle', 'ftitle'):
        d.setdefault(k, {})
    return d


def _save(d):
    p = _state_file(); tmp = p.with_suffix('.tmp')
    tmp.write_text(json.dumps(d, indent=1, sort_keys=True)); tmp.replace(p)


def _title(it):
    """What the reminder is called: hand-added items carry their count ('Milk ×2'); ingredients keep the name."""
    return meals_api.qty_title(it['name'], it.get('qty')) if it.get('added') else it['name']


def _notes(it):
    bits = [it['amount']] if it.get('amount') else []
    if it.get('meals'):
        bits.append('For ' + ', '.join(it['meals'][:3]))
    return '\n'.join(bits + [MARK])


# ------------------------------------------------------------------ one sync
def sync_once():
    conf = settings()
    if not conf['list']:
        _status.update(enabled=False, ok=None, error=None); return
    _status.update(enabled=True, list=conf['list'])
    with _lock:
        try:
            _sync(conf)
            _status.update(ok=True, error=None, last=time.time())
        except RemindError as e:
            _status.update(ok=False, error=str(e), last=time.time())


def _sync(conf):
    lst = conf['list']
    # make sure the list exists (reuses a matching list; never makes a second one)
    if not _status.get('list_ready') == lst:
        st = run(conf, 'status') or {}
        if isinstance(st, dict) and st.get('authorized') is False:
            try:
                run(conf, 'authorize', want_json=False)       # macOS asks once: allow HomeView to use Reminders
            except RemindError:
                pass
            st = run(conf, 'status') or {}
            if isinstance(st, dict) and st.get('authorized') is False:
                raise RemindError('HomeView has no access to Reminders yet: allow it when macOS asks, or in '
                                  'System Settings > Privacy & Security > Reminders')
        run(conf, 'list', lst, '--create', want_json=False)
        _status['list_ready'] = lst
    rem = run(conf, 'show', 'all', '--list', lst) or []
    R = {r['id']: r for r in rem if isinstance(r, dict) and r.get('id')}
    doc = meals_api.shopping_doc(conf['days'])
    F = {it['key']: it for it in doc['items'] if it['key'] not in conf['skip'] or it.get('added')}
    st = _load(); m, fdone, rdone, rtitle, ftitle = st['map'], st['fdone'], st['rdone'], st['rtitle'], st['ftitle']
    mapped_ids = set(m.values())

    # 1. reminders added on the phone / by Siri -> hand-added items on the frame
    for rid, r in R.items():
        if rid in mapped_ids or r.get('isCompleted'):
            continue
        name, q = meals_api.split_qty(r.get('title') or '')
        k = meals_api.ingredient_key(name)
        if not k:
            continue
        if k in m and m[k] in R:                      # a second reminder for something already linked: leave it
            continue
        if k not in F or F[k].get('added') or q:
            try:
                meals_api.add_item(name, set_qty=q or 1)
            except ValueError:
                continue
        elif F[k]['checked']:
            meals_api.check_item(k, False)
        m[k] = rid; mapped_ids.add(rid); fdone[k] = False; rdone[rid] = False
        rtitle[rid] = r.get('title') or ''; ftitle.pop(k, None)
    doc = meals_api.shopping_doc(conf['days'])
    F = {it['key']: it for it in doc['items'] if it['key'] not in conf['skip'] or it.get('added')}

    # 2. linked items: deletions and check-offs, both ways
    created = 0
    for k, it in F.items():
        rid = m.get(k)
        if rid and rid not in R:                      # deleted on the phone
            m.pop(k, None); rdone.pop(rid, None)
            if it.get('added'):
                try:
                    meals_api.remove_item(k)
                except ValueError:
                    pass
                fdone.pop(k, None)
            else:
                meals_api.check_item(k, True); fdone[k] = True
            continue
        if not rid:
            if it['checked']:
                fdone[k] = True; continue
            if created >= MAX_CREATE:
                continue
            want = _title(it)
            r = run(conf, 'add', want, '--list', lst, '--notes', _notes(it))
            rid = (r or {}).get('id')
            if not rid:
                continue
            m[k] = rid; fdone[k] = False; rdone[rid] = False; created += 1
            rtitle[rid] = want; ftitle[k] = want
            continue
        r = R[rid]; f_now, r_now = bool(it['checked']), bool(r.get('isCompleted'))
        f_chg = f_now != fdone.get(k, f_now); r_chg = r_now != rdone.get(rid, r_now)
        if f_now != r_now:
            if r_chg and not f_chg:
                meals_api.check_item(k, r_now); f_now = r_now
            elif f_chg and not r_chg:
                run(conf, 'edit', rid, '--complete' if f_now else '--incomplete'); r_now = f_now
            else:                                     # both changed, or no history: done wins
                done = f_now or r_now
                if f_now != done:
                    meals_api.check_item(k, done)
                if r_now != done:
                    run(conf, 'edit', rid, '--complete' if done else '--incomplete')
                f_now = r_now = done
        fdone[k] = f_now; rdone[rid] = r_now
        # the count, carried in the title: whichever side changed since the last sync wins
        want, have = _title(it), r.get('title') or ''
        name, q = meals_api.split_qty(have)
        same = meals_api.ingredient_key(name) == k and (q or 1) == ((it.get('qty') or 1) if it.get('added') else 1)
        if want != have and not same:                 # 'Milk ×2' and '2 Milk' say the same thing: leave the phone's wording
            r_t = have != rtitle.get(rid, have); f_t = want != ftitle.get(k, want)
            if r_t and not f_t and it.get('added') and meals_api.ingredient_key(name) == k:
                meals_api.set_qty(k, q or 1); want = have
            else:
                run(conf, 'edit', rid, '--title', want); have = want
        rtitle[rid] = have; ftitle[k] = _title(it) if same else want

    # 3. items gone from the frame list: delete their open reminders, forget the link
    for k in [k for k in m if k not in F]:
        rid = m.pop(k); fdone.pop(k, None); rdone.pop(rid, None); rtitle.pop(rid, None); ftitle.pop(k, None)
        r = R.get(rid)
        if r and not r.get('isCompleted'):
            try:
                run(conf, 'delete', rid, '--force', want_json=False)
            except RemindError:
                pass
    _status['items'] = len(m)
    _save(st)


# ------------------------------------------------------------------ background
def kick():
    """Something changed on a frame: sync in a moment."""
    _kick.set()


def _loop():
    time.sleep(3)
    while True:
        try:
            sync_once()
        except Exception as e:                        # never let the thread die
            _status.update(ok=False, error='Sync error: %s' % e)
            sys.stderr.write('reminders: %r\n' % e)
        _kick.wait(settings()['interval'])
        if _kick.is_set():
            _kick.clear(); time.sleep(2)              # let a burst of taps settle


def start():
    threading.Thread(target=_loop, daemon=True, name='reminders-sync').start()


def status_doc():
    return {'ok': True, **{k: v for k, v in _status.items() if k != 'list_ready'}}


def dispatch_get(handler, route):
    if route == '/api/reminders/status':
        handler._json(status_doc()); return True
    return False
