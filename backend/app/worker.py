import signal
import time
import logging
from .config import Settings
from .db import Database
from .media.processing import run_once
from .maintenance import cleanup_expired_uploads


def main():
    logging.basicConfig(level=logging.INFO,format='%(message)s')
    config=Settings.from_env();config.prepare()
    db=Database(config.database);db.migrate()
    active=True
    def stop(*_):
        nonlocal active
        active=False
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    next_cleanup=0
    while active:
        if time.monotonic()>=next_cleanup:
            try:cleanup_expired_uploads(db,config)
            except OSError:logging.warning('Temporary upload cleanup postponed')
            next_cleanup=time.monotonic()+600
        if not run_once(db,config):
            time.sleep(.8)


if __name__=='__main__':
    main()
