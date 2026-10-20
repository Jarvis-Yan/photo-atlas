"""Small, versioned browsing previews; existing large previews and masters stay intact."""
import os
import uuid
from pathlib import Path
from PIL import Image

LEGACY_THUMBNAILS = {160: 58, 320: 62, 480: 66, 768: 70, 1280: 74}
THUMBNAILS = {160: 38, 320: 42, 480: 46, 768: 50, 1280: 58}


def variant(target, version=2):
    return f'thumb-v{version}-{target}.webp'


def manifest(identifier, width, height):
    longest = max(1, width, height)
    candidates = {}
    for target in THUMBNAILS:
        actual = max(1, round(width * min(1, target / longest)))
        candidates.setdefault(actual, f'/media/{identifier}/{variant(target)} {actual}w')
        if target >= longest:
            break
    return {'src': f'/media/{identifier}/{variant(480)}', 'srcset': ', '.join(candidates.values())}


def cached(folder, target, version=2):
    """Use the smallest existing preview that can fill the requested long edge."""
    folder = Path(folder)
    if target not in THUMBNAILS or version not in (1, 2):
        raise ValueError('Unknown thumbnail size')
    candidates = [folder / f'{size}.webp' for size in (480, 960, 1600, 2400) if size >= target]
    source = next((path for path in candidates if path.is_file()), None)
    if source is None:
        raise FileNotFoundError('Browsing preview source is not ready')
    output = folder / variant(target, version)
    if output.is_file() and output.stat().st_mtime_ns >= source.stat().st_mtime_ns:
        return output
    with Image.open(source) as image:
        image = image.convert('RGB')
        image.thumbnail((target, target), Image.Resampling.LANCZOS)
        temp = folder / (variant(target, version) + '.' + uuid.uuid4().hex + '.tmp')
        try:
            image.save(temp, format='WEBP', quality=(LEGACY_THUMBNAILS if version == 1 else THUMBNAILS)[target], method=5, exif=b'')
            os.replace(temp, output)
        finally:
            temp.unlink(missing_ok=True)
    return output
