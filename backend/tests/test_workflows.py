import hashlib
import io
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from app.main import create_app
from app.config import Settings
from app.media.processing import run_once

PASSWORD='integration-only-passphrase'
@pytest.fixture
def stack(tmp_path):
    config=Settings(tmp_path/'data',tmp_path/'db.sqlite',tmp_path/'dist','http://testserver','admin',PASSWORD,False,'',chunk_size=256)
    app=create_app(config)
    with TestClient(app) as client:
        response=client.post('/api/auth/login',json={'username':'admin','password':PASSWORD})
        assert response.status_code==200
        client.headers['X-CSRF-Token']=response.json()['csrf']
        yield app,client,config

def png():
    image=Image.new('RGB',(80,60),(12,66,130));out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()

def uploaded(client,content=None):
    content=content or png();sha=hashlib.sha256(content).hexdigest()
    init={'filename':'../original.png','size':len(content),'sha256':sha}
    u=client.post('/api/admin/uploads',json=init).json()
    assert client.post('/api/admin/uploads',json=init).json()['id']==u['id']
    for n in range(u['chunks']):
        data=content[n*u['chunk_size']:(n+1)*u['chunk_size']]
        r=client.put('/api/admin/uploads/'+u['id']+'/chunks/'+str(n),content=data,headers={'X-Chunk-SHA256':hashlib.sha256(data).hexdigest()})
        assert r.status_code==200
    r=client.post('/api/admin/uploads/'+u['id']+'/complete')
    assert r.status_code==200
    assert client.post('/api/admin/uploads/'+u['id']+'/complete').json()['photo_id']==r.json()['photo_id']
    return r.json()['photo_id'],sha

def test_cookie_csrf_origin_and_logout(stack):
    app,client,config=stack
    assert client.cookies.get('pa_session')
    assert client.put('/api/admin/settings',json={},headers={'X-CSRF-Token':''}).status_code==403
    assert client.post('/api/auth/login',json={'username':'admin','password':PASSWORD},headers={'Origin':'https://evil.example'}).status_code==403
    assert client.post('/api/auth/logout').status_code==200
    assert client.get('/api/admin/photos').status_code==401

def test_resume_checksum_missing_chunks_and_worker_restart(stack):
    app,client,config=stack
    data=png()+b'padding'*300
    u=client.post('/api/admin/uploads',json={'filename':'test.png','size':len(data),'sha256':hashlib.sha256(data).hexdigest()}).json()
    assert client.post('/api/admin/uploads/'+u['id']+'/complete').status_code==409
    assert client.put('/api/admin/uploads/'+u['id']+'/chunks/0',content=data[:256],headers={'X-Chunk-SHA256':'0'*64}).status_code==422
    r=client.put('/api/admin/uploads/'+u['id']+'/chunks/0',content=data[:256],headers={'X-Chunk-SHA256':hashlib.sha256(data[:256]).hexdigest()})
    assert r.json()['received']==[0]
    restarted=create_app(config)
    with TestClient(restarted) as c:
        c.cookies.update(client.cookies);c.headers.update({'X-CSRF-Token':client.headers['X-CSRF-Token']})
        assert c.get('/api/admin/uploads/'+u['id']).json()['received']==[0]
        for n in range(1,u['chunks']):
            block=data[n*256:(n+1)*256]
            assert c.put('/api/admin/uploads/'+u['id']+'/chunks/'+str(n),content=block,headers={'X-Chunk-SHA256':hashlib.sha256(block).hexdigest()}).status_code==200
        p=c.post('/api/admin/uploads/'+u['id']+'/complete').json()['photo_id']
        assert run_once(restarted.state.db,config)
        assert c.get('/api/admin/photos').json()['photos'][0]['processing']=='ready'
        assert hashlib.sha256(c.get('/api/admin/photos/'+p+'/original').content).hexdigest()==hashlib.sha256(data).hexdigest()

