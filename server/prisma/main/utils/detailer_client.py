"""Headers for server-to-server calls from the client stack to the detailer API."""
from django.conf import settings


def detailer_request_headers(extra=None) -> dict:
    """
    JSON headers plus ``X-Client-Internal-Key`` when ``DETAILER_API_SECRET`` is set.

    Args:
        extra: Optional extra headers merged last.

    Returns:
        dict: Headers for ``requests`` to the detailer app.
    """
    headers = {"Content-Type": "application/json"}
    secret = (getattr(settings, "DETAILER_API_SECRET", None) or "").strip()
    if secret:
        headers["X-Client-Internal-Key"] = secret
    detailer_url = (getattr(settings, "DETAILER_APP_URL", None) or "")
    if "ngrok" in detailer_url:
        headers["ngrok-skip-browser-warning"] = "1"
    if extra:
        headers.update(extra)
    return headers
