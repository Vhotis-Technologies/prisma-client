"""
Internal support API authentication via shared secret header.

Used by support-app backends calling client Django views; no session or staff bypass.
"""
import secrets

from django.conf import settings


def has_support_permission(request):
    """
    Return True when the request carries a valid ``X-Support-Internal-Key`` header.

    Compares the header to ``settings.SUPPORT_INTERNAL_API_KEY`` using constant-time
    digest comparison. Returns False when the setting is unset or the header mismatches.

    Args:
        request: Django ``HttpRequest`` with ``request.headers``.

    Returns:
        bool: Whether the caller is authorised as internal support.
    """
    expected = (getattr(settings, "SUPPORT_INTERNAL_API_KEY", None) or "").strip()
    if not expected:
        return False
    got = (request.headers.get("X-Support-Internal-Key") or "").strip()
    return secrets.compare_digest(got, expected)