def test_draft_publish_unpublish_and_archive_privacy(stack):
    app,client,config=stack;p,sha=uploaded(client)
    with TestClient(app) as guest:
        assert guest.get('/media/'+p+'/960.webp').status_code==404
        assert guest.get('/api/admin/photos/'+p+'/original').status_code==401
        assert client.put('/api/admin/photos/'+p,json={'title':'Hello','published':True}).status_code==409
        run_once(app.state.db,config)
        assert client.put('/api/admin/photos/'+p,json={'title':'Hello','published':True}).status_code==200
        assert guest.get('/media/'+p+'/960.webp').status_code==200
        assert guest.get('/media/'+p+'/960.webp').headers['cache-control']=='no-store'
        assert client.delete('/api/admin/photos/'+p).status_code==200
        assert guest.get('/media/'+p+'/960.webp').status_code==404
        assert client.post('/api/admin/photos/'+p+'/restore').status_code==200
        assert client.get('/api/admin/photos').json()['photos'][0]['published']==0
        assert hashlib.sha256(client.get('/api/admin/photos/'+p+'/original').content).hexdigest()==sha

def test_content_crud_album_delete_retains_photo_and_sanitizes_post(stack):
    app,client,config=stack;p,sha=uploaded(client);run_once(app.state.db,config)
    a=client.post('/api/admin/albums',json={'title':'Travel','published':True}).json()
    assert client.put('/api/admin/photos/'+p,json={'title':'Travel photo','published':True,'album_ids':[a['id']]}).status_code==200
    assert client.put('/api/admin/albums/'+a['id'],json={'title':'Travel','published':True,'cover_id':p}).status_code==200
    assert client.get('/api/public/albums/'+a['id']).json()['photos'][0]['id']==p
    assert client.delete('/api/admin/albums/'+a['id']).status_code==200
    assert client.get('/api/public/photos/'+p).status_code==200
    post=client.post('/api/admin/posts',json={'title':'Notes','body':'## Heading\n\n<script>alert(1)</script><img src="x" onerror="bad()">[bad](javascript:alert(1))','published':True}).json()
    assert '<script' not in post['html'] and 'onerror' not in post['html'] and 'javascript:' not in post['html']
    assert client.delete('/api/admin/posts/'+post['id']).status_code==200
    assert client.get('/api/public/posts/'+post['id']).status_code==404

def test_invalid_image_never_published_and_retry(stack):
    app,client,config=stack;p,_=uploaded(client,b'not-image')
    run_once(app.state.db,config)
    assert client.get('/api/admin/photos').json()['photos'][0]['processing']=='failed'
    assert client.put('/api/admin/photos/'+p,json={'title':'x','published':True}).status_code==409
    assert client.post('/api/admin/photos/'+p+'/retry').status_code==200

def test_original_path_and_catalog_metadata_boundary(stack):
    app,client,config=stack;p,_=uploaded(client);run_once(app.state.db,config)
    assert client.put('/api/admin/photos/'+p,json={'title':'visible','published':True}).status_code==200
    item=client.get('/api/public/catalog').json()['photos'][0]
    assert 'original_path' not in item and 'sha256' not in item and 'original_name' not in item
    assert len(item['srcset'].split(','))==1
    assert client.get('/originals/'+p+'.png').status_code==404
    assert client.get('/api/admin/uploads/not-a-real-session').status_code==404

def test_cancelled_upload_cannot_finalize(stack):
    app,client,config=stack
    data=png();u=client.post('/api/admin/uploads',json={'filename':'x.png','size':len(data),'sha256':hashlib.sha256(data).hexdigest()}).json()
    assert client.put('/api/admin/uploads/'+u['id']+'/chunks/0',content=data,headers={'X-Chunk-SHA256':hashlib.sha256(data).hexdigest()}).status_code==200
    assert client.delete('/api/admin/uploads/'+u['id']).status_code==200
    assert client.post('/api/admin/uploads/'+u['id']+'/complete').status_code==409

def test_imported_broken_original_uses_explicit_verified_fallback(stack):
    from app.media.processing import process_photo
    app,client,config=stack;p,_=uploaded(client,b'broken-old-jpeg')
    fallback=config.data/'fallbacks';fallback.mkdir();(fallback/'valid.png').write_bytes(png())
    app.state.db.execute('UPDATE photos SET source_key=?,fallback_path=? WHERE id=?',('native:old','fallbacks/valid.png',p))
    process_photo(app.state.db,config,p)
    row=app.state.db.one('SELECT * FROM photos WHERE id=?',(p,))
    assert row['processing']=='ready' and '历史预览' in row['error']
    assert client.get('/api/admin/photos/'+p+'/original').content==b'broken-old-jpeg'

