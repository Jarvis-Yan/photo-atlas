import io
import json
from pathlib import Path
from PIL import Image
from fastapi.testclient import TestClient
from test_workflows import stack, uploaded
from app.media.processing import run_once
from app.media.thumbnails import THUMBNAILS, cached, manifest, variant


def test_browsing_previews_preserve_ratio_strip_metadata_and_cache(tmp_path):
    folder=tmp_path/'media';folder.mkdir()
    image=Image.effect_noise((600,960),50).convert('RGB')
    image.save(folder/'960.webp',format='WEBP',quality=84)
    result=cached(folder,320)
    with Image.open(result) as output:
        assert output.size==(200,320)
        assert not output.getexif()
    assert result.stat().st_size<(folder/'960.webp').stat().st_size
    modified=result.stat().st_mtime_ns
    assert cached(folder,320).stat().st_mtime_ns==modified
    small=manifest('photo',600,960)
    assert 'thumb-v2-320.webp 200w' in small['srcset']
    assert len(manifest('small',80,60)['srcset'].split(','))==1


def test_thumbnail_auth_conditional_cache_and_legacy_backfill(stack):
    app,client,config=stack
    image=Image.effect_noise((400,600),40).convert('RGB');data=io.BytesIO();image.save(data,format='PNG')
    identifier,_=uploaded(client,data.getvalue());run_once(app.state.db,config)
    folder=config.data/'media'/identifier
    url=f'/media/{identifier}/{variant(320)}'
    full_before=(folder/'full.jpg').read_bytes()
    with TestClient(app) as guest:
        assert guest.get(url).status_code==404
        assert client.put('/api/admin/photos/'+identifier,json={'title':'test','published':True}).status_code==200
        (folder/variant(320)).unlink()  # Existing libraries get a small preview on first use.
        response=guest.get(url);assert response.status_code==200
        assert Image.open(io.BytesIO(response.content)).size==(213,320)
        assert response.headers['cache-control']=='private, max-age=0, must-revalidate'
        unchanged=guest.get(url,headers={'If-None-Match':response.headers['etag']})
        assert unchanged.status_code==304
        assert unchanged.content==b''
        assert 'content-length' not in unchanged.headers
        assert 'content-type' not in unchanged.headers
        assert 'accept-ranges' not in unchanged.headers
        for key in ('etag','last-modified','cache-control'):
            assert unchanged.headers[key]==response.headers[key]
        # A conditional request must not poison the following image transfer.
        following=guest.get(url)
        assert following.status_code==200
        assert len(following.content)==int(following.headers['content-length'])
        assert following.content==response.content
        photo=guest.get('/api/public/footprints?limit=500').json()['photos'][0]
        assert photo['thumbnail']['src'].endswith(variant(480))
        assert '213w' in photo['thumbnail']['srcset']
        assert guest.get(f'/media/{identifier}/thumb-v1-320.webp').status_code==200
        assert guest.get(f'/media/{identifier}/thumb-v1-99999.webp').status_code==404
        assert client.put('/api/admin/photos/'+identifier,json={'title':'test','published':False}).status_code==200
        assert guest.get(url,headers={'If-None-Match':response.headers['etag']}).status_code==404
    assert (folder/'full.jpg').read_bytes()==full_before


def test_lite_version_smaller_than_legacy_without_overwriting_old_previews(tmp_path):
    folder=tmp_path/'media';folder.mkdir()
    image=Image.effect_noise((960,640),45).convert('RGB')
    image.save(folder/'960.webp',format='WEBP',quality=84)
    old=cached(folder,480,1);before=old.read_bytes()
    lite=cached(folder,480)
    assert lite.name=='thumb-v2-480.webp'
    assert lite.stat().st_size<old.stat().st_size*.85
    assert Image.open(lite).size==Image.open(old).size
    assert old.read_bytes()==before
