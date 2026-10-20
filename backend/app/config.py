import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse


@dataclass(frozen=True)
class Settings:
    data: Path
    database: Path
    frontend: Path
    origin: str
    admin_user: str
    admin_password: str
    secure_cookie: bool
    required_mount: str
    chunk_size: int = 4 * 1024 * 1024
    max_upload: int = 8 * 1024 * 1024 * 1024
    session_seconds: int = 86400
    canonical_aliases: tuple[str, ...] = ()

    @classmethod
    def from_env(cls):
        data = Path(os.environ.get('PA_DATA_ROOT', './data')).resolve()
        origin = os.environ.get('PA_PUBLIC_ORIGIN', 'http://127.0.0.1:18770').rstrip('/')
        password = os.environ.get('PA_ADMIN_PASSWORD', '')
        if len(password) < 12 or password == 'replace-with-a-strong-private-password':
            raise ValueError('PA_ADMIN_PASSWORD must have at least 12 characters')
        if urlparse(origin).scheme not in ('http', 'https') or not urlparse(origin).netloc:
            raise ValueError('Invalid PA_PUBLIC_ORIGIN')
        mount = os.environ.get('PA_REQUIRED_MOUNT', '')
        aliases=tuple(x.strip().lower() for x in os.environ.get('PA_CANONICAL_ALIASES','').split(',') if x.strip())
        if any('/' in x or ':' in x or '*' in x for x in aliases):
            raise ValueError('Canonical aliases must be exact hostnames')
        if mount and not os.path.ismount(mount):
            raise ValueError('Required storage mount is unavailable')
        return cls(data, Path(os.environ.get('PA_DB_PATH', str(data / 'database.sqlite3'))).resolve(),
                   Path(os.environ.get('PA_FRONTEND_ROOT', str(Path(__file__).resolve().parents[2] / 'frontend' / 'dist'))).resolve(), origin,
                   os.environ.get('PA_ADMIN_USER', 'admin'), password,
                   os.environ.get('PA_SECURE_COOKIE', 'true').lower() == 'true', mount,canonical_aliases=aliases,
                   max_upload=int(os.environ.get('PA_MAX_UPLOAD_BYTES',str(8*1024**3))))

    def prepare(self):
        self.database.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        for name in ('originals', 'media', 'uploads'):
            (self.data / name).mkdir(parents=True, exist_ok=True, mode=0o700)
