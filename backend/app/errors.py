class AppError(Exception):
    def __init__(self, message, code='INVALID_REQUEST', status=400):
        self.message, self.code, self.status = message, code, status
