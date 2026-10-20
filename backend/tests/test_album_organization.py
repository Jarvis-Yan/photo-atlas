from app.content.albums import merge, resolve
from app.media.processing import run_once
from test_workflows import stack, uploaded


def test_merge_preserves_union_and_old_links(stack):
    app, client, config = stack
    identifier, _ = uploaded(client)
    run_once(app.state.db, config)
    a = client.post('/api/admin/albums', json={'title': '云南旅行', 'kind': 'travel', 'published': True}).json()
    b = client.post('/api/admin/albums', json={'title': '云南旧册', 'kind': 'travel', 'published': True}).json()
    app.state.db.execute('INSERT INTO album_photos VALUES(?,?,0)', (a['id'], identifier))
    app.state.db.execute('INSERT INTO album_photos VALUES(?,?,0)', (b['id'], identifier))
    app.state.db.execute('UPDATE photos SET published=1 WHERE id=?', (identifier,))
    response = client.post('/api/admin/albums/'+b['id']+'/merge', json={'target_id': a['id']})
    assert response.status_code == 200
    assert resolve(app.state.db, b['slug'], public=True)['id'] == a['id']
    assert len(client.get('/api/public/albums/'+b['id']).json()['photos']) == 1
    assert client.get('/api/public/photos/'+identifier).json()['album_ids'] == [a['id']]
    assert app.state.db.one('SELECT COUNT(*) n FROM album_events')['n'] == 1
    assert client.get('/api/admin/albums').json()['albums'][0]['id'] == a['id']
    assert client.post('/api/admin/albums/'+a['id']+'/merge', json={'target_id': a['id']}).status_code == 409


def test_duplicate_names_and_recoverable_archive(stack):
    app, client, config = stack
    a = client.post('/api/admin/albums', json={'title': '  云南旅行  ', 'kind': 'travel'}).json()
    assert client.post('/api/admin/albums', json={'title': '云南 旅行', 'kind': 'travel'}).status_code == 409
    assert client.post('/api/admin/albums', json={'title': '云南旅行', 'kind': 'series'}).status_code == 200
    assert client.delete('/api/admin/albums/'+a['id']).status_code == 200
    assert client.get('/api/public/albums/'+a['id']).status_code == 404
    assert client.post('/api/admin/albums/'+a['id']+'/restore').status_code == 200
    restored = app.state.db.one('SELECT * FROM albums WHERE id=?', (a['id'],))
    assert restored['published'] == 0 and restored['archived_at'] is None
    assert client.post('/api/admin/uploads', json={'filename':'x.jpg','size':3,'sha256':'0'*64,'album_id':'missing'}).status_code == 404
