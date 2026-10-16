#!/usr/bin/env python3
# fake remindctl: a JSON file store, same CLI shapes and JSON fields as the real one
import json, os, sys, uuid
DB=os.environ.get('FAKE_REM_DB','/tmp/fakerem.json')
try: d=json.load(open(DB))
except Exception: d={'lists':[],'items':[]}
a=[x for x in sys.argv[1:] if x not in('--json','--no-input','--no-color','--force')]
def opt(n):
    return a[a.index(n)+1] if n in a else None
def save(): json.dump(d,open(DB,'w'))
def item(r): return dict(r)
cmd=a[0]
if cmd=='status':
    print(json.dumps({'status':'fullAccess','authorized':True}))
elif cmd=='list':
    name=a[1]
    if '--create' in a and name not in d['lists']: d['lists'].append(name)
    save(); print('{}')
elif cmd=='show':
    L=opt('--list'); print(json.dumps([r for r in d['items'] if r['listName']==L]))
elif cmd=='add':
    r={'id':uuid.uuid4().hex.upper(),'title':a[1],'notes':opt('--notes'),'isCompleted':False,'listName':opt('--list'),'listID':'L1','priority':'none','dueDateIsAllDay':False}
    d['items'].append(r); save(); print(json.dumps(r))
elif cmd=='edit':
    r=[x for x in d['items'] if x['id'].startswith(a[1])][0]
    if '--title' in a: r['title']=opt('--title')
    if '--complete' in a: r['isCompleted']=True
    if '--incomplete' in a: r['isCompleted']=False
    save(); print(json.dumps(r))
elif cmd=='delete':
    d['items']=[x for x in d['items'] if not x['id'].startswith(a[1])]; save()
