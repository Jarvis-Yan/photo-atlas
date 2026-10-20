"""Recoverable duplicate audit and publication of the explicitly requested library."""
import collections,json,time
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import uniform_filter


def similarity(config,a,b):
    if abs(a['width']/max(1,a['height'])-b['width']/max(1,b['height']))>.003:return 0,1
    arrays=[]
    for p in (a,b):
        with Image.open(config.data/'media'/p['id']/'960.webp') as im:
            arrays.append(np.asarray(im.convert('RGB').resize((256,192),Image.Resampling.LANCZOS),dtype=np.float32)/255)
    x,y=arrays;mx,my=uniform_filter(x,size=(7,7,1)),uniform_filter(y,size=(7,7,1))
    vx,vy=uniform_filter(x*x,size=(7,7,1))-mx*mx,uniform_filter(y*y,size=(7,7,1))-my*my
    cov=uniform_filter(x*y,size=(7,7,1))-mx*my
    score=((2*mx*my+.01**2)*(2*cov+.03**2))/((mx*mx+my*my+.01**2)*(vx+vy+.03**2))
    return float(np.clip(score,0,1).mean()),float(np.abs(x-y).mean())


def audit(db,config,only=None,publish=False):
    with db.connect() as conn:
        for archived in conn.execute("SELECT id,duplicate_of FROM photos WHERE deleted IS NOT NULL AND duplicate_of!=''").fetchall():
            if not conn.execute('SELECT id FROM photos WHERE id=? AND deleted IS NULL',(archived['duplicate_of'],)).fetchone():continue
            conn.execute('INSERT OR IGNORE INTO album_photos SELECT album_id,?,position FROM album_photos WHERE photo_id=?',(archived['duplicate_of'],archived['id']))
            conn.execute('INSERT OR IGNORE INTO photo_masters SELECT ?,original_path,original_name,sha256,size,created FROM photo_masters WHERE photo_id=?',(archived['duplicate_of'],archived['id']))
    rows=db.all("SELECT p.*,m.photo_id AS has_master FROM photos p LEFT JOIN photo_masters m ON m.photo_id=p.id WHERE p.deleted IS NULL AND p.processing='ready' ORDER BY p.published DESC,(m.photo_id IS NOT NULL) DESC,(p.width*p.height) DESC,p.created,p.id")
    target=set(only or [p['id'] for p in rows]);decisions=[];dupes={};uncertain=set();pairs=[];seen={}
    for i,p in enumerate(rows):
        keys=[('sha',p['sha256'],p['size'])]
        if p.get('pixel_hash'):keys.append(('pixels',p['pixel_hash']))
        known=next((seen[k] for k in keys if k in seen),None)
        if known:
            dupes[p['id']]=known;decisions.append({'id':p['id'],'keep':known,'decision':'duplicate','method':'file_or_normalized_pixels'});continue
        for k in keys:seen[k]=p['id']
        if not p.get('phash'):continue
        for q in rows[:i]:
            if q['id'] in dupes or (p['id'] not in target and q['id'] not in target) or not q.get('phash'):continue
            d=(int(p['phash'],16)^int(q['phash'],16)).bit_count()
            if d>10:continue
            try:score,error=similarity(config,p,q)
            except (OSError,ValueError):uncertain.update((p['id'],q['id']));continue
            a,b=json.loads(p['exif']).get('date'),json.loads(q['exif']).get('date')
            different_captures=bool(a and b and a!=b)
            verdict='distinct'
            if d<=2 and score>=.995 and error<=.006 and not different_captures:
                verdict='duplicate';dupes[p['id']]=q['id']
                decisions.append({'id':p['id'],'keep':q['id'],'decision':verdict,'method':'near_identical_render','ssim':round(score,6),'difference':round(error,6)})
            elif score>=.98 and not different_captures:verdict='review';uncertain.update((p['id'],q['id']))
            pairs.append({'ids':[q['id'],p['id']],'titles':[q['title'],p['title']],'decision':verdict,'ssim':round(score,6),'difference':round(error,6)})
            if verdict=='duplicate':break
    with db.connect() as conn:
        conn.execute('BEGIN IMMEDIATE')
        for removed,keep in dupes.items():
            while keep in dupes:keep=dupes[keep]
            conn.execute('INSERT OR IGNORE INTO album_photos SELECT album_id,?,position FROM album_photos WHERE photo_id=?',(keep,removed))
            conn.execute('INSERT OR IGNORE INTO photo_masters SELECT ?,original_path,original_name,sha256,size,created FROM photo_masters WHERE photo_id=?',(keep,removed))
            conn.execute('UPDATE albums SET cover_id=? WHERE cover_id=?',(keep,removed))
            record=next(d for d in decisions if d['id']==removed)
            conn.execute('UPDATE photos SET deleted=?,published=0,publish_requested=0,duplicate_of=?,duplicate_audit=? WHERE id=?',(time.time(),keep,json.dumps(record),removed))
        for row in rows:
            if row['id'] in dupes:continue
            relevant=[p for p in pairs if row['id'] in p['ids']]
            if row['id'] in target or publish:
                pending=row['id'] in uncertain
                conn.execute('UPDATE photos SET similarity_reviewed=?,duplicate_audit=? WHERE id=?',(int(not pending),json.dumps({'decision':'review' if pending else 'distinct','pairs':relevant},ensure_ascii=False),row['id']))
                if publish and not pending:conn.execute('UPDATE photos SET published=1 WHERE id=?',(row['id'],))
        if publish:
            conn.execute('UPDATE albums SET published=1 WHERE EXISTS(SELECT 1 FROM album_photos ap JOIN photos p ON p.id=ap.photo_id WHERE ap.album_id=albums.id AND p.published=1 AND p.deleted IS NULL)')
    report={'ready_checked':len(rows),'duplicates_archived':len(dupes),'needs_duplicate_review':len(uncertain-set(dupes)),'pairs':pairs,'decisions':decisions}
    return report


