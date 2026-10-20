"""Private metadata history and atomic undo that preserves later edits."""
import json,time,uuid
from .errors import AppError

FIELDS=('id','geo','captured','geo_locked','captured_locked','metadata_updated')

def snapshots(conn,ids):
    placeholders=','.join('?' for _ in ids)
    return [dict(r) for r in conn.execute('SELECT '+','.join(FIELDS)+' FROM photos WHERE deleted IS NULL AND id IN ('+placeholders+') ORDER BY id',ids)]

def record(conn,before,after,actor=None,action='save'):
    identifier=str(uuid.uuid4())
    conn.execute('INSERT INTO metadata_events(id,actor_id,action,created,before_json,after_json) VALUES(?,?,?,?,?,?)',(identifier,actor,action,time.time(),json.dumps(before,ensure_ascii=False),json.dumps(after,ensure_ascii=False)))
    return identifier

def serialize(rows):
    return [{**r,'geo':json.loads(r['geo']),'captured':json.loads(r['captured'])} for r in rows]

def history(db):
    events=[]
    for row in db.all('SELECT * FROM metadata_events ORDER BY created DESC LIMIT 20'):
        after=json.loads(row['after_json']);labels=sorted({json.loads(p['geo']).get('label','') for p in after})
        events.append({'id':row['id'],'created':row['created'],'count':len(after),'place':'、'.join(l for l in labels if l)[:240],'action':row['action'],'undoable':not row['undone_at'] and row['action'] in ('save','recovery')})
    return {'events':events}

def undo(db,identifier,actor=None):
    with db.connect() as conn:
        conn.execute('BEGIN IMMEDIATE')
        event=conn.execute('SELECT * FROM metadata_events WHERE id=?',(identifier,)).fetchone()
        if not event or event['undone_at'] or event['action'] not in ('save','recovery'):
            raise AppError('此修改已撤销或不可撤销','UNDO_UNAVAILABLE',409)
        before=json.loads(event['before_json']);after=json.loads(event['after_json']);ids=[r['id'] for r in after]
        current=snapshots(conn,ids)
        if current!=sorted(after,key=lambda r:r['id']):
            raise AppError('照片后来又被修改，已阻止撤销以保留新信息','METADATA_CHANGED',409)
        for row in before:
            conn.execute('UPDATE photos SET geo=?,captured=?,geo_locked=?,captured_locked=?,metadata_updated=? WHERE id=?',(row['geo'],row['captured'],row['geo_locked'],row['captured_locked'],time.time(),row['id']))
        restored=snapshots(conn,ids)
        conn.execute('UPDATE metadata_events SET undone_at=? WHERE id=?',(time.time(),identifier))
        record(conn,current,restored,actor,'undo')
    return {'updated':len(restored),'photos':serialize(restored)}
