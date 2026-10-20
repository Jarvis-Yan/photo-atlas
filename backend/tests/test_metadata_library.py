import io,json
from PIL import Image
from test_workflows import stack,uploaded
from app.media.processing import run_once
from app.metadata import infer,parse_date,enrich
from app.library import audit


def test_metadata_uses_explicit_dates_and_places_without_fabricating_upload_time():
    p={'original_name':'祈年殿-20240512.jpg','title':'祈年殿','source_context':'{}','exif':'{}','classification':'{}','created':99999999}
    geo,date=infer(p)
    assert geo['label']=='北京' and geo['precision']=='city' and geo['source']=='filename'
    assert date['value']=='2024-05-12' and date['source']=='filename'
    p.update(original_name='DSC123.jpg',title='作品',source_context=json.dumps({'relative_path':'日本/京都、纳良、宇智/DSC123.jpg'},ensure_ascii=False))
    geo,date=infer(p);assert geo['status']=='unknown' and 'value' not in date
    assert parse_date('2024-02-31') is None
    assert parse_date('2024-05')['precision']=='month' and parse_date('2024')['precision']=='year'


def test_private_gps_is_fuzzed_publicly_and_manual_batch_edits_are_protected(stack):
    app,c,config=stack;p,_=uploaded(c);run_once(app.state.db,config)
    exif={'gps_latitude':31.234567,'gps_longitude':121.487654,'date':'2024:04:02 16:12:09'}
    app.state.db.execute('UPDATE photos SET exif=? WHERE id=?',(json.dumps(exif),p));enrich(app.state.db,config,p)
    row=app.state.db.one('SELECT * FROM photos WHERE id=?',(p,));assert json.loads(row['geo'])['latitude']==31.234567
    c.put('/api/admin/photos/'+p,json={'title':'摄影作品','published':True})
    public=c.get('/api/public/photos/'+p).json()
    assert public['geo']['latitude']==31.23 and public['geo']['longitude']==121.49
    assert 'gps_latitude' not in public['exif'] and 'evidence' not in public['geo']
    assert public['captured']['value']=='2024-04-02'
    response=c.post('/api/admin/library/metadata',json={'ids':[p],'place':'东京','date':'2023-10','overwrite_place':True})
    assert response.status_code==200;enrich(app.state.db,config,p)
    row=app.state.db.one('SELECT * FROM photos WHERE id=?',(p,))
    assert json.loads(row['geo'])['label']=='东京' and json.loads(row['captured'])['value']=='2023-10'
    assert c.post('/api/admin/library/metadata',json={'ids':[p],'date':'2024-02-31'}).status_code==422
    assert c.get('/api/public/footprints').json()['total']==1
    assert c.post('/api/admin/library/metadata',json={'ids':[p], 'reset':True}).status_code==200
    row=app.state.db.one('SELECT * FROM photos WHERE id=?',(p,));assert json.loads(row['geo'])['source']=='gps'
    from fastapi.testclient import TestClient
    with TestClient(app) as guest:
        assert guest.post('/api/admin/library/publish').status_code==401
        assert guest.get('/api/admin/library').status_code==401


def test_dedup_is_recoverable_and_publishes_distinct_photos(stack):
    app,c,config=stack;im=Image.new('RGB',(100,80),(70,120,190));a=io.BytesIO();im.save(a,format='PNG');first,_=uploaded(c,a.getvalue());run_once(app.state.db,config)
    b=io.BytesIO();im.save(b,format='PNG',compress_level=1);second,_=uploaded(c,b.getvalue())
    app.state.db.execute('UPDATE photos SET source_key=? WHERE id=?',('imported',second));run_once(app.state.db,config)
    third,_=uploaded(c);run_once(app.state.db,config)
    result=c.post('/api/admin/library/publish').json()
    assert result['duplicates_archived']==1 and result['library']['published']==2
    archived=app.state.db.one('SELECT * FROM photos WHERE deleted IS NOT NULL AND duplicate_of!=\'\'')
    assert archived and (config.data/archived['original_path']).is_file()
    assert c.get('/api/public/catalog').json()['total']==2
    # A later mother-file upload referring to a deduplicated photo resolves to the keeper.
    master=c.post('/api/admin/uploads',json={'filename':'original.png','size':len(a.getvalue()),'sha256':app.state.db.one('SELECT sha256 FROM photos WHERE id=?',(first,))['sha256'],'master_photo_id':archived['id']})
    assert master.status_code==200


