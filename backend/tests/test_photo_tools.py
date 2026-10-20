import hashlib,io,json,time
from PIL import Image
from test_workflows import stack,uploaded,png
from app.media.processing import run_once

def test_large_limit_supported_format_acceptance_and_existing_import_dedup(stack):
    app,c,config=stack
    sha=hashlib.sha256(png()).hexdigest()
    assert c.post('/api/admin/uploads',json={'filename':'photo.tiff','size':1,'sha256':sha}).status_code==200
    assert c.post('/api/admin/uploads',json={'filename':'photo.exe','size':1,'sha256':'b'*64}).status_code==422
    r=c.post('/api/admin/uploads',json={'filename':'large.tif','size':4*1024**3,'sha256':'a'*64})
    assert r.status_code==200
    p,_=uploaded(c)
    r=c.post('/api/admin/uploads',json={'filename':'copy.png','size':len(png()),'sha256':sha})
    assert r.json()['status']=='duplicate' and r.json()['photo_id']==p
    assert len(app.state.db.all('SELECT id FROM photos'))==1

def test_jpeg_dimensions_orientation_privacy_and_pixels_dedup(stack):
    app,c,config=stack
    image=Image.new('RGB',(3000,180),(50,110,190));out=io.BytesIO();image.save(out,format='PNG');p,_=uploaded(c,out.getvalue());run_once(app.state.db,config)
    row=app.state.db.one('SELECT * FROM photos WHERE id=?',(p,));assert row['width']==3000 and row['jpeg_ready']==1
    path=f'/media/{p}/full.jpg'
    from fastapi.testclient import TestClient
    with TestClient(app) as guest:
        assert guest.get(path).status_code==404
        assert c.put('/api/admin/photos/'+p,json={'title':'test','published':True}).status_code==200
        r=guest.get(path);assert r.status_code==200
        decoded=Image.open(io.BytesIO(r.content));assert decoded.size==(3000,180) and not decoded.getexif()
        assert c.put('/api/admin/photos/'+p,json={'title':'test','published':False}).status_code==200
        assert guest.get(path).status_code==404
    # Same RGB image with different PNG encoding must not become a second active photo.
    out=io.BytesIO();image.save(out,format='PNG',compress_level=1);p2,_=uploaded(c,out.getvalue());run_once(app.state.db,config)
    second=app.state.db.one('SELECT * FROM photos WHERE id=?',(p2,));assert second['duplicate_of']==p and second['deleted'] is not None
    upload=app.state.db.one('SELECT id FROM uploads WHERE photo_id=?',(p2,))
    assert c.get('/api/admin/uploads/'+upload['id']).json()['duplicate_of']==p


def test_similar_review_blocks_publish_without_confirmation(stack):
    app,c,config=stack;p,_=uploaded(c);run_once(app.state.db,config)
    app.state.db.execute('UPDATE photos SET similar_photos=? WHERE id=?',(json.dumps(['other']),p))
    assert c.put('/api/admin/photos/'+p,json={'title':'test','published':True}).status_code==409
    assert c.post('/api/admin/photos/batch',json={'ids':[p],'published':True}).json()['updated']==0
    assert c.post('/api/admin/photos/'+p+'/confirm-distinct').status_code==200
    assert c.put('/api/admin/photos/'+p,json={'title':'test','published':True}).status_code==200

def test_ultra_hdr_jpeg_generates_standard_jpeg(stack,tmp_path):
    import pyvips
    app,c,config=stack
    image=(pyvips.Image.black(80,60,bands=3)+[0.4,0.2,0.1]).cast('float').copy(interpretation='scrgb')
    source=tmp_path/'hdr.jpg';image.uhdrsave(str(source))
    assert pyvips.Image.new_from_file(str(source)).get('vips-loader')=='uhdrload'
    p,_=uploaded(c,source.read_bytes());run_once(app.state.db,config)
    row=app.state.db.one('SELECT * FROM photos WHERE id=?',(p,))
    assert row['processing']=='ready' and row['jpeg_ready']==1
    output=config.data/'media'/p/'full.jpg'
    assert pyvips.Image.new_from_file(str(output)).get('vips-loader')=='jpegload'
    assert Image.open(output).size==(80,60)


