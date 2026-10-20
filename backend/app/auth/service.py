import hashlib
import hmac
import secrets
import time
import uuid
from ..errors import AppError


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password):
    salt = secrets.token_hex(16)
    key = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return salt + ':' + key


def verify_password(password, encoded):
    salt, key = encoded.split(':')
    result = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return hmac.compare_digest(result, key)


class AuthService:
    def __init__(self, db, config):
        self.db, self.config = db, config
        self.dummy_hash = password_hash('timing-safe-placeholder')
        with db.connect() as conn:
            if not conn.execute('SELECT id FROM users LIMIT 1').fetchone():
                conn.execute('INSERT INTO users VALUES(?,?,?)', (str(uuid.uuid4()), config.admin_user, password_hash(config.admin_password)))

    def login(self, username, password, ip):
        now = time.time()
        with self.db.connect() as conn:
            conn.execute('DELETE FROM login_attempts WHERE at<?', (now - 600,))
            count = conn.execute('SELECT COUNT(*) FROM login_attempts WHERE ip=? AND at>?', (ip, now - 300)).fetchone()[0]
            if count >= 8:
                raise AppError('尝试过于频繁，请稍后再试', 'RATE_LIMITED', 429)
            user = conn.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
            valid = verify_password(password, user['password_hash'] if user else self.dummy_hash)
            if not user or not valid:
                conn.execute('INSERT INTO login_attempts VALUES(?,?)', (ip, now))
                conn.commit()
                raise AppError('账号或密码不正确', 'LOGIN_FAILED', 401)
            token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
            conn.execute('DELETE FROM sessions WHERE expires<?', (now,))
            conn.execute('INSERT INTO sessions VALUES(?,?,?,?)', (digest(token), user['id'], csrf, now + self.config.session_seconds))
            conn.execute('DELETE FROM login_attempts WHERE ip=?', (ip,))
            return token, {'username': user['username'], 'csrf': csrf}

    def session(self, token):
        if not token:
            raise AppError('请先登录管理后台', 'AUTH_REQUIRED', 401)
        session = self.db.one('SELECT s.*,u.username FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>?', (digest(token), time.time()))
        if not session:
            raise AppError('登录已过期，请重新登录', 'AUTH_REQUIRED', 401)
        return session

    def logout(self, token):
        if token:
            self.db.execute('DELETE FROM sessions WHERE token_hash=?', (digest(token),))
