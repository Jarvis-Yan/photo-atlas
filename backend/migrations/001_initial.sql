CREATE TABLE users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires REAL NOT NULL);
CREATE TABLE login_attempts(ip TEXT NOT NULL,at REAL NOT NULL);
CREATE INDEX login_attempt_time ON login_attempts(ip,at);
CREATE TABLE albums(id TEXT PRIMARY KEY,slug TEXT UNIQUE NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',published INTEGER NOT NULL DEFAULT 0,position INTEGER NOT NULL DEFAULT 0,cover_id TEXT,source_key TEXT UNIQUE);
CREATE TABLE photos(id TEXT PRIMARY KEY,slug TEXT UNIQUE NOT NULL,title TEXT NOT NULL,caption TEXT NOT NULL DEFAULT '',alt TEXT NOT NULL DEFAULT '',tags TEXT NOT NULL DEFAULT '[]',published INTEGER NOT NULL DEFAULT 0,featured INTEGER NOT NULL DEFAULT 0,position INTEGER NOT NULL DEFAULT 0,processing TEXT NOT NULL DEFAULT 'pending',error TEXT NOT NULL DEFAULT '',original_name TEXT NOT NULL,original_path TEXT NOT NULL,sha256 TEXT NOT NULL,size INTEGER NOT NULL,mime TEXT NOT NULL DEFAULT '',width INTEGER NOT NULL DEFAULT 0,height INTEGER NOT NULL DEFAULT 0,exif TEXT NOT NULL DEFAULT '{}',created REAL NOT NULL,deleted REAL,source_key TEXT UNIQUE);
CREATE INDEX photos_public ON photos(published,processing,deleted,position);
CREATE TABLE album_photos(album_id TEXT NOT NULL REFERENCES albums(id),photo_id TEXT NOT NULL REFERENCES photos(id),position INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(album_id,photo_id));
CREATE TABLE posts(id TEXT PRIMARY KEY,slug TEXT UNIQUE NOT NULL,title TEXT NOT NULL,excerpt TEXT NOT NULL DEFAULT '',body TEXT NOT NULL DEFAULT '',published INTEGER NOT NULL DEFAULT 0,created REAL NOT NULL,updated REAL NOT NULL);
CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE uploads(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),filename TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL,chunk_size INTEGER NOT NULL,album_id TEXT REFERENCES albums(id),status TEXT NOT NULL DEFAULT 'receiving',photo_id TEXT REFERENCES photos(id),created REAL NOT NULL,expires REAL NOT NULL);
CREATE INDEX uploads_resume ON uploads(user_id,sha256,size,status);
CREATE TABLE upload_chunks(upload_id TEXT NOT NULL REFERENCES uploads(id),number INTEGER NOT NULL,sha256 TEXT NOT NULL,size INTEGER NOT NULL,PRIMARY KEY(upload_id,number));
CREATE TABLE jobs(id TEXT PRIMARY KEY,photo_id TEXT NOT NULL REFERENCES photos(id),status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,available REAL NOT NULL DEFAULT 0,lease REAL NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '');
CREATE INDEX jobs_claim ON jobs(status,available,lease);

ALTER TABLE photos ADD COLUMN fallback_path TEXT NOT NULL DEFAULT '';

ALTER TABLE photos ADD COLUMN jpeg_ready INTEGER NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN pixel_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE photos ADD COLUMN phash TEXT NOT NULL DEFAULT '';
ALTER TABLE photos ADD COLUMN duplicate_of TEXT NOT NULL DEFAULT '';
CREATE INDEX photos_checksum ON photos(sha256,size);
ALTER TABLE photos ADD COLUMN similar_photos TEXT NOT NULL DEFAULT '[]';
ALTER TABLE photos ADD COLUMN similarity_reviewed INTEGER NOT NULL DEFAULT 0;

ALTER TABLE photos ADD COLUMN category TEXT NOT NULL DEFAULT '';
ALTER TABLE photos ADD COLUMN category_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN tags_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN source_context TEXT NOT NULL DEFAULT '{}';
ALTER TABLE uploads ADD COLUMN source_context TEXT NOT NULL DEFAULT '{}';
CREATE INDEX photos_category ON photos(category,published,deleted);

ALTER TABLE uploads ADD COLUMN master_photo_id TEXT REFERENCES photos(id);
CREATE TABLE photo_masters(photo_id TEXT PRIMARY KEY REFERENCES photos(id),original_path TEXT NOT NULL,original_name TEXT NOT NULL,sha256 TEXT NOT NULL,size INTEGER NOT NULL,created REAL NOT NULL);

ALTER TABLE photos ADD COLUMN geo TEXT NOT NULL DEFAULT '{}';
ALTER TABLE photos ADD COLUMN captured TEXT NOT NULL DEFAULT '{}';
ALTER TABLE photos ADD COLUMN geo_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN captured_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN metadata_updated REAL NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN duplicate_audit TEXT NOT NULL DEFAULT '{}';
ALTER TABLE photos ADD COLUMN publish_requested INTEGER NOT NULL DEFAULT 0;

ALTER TABLE albums ADD COLUMN kind TEXT NOT NULL DEFAULT 'series' CHECK(kind IN ('travel','project','series'));
ALTER TABLE albums ADD COLUMN archived_at REAL;
ALTER TABLE albums ADD COLUMN merged_into TEXT REFERENCES albums(id);
CREATE INDEX albums_active_kind ON albums(archived_at,kind,published);
CREATE TABLE album_events(id TEXT PRIMARY KEY,action TEXT NOT NULL,source_id TEXT REFERENCES albums(id),target_id TEXT REFERENCES albums(id),snapshot TEXT NOT NULL,created REAL NOT NULL);

CREATE TABLE metadata_events(id TEXT PRIMARY KEY,actor_id TEXT REFERENCES users(id),action TEXT NOT NULL,created REAL NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,undone_at REAL);
CREATE INDEX metadata_events_created ON metadata_events(created DESC);

ALTER TABLE photos ADD COLUMN title_locked INTEGER NOT NULL DEFAULT 0;

CREATE TABLE daily_home_state(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL);
CREATE TABLE daily_home_editions(day TEXT PRIMARY KEY,photo_ids TEXT NOT NULL);