#!/usr/bin/env python3
"""Inspect versioned source (or an uninitialized source tree) for common disclosure risks."""
from pathlib import Path
import gzip
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SKIP = {'.git', '.venv', 'node_modules', 'dist', '.astro', '__pycache__', '.pytest_cache', 'data'}
RULES = {
    'private key block': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
    'personal home path': re.compile(r'(?<![\w./])/(?:Users|home)/[\w .-]+/'),
    'real mini-program AppID': re.compile(r'wx[0-9a-f]{16}'),
    'GitHub token': re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})'),
    'cloud access key': re.compile(r'\b(?:AKIA[0-9A-Z]{16}|LTAI[A-Za-z0-9]{16,}|AKID[A-Za-z0-9]{28,})\b'),
    'IPv4 private host': re.compile(r'\b(?:10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b'),
}
FORBIDDEN_PARTS = {'private_raw', 'social', 'availability', '.miniprogram-ci', 'branding', 'originals', 'uploads', 'backups'}
# app/uploads is code, rather than a runtime upload directory.
FORBIDDEN_SUFFIXES = {'.key', '.pem', '.p12', '.pfx', '.db', '.sqlite', '.sqlite3', '.xmp', '.cr2', '.cr3', '.nef', '.arw', '.raf', '.raw', '.zip'}

def candidates():
    if (ROOT / '.git').is_dir():
        result = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT, check=True, capture_output=True)
        return [ROOT / p for p in result.stdout.decode().split('\0') if p]
    return [p for p in ROOT.rglob('*') if p.is_file() and not any(part in SKIP for part in p.relative_to(ROOT).parts) and p.name != '.env']

def main():
    files = candidates()
    errors = []
    for p in files:
        rel = p.relative_to(ROOT)
        parts = set(rel.parts)
        disallowed = (parts & FORBIDDEN_PARTS) - ({'uploads'} if str(rel).startswith('backend/app/uploads/') else set())
        if disallowed or p.suffix.lower() in FORBIDDEN_SUFFIXES or p.name == 'project.private.config.json' or (p.name.startswith('.env') and p.name != '.env.example'):
            errors.append(f'{rel}: forbidden source asset or configuration')
        if p.suffix in {'.png', '.gz'}:
            continue
        try:
            text = p.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            errors.append(f'{rel}: unexpected binary file')
            continue
        for rule, pattern in RULES.items():
            match = pattern.search(text)
            if match:
                errors.append(f'{rel}:{text[:match.start()].count(chr(10))+1}: {rule}')
    project = json.loads((ROOT / 'miniprogram/project.config.json').read_text())
    if project['appid'] != 'touristappid' or project['setting']['urlCheck'] is not False:
        errors.append('mini-program release template must use tourist local defaults')
    if '127.0.0.1:18770' not in (ROOT / 'miniprogram/config.js').read_text():
        errors.append('mini-program template must use local API origin')
    with gzip.open(ROOT / 'backend/app/data/cities15000.json.gz', 'rt') as stream:
        cities = json.load(stream)
    fields = {'id', 'name', 'aliases', 'country', 'lat', 'lon', 'population'}
    if not cities or any(set(city) - fields for city in cities):
        errors.append('unexpected fields in bundled GeoNames data')
    if errors:
        print('\n'.join(errors))
        raise SystemExit(1)
    print(json.dumps({'status': 'ok', 'source_files': len(files), 'geonames_records': len(cities), 'note': 'Pattern scan and source-boundary checks; manual review is still required.'}))

if __name__ == '__main__':
    main()