def test_generic_subjects_are_not_geocoded_and_trip_context_disambiguates_towns():
    from app.places import matches
    assert not matches('苗寨小河 松树 日落 春日风景')
    p={'original_name':'沙溪街道.jpg','title':'沙溪街道','exif':'{}','classification':'{}','source_context':json.dumps({'relative_path':'假期/云南/大理/沙溪街道.jpg'})}
    geo,_=infer(p);assert geo['label']=='沙溪' and geo['latitude']==26.3
    p.update(original_name='春日神社神龛.jpg',title='春日神社神龛',source_context=json.dumps({'relative_path':'日本/京都、纳良、宇智/春日神社神龛.jpg'}))
    geo,_=infer(p);assert geo['label']=='奈良' and geo['latitude']==34.68505
    p.update(original_name='河口湖垂钓者.jpg',title='河口湖垂钓者',source_context=json.dumps({'relative_path':'日本/富士、河口湖/河口湖垂钓者.jpg'}))
    geo,_=infer(p);assert geo['label']=='河口湖' and geo['country']=='JP'


def test_inflight_master_upload_survives_photo_deduplication(stack):
    import hashlib
    from app.library import resolve_pair
    app,c,config=stack;first,_=uploaded(c);run_once(app.state.db,config)
    image=Image.new('RGB',(120,90),(210,110,40));buf=io.BytesIO();image.save(buf,format='PNG');data=buf.getvalue()
    second,_=uploaded(c,data);run_once(app.state.db,config)
    master=data+b'retouched source metadata';sha=hashlib.sha256(master).hexdigest()
    u=c.post('/api/admin/uploads',json={'filename':'master.png','size':len(master),'sha256':sha,'master_photo_id':second}).json()
    for number in range(u['chunks']):
        chunk=master[number*u['chunk_size']:(number+1)*u['chunk_size']]
        assert c.put('/api/admin/uploads/'+u['id']+'/chunks/'+str(number),content=chunk,headers={'X-Chunk-SHA256':hashlib.sha256(chunk).hexdigest()}).status_code==200
    resolve_pair(app.state.db,[first,second],keep=first)
    response=c.post('/api/admin/uploads/'+u['id']+'/complete')
    assert response.status_code==200 and response.json()['photo_id']==first
    assert hashlib.sha256(c.get('/api/admin/photos/'+first+'/original').content).hexdigest()==sha


def test_landmark_does_not_match_unrelated_substring_town():
    p={'original_name':'趵突泉_1.jpg','title':'趵突泉','exif':'{}','classification':'{}','source_context':json.dumps({'relative_path':'山东/趵突泉_1.jpg'})}
    geo,_=infer(p);assert geo['country']=='CN' and 36<geo['latitude']<37 and 116<geo['longitude']<118


def test_manual_name_without_city_coordinates_saves_without_exif_scan(stack,monkeypatch):
    app,c,config=stack;p,_=uploaded(c);run_once(app.state.db,config)
    def forbidden(*args):raise AssertionError('Manual save must not scan original files')
    monkeypatch.setattr('app.metadata.enrich',forbidden)
    response=c.post('/api/admin/library/metadata',json={'ids':[p],'place':'不在城市库中的拍摄位置','date':'2024-06'})
    assert response.status_code==200
    assert response.json()['updated']==1
    photo=response.json()['photos'][0]
    assert photo['id']==p and photo['geo']['label']=='不在城市库中的拍摄位置'
    assert photo['geo']['status']=='named' and 'latitude' not in photo['geo']
    assert photo['captured']['value']=='2024-06' and photo['geo_locked'] and photo['captured_locked']
    assert app.state.db.one('SELECT metadata_updated FROM photos WHERE id=?',(p,))['metadata_updated']>0
    assert c.post('/api/admin/library/metadata',json={'ids':[p]}).status_code==422
    assert c.post('/api/admin/library/metadata',json={'ids':[p],'place':'北京','latitude':30}).status_code==422


