import json
import hashlib
import math
import os
import shutil
import threading
import time
import uuid
from pathlib import Path
from ..errors import AppError
from ..media.formats import UPLOAD_EXTENSIONS


class UploadService:
    def __init__(self, db, config):
        self.db, self.config = db, config
        self.locks = {}
        self.guard = threading.Lock()

    def lock(self, identifier):
        with self.guard:
            return self.locks.setdefault(identifier, threading.Lock())

    def get(self, identifier, user_id):
        row = self.db.one('SELECT * FROM uploads WHERE id=? AND user_id=?', (identifier, user_id))
        if not row or (row['expires'] < time.time() and row['status'] != 'complete'):
            raise AppError('上传会话已过期，请重新选择文件', 'UPLOAD_EXPIRED', 404)
        chunks = self.db.all('SELECT number FROM upload_chunks WHERE upload_id=? ORDER BY number', (identifier,))
        photo=self.db.one('SELECT processing,duplicate_of FROM photos WHERE id=?',(row['photo_id'],)) if row['photo_id'] else None
        return {**row, 'duplicate_of':photo['duplicate_of'] if photo else '', 'received': [x['number'] for x in chunks], 'chunks': math.ceil(row['size'] / row['chunk_size'])}

    def create(self, user_id, filename, size, checksum, album_id=None, relative_path='', master_photo_id=None):
        if relative_path and (relative_path.startswith(('/', '\\')) or '..' in relative_path.replace('\\','/').split('/')):
            raise AppError('照片目录必须为相对路径','INVALID_CONTEXT',422)
        if master_photo_id:
            for _ in range(5):
                alias=self.db.one('SELECT deleted,duplicate_of FROM photos WHERE id=?',(master_photo_id,))
                if not alias or not alias['deleted'] or not alias['duplicate_of']:break
                master_photo_id=alias['duplicate_of']
        if master_photo_id and not self.db.one('SELECT id FROM photos WHERE id=? AND deleted IS NULL',(master_photo_id,)):
            raise AppError('要关联的照片不存在','NOT_FOUND',404)
        context=json.dumps({'relative_path':relative_path.replace('\\','/')[:1024]},ensure_ascii=False)
        if self.config.required_mount and not os.path.ismount(self.config.required_mount):
            raise AppError('照片存储暂不可用','STORAGE_UNAVAILABLE',503)
        if Path(filename).suffix.lower() not in UPLOAD_EXTENSIONS:
            raise AppError('支持 JPEG、PNG、TIFF、WebP、HEIC 和相机 RAW 原片', 'UNSUPPORTED_UPLOAD', 422)
        if size <= 0 or size > self.config.max_upload:
            raise AppError(f'单张照片不得超过 {self.config.max_upload/1024**3:g} GiB', 'SIZE_LIMIT', 413)
        if shutil.disk_usage(self.config.data).free < size*2 + 1024**3:
            raise AppError('照片存储空间不足，请释放空间后重试','STORAGE_FULL',507)
        if album_id and not self.db.one('SELECT id FROM albums WHERE id=? AND archived_at IS NULL', (album_id,)):
            raise AppError('请选择有效相册', 'ALBUM_NOT_FOUND', 404)
        with self.db.connect() as conn:
            conn.execute('BEGIN IMMEDIATE')
            if master_photo_id:
                photo=conn.execute('SELECT id FROM photos WHERE id=? AND sha256=? AND size=? AND deleted IS NULL',(master_photo_id,checksum,size)).fetchone()
                if not photo:
                    photo=conn.execute('SELECT photo_id AS id FROM photo_masters WHERE photo_id=? AND sha256=? AND size=?',(master_photo_id,checksum,size)).fetchone()
            else:
                photo = conn.execute('SELECT id FROM photos WHERE sha256=? AND size=? AND deleted IS NULL LIMIT 1',(checksum,size)).fetchone()
            if photo:
                return {'id':'duplicate:'+photo['id'],'photo_id':photo['id'],'status':'duplicate','received':[],'chunks':0,'chunk_size':self.config.chunk_size,'filename':filename,'size':size,'sha256':checksum}
            existing = conn.execute("SELECT u.* FROM uploads u LEFT JOIN photos p ON u.photo_id=p.id WHERE u.user_id=? AND u.sha256=? AND u.size=? AND u.master_photo_id IS ? AND ((u.status='receiving' AND u.expires>?) OR (u.status='complete' AND p.deleted IS NULL)) ORDER BY u.created DESC LIMIT 1", (user_id, checksum, size, master_photo_id, time.time())).fetchone()
            if existing:
                identifier = existing['id']
            else:
                count = conn.execute("SELECT COUNT(*) FROM uploads WHERE user_id=? AND status='receiving' AND expires>?", (user_id,time.time())).fetchone()[0]
                if count >= 100:
                    raise AppError('待完成上传过多，请先完成已有队列', 'QUEUE_LIMIT', 429)
                identifier = str(uuid.uuid4())
                filename = Path(filename.replace('\\','/')).name[:240]
                conn.execute('INSERT INTO uploads(id,user_id,filename,size,sha256,chunk_size,album_id,created,expires) VALUES(?,?,?,?,?,?,?,?,?)', (identifier,user_id,filename,size,checksum,self.config.chunk_size,album_id,time.time(),time.time()+7*86400))
        self.db.execute('UPDATE uploads SET source_context=?,master_photo_id=? WHERE id=?',(context,master_photo_id,identifier))
        (self.config.data / 'uploads' / identifier).mkdir(mode=0o700, exist_ok=True)
        return self.get(identifier, user_id)

    def put_chunk(self, identifier, number, data, checksum, user_id):
        with self.lock(identifier):
            upload = self.get(identifier, user_id)
            if number < 0 or number >= upload['chunks']:
                raise AppError('分块编号无效', 'INVALID_CHUNK')
            expected = min(upload['chunk_size'], upload['size'] - number * upload['chunk_size'])
            if len(data) != expected or hashlib.sha256(data).hexdigest() != checksum:
                raise AppError('分块校验失败，请重试当前分块', 'CHUNK_CHECKSUM', 422)
            old = self.db.one('SELECT * FROM upload_chunks WHERE upload_id=? AND number=?', (identifier,number))
            if old:
                if old['sha256'] != checksum:
                    raise AppError('分块内容冲突', 'CHUNK_CONFLICT', 409)
                return self.get(identifier, user_id)
            if upload['status'] != 'receiving':
                raise AppError('上传已完成', 'UPLOAD_COMPLETE', 409)
            folder = self.config.data / 'uploads' / identifier
            folder.mkdir(exist_ok=True,mode=0o700)
            temporary = folder / f'{number}.tmp'
            with temporary.open('wb') as file:
                file.write(data);file.flush();os.fsync(file.fileno())
            temporary.replace(folder / f'{number}.chunk')
            self.db.execute('INSERT INTO upload_chunks VALUES(?,?,?,?)', (identifier,number,checksum,len(data)))
            return self.get(identifier, user_id)

    def complete(self, identifier, user_id):
        with self.lock(identifier):
            upload = self.get(identifier, user_id)
            if upload['status'] == 'complete':
                return {'photo_id': upload['photo_id'], 'status': 'original_saved'}
            if upload['status'] != 'receiving':
                raise AppError('此上传已取消，请重新选择文件', 'UPLOAD_CANCELLED', 409)
            if len(upload['received']) != upload['chunks']:
                raise AppError('还有未完成的分块，可以继续上传', 'CHUNKS_MISSING', 409)
            photo_id = str(uuid.uuid4())
            folder = self.config.data / 'uploads' / identifier
            assembled = folder / 'assembled.tmp'
            total, digest = 0, hashlib.sha256()
            with assembled.open('wb') as destination:
                for number in range(upload['chunks']):
                    with (folder / f'{number}.chunk').open('rb') as source:
                        while block := source.read(1024*1024):
                            destination.write(block);digest.update(block);total+=len(block)
                destination.flush();os.fsync(destination.fileno())
            if total != upload['size'] or digest.hexdigest() != upload['sha256']:
                assembled.unlink(missing_ok=True)
                raise AppError('原图校验失败，原文件未发布', 'FILE_CHECKSUM', 422)
            suffix = Path(upload['filename']).suffix.lower()[:12]
            destination = self.config.data / 'originals' / (photo_id + suffix)
            assembled.replace(destination)
            if upload.get('master_photo_id'):
                target=upload['master_photo_id']
                try:
                    with self.db.connect() as conn:
                        conn.execute('BEGIN IMMEDIATE')
                        for _ in range(5):
                            alias=conn.execute('SELECT deleted,duplicate_of FROM photos WHERE id=?',(target,)).fetchone()
                            if not alias or not alias['deleted'] or not alias['duplicate_of']:break
                            target=alias['duplicate_of']
                        if not conn.execute('SELECT id FROM photos WHERE id=? AND deleted IS NULL',(target,)).fetchone():
                            raise AppError('照片已归档，原文件未替换','NOT_FOUND',404)
                        conn.execute('INSERT INTO photo_masters VALUES(?,?,?,?,?,?) ON CONFLICT(photo_id) DO UPDATE SET original_path=excluded.original_path,original_name=excluded.original_name,sha256=excluded.sha256,size=excluded.size,created=excluded.created',(target,str(destination.relative_to(self.config.data)),upload['filename'],upload['sha256'],total,time.time()))
                        conn.execute("UPDATE photos SET processing=CASE WHEN published=1 AND jpeg_ready=1 THEN 'ready' ELSE 'pending' END,error='' WHERE id=?",(target,))
                        conn.execute('INSERT INTO jobs(id,photo_id,available) VALUES(?,?,-1)',(str(uuid.uuid4()),target))
                        conn.execute("UPDATE uploads SET status='complete',photo_id=? WHERE id=?",(target,identifier))
                except BaseException:
                    destination.unlink(missing_ok=True);raise
                for part in folder.glob('*.chunk'):part.unlink()
                return {'photo_id':target,'status':'master_saved'}
            try:
                with self.db.connect() as conn:
                    conn.execute('BEGIN IMMEDIATE')
                    other=conn.execute('SELECT id FROM photos WHERE sha256=? AND size=? AND deleted IS NULL LIMIT 1',(upload['sha256'],total)).fetchone()
                    if other:
                        destination.unlink(missing_ok=True)
                        photo_id=other['id']
                    else:
                        conn.execute('INSERT INTO photos(id,slug,title,original_name,original_path,sha256,size,created) VALUES(?,?,?,?,?,?,?,?)', (photo_id,photo_id,Path(upload['filename']).stem,upload['filename'],str(destination.relative_to(self.config.data)),upload['sha256'],total,time.time()))
                    if not other:
                        conn.execute('UPDATE photos SET source_context=? WHERE id=?',(upload.get('source_context','{}'),photo_id))
                    if upload['album_id']:
                        conn.execute('INSERT OR IGNORE INTO album_photos VALUES(?,?,?)', (upload['album_id'],photo_id,0))
                    if not other:
                        conn.execute('INSERT INTO jobs(id,photo_id,available) VALUES(?,?,-1)', (str(uuid.uuid4()),photo_id))
                    conn.execute("UPDATE uploads SET status='complete',photo_id=? WHERE id=?", (photo_id,identifier))
            except BaseException:
                destination.unlink(missing_ok=True)
                raise
            for part in folder.glob('*.chunk'):
                part.unlink()
            return {'photo_id':photo_id,'status':'original_saved'}
