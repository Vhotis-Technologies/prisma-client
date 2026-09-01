"""
Media URL helper: build full URL for relative media paths (e.g. vehicle images).

Uses ``settings.BASE_URL`` or env ``BASE_URL``; prepends ``/client/`` for relative paths.
"""
from django.conf import settings
import os


def get_full_media_url(relative_url):
    """
    Turn a stored media path into an absolute URL for clients and emails.

    Args:
        relative_url: Path or URL from storage; may be None, absolute, or relative.

    Returns:
        str | None: Absolute URL, unchanged absolute input, or None when ``relative_url`` is falsy.
    """
    if not relative_url:
        return None

    if relative_url.startswith('http://') or relative_url.startswith('https://'):
        return relative_url

    base_url = getattr(settings, 'BASE_URL', None)
    if not base_url:
        base_url = os.getenv('BASE_URL')

    if relative_url.startswith('/'):
        relative_url = relative_url[1:]

    return f"{base_url}/client/{relative_url}"