def test_public_download_is_full_size_watermarked_jpeg_and_original_is_private(stack):
    from fastapi.testclient import TestClient
    app,c,config=stack;p,sha=uploaded(c);run_once(app.state.db,config)
    with TestClient(app) as guest:
        assert guest.get('/api/public/photos/'+p+'/download').status_code==404
        assert c.put('/api/admin/photos/'+p,json={'title':'作品','published':True}).status_code==200
        downloaded=guest.get('/api/public/photos/'+p+'/download')
        assert downloaded.status_code==200 and 'attachment' in downloaded.headers['content-disposition']
        photo=Image.open(io.BytesIO(downloaded.content));photo.load()
        assert photo.size==(80,60) and photo.format=='JPEG' and not photo.getexif()
        assert downloaded.headers['content-type']=='image/jpeg'
        assert '-watermarked.jpg' in downloaded.headers['content-disposition']
        assert downloaded.headers['cache-control']=='no-store'
        assert hashlib.sha256(downloaded.content).hexdigest()!=sha
        assert guest.get('/media/'+p+'/full.jpg').content==downloaded.content
        from PIL import ImageChops
        with Image.open(config.data/'media'/p/'full.jpg') as unmarked:
            assert ImageChops.difference(photo.convert('RGB'),unmarked.convert('RGB')).getbbox()
        assert guest.get('/api/admin/photos/'+p+'/original').status_code==401
        assert hashlib.sha256(c.get('/api/admin/photos/'+p+'/original').content).hexdigest()==sha
        c.put('/api/admin/photos/'+p,json={'title':'作品','published':False})
        assert guest.get('/api/public/photos/'+p+'/download').status_code==404


def test_large_source_attaches_to_same_photo_and_regenerates_watermark(stack):
    app,c,config=stack;p,_=uploaded(c);run_once(app.state.db,config)
    image=Image.new('RGB',(180,120),(40,120,200));out=io.BytesIO();image.save(out,format='PNG');data=out.getvalue();sha=hashlib.sha256(data).hexdigest()
    init={'filename':'retouched-master.png','size':len(data),'sha256':sha,'master_photo_id':p}
    assert c.post('/api/admin/uploads',json={**init,'master_photo_id':'missing'}).status_code==404
    u=c.post('/api/admin/uploads',json=init).json()
    for number in range(u['chunks']):
        chunk=data[number*u['chunk_size']:(number+1)*u['chunk_size']]
        assert c.put('/api/admin/uploads/'+u['id']+'/chunks/'+str(number),content=chunk,headers={'X-Chunk-SHA256':hashlib.sha256(chunk).hexdigest()}).status_code==200
    result=c.post('/api/admin/uploads/'+u['id']+'/complete').json()
    assert result=={'photo_id':p,'status':'master_saved'}
    assert len(app.state.db.all('SELECT id FROM photos'))==1
    assert c.post('/api/admin/uploads/'+u['id']+'/complete').json()['photo_id']==p
    assert c.post('/api/admin/uploads',json=init).json()['status']=='duplicate'
    assert hashlib.sha256(c.get('/api/admin/photos/'+p+'/original').content).hexdigest()==sha
    run_once(app.state.db,config)
    photo=app.state.db.one('SELECT * FROM photos WHERE id=?',(p,))
    assert (photo['width'],photo['height'],photo['published'])==(180,120,0)
    assert Image.open(config.data/'media'/p/'watermarked.jpg').size==(180,120)

    c.put('/api/admin/photos/'+p,json={'title':'Original master','published':True})
    from fastapi.testclient import TestClient
    with TestClient(app) as guest:
        response=guest.get('/api/public/photos/'+p+'/download')
        assert response.content!=data and Image.open(io.BytesIO(response.content)).size==(180,120)
        assert response.content==(config.data/'media'/p/'watermarked.jpg').read_bytes()
        assert '-watermarked.jpg' in response.headers['content-disposition']
