from app.media.processing import run_once
from test_workflows import stack,uploaded
from test_daily_home import colored_png


def test_existing_place_protection_and_recoverable_undo(stack):
 app,c,config=stack;p,_=uploaded(c);run_once(app.state.db,config)
 first=c.post('/api/admin/library/metadata',json={'ids':[p],'place':'东京','date':'2024-04'}).json()
 version=first['photos'][0]['metadata_updated']
 rejected=c.post('/api/admin/library/metadata',json={'ids':[p],'place':'北京','expected':{p:version}})
 assert rejected.status_code==409 and rejected.json()['code']=='KNOWN_PLACE_PROTECTED'
 accepted=c.post('/api/admin/library/metadata',json={'ids':[p],'place':'北京','expected':{p:version},'overwrite_place':True})
 assert accepted.status_code==200
 event=accepted.json()['history_id']
 assert c.get('/api/admin/library/metadata-history').json()['events'][0]['id']==event
 restored=c.post('/api/admin/library/metadata-history/'+event+'/undo')
 assert restored.status_code==200 and restored.json()['photos'][0]['geo']['label']=='东京'
 assert restored.json()['photos'][0]['captured']['value']=='2024-04'
 assert c.post('/api/admin/library/metadata-history/'+event+'/undo').status_code==409


def test_batch_preview_versions_and_atomic_failure(stack):
 app,c,config=stack;ids=[]
 for color in [30,180]:
  p,_=uploaded(c,colored_png(color));run_once(app.state.db,config);ids.append(p)
 assert c.post('/api/admin/library/metadata',json={'ids':ids,'place':'北京'}).status_code==409
 versions={p:app.state.db.one('SELECT metadata_updated FROM photos WHERE id=?',(p,))['metadata_updated'] for p in ids}
 saved=c.post('/api/admin/library/metadata',json={'ids':[ids[1]],'date':'2024'})
 assert saved.status_code==200
 assert c.post('/api/admin/library/metadata',json={'ids':ids,'place':'东京','expected':versions}).status_code==409
 assert app.state.db.one('SELECT geo_locked FROM photos WHERE id=?',(ids[0],))['geo_locked']==0


def test_undo_rejects_subsequent_edits(stack):
 app,c,config=stack;p,_=uploaded(c);run_once(app.state.db,config)
 first=c.post('/api/admin/library/metadata',json={'ids':[p],'place':'未定位地点'}).json()
 assert c.post('/api/admin/library/metadata',json={'ids':[p],'date':'2024-05'}).status_code==200
 blocked=c.post('/api/admin/library/metadata-history/'+first['history_id']+'/undo')
 assert blocked.status_code==409 and blocked.json()['code']=='METADATA_CHANGED'
 assert app.state.db.one('SELECT captured FROM photos WHERE id=?',(p,))['captured'].find('2024-05')>=0
