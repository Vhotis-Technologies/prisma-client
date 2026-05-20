"""Legal document URLs for email footers and public web pages (client deployment)."""
from django.conf import settings


def frontend_base_url() -> str:
    """
    Base URL for the client web app (no trailing slash).

    Returns:
        str: ``settings.FRONTEND_BASE_URL`` stripped, or empty when unset.
    """
    return (getattr(settings, "FRONTEND_BASE_URL", None) or "").rstrip("/")


def privacy_policy_url() -> str:
    """
    Absolute or site-relative privacy policy path.

    Returns:
        str: ``{base}/legal/privacy/`` when base is configured, else ``/legal/privacy/``.
    """
    base = frontend_base_url()
    return f"{base}/legal/privacy/" if base else "/legal/privacy/"


def terms_of_service_url() -> str:
    """
    Absolute or site-relative terms of service path.

    Returns:
        str: ``{base}/legal/terms/`` when base is configured, else ``/legal/terms/``.
    """
    base = frontend_base_url()
    return f"{base}/legal/terms/" if base else "/legal/terms/"


def email_legal_context(**extra) -> dict:
    """
    Build template context keys for legal links in transactional emails.

    Args:
        **extra: Additional context merged after the legal defaults (``year`` may
            override ``current_year``).

    Returns:
        dict: ``privacy_policy_url``, ``terms_of_service_url``, ``current_year``,
        plus any ``extra`` keys.
    """
    from datetime import datetime

    year = extra.pop("year", None)
    ctx = {
        "privacy_policy_url": privacy_policy_url(),
        "terms_of_service_url": terms_of_service_url(),
        "current_year": str(year if year is not None else datetime.now().year),
    }
    ctx.update(extra)
    return ctx
