import json
from ..errors import AppError


class MediaRepository:
    def __init__(self, db):
        self.db = db

    def get(self, identifier, admin=False):
        suffix = '' if admin else " AND published=1 AND processing='ready'"
        row = self.db.one('SELECT * FROM photos WHERE (id=? OR slug=?) AND deleted IS NULL' + suffix, (identifier, identifier))
        if not row:
            raise AppError('照片不存在或尚未公开', 'NOT_FOUND', 404)
        return row

    def list(self, admin=False, album_id=None, limit=120, offset=0, search='', category=''):
        conditions = ['p.deleted IS NULL']
        params = []
        join = ''
        if not admin:
            conditions += ["p.published=1", "p.processing='ready'"]
        if album_id:
            join = ' JOIN album_photos ap ON ap.photo_id=p.id'
            conditions.append('ap.album_id=?')
            params.append(album_id)
        if category:
            conditions.append('p.category=?')
            params.append(category)
        if search:
            conditions.append("(p.title LIKE ? OR EXISTS(SELECT 1 FROM json_each(p.tags) tag WHERE tag.value LIKE ?) OR json_extract(p.geo,'$.label') LIKE ? OR json_extract(p.captured,'$.value') LIKE ?)")
            params += ['%'+search+'%']*4
        order = 'ap.position,p.position,p.created DESC' if album_id else 'p.featured DESC,p.position,p.created DESC'
        params += [limit, offset]
        return self.db.all('SELECT p.* FROM photos p' + join + ' WHERE ' + ' AND '.join(conditions) + ' ORDER BY ' + order + ' LIMIT ? OFFSET ?', params)

    def count(self, album_id=None, search='', category=''):
        sql="SELECT COUNT(*) AS n FROM photos p WHERE p.deleted IS NULL AND p.published=1 AND p.processing='ready'"
        params=[]
        if album_id:
            sql+=' AND EXISTS(SELECT 1 FROM album_photos ap WHERE ap.photo_id=p.id AND ap.album_id=?)';params.append(album_id)
        if category:
            sql+=' AND p.category=?';params.append(category)
        if search:
            sql+=" AND (p.title LIKE ? OR EXISTS(SELECT 1 FROM json_each(p.tags) tag WHERE tag.value LIKE ?) OR json_extract(p.geo,'$.label') LIKE ? OR json_extract(p.captured,'$.value') LIKE ?)";params+=['%'+search+'%']*4
        return self.db.one(sql,params)['n']

    def daily_featured(self, day, limit=12):
        from ..home import persistent_daily
        return persistent_daily(self.db, day, limit)

    def serialize(self, row, admin=False):
        result = {k: row[k] for k in ('id','slug','title','caption','alt','featured','published','position','processing','width','height','created','category')}
        result['tags'] = json.loads(row['tags'])
        exif=json.loads(row['exif'])
        result['exif']=exif if admin else {k:v for k,v in exif.items() if k in ('camera','lens','date','iso','fnumber','exposure','focal_length')}
        from ..metadata import public_geo
        geo=json.loads(row.get('geo') or '{}')
        result['geo']=geo if admin else public_geo(geo)
        result['captured']=json.loads(row.get('captured') or '{}')
        result['download'] = f"/api/public/photos/{row['id']}/download" if row.get('jpeg_ready') and row['published'] else None
        result['full'] = f"/media/{row['id']}/full.jpg" if row.get('jpeg_ready') else None
        if admin:
            master=self.db.one('SELECT original_name,size FROM photo_masters WHERE photo_id=?',(row['id'],))
            result['master']=master
            result['metadata_updated']=row.get('metadata_updated',0)
            result['geo_locked']=bool(row.get('geo_locked'))
            result['captured_locked']=bool(row.get('captured_locked'))
            result['duplicate_audit']=json.loads(row.get('duplicate_audit') or '{}')
            result['category_locked']=bool(row.get('category_locked'))
            result['tags_locked']=bool(row.get('tags_locked'))
            result['source_context']=json.loads(row.get('source_context') or '{}')
            result['duplicate_of']=row.get('duplicate_of') or ''
            result['similar_photos']=json.loads(row.get('similar_photos') or '[]')
            result['similarity_reviewed']=bool(row.get('similarity_reviewed'))
        from .thumbnails import manifest
        result['thumbnail'] = manifest(row['id'], row['width'], row['height'])
        result['src'] = f"/media/{row['id']}/960.webp"
        sizes = []
        for width in (480, 960, 1600, 2400):
            sizes.append(f"/media/{row['id']}/{width}.webp {max(1,min(width,row['width']))}w")
            if width >= row['width']:
                break
        result['srcset'] = ', '.join(sizes)
        result['album_ids'] = [x['album_id'] for x in self.db.all('SELECT ap.album_id FROM album_photos ap JOIN albums a ON a.id=ap.album_id WHERE ap.photo_id=? AND a.archived_at IS NULL'+('' if admin else ' AND a.published=1'), (row['id'],))]
        if admin:
            result.update({k: row[k] for k in ('original_name','sha256','size','error')})
        return result
