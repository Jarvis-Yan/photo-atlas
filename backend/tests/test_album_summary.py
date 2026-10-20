import json
from app.content.album_summary import summarize
from test_workflows import stack, uploaded
from app.media.processing import run_once


def test_album_summary_uses_all_known_dates_and_places():
    result=summarize([
        {'captured':{'value':'2026-10-01'},'geo':{'label':'云南 大理'}},
        {'captured':json.dumps({'value':'2024'}),'geo':json.dumps({'label':'云南 沙溪古镇'})},
        {'captured':{'value':'2026'},'geo':{'label':'云南 大理'}},
        {'captured':{'value':'not-a-date'},'geo':{}},
    ])
    assert result=={'years':[2024,2026],'places':['云南 大理','云南 沙溪古镇']}
    assert summarize([])=={'years':[],'places':[]}


def test_public_album_summary_excludes_unpublished_members(stack):
    app,client,config=stack
    identifier,_=uploaded(client);run_once(app.state.db,config)
    album=client.post('/api/admin/albums',json={'title':'旅行记录','kind':'travel','published':True}).json()
    app.state.db.execute('INSERT INTO album_photos VALUES(?,?,0)',(album['id'],identifier))
    app.state.db.execute('UPDATE photos SET captured=?,geo=? WHERE id=?',(json.dumps({'value':'2024-03-12'}),json.dumps({'label':'云南 大理'}),identifier))
    public=client.get('/api/public/site').json()['albums'][0]
    assert public['years']==[] and public['places']==[] and public['count']==0
    app.state.db.execute('UPDATE photos SET published=1 WHERE id=?',(identifier,))
    public=client.get('/api/public/site').json()['albums'][0]
    assert public['years']==[2024] and public['places']==['云南 大理'] and public['count']==1
    app.state.db.execute('UPDATE photos SET deleted=123 WHERE id=?',(identifier,))
    public=client.get('/api/public/site').json()['albums'][0]
    assert public['years']==[] and public['places']==[]
