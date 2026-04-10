"""
Media URL helper: build full URL for relative media paths (e.g. vehicle images).

Uses settings.BASE_URL or env BASE_URL; appends /client/ prefix for relative paths.
"""
from django.conf import settings
import os

def get_full_media_url(relative_url):
    if not relative_url:
        return None
    
    # Check if URL is already absolute (starts with http:// or https://)
    if relative_url.startswith('http://') or relative_url.startswith('https://'):
        return relative_url
    
    # Get the base URL from settings
    base_url = getattr(settings, 'BASE_URL', None)
    if not base_url:
        # Use the ngrok URL directly as fallback
        base_url = os.getenv('BASE_URL')
    
    # Remove leading slash if present to avoid double slashes
    if relative_url.startswith('/'):
        relative_url = relative_url[1:]
    
    # Combine base URL with relative URL
    return f"{base_url}/client/{relative_url}" 