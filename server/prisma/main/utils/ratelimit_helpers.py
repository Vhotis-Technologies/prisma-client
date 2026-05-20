"""Shared HTTP 429 JSON response for ``django-ratelimit`` view decorators."""

from django.http import JsonResponse


def rate_limit_json_response(request, *args, **kwargs):
    """
    Callback invoked by django-ratelimit when a rate limit is exceeded.

    Args:
        request: The throttled request (unused; required by ratelimit signature).
        *args, **kwargs: Additional ratelimit callback arguments (ignored).

    Returns:
        JsonResponse: 429 with a generic ``detail`` message for API clients.
    """
    return JsonResponse({"detail": "Too many requests. Try again later."}, status=429)
