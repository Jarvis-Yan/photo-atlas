import sqlite3
from contextlib import contextmanager
from pathlib import Path


class Database:
    def __init__(self, path):
        self.path = path

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA busy_timeout=15000')
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def migrate(self):
        with self.connect() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE IF NOT EXISTS schema_versions(version INTEGER PRIMARY KEY)')
            db.commit()
            db.execute('BEGIN IMMEDIATE')
            current = db.execute('SELECT MAX(version) FROM schema_versions').fetchone()[0] or 0
            for migration in sorted((Path(__file__).parents[1] / 'migrations').glob('*.sql')):
                if '.down.' in migration.name:
                    continue
                version = int(migration.name.split('_',1)[0])
                if version <= current:
                    continue
                sql = migration.read_text()
                for statement in sql.split(';'):
                    if statement.strip():
                        db.execute(statement)
                db.execute('INSERT INTO schema_versions VALUES(?)',(version,))

    def one(self, sql, params=()):
        with self.connect() as db:
            row = db.execute(sql, params).fetchone()
            return dict(row) if row else None

    def all(self, sql, params=()):
        with self.connect() as db:
            return [dict(row) for row in db.execute(sql, params).fetchall()]

    def execute(self, sql, params=()):
        with self.connect() as db:
            return db.execute(sql, params).rowcount
