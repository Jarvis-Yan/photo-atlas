import io
import json
import logging
import os
import time
import warnings
from PIL import Image, ImageOps, ImageCms, UnidentifiedImageError
from ..errors import AppError

Image.MAX_IMAGE_PIXELS = 120_000_000
WIDTHS = (480, 960, 1600, 2400)


def process_photo(db, config, identifier):
    row = db.one('SELECT * FROM photos WHERE id=? AND deleted IS NULL', (identifier,))
    if not row:
        return
    master=db.one('SELECT original_path FROM photo_masters WHERE photo_id=?',(identifier,))
    source = config.data / (master['original_path'] if master else row['original_path'])
    try:
        render_photo(db, config, row, source)
        from ..metadata import enrich
        enrich(db,config,identifier)
        from ..library import publish_requested
        publish_requested(db,config,identifier)
    except AppError:
        if not row.get('source_key') or not row.get('fallback_path'):
            raise
        fallback = (config.data / row['fallback_path']).resolve()
        if config.data not in fallback.parents or not fallback.is_file():
            raise
        render_photo(db, config, row, fallback)
        db.execute('UPDATE photos SET error=? WHERE id=?',('原图读取异常，已保留原文件；展示图使用旧相册历史预览。请上传备份原图后替换。',identifier))


def render_photo(db, config, row, source):
    import hashlib
    import pyvips
    import imagehash
    pyvips.cache_set_max_mem(64*1024**2)
    pyvips.cache_set_max(50)
    identifier=row['id']
    folder=config.data/'media'/identifier
    folder.mkdir(parents=True,exist_ok=True,mode=0o700)
    try:
        image=pyvips.Image.new_from_file(str(source),access='sequential',fail_on='error')
        loader=image.get('vips-loader')
        if loader=='uhdrload':
            # Ultra HDR JPEG contains a normal SDR base; serve that base as JPEG.
            image=pyvips.Image.jpegload(str(source),access='sequential',fail_on='error')
            loader=image.get('vips-loader')
        if not any(x in loader for x in ('jpeg','png','webp','tiff','heif')):
            raise AppError('不支持此图片格式','UNSUPPORTED_IMAGE')
        if image.width*image.height>120_000_000:
            raise AppError('图片超过1.2亿像素，请导出较小的成片','IMAGE_SIZE_LIMIT')
        # Preserve metadata recovered from a verified local original on reprocessing.
        exif=json.loads(row.get('exif') or '{}')
        for name,key in [('camera','exif-ifd0-Model'),('lens','exif-ifd2-LensModel'),('date','exif-ifd2-DateTimeOriginal'),('iso','exif-ifd2-ISOSpeedRatings'),('fnumber','exif-ifd2-FNumber'),('exposure','exif-ifd2-ExposureTime'),('focal_length','exif-ifd2-FocalLength')]:
            if image.get_typeof(key) and name not in exif.get('field_sources',{}):exif[name]=str(image.get(key)).split(' (')[0][:120]
        image=image.autorot()
        if image.get_typeof('icc-profile-data'):
            image=image.icc_transform('srgb',embedded=True)
        else:image=image.colourspace('srgb')
        if image.hasalpha():image=image.flatten(background=[255,255,255])
        if image.format!='uchar':image=image.cast('uchar',shift=image.format in ('ushort','short'))
        image=image.copy_memory()
        width,height=image.width,image.height
        pixels=image.write_to_memory()
        pixel_hash=hashlib.sha256(f'{width}x{height}:RGB:'.encode()+pixels).hexdigest()
        small=image.thumbnail_image(256,height=256,size='down')
        pillow=Image.frombytes('RGB',(small.width,small.height),small.write_to_memory())
        phash=str(imagehash.phash(pillow))
        full=folder/'full.jpg.tmp'
        image.jpegsave(str(full),Q=94,strip=True,optimize_coding=True,interlace=True)
        os.replace(full,folder/'full.jpg')
        from .watermark import generate
        generate(folder/'full.jpg',folder)
        # Generate from converted JPEG to avoid repeated decoding of layered TIFF.
        for target in WIDTHS:
            preview=pyvips.Image.thumbnail(str(folder/'full.jpg'),target,size='down')
            temp=folder/f'{target}.webp.tmp'
            preview.webpsave(str(temp),Q=84,strip=True,effort=4)
            os.replace(temp,folder/f'{target}.webp')
        from .thumbnails import THUMBNAILS, cached
        for target in THUMBNAILS:
            cached(folder, target)
        with db.connect() as conn:
            conn.execute('BEGIN IMMEDIATE')
            other=conn.execute("SELECT id FROM photos WHERE pixel_hash=? AND id!=? AND deleted IS NULL LIMIT 1",(pixel_hash,identifier)).fetchone()
            duplicate=other['id'] if other and not row.get('source_key') else ''
            similar=[]
            for candidate in conn.execute("SELECT id,phash,width,height FROM photos WHERE id!=? AND deleted IS NULL AND phash!=''",(identifier,)):
                if candidate['width'] and candidate['height'] and abs(width/height-candidate['width']/candidate['height'])<0.04 and (int(phash,16)^int(candidate['phash'],16)).bit_count()<=10:
                    similar.append(candidate['id'])
            conn.execute('UPDATE photos SET similar_photos=?,similarity_reviewed=0 WHERE id=?',(json.dumps(similar[:30]),identifier))
            conn.execute("UPDATE photos SET processing='ready',error='',mime='image/jpeg',width=?,height=?,exif=?,jpeg_ready=1,pixel_hash=?,phash=?,duplicate_of=? WHERE id=?",(width,height,json.dumps(exif),pixel_hash,phash,duplicate,identifier))
            if duplicate:
                conn.execute('INSERT OR IGNORE INTO album_photos SELECT album_id,?,position FROM album_photos WHERE photo_id=?',(duplicate,identifier))
                conn.execute('INSERT OR IGNORE INTO photo_masters SELECT ?,original_path,original_name,sha256,size,created FROM photo_masters WHERE photo_id=?',(duplicate,identifier))
                conn.execute('UPDATE albums SET cover_id=? WHERE cover_id=?',(duplicate,identifier))
                conn.execute('UPDATE photos SET deleted=?,published=0,publish_requested=0 WHERE id=?',(time.time(),identifier))
    except AppError:raise
    except (pyvips.Error, OSError, ValueError) as error:
        raise AppError('原片已保存，图片解码或转换失败，请检查文件后重试','IMAGE_PROCESSING_FAILED') from error


