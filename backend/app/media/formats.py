"""Accepted originals; display conversion never changes these files."""
IMAGE_TYPES = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
               '.webp': 'image/webp', '.tif': 'image/tiff', '.tiff': 'image/tiff',
               '.heic': 'image/heic', '.heif': 'image/heif'}
UPLOAD_EXTENSIONS = frozenset(IMAGE_TYPES)
