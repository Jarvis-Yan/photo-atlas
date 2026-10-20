import gzip
from starlette.applications import Starlette
from starlette.responses import JSONResponse, Response
from starlette.routing import Route
from starlette.testclient import TestClient
from app.admin_compression import AdminListCompression


def test_admin_list_compression_preserves_payload_and_downloads():
    data={'photos':[{'title':'测试照片','id':str(i)} for i in range(100)]}
    async def listing(request):return JSONResponse(data,headers={'Cache-Control':'private, no-store'})
    async def download(request):return Response(b'raw-original'*1000,headers={'ETag':'original-sha'})
    app=AdminListCompression(Starlette(routes=[Route('/api/admin/photos',listing),Route('/api/admin/photos/id/original',download)]))
    with TestClient(app) as client:
        compressed=client.get('/api/admin/photos',headers={'Accept-Encoding':'gzip'})
        plain=client.get('/api/admin/photos',headers={'Accept-Encoding':'identity'})
        assert compressed.json()==plain.json()==data
        assert compressed.headers['content-encoding']=='gzip'
        assert int(compressed.headers['content-length'])<len(plain.content)/3
        assert 'Accept-Encoding' in compressed.headers['vary']
        assert compressed.headers['cache-control']=='private, no-store'
        original=client.get('/api/admin/photos/id/original')
        assert 'content-encoding' not in original.headers
        assert original.content==b'raw-original'*1000 and original.headers['etag']=='original-sha'
