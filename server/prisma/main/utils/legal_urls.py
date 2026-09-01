"""Public URL helpers: Django API vs Prisma Web SPA."""
from django.conf import settings


def _strip(value) -> str:
    return (value or "").strip().rstrip("/")


def client_api_base_url() -> str:
    """Public Django API origin (no trailing slash). Uses ``BASE_URL``."""
    return _strip(getattr(settings, "BASE_URL", None)) or "https://client.prismavalet.com"


def client_web_base_url() -> str:
    """Prisma Web SPA origin (no trailing slash)."""
    web = _strip(getattr(settings, "CLIENT_WEB_BASE_URL", None))
    if web:
        return web
    return (
        "http://localhost:5173"
        if getattr(settings, "IS_STAGING", False)
        else "https://app.prismavalet.com"
    )


def client_web_url(path: str) -> str:
    """Join ``path`` onto the SPA origin. ``path`` may start with ``/``."""
    suffix = path if path.startswith("/") else f"/{path}"
    return f"{client_web_base_url()}{suffix}"


def password_reset_url(token: str) -> str:
    """Browser password-reset link on Prisma Web."""
    return client_web_url(f"/reset-password?token={token}")


def accept_invite_url(token: str) -> str:
    """Browser accept-invite link on Prisma Web."""
    return client_web_url(f"/accept-invite?token={token}")


def guest_results_url(token: str) -> str:
    """
    Browser guest-booking results link on Prisma Web (photos and job notes).

    Args:
        token: Raw guest access token (not the stored SHA-256 hash).

    Returns:
        str: ``{CLIENT_WEB_BASE_URL}/guest/b/{token}``. Include any SPA basename
        (e.g. ``/app``) in ``CLIENT_WEB_BASE_URL`` or emailed links 404 at the gateway.
    """
    return client_web_url(f"/guest/b/{token}")


def guest_claim_url(token: str) -> str:
    """
    Browser link to set a password on a guest checkout user (same token as results).

    Args:
        token: Raw guest access token (not the stored SHA-256 hash).

    Returns:
        str: ``{CLIENT_WEB_BASE_URL}/guest/claim/{token}``.
    """
    return client_web_url(f"/guest/claim/{token}")


def transfer_action_url(transfer_id) -> str:
    """Browser vehicle-transfer approve/reject link on Prisma Web."""
    return client_web_url(f"/transfer/{transfer_id}")


def privacy_policy_url() -> str:
    """Django-rendered privacy policy (not the SPA)."""
    return f"{client_api_base_url()}/legal/privacy/"


def terms_of_service_url() -> str:
    """Django-rendered terms of service (not the SPA)."""
    return f"{client_api_base_url()}/legal/terms/"


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
