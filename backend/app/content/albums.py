"""Album organization with retained source memberships and recoverable history."""
import json
import re
import time
import unicodedata
import uuid
from ..errors import AppError

KINDS = {'travel': '旅行', 'project': '拍摄项目', 'series': '专题'}


def name_key(title):
    return re.sub(r'[\s·・\-_]+', '', unicodedata.normalize('NFKC', title).casefold())


def validate_name(conn, title, kind, identifier=None):
    if not title.strip():
        raise AppError('请输入相册名称', 'INVALID_ALBUM')
    if kind not in KINDS:
        raise AppError('请选择旅行、拍摄项目或专题', 'INVALID_ALBUM')
    for row in conn.execute('SELECT id,title FROM albums WHERE archived_at IS NULL AND kind=?', (kind,)):
        if row['id'] != identifier and name_key(row['title']) == name_key(title):
            raise AppError('同类型已有同名相册，请使用现有相册或合并', 'DUPLICATE_ALBUM', 409)


def resolve(db, identifier, public=False):
    row = db.one('SELECT * FROM albums WHERE id=? OR slug=?', (identifier, identifier))
    seen = set()
    while row and row['merged_into'] and row['id'] not in seen:
        seen.add(row['id'])
        row = db.one('SELECT * FROM albums WHERE id=?', (row['merged_into'],))
    if not row or row['archived_at'] is not None or (public and not row['published']):
        raise AppError('相册不存在或已归档', 'NOT_FOUND', 404)
    return row


def merge(db, source_id, target_id):
    with db.connect() as conn:
        conn.execute('BEGIN IMMEDIATE')
        merge_in_transaction(conn, source_id, target_id)
    return {'ok': True, 'target_id': target_id, 'photos_retained': True}


def merge_in_transaction(conn, source_id, target_id):
    rows = {r['id']: dict(r) for r in conn.execute('SELECT * FROM albums WHERE id IN (?,?)', (source_id, target_id))}
    if source_id == target_id or len(rows) != 2 or any(r['archived_at'] is not None for r in rows.values()):
        raise AppError('请选择两个不同的活动相册', 'INVALID_ALBUM', 409)
    snapshot = {'albums': list(rows.values()), 'memberships': [dict(r) for r in conn.execute('SELECT * FROM album_photos WHERE album_id IN (?,?)', (source_id, target_id))]}
    conn.execute('INSERT INTO album_events VALUES(?,?,?,?,?,?)', (str(uuid.uuid4()), 'merge', source_id, target_id, json.dumps(snapshot, ensure_ascii=False), time.time()))
    # The primary key makes the target a union without duplicate memberships.
    conn.execute('INSERT OR IGNORE INTO album_photos(album_id,photo_id,position) SELECT ?,photo_id,position FROM album_photos WHERE album_id=?', (target_id, source_id))
    conn.execute('UPDATE uploads SET album_id=? WHERE album_id=?', (target_id, source_id))
    conn.execute('UPDATE albums SET published=MAX(published,?),cover_id=COALESCE(cover_id,?) WHERE id=?', (rows[source_id]['published'], rows[source_id]['cover_id'], target_id))
    conn.execute('UPDATE albums SET archived_at=?,published=0,merged_into=? WHERE id=?', (time.time(), target_id, source_id))


def archive(db, identifier):
    with db.connect() as conn:
        conn.execute('BEGIN IMMEDIATE')
        row = conn.execute('SELECT * FROM albums WHERE id=? AND archived_at IS NULL', (identifier,)).fetchone()
        if not row:
            raise AppError('相册不存在或已归档', 'NOT_FOUND', 404)
        if conn.execute("SELECT COUNT(*) FROM uploads WHERE album_id=? AND status='receiving'", (identifier,)).fetchone()[0]:
            raise AppError('相册仍有待完成上传', 'ALBUM_BUSY', 409)
        conn.execute('INSERT INTO album_events VALUES(?,?,?,?,?,?)', (str(uuid.uuid4()), 'archive', identifier, None, json.dumps(dict(row), ensure_ascii=False), time.time()))
        conn.execute('UPDATE albums SET archived_at=?,published=0 WHERE id=?', (time.time(), identifier))
    return {'ok': True, 'photos_retained': True}


def restore(db, identifier):
    with db.connect() as conn:
        conn.execute('BEGIN IMMEDIATE')
        row = conn.execute('SELECT * FROM albums WHERE id=?', (identifier,)).fetchone()
        if not row or row['archived_at'] is None or row['merged_into']:
            raise AppError('合并相册请使用合并记录恢复；普通归档相册可直接恢复', 'INVALID_ALBUM', 409)
        validate_name(conn, row['title'], row['kind'], identifier)
        conn.execute('UPDATE albums SET archived_at=NULL,published=0 WHERE id=?', (identifier,))
    return {'ok': True}
