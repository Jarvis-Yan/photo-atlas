#!/usr/bin/env python3
"""Populate an empty local database with synthetic illustrations, never real photographs."""
import hashlib
import io
from urllib.parse import urlparse
from PIL import Image, ImageDraw
from run import configure, ROOT

configure()
from app.main import create_app
from app.config import Settings
from app.content.service import ContentService
from app.media.repository import MediaRepository
from app.media.processing import run_once

config = Settings.from_env()
if urlparse(config.origin).hostname not in ('localhost', '127.0.0.1') or config.data != ROOT / 'data':
    raise SystemExit('Demo requires a loopback origin and this repository/data directory.')
app = create_app(config)
db = app.state.db
if any(db.one('SELECT COUNT(*) n FROM ' + table)['n'] for table in ('photos', 'albums', 'posts')):
    raise SystemExit('Demo requires an empty database; existing content was left unchanged.')
user = db.one('SELECT id FROM users LIMIT 1')['id']
content = ContentService(db, MediaRepository(db))
album = content.save_album({'title': 'Synthetic light studies', 'kind': 'series', 'description': 'Generated geometric illustrations. No personal photographs.', 'published': True})
for i, color in enumerate([(31, 78, 111), (130, 76, 57), (63, 103, 89), (71, 58, 105)]):
    image = Image.new('RGB', (1000 + i*100, 700 + i*160), color)
    draw = ImageDraw.Draw(image)
    draw.ellipse((100+i*30, 100, 500+i*30, 500), fill=(230-i*20, 190+i*10, 130+i*15))
    draw.polygon([(0, image.height), (image.width//2, 230+i*100), (image.width, image.height)], fill=(15+i*20, 35+i*10, 50+i*20))
    draw.text((40, 40), 'PIXELCORE / SYNTHETIC STUDY ' + str(i+1), fill='white')
    buffer = io.BytesIO(); image.save(buffer, 'PNG'); payload = buffer.getvalue()
    session = app.state.uploads.create(user, 'study-'+str(i+1)+'.png', len(payload), hashlib.sha256(payload).hexdigest(), album['id'])
    for number, offset in enumerate(range(0, len(payload), config.chunk_size)):
        chunk = payload[offset:offset+config.chunk_size]
        app.state.uploads.put_chunk(session['id'], number, chunk, hashlib.sha256(chunk).hexdigest(), user)
    identifier = app.state.uploads.complete(session['id'], user)['photo_id']
    run_once(db, config)
    # Synthetic illustrations are manually reviewed distinct demo works.
    db.execute('UPDATE photos SET similarity_reviewed=1 WHERE id=?', (identifier,))
    content.save_photo(identifier, {'title': 'Light study '+str(i+1), 'caption': '程序生成的几何插画，用于演示排版；不是摄影作品。', 'alt': '几何山形与圆形色块', 'category': '自然', 'tags': ['演示'], 'published': True, 'featured': True, 'album_ids': [album['id']]})
content.save_post({'title': '欢迎使用 PixelCore', 'excerpt': '用自己的照片开始建立作品集。', 'body': '这是本地演示内容。四张配图均由程序生成，不包含个人摄影作品。\n\n可以在管理后台上传照片、编辑相册和撰写随笔。', 'published': True})
for key, value in {'site_name': 'PixelCore Demo', 'subtitle': '你的摄影作品集', 'description': '独立部署，记录你自己的光影与旅程。', 'about': '这是一个只含程序生成插画的本地演示。请在设置中替换为自己的介绍。'}.items():
    db.execute('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (key, value))
print('Created 4 synthetic illustrations, 1 album and 1 journal post in local data/.')
