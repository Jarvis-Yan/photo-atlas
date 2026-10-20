"""Compress authenticated list responses without touching original-file streams."""
from starlette.middleware.gzip import GZipMiddleware


class AdminListCompression:
    paths = frozenset(('/api/admin/photos', '/api/admin/albums', '/api/admin/posts',
                       '/api/admin/raw/links', '/api/admin/raw/files'))

    def __init__(self, app):
        self.app = app
        self.compressed = GZipMiddleware(app, minimum_size=1000, compresslevel=4)

    async def __call__(self, scope, receive, send):
        target = self.compressed if (scope['type'] == 'http' and
                    scope.get('method') == 'GET' and scope.get('path') in self.paths) else self.app
        await target(scope, receive, send)