def test_public_paging_search_and_batch_publish_skip_pending(stack):
    app,client,config=stack;p,_=uploaded(client);run_once(app.state.db,config)
    pending,_=uploaded(client,b'pending-other-image')
    r=client.post('/api/admin/photos/batch',json={'ids':[p,pending],'published':True})
    assert r.json()=={'updated':1,'skipped':1}
    assert client.get('/api/public/catalog?search=original&limit=1').json()['total']==1
    assert client.put('/api/admin/photos/'+p,json={'title':'original','published':True,'tags':['中文验收标签']}).status_code==200
    assert client.get('/api/public/catalog?search=中文验收标签').json()['total']==1
    assert client.get('/api/public/catalog?offset=1').json()['photos']==[]
    assert client.get('/api/public/catalog?search=not-present').json()['total']==0
    assert client.post('/api/admin/photos/batch',json={'ids':[p],'published':False}).json()['updated']==1
    assert client.get('/api/public/catalog').json()['total']==0

def test_expired_temporary_cleanup_keeps_active_upload_and_original(stack):
    from app.maintenance import cleanup_expired_uploads
    import time
    app,client,config=stack;p,_=uploaded(client)
    u=client.post('/api/admin/uploads',json={'filename':'later.png','size':9,'sha256':hashlib.sha256(b'expirable').hexdigest()}).json()
    content=b'expirable';client.put('/api/admin/uploads/'+u['id']+'/chunks/0',content=content,headers={'X-Chunk-SHA256':hashlib.sha256(content).hexdigest()})
    assert cleanup_expired_uploads(app.state.db,config)==0
    app.state.db.execute('UPDATE uploads SET expires=? WHERE id=?',(time.time()-4000,u['id']))
    assert cleanup_expired_uploads(app.state.db,config)==1
    assert client.get('/api/admin/uploads/'+u['id']).status_code==404
    assert client.get('/api/admin/photos/'+p+'/original').status_code==200

def test_canonical_cutover_keeps_query_blocks_alias_writes_and_supports_head(stack):
    from dataclasses import replace
    app,client,config=stack
    config.frontend.mkdir();(config.frontend/'index.html').write_text('<html>Photo Atlas</html>')
    main=create_app(replace(config,origin='https://portfolio.example',canonical_aliases=('www.portfolio.example','preview.portfolio.example')))
    with TestClient(main,base_url='https://portfolio.example',follow_redirects=False) as root:
        assert root.get('/').status_code==200
        assert 'x-robots-tag' not in root.get('/').headers
        assert root.head('/').status_code==200 and not root.head('/').content
        for hostname in ['www.portfolio.example','preview.portfolio.example']:
            r=root.get('/admin/?tab=photos',headers={'Host':hostname})
            assert r.status_code==308 and r.headers['location']=='https://portfolio.example/admin/?tab=photos'
            assert r.headers['cache-control']=='no-store'
            r=root.post('/api/auth/login',headers={'Host':hostname},json={'username':'admin','password':PASSWORD})
            assert r.status_code==409 and r.json()['code']=='SITE_MOVED'
        r=root.post('/api/auth/login',headers={'Origin':'https://portfolio.example'},json={'username':'admin','password':PASSWORD})
        assert r.status_code==200
        assert root.post('/api/auth/login',headers={'Origin':'https://preview.portfolio.example'},json={'username':'admin','password':PASSWORD}).status_code==403
        assert root.get('/',headers={'Host':'unexpected.example'}).status_code==400


def test_untrusted_proxy_header_cannot_bypass_login_rate_limit(stack):
    app, client, config = stack
    for number in range(8):
        result = client.post('/api/auth/login', json={'username': 'admin', 'password': 'wrong-password'}, headers={'CF-Connecting-IP': '203.0.113.' + str(number + 1)})
        assert result.status_code == 401
    result = client.post('/api/auth/login', json={'username': 'admin', 'password': 'wrong-password'}, headers={'CF-Connecting-IP': '203.0.113.200'})
    assert result.status_code == 429
