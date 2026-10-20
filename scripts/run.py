#!/usr/bin/env python3
"""Run the web service or image worker from the repository's own configuration."""
import argparse
import os
from pathlib import Path
import sys
from urllib.parse import urlparse
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]

def configure():
    os.chdir(ROOT)
    load_dotenv(ROOT / '.env', override=False)
    sys.path.insert(0, str(ROOT / 'backend'))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('service', choices=['web', 'worker'])
    parser.add_argument('--host', default='127.0.0.1')
    args = parser.parse_args()
    configure()
    if args.service == 'worker':
        from app.worker import main as worker
        worker()
    else:
        import uvicorn
        from app.config import Settings
        from app.main import create_app
        config = Settings.from_env()
        origin = urlparse(config.origin)
        uvicorn.run(create_app(config), host=args.host, port=origin.port or (443 if origin.scheme == 'https' else 80))

if __name__ == '__main__':
    main()
