import hashlib
import hmac
import html
import json
import logging
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request, Response, Depends, Query
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse, RedirectResponse
from starlette.concurrency import run_in_threadpool
from starlette.middleware.trustedhost import TrustedHostMiddleware
from urllib.parse import urlparse
from .config import Settings
from .db import Database
from .errors import AppError
from .auth.service import AuthService
from .media.repository import MediaRepository
from .uploads.service import UploadService
from .content.service import ContentService,safe_markdown
from .schemas import Login,UploadInit,AlbumInput,PhotoInput,PhotoBatchInput,PostInput,SettingInput,PhotoIdsInput,MetadataBatchInput,DuplicateReviewInput,AlbumMergeInput

COOKIE='pc_session'


def create_app(config=None):
    logging.basicConfig(level=logging.INFO,format='%(message)s')
    config=config or Settings.from_env();config.prepare()
    db=Database(config.database);db.migrate()
    auth=AuthService(db,config);media=MediaRepository(db)
    content=ContentService(db,media);uploads=UploadService(db,config)
    @asynccontextmanager
    async def lifecycle(app):
        yield
        with db.connect() as conn:
            conn.execute('PRAGMA wal_checkpoint(PASSIVE)')
    app=FastAPI(title='PixelCore',version='0.1.0',lifespan=lifecycle,docs_url=None,redoc_url=None)
    app.state.db=db;app.state.config=config;app.state.uploads=uploads
    from .admin_compression import AdminListCompression
    app.add_middleware(AdminListCompression)
    app.add_middleware(CORSMiddleware,allow_origins=[config.origin],allow_credentials=True,allow_methods=['GET','POST','PUT','DELETE'],allow_headers=['Content-Type','X-CSRF-Token','X-Chunk-SHA256'])
    host=urlparse(config.origin).hostname
    app.add_middleware(TrustedHostMiddleware,allowed_hosts=[host,*config.canonical_aliases,'127.0.0.1','localhost','testserver'])

    @app.middleware('http')
    async def boundary(request,call_next):
        start=time.monotonic();request.state.request_id=str(uuid.uuid4())
        origin=request.headers.get('origin')
        if request.url.hostname in config.canonical_aliases and request.url.hostname!=host:
            if request.method in ('GET','HEAD'):
                target=config.origin+request.url.path+('?' + request.url.query if request.url.query else '')
                response=RedirectResponse(target,status_code=308)
            else:
                response=JSONResponse({'code':'SITE_MOVED','message':'网站已迁移，请在主站重新打开后台后继续','url':config.origin},status_code=409)
            response.headers['Cache-Control']='no-store'
        elif request.method not in ('GET','HEAD','OPTIONS') and origin and origin != config.origin:
            response=JSONResponse({'code':'ORIGIN_FORBIDDEN','message':'请求来源不匹配'},status_code=403)
        else:
            try:
                response=await call_next(request)
            except Exception:
                logging.exception('request_failed')
                response=JSONResponse({'code':'INTERNAL_ERROR','message':'服务暂时不可用，请稍后重试'},status_code=500)
        response.headers['X-Request-ID']=request.state.request_id
        response.headers['X-Content-Type-Options']='nosniff'
        response.headers['Referrer-Policy']='same-origin'
        response.headers['X-Frame-Options']='DENY'
        response.headers['Permissions-Policy']='camera=(), microphone=(), geolocation=()'
        if urlparse(config.origin).hostname.startswith('preview.'):
            response.headers['X-Robots-Tag']='noindex, nofollow'
        response.headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tiles.openfreemap.org; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self' blob:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
        if request.url.path.startswith(('/api','/admin','/media')) and request.url.path not in ('/api/public/home','/api/public/site') and not getattr(request.state,'thumbnail_cache',False):
            response.headers['Cache-Control']='no-store'
        logging.info(json.dumps({'event':'http','request_id':request.state.request_id,'method':request.method,'path':request.url.path,'status':response.status_code,'milliseconds':round((time.monotonic()-start)*1000,2)}))
        return response

    @app.exception_handler(AppError)
    async def app_error(request,error):
        return JSONResponse({'code':error.code,'message':error.message,'request_id':request.state.request_id},status_code=error.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request,error):
        return JSONResponse({'code':'VALIDATION_ERROR','message':'输入格式或长度不正确，请检查后重试','fields':[{'field':'.'.join(map(str,x['loc'])),'type':x['type']} for x in error.errors()]},status_code=422)

    @app.exception_handler(sqlite3.IntegrityError)
    async def conflict(request,error):
        return JSONResponse({'code':'CONFLICT','message':'数据冲突，请刷新后重试'},status_code=409)

    def admin(request:Request):
        session=auth.session(request.cookies.get(COOKIE))
        if request.method not in ('GET','HEAD'):
            csrf=request.headers.get('x-csrf-token','')
            if not hmac.compare_digest(csrf,session['csrf']):
                raise AppError('操作验证已失效，请刷新后台后重试','CSRF_INVALID',403)
        return session

    @app.get('/health')
    def health():
        return {'status':'ok','service':'pixelcore','version':'0.1.0'}

    @app.get('/ready')
    def ready():
        if config.required_mount and not Path(config.required_mount).is_mount():
            raise AppError('照片存储暂不可用','STORAGE_UNAVAILABLE',503)
        db.one('SELECT COUNT(*) FROM photos')
        return {'status':'ok','database':'ok','storage':'ok','pending_jobs':db.one("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('pending','running')")['n']}

    @app.post('/api/auth/login')
    def login(data:Login,request:Request):
        ip=request.client.host if request.client else 'local'
        token,result=auth.login(data.username,data.password,ip)
        response=JSONResponse(result)
        response.set_cookie(COOKIE,token,max_age=config.session_seconds,httponly=True,secure=config.secure_cookie,samesite='lax',path='/')
        return response

    @app.get('/api/auth/me')
    def me(session=Depends(admin)):
        return {'username':session['username'],'csrf':session['csrf']}

    @app.post('/api/auth/logout')
    def logout(request:Request,session=Depends(admin)):
        auth.logout(request.cookies.get(COOKIE));response=JSONResponse({'ok':True});response.delete_cookie(COOKIE,path='/');return response

    @app.get('/api/public/home')
    def home(request:Request,response:Response):
        from .home import beijing_day
        day=beijing_day()
        payload={'settings':content.settings(),'photos':[media.serialize(x) for x in media.daily_featured(day,12)],'albums':content.albums(),'posts':content.posts(),'total':12,'daily_date':day}
        payload['total']=len(payload['photos'])
        etag='"'+hashlib.sha256(json.dumps(payload,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()[:24]+'"'
        headers={'Cache-Control':'public, max-age=300, s-maxage=300, stale-while-revalidate=60','ETag':etag,'Vary':'Accept-Encoding'}
        if request.headers.get('if-none-match')==etag:
            return Response(status_code=304,headers=headers)
        for key,value in headers.items():response.headers[key]=value
        return payload

    @app.get('/api/public/site')
    def public_site(response:Response):
        response.headers['Cache-Control']='public, max-age=30'
        return {'settings':content.settings(),'albums':content.albums(),'posts':content.posts()}

    @app.get('/api/public/catalog')
    def catalog(limit:int=Query(120,ge=1,le=500),offset:int=Query(0,ge=0),search:str=Query('',max_length=240),category:str=Query('',pattern='^(|人像|自然|城市|星空)$')):
        return {'settings':content.settings(),'photos':[media.serialize(x) for x in media.list(limit=limit,offset=offset,search=search,category=category)],'albums':content.albums(),'posts':content.posts(),'total':media.count(search=search,category=category)}

    @app.get('/api/public/footprints')
    def footprints(category:str=Query('',pattern='^(|人像|自然|城市|星空)$'),search:str=Query('',max_length=240),limit:int=Query(500,ge=1,le=5000),offset:int=Query(0,ge=0)):
        rows=media.list(limit=limit,offset=offset,category=category,search=search)
        photos=[media.serialize(row) for row in rows]
        return {'photos':photos,'total':media.count(category=category,search=search),'attribution':'GeoNames · CC BY 4.0'}

    @app.get('/api/admin/library')
    def library_status(session=Depends(admin)):
        from .library import stats
        return stats(db)

    @app.post('/api/admin/library/enrich')
    def enrich_library(data:PhotoIdsInput,session=Depends(admin)):
        from .metadata import enrich
        for identifier in dict.fromkeys(data.ids):enrich(db,config,identifier)
        return {'updated':len(set(data.ids))}

    @app.post('/api/admin/library/metadata')
    def metadata_batch(data:MetadataBatchInput,session=Depends(admin)):
        from .metadata import parse_date,compact,enrich
        from .places import matches
        ids=list(dict.fromkeys(data.ids));geo=None;captured=None
        from .metadata_history import snapshots,record
        if len(ids)>1 and data.expected is None:raise AppError('请刷新后台并重新选择照片，以使用新的批量编辑保护','METADATA_PREVIEW_REQUIRED',409)
        if data.place and data.place.strip():
            if data.latitude is not None and data.longitude is not None:
                geo={'label':data.place,'latitude':data.latitude,'longitude':data.longitude,'precision':'exact','source':'manual','status':'resolved'}
            else:
                candidates=matches(data.place)
                geo=compact(candidates[0],'manual') if len(candidates)==1 else {'label':data.place.strip(),'precision':'place','source':'manual','status':'named'}
                geo['label']=data.place.strip()
        if (data.latitude is None)!=(data.longitude is None):raise AppError('经纬度需要同时填写','INVALID_COORDINATES',422)
        if not data.reset and geo is None and not data.date:raise AppError('请填写地点或日期','EMPTY_METADATA',422)
        if data.date:
            captured=parse_date(data.date,'manual')
            if not captured:raise AppError('请输入年份、年月或完整日期，如2024-04','INVALID_DATE',422)
        with db.connect() as conn:
            conn.execute('BEGIN IMMEDIATE')
            before=snapshots(conn,ids)
            if len(before)!=len(ids):raise AppError('部分照片已变化，请刷新','NOT_FOUND',404)
            for row in before:
                if data.expected is not None and (row['id'] not in data.expected or row['metadata_updated']!=data.expected[row['id']]):raise AppError('打开编辑后照片已被修改，请重新打开编辑确认','METADATA_CHANGED',409)
                old_place=json.loads(row['geo']).get('label','').strip()
                if geo is not None and old_place and old_place!=geo.get('label','').strip() and not data.overwrite_place:raise AppError('所选照片中已有地点；请取消这些照片，或明确勾选覆盖已有地点','KNOWN_PLACE_PROTECTED',409)
            for identifier in ids:
                conn.execute('UPDATE photos SET metadata_updated=? WHERE id=?',(time.time(),identifier))
                if data.reset:conn.execute('UPDATE photos SET geo_locked=0,captured_locked=0 WHERE id=?',(identifier,))
                if geo is not None:conn.execute('UPDATE photos SET geo=?,geo_locked=1 WHERE id=?',(json.dumps(geo,ensure_ascii=False),identifier))
                if captured is not None:conn.execute('UPDATE photos SET captured=?,captured_locked=1 WHERE id=?',(json.dumps(captured,ensure_ascii=False),identifier))
            history_id=record(conn,before,snapshots(conn,ids),session['user_id'],'reset' if data.reset else 'save')
        if data.reset:
            for identifier in ids:enrich(db,config,identifier)
        placeholders=','.join('?' for _ in ids)
        rows=db.all('SELECT id,geo,captured,geo_locked,captured_locked,metadata_updated FROM photos WHERE id IN ('+placeholders+')',ids)
        return {'updated':len(ids),'history_id':history_id,'photos':[{**row,'geo':json.loads(row['geo']),'captured':json.loads(row['captured'])} for row in rows]}

    @app.get('/api/admin/library/metadata-history')
    def metadata_history(session=Depends(admin)):
        from .metadata_history import history
        return history(db)

    @app.post('/api/admin/library/metadata-history/{identifier}/undo')
    def undo_metadata(identifier:str,session=Depends(admin)):
        from .metadata_history import undo
        return undo(db,identifier,session['user_id'])

    @app.post('/api/admin/library/audit')
    def audit_library(session=Depends(admin)):
        from .library import audit
        return audit(db,config)

    @app.get('/api/admin/library/duplicates')
    def duplicate_groups(session=Depends(admin)):
        groups={}
        for row in db.all("SELECT duplicate_audit FROM photos WHERE deleted IS NULL AND duplicate_audit!='{}'"):
            for pair in json.loads(row['duplicate_audit']).get('pairs',[]):
                if pair.get('decision')=='review':groups[':'.join(sorted(pair['ids']))]=pair
        return {'groups':list(groups.values())}

    @app.post('/api/admin/library/duplicates')
    def review_duplicates(data:DuplicateReviewInput,session=Depends(admin)):
        from .library import resolve_pair
        return resolve_pair(db,data.ids,data.keep)

    @app.post('/api/admin/library/publish')
    def publish_library(session=Depends(admin)):
        from .library import audit,stats
        db.execute('UPDATE photos SET publish_requested=1 WHERE deleted IS NULL')
        report=audit(db,config,publish=True)
        return {**report,'library':stats(db)}

    @app.get('/api/public/photos/{identifier}')
    def public_photo(identifier:str):
        return media.serialize(media.get(identifier))

    @app.get('/api/public/albums/{identifier}')
    def public_album(identifier:str,limit:int=Query(120,ge=1,le=500),offset:int=Query(0,ge=0)):
        from .content.albums import resolve
        album=resolve(db,identifier,public=True)
        return {'album':album,'photos':[media.serialize(x) for x in media.list(album_id=album['id'],limit=limit,offset=offset)],'total':media.count(album_id=album['id'])}

    @app.get('/api/public/posts/{identifier}')
    def public_post(identifier:str):
        return content.post(identifier)

    @app.get('/api/admin/photos')
    def admin_photos(limit:int=Query(500,ge=1,le=500),offset:int=Query(0,ge=0),session=Depends(admin)):
        return {'photos':[media.serialize(x,True) for x in media.list(True,limit=limit,offset=offset)],'total':db.one('SELECT COUNT(*) AS n FROM photos WHERE deleted IS NULL')['n']}

    @app.post('/api/admin/photos/batch')
    def batch_photos(data:PhotoBatchInput,session=Depends(admin)):
        ids=list(dict.fromkeys(data.ids));marks=','.join('?' for _ in ids)
        with db.connect() as conn:
            rows=conn.execute('SELECT id,processing,duplicate_of,similar_photos,similarity_reviewed FROM photos WHERE deleted IS NULL AND id IN ('+marks+')',ids).fetchall()
            if len(rows)!=len(ids):raise AppError('部分照片不存在，请刷新媒体库','NOT_FOUND',404)
            allowed=[r['id'] for r in rows if not data.published or (r['processing']=='ready' and not r['duplicate_of'] and (r['similarity_reviewed'] or r['similar_photos']=='[]'))]
            if allowed:
                conn.execute('UPDATE photos SET published=?,publish_requested=? WHERE id IN ('+','.join('?' for _ in allowed)+')',[int(data.published),int(data.published),*allowed])
        return {'updated':len(allowed),'skipped':len(ids)-len(allowed)}

    @app.put('/api/admin/photos/{identifier}')
    def save_photo(identifier:str,data:PhotoInput,session=Depends(admin)):
        return content.save_photo(identifier,data.model_dump())

    @app.delete('/api/admin/photos/{identifier}')
    def archive_photo(identifier:str,session=Depends(admin)):
        media.get(identifier,True)
        db.execute('UPDATE photos SET published=0,publish_requested=0,deleted=? WHERE id=?',(time.time(),identifier))
        return {'ok':True,'retained_original':True}

    @app.get('/api/admin/archived')
    def archived(session=Depends(admin)):
        return {'photos':[media.serialize(x,True) for x in db.all('SELECT * FROM photos WHERE deleted IS NOT NULL ORDER BY deleted DESC')]}

    @app.post('/api/admin/photos/{identifier}/restore')
    def restore_photo(identifier:str,session=Depends(admin)):
        if not db.execute('UPDATE photos SET deleted=NULL,published=0 WHERE id=? AND deleted IS NOT NULL',(identifier,)):
            raise AppError('回收站没有这张照片','NOT_FOUND',404)
        return {'ok':True}

    @app.post('/api/admin/photos/{identifier}/retry')
    def retry_processing(identifier:str,session=Depends(admin)):
        photo=media.get(identifier,True)
        if photo['processing'] in ('processing','pending'):
            return {'ok':True}
        with db.connect() as conn:
            conn.execute("UPDATE photos SET processing='pending',error='' WHERE id=?",(identifier,))
            conn.execute("DELETE FROM jobs WHERE photo_id=? AND status!='running'",(identifier,))
            conn.execute('INSERT INTO jobs(id,photo_id,available) VALUES(?,?,-1)',(str(uuid.uuid4()),identifier))
        return {'ok':True}

    def original_response(photo):
        from .media.formats import IMAGE_TYPES
        master=db.one('SELECT original_path,original_name FROM photo_masters WHERE photo_id=?',(photo['id'],))
        source=master or photo
        path=config.data/source['original_path']
        if not path.is_file():
            raise AppError('原文件暂不可用','ORIGINAL_UNAVAILABLE',404)
        return FileResponse(path,filename=source['original_name'],media_type=IMAGE_TYPES.get(path.suffix.lower(),'application/octet-stream'))

    @app.get('/api/admin/photos/{identifier}/original')
    def original(identifier:str,session=Depends(admin)):
        return original_response(media.get(identifier,True))

    @app.get('/api/public/photos/{identifier}/download')
    def download_photo(identifier:str):
        from .media.watermark import cached,download_name
        photo=media.get(identifier)
        if not photo.get('jpeg_ready'):
            raise AppError('展示图尚未就绪','NOT_FOUND',404)
        return FileResponse(cached(config,photo['id']),filename=download_name(photo),media_type='image/jpeg')

    @app.get('/media/{identifier}/{variant}')
    def derivative(identifier:str,variant:str,request:Request):
        authenticated=False
        try:
            auth.session(request.cookies.get(COOKIE));authenticated=True
        except AppError:pass
        photo=media.get(identifier,authenticated)
        from .media.thumbnails import THUMBNAILS, cached as thumbnail, variant as thumbnail_variant
        thumbnail_sizes = {thumbnail_variant(size, version): (size, version) for version in (1, 2) for size in THUMBNAILS}
        if variant not in (*thumbnail_sizes, '480.webp','960.webp','1600.webp','2400.webp','full.jpg') or photo['processing']!='ready':
            raise AppError('展示图尚未就绪','NOT_FOUND',404)
        if variant=='full.jpg':
            from .media.watermark import cached
            return FileResponse(cached(config,photo['id']),media_type='image/jpeg')
        if variant in thumbnail_sizes:
            try:
                path=thumbnail(config.data/'media'/photo['id'],*thumbnail_sizes[variant])
            except FileNotFoundError:
                raise AppError('此版本尚未生成','NOT_FOUND',404)
            response=FileResponse(path,media_type='image/webp')
            response.set_stat_headers(path.stat())
            # Recheck visibility on every request while reusing unchanged response bytes.
            request.state.thumbnail_cache=True
            response.headers['Cache-Control']='private, max-age=0, must-revalidate'
            if request.headers.get('if-none-match')==response.headers.get('etag'):
                # A 304 has no representation body. Forward cache validators only;
                # copying FileResponse's Content-Length breaks the tunnel's framing.
                validators={key:response.headers[key] for key in ('cache-control','etag','last-modified','vary') if key in response.headers}
                return Response(status_code=304,headers=validators)
            return response
        path=config.data/'media'/photo['id']/variant
        if not path.is_file():raise AppError('此版本尚未生成','NOT_FOUND',404)
        return FileResponse(path,media_type='image/jpeg' if variant=='full.jpg' else 'image/webp')

    @app.get('/api/admin/albums')
    def admin_albums(session=Depends(admin)):
        return {'albums':content.albums(True)}

    @app.post('/api/admin/albums')
    def create_album(data:AlbumInput,session=Depends(admin)):
        return content.save_album(data.model_dump())

    @app.put('/api/admin/albums/{identifier}')
    def update_album(identifier:str,data:AlbumInput,session=Depends(admin)):
        if not db.one('SELECT id FROM albums WHERE id=?',(identifier,)):raise AppError('相册不存在','NOT_FOUND',404)
        return content.save_album(data.model_dump(),identifier)

    @app.delete('/api/admin/albums/{identifier}')
    def delete_album(identifier:str,session=Depends(admin)):
        from .content.albums import archive
        return archive(db,identifier)

    @app.post('/api/admin/albums/{identifier}/merge')
    def merge_album(identifier:str,data:AlbumMergeInput,session=Depends(admin)):
        from .content.albums import merge
        return merge(db,identifier,data.target_id)

    @app.get('/api/admin/archived-albums')
    def archived_albums(session=Depends(admin)):
        return {'albums':db.all('SELECT id,title,kind,merged_into,archived_at FROM albums WHERE archived_at IS NOT NULL ORDER BY archived_at DESC')}

    @app.post('/api/admin/albums/{identifier}/restore')
    def restore_album(identifier:str,session=Depends(admin)):
        from .content.albums import restore
        return restore(db,identifier)

    @app.get('/api/admin/posts')
    def admin_posts(session=Depends(admin)):
        return {'posts':content.posts(True)}

    @app.get('/api/admin/posts/{identifier}')
    def admin_post(identifier:str,session=Depends(admin)):
        return content.post(identifier,True)

    @app.post('/api/admin/posts')
    def create_post(data:PostInput,session=Depends(admin)):
        return content.save_post(data.model_dump())

    @app.put('/api/admin/posts/{identifier}')
    def update_post(identifier:str,data:PostInput,session=Depends(admin)):
        content.post(identifier,True);return content.save_post(data.model_dump(),identifier)

    @app.delete('/api/admin/posts/{identifier}')
    def delete_post(identifier:str,session=Depends(admin)):
        content.post(identifier,True);db.execute('UPDATE posts SET published=0 WHERE id=?',(identifier,));return {'ok':True}

    @app.get('/api/admin/settings')
    def admin_settings(session=Depends(admin)):
        return content.settings()

    @app.put('/api/admin/settings')
    def save_settings(data:SettingInput,session=Depends(admin)):
        with db.connect() as conn:
            for key,value in data.model_dump().items():
                conn.execute('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(key,value))
        return content.settings()

    @app.post('/api/admin/photos/{identifier}/confirm-distinct')
    def confirm_distinct(identifier:str,session=Depends(admin)):
        photo=media.get(identifier,True)
        if photo.get('duplicate_of'):raise AppError('此文件与另一作品的像素完全相同','DUPLICATE_IMAGE',409)
        db.execute('UPDATE photos SET similarity_reviewed=1 WHERE id=?',(identifier,))
        return {'ok':True}

    @app.post('/api/admin/uploads')
    def init_upload(data:UploadInit,session=Depends(admin)):
        return uploads.create(session['user_id'],data.filename,data.size,data.sha256,data.album_id,data.relative_path,data.master_photo_id)

    @app.get('/api/admin/uploads')
    def active_uploads(session=Depends(admin)):
        return {'uploads':[uploads.get(x['id'],session['user_id']) for x in db.all("SELECT id FROM uploads WHERE user_id=? AND status='receiving' AND expires>? ORDER BY created DESC",(session['user_id'],time.time()))]}

    @app.get('/api/admin/uploads/{identifier}')
    def get_upload(identifier:str,session=Depends(admin)):
        return uploads.get(identifier,session['user_id'])

    @app.put('/api/admin/uploads/{identifier}/chunks/{number}')
    async def chunk(identifier:str,number:int,request:Request,session=Depends(admin)):
        if config.required_mount and not Path(config.required_mount).is_mount():raise AppError('照片存储暂不可用','STORAGE_UNAVAILABLE',503)
        data=bytearray()
        async for block in request.stream():
            data.extend(block)
            if len(data)>config.chunk_size:raise AppError('分块过大','SIZE_LIMIT',413)
        checksum=request.headers.get('x-chunk-sha256','')
        return await run_in_threadpool(uploads.put_chunk,identifier,number,bytes(data),checksum,session['user_id'])

    @app.post('/api/admin/uploads/{identifier}/complete')
    def finish_upload(identifier:str,session=Depends(admin)):
        if config.required_mount and not Path(config.required_mount).is_mount():raise AppError('照片存储暂不可用','STORAGE_UNAVAILABLE',503)
        return uploads.complete(identifier,session['user_id'])

    @app.delete('/api/admin/uploads/{identifier}')
    def cancel_upload(identifier:str,session=Depends(admin)):
        upload=uploads.get(identifier,session['user_id'])
        if upload['status']=='complete':raise AppError('原图已保存，请在媒体管理中归档','UPLOAD_COMPLETE',409)
        db.execute("UPDATE uploads SET status='cancelled' WHERE id=?",(identifier,));return {'ok':True}

    @app.get('/api/admin/jobs')
    def jobs(session=Depends(admin)):
        return {'jobs':db.all("SELECT j.id,j.photo_id,j.status,j.attempts,j.error,p.title FROM jobs j JOIN photos p ON p.id=j.photo_id WHERE j.status!='complete' ORDER BY j.available LIMIT 100")}

    @app.api_route('/{path:path}',methods=['GET','HEAD'],include_in_schema=False)
    def frontend(path:str,request:Request):
        if path.startswith(('api/','media/','originals/','uploads/','data/')):
            raise AppError('地址不存在','NOT_FOUND',404)
        clean=(config.frontend/path).resolve()
        if config.frontend not in clean.parents and clean!=config.frontend:raise AppError('地址不存在','NOT_FOUND',404)
        if clean.is_file():return FileResponse(clean)
        if (clean/'index.html').is_file():return FileResponse(clean/'index.html')
        section=path.split('/')[0]
        if section in ('photos','albums','journal') and '/' in path:
            identifier=path.split('/')[1]
            if section=='photos':record=media.get(identifier)
            elif section=='journal':record=content.post(identifier)
            else:
                record=db.one('SELECT * FROM albums WHERE slug=? AND published=1',(identifier,))
                if not record:raise AppError('相册不存在','NOT_FOUND',404)
            template=config.frontend/section/'index.html'
            if template.exists():
                body=template.read_text().replace('<title>PixelCore</title>','<title>'+html.escape(record['title'])+' · PixelCore</title>')
                return HTMLResponse(body)
        if not path and (config.frontend/'index.html').exists():return FileResponse(config.frontend/'index.html')
        raise AppError('页面不存在','NOT_FOUND',404)

    return app
