#!/usr/bin/env python3
"""Create local configuration once, without printing credentials."""
from pathlib import Path
import secrets

root = Path(__file__).resolve().parents[1]
config = root / '.env'
if config.exists():
    raise SystemExit('.env already exists; keeping your configuration unchanged.')
text = (root / '.env.example').read_text().replace('PC_ADMIN_PASSWORD=\n', 'PC_ADMIN_PASSWORD=' + secrets.token_urlsafe(24) + '\n')
with config.open('x', encoding='utf-8') as stream:
    stream.write(text)
config.chmod(0o600)
print('Created .env with a random administrator password. Read it locally before signing in.')