def run_once(db, config):
    if config.required_mount and not os.path.ismount(config.required_mount):
        return False
    now=time.time()
    with db.connect() as conn:
        conn.execute('BEGIN IMMEDIATE')
        stale=conn.execute("SELECT photo_id FROM jobs WHERE status='running' AND lease<? AND attempts>=3",(now,)).fetchall()
        for row in stale:
            message='图片任务多次中断，原图已保留；请检查存储或处理资源后重试'
            conn.execute("UPDATE jobs SET status='failed',error=? WHERE photo_id=? AND status='running'",(message,row['photo_id']))
            conn.execute("UPDATE photos SET processing=CASE WHEN published=1 AND jpeg_ready=1 THEN 'ready' ELSE 'failed' END,error=? WHERE id=?",(message,row['photo_id']))
        job=conn.execute("SELECT * FROM jobs WHERE (status='pending' AND available<=?) OR (status='running' AND lease<?) ORDER BY available,id LIMIT 1",(now,now)).fetchone()
        if not job:
            return False
        job=dict(job)
        conn.execute("UPDATE jobs SET status='running',attempts=attempts+1,lease=? WHERE id=?",(now+1800,job['id']))
        conn.execute("UPDATE photos SET processing=CASE WHEN published=1 AND jpeg_ready=1 THEN 'ready' ELSE 'processing' END WHERE id=? AND deleted IS NULL",(job['photo_id'],))
    try:
        process_photo(db,config,job['photo_id'])
        db.execute("UPDATE jobs SET status='complete',lease=0,error='' WHERE id=?",(job['id'],))
    except Exception as error:
        attempts=job['attempts']+1
        message=error.message if isinstance(error,AppError) else '图片处理暂时失败，请在后台重试'
        db.execute("UPDATE jobs SET status=?,available=?,lease=0,error=? WHERE id=?",('failed' if attempts>=3 else 'pending',now+5*attempts,message,job['id']))
        db.execute("UPDATE photos SET processing=CASE WHEN published=1 AND jpeg_ready=1 THEN 'ready' ELSE 'failed' END,error=? WHERE id=?",(message,job['photo_id']))
        logging.error(json.dumps({'event':'image_job_failed','photo_id':job['photo_id'],'attempt':attempts,'error_type':type(error).__name__}))
    return True