def test_site_bootstrap_omits_photo_library_and_keeps_public_content(stack):
    app,c,config=stack
    c.post('/api/admin/albums',json={'title':'旅行','published':True})
    c.post('/api/admin/albums',json={'title':'私密相册','published':False})
    response=c.get('/api/public/site')
    assert response.status_code==200
    assert 'photos' not in response.json() and 'total' not in response.json()
    assert [a['title'] for a in response.json()['albums']]==['旅行']
    assert response.headers['cache-control']=='public, max-age=30'


def test_ledong_is_not_japans_kainan_and_bare_province_is_not_a_city():
    from app.places import matches
    assert not matches('海南')
    for query in ('海南 乐东','海南省乐东黎族自治县','乐东'):
        choices=matches(query)
        assert len(choices)==1 and choices[0]['country']=='CN'
        assert choices[0]['id']=='1816887'
        assert 18<choices[0]['lat']<19 and 108<choices[0]['lon']<110
    assert matches('日本 海南市')[0]['country']=='JP'


def test_manual_ledong_edit_uses_chinese_county_coordinates(stack):
    app,c,config=stack;p,_=uploaded(c);run_once(app.state.db,config)
    response=c.post('/api/admin/library/metadata',json={'ids':[p],'place':'海南 乐东'})
    assert response.status_code==200
    geo=response.json()['photos'][0]['geo']
    assert geo['label']=='海南 乐东' and geo['country']=='CN'
    assert geo['city_id']=='1816887'


def test_verified_metadata_survives_reprocessing(stack):
    app,c,config=stack;p,_=uploaded(c)
    metadata={'camera':'Canon EOS 5D Mark II','lens':'EF24-105mm f/4L IS USM','iso':'320','field_sources':{'iso':{'source':'raw_exact_capture_time'}}}
    app.state.db.execute('UPDATE photos SET exif=? WHERE id=?',(json.dumps(metadata),p))
    run_once(app.state.db,config)
    row=app.state.db.one('SELECT exif FROM photos WHERE id=?',(p,))
    assert json.loads(row['exif'])==metadata




def test_png_xmp_restores_camera_settings_and_nested_iso(tmp_path):
    from PIL.PngImagePlugin import PngInfo
    from app.metadata import extract
    packet='''<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:tiff="http://ns.adobe.com/tiff/1.0/" xmlns:exif="http://ns.adobe.com/exif/1.0/" xmlns:aux="http://ns.adobe.com/exif/1.0/aux/" tiff:Model="Canon EOS 5D Mark II" aux:Lens="EF24-105mm f/4L IS USM" exif:FNumber="9/1" exif:ExposureTime="1/500" exif:FocalLength="24/1" exif:DateTimeOriginal="2025-06-06T12:45:21"><exif:ISOSpeedRatings><rdf:Seq><rdf:li>100</rdf:li></rdf:Seq></exif:ISOSpeedRatings></rdf:Description></rdf:RDF></x:xmpmeta>'''
    metadata=PngInfo();metadata.add_itxt('XML:com.adobe.xmp',packet)
    path=tmp_path/'original.png';Image.new('RGB',(100,80)).save(path,pnginfo=metadata)
    result=extract(path)
    assert result['camera']=='Canon EOS 5D Mark II'
    assert result['lens']=='EF24-105mm f/4L IS USM' and result['iso']=='100'
    assert result['fnumber']=='9/1' and result['exposure']=='1/500' and result['focal_length']=='24/1'
    assert result['date'].startswith('2025-06-06')
    assert extract(path,{'iso':'320','field_sources':{'iso':{'source':'raw_verified'}}})['iso']=='320'


def test_dimensions_do_not_invent_camera_model(stack):
    app, client, config = stack
    identifier, _ = uploaded(client)
    app.state.db.execute('UPDATE photos SET width=5616,height=3744 WHERE id=?', (identifier,))
    enrich(app.state.db, config, identifier)
    photo = client.get('/api/admin/photos').json()['photos'][0]
    assert not photo['exif'].get('camera')