def publish_requested(db,config,identifier):
    photo=db.one('SELECT publish_requested FROM photos WHERE id=? AND deleted IS NULL',(identifier,))
    if photo and photo['publish_requested']:
        result=audit(db,config,only=[identifier])
        db.execute("UPDATE photos SET published=1 WHERE id=? AND deleted IS NULL AND processing='ready' AND similarity_reviewed=1 AND duplicate_of=''",(identifier,))
        db.execute('UPDATE albums SET published=1 WHERE id IN (SELECT album_id FROM album_photos WHERE photo_id=?)',(identifier,))


def stats(db):
    rows=db.all('SELECT processing,published,geo,captured,duplicate_audit FROM photos WHERE deleted IS NULL')
    return {'total':len(rows),'published':sum(p['published'] for p in rows),'processing':dict(collections.Counter(p['processing'] for p in rows)),
      'located':sum(json.loads(p['geo']).get('status') in ('resolved','approximate') for p in rows),
      'dated':sum(bool(json.loads(p['captured']).get('value')) for p in rows),
      'location_review':sum(json.loads(p['geo']).get('status')=='unknown' or bool(json.loads(p['geo']).get('conflict')) for p in rows),
      'date_review':sum(not json.loads(p['captured']).get('value') for p in rows),
      'duplicate_review':sum(json.loads(p['duplicate_audit']).get('decision')=='review' for p in rows)}


def resolve_pair(db,ids,keep=None):
    if len(set(ids))!=2 or keep is not None and keep not in ids:
        from .errors import AppError
        raise AppError('请选择一组照片','INVALID_REVIEW',422)
    with db.connect() as conn:
        conn.execute('BEGIN IMMEDIATE')
        for identifier in ids:
            if not conn.execute('SELECT id FROM photos WHERE id=? AND deleted IS NULL',(identifier,)).fetchone():
                from .errors import AppError
                raise AppError('照片已变化，请刷新','NOT_FOUND',404)
        if keep:
            removed=next(i for i in ids if i!=keep)
            conn.execute('INSERT OR IGNORE INTO album_photos SELECT album_id,?,position FROM album_photos WHERE photo_id=?',(keep,removed))
            conn.execute('INSERT OR IGNORE INTO photo_masters SELECT ?,original_path,original_name,sha256,size,created FROM photo_masters WHERE photo_id=?',(keep,removed))
            conn.execute('UPDATE albums SET cover_id=? WHERE cover_id=?',(keep,removed))
            conn.execute('UPDATE photos SET deleted=?,published=0,publish_requested=0,duplicate_of=? WHERE id=?',(time.time(),keep,removed))
        for identifier in ids:
            if keep and identifier!=keep:continue
            conn.execute('UPDATE photos SET similarity_reviewed=1,duplicate_audit=?,published=CASE WHEN publish_requested=1 AND processing=\'ready\' THEN 1 ELSE published END WHERE id=?',(json.dumps({'decision':'manual_distinct' if not keep else 'manual_keep','ids':ids}),identifier))
    return {'updated':len(ids)}
