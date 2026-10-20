import json
import time
import uuid
import re
import bleach
import markdown
from ..errors import AppError

DEFAULT_SETTINGS={'site_name':'Photo Atlas','subtitle':'摄影作品与旅行记录','description':'风景、街巷，以及拍摄时的随笔。','about':'这里是我的个人影像空间，收藏旅行中的风景，也记录身边的街巷。','contact':'','copyright':'© Photo Atlas · 摄影与记录'}


def safe_markdown(text):
    html=markdown.markdown(text,extensions=['extra','sane_lists'])
    return bleach.clean(html,tags=['p','br','h2','h3','h4','strong','em','ul','ol','li','blockquote','pre','code','a','img','hr','table','thead','tbody','tr','td','th'],attributes={'a':['href','title'],'img':['src','alt','title']},protocols=['https','http'],strip=True)


def slug_for(title):
    value=re.sub(r'[^\w\-]+','-',title.strip().lower()).strip('-')[:80]
    return value or str(uuid.uuid4())


class ContentService:
    def __init__(self, db, media):
        self.db,self.media=db,media

    def settings(self):
        return {**DEFAULT_SETTINGS,**{x['key']:x['value'] for x in self.db.all('SELECT * FROM settings')}}

    def albums(self, admin=False):
        rows=self.db.all('SELECT * FROM albums WHERE archived_at IS NULL'+('' if admin else ' AND published=1')+' ORDER BY position,title')
        from .album_summary import summarize
        members={}
        for member in self.db.all("SELECT ap.album_id,p.captured,p.geo FROM album_photos ap JOIN photos p ON p.id=ap.photo_id JOIN albums a ON a.id=ap.album_id WHERE a.archived_at IS NULL AND p.deleted IS NULL"+('' if admin else " AND a.published=1 AND p.published=1 AND p.processing='ready'")):
            members.setdefault(member['album_id'],[]).append(member)
        for row in rows:
            row.update(summarize(members.get(row['id'],[])))
            photos=self.media.list(admin=admin,album_id=row['id'])
            row['count']=self.db.one('SELECT COUNT(*) AS n FROM album_photos ap JOIN photos p ON p.id=ap.photo_id WHERE ap.album_id=? AND p.deleted IS NULL'+('' if admin else " AND p.published=1 AND p.processing='ready'"),(row['id'],))['n']
            cover=next((x for x in photos if x['id']==row['cover_id'] and x['processing']=='ready'),None)
            if not cover:
                cover=next((x for x in photos if x['processing']=='ready'),None)
            row['cover']=self.media.serialize(cover,admin) if cover else None
        return rows

    def save_album(self, data, identifier=None):
        identifier=identifier or str(uuid.uuid4())
        if data.get('cover_id'):
            if not self.db.one('SELECT * FROM album_photos WHERE album_id=? AND photo_id=?',(identifier,data['cover_id'])):
                raise AppError('封面须选择此相册内的照片','INVALID_COVER')
        data['title']=data['title'].strip()
        kind=data.get('kind','series')
        slug=data.get('slug') or slug_for(data['title'])+'-'+identifier[:6]
        with self.db.connect() as conn:
            conn.execute('BEGIN IMMEDIATE')
            from .albums import validate_name
            validate_name(conn,data['title'],kind,identifier)
            old=conn.execute('SELECT archived_at FROM albums WHERE id=?',(identifier,)).fetchone()
            if old and old['archived_at'] is not None:raise AppError('请先恢复归档相册','ALBUM_ARCHIVED',409)
            conn.execute('INSERT INTO albums(id,slug,title,description,published,position,cover_id) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,published=excluded.published,position=excluded.position,cover_id=excluded.cover_id', (identifier,slug,data['title'],data.get('description',''),int(data.get('published',False)),data.get('position',0),data.get('cover_id')))
            conn.execute('UPDATE albums SET kind=? WHERE id=?',(kind,identifier))
        return self.db.one('SELECT * FROM albums WHERE id=?',(identifier,))

    def save_photo(self, identifier, data):
        photo=self.media.get(identifier,True)
        if data['published'] and photo['processing']!='ready':
            raise AppError('展示图生成完成后才能发布','PHOTO_NOT_READY',409)
        if data['published'] and (photo.get('duplicate_of') or (json.loads(photo.get('similar_photos') or '[]') and not photo.get('similarity_reviewed'))):
            raise AppError('请先比较相似照片，确认不同作品后再发布','DUPLICATE_REVIEW_REQUIRED',409)
        album_ids=data.get('album_ids',[])
        for album_id in album_ids:
            if not self.db.one('SELECT id FROM albums WHERE id=? AND archived_at IS NULL',(album_id,)):
                raise AppError('相册不存在','NOT_FOUND',404)
        with self.db.connect() as conn:
            conn.execute('BEGIN IMMEDIATE')
            current=conn.execute('SELECT tags,category,title FROM photos WHERE id=?',(identifier,)).fetchone()
            if current['title']!=data['title']:
                conn.execute('UPDATE photos SET title_locked=1 WHERE id=?',(identifier,))
            if json.loads(current['tags']) != data.get('tags',[]):
                conn.execute('UPDATE photos SET tags_locked=1 WHERE id=?',(identifier,))
            category=data.get('category')
            if category is not None and category != current['category']:
                if category:
                    conn.execute('UPDATE photos SET category=?,category_locked=1 WHERE id=?',(category,identifier))
                else:
                    conn.execute("UPDATE photos SET category='',category_locked=0 WHERE id=?",(identifier,))
            conn.execute('UPDATE photos SET publish_requested=? WHERE id=?',(int(data['published']),identifier))
            conn.execute('UPDATE photos SET title=?,caption=?,alt=?,tags=?,published=?,featured=?,position=? WHERE id=?', (data['title'],data.get('caption',''),data.get('alt',''),json.dumps(data.get('tags',[])),int(data['published']),int(data.get('featured',False)),data.get('position',0),identifier))
            conn.execute('DELETE FROM album_photos WHERE photo_id=? AND album_id IN (SELECT id FROM albums WHERE archived_at IS NULL)',(identifier,))
            for index,album_id in enumerate(album_ids):
                conn.execute('INSERT INTO album_photos VALUES(?,?,?)',(album_id,identifier,index))
        return self.media.serialize(self.media.get(identifier,True),True)

    def posts(self, admin=False):
        return self.db.all('SELECT id,slug,title,excerpt,published,created,updated FROM posts'+('' if admin else ' WHERE published=1')+' ORDER BY updated DESC')

    def post(self, identifier, admin=False):
        row=self.db.one('SELECT * FROM posts WHERE (id=? OR slug=?)'+('' if admin else ' AND published=1'),(identifier,identifier))
        if not row:
            raise AppError('随笔不存在','NOT_FOUND',404)
        row['html']=safe_markdown(row['body'])
        return row

    def save_post(self, data, identifier=None):
        identifier=identifier or str(uuid.uuid4());now=time.time()
        slug=data.get('slug') or slug_for(data['title'])+'-'+identifier[:6]
        with self.db.connect() as conn:
            conn.execute('INSERT INTO posts(id,slug,title,excerpt,body,published,created,updated) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,excerpt=excluded.excerpt,body=excluded.body,published=excluded.published,updated=excluded.updated', (identifier,slug,data['title'],data.get('excerpt',''),data.get('body',''),int(data.get('published',False)),now,now))
        return self.post(identifier,True)
