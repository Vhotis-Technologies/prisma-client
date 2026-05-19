"""Legal document URLs for email footers and public web pages (client deployment)."""
from django.conf import settings


def frontend_base_url() -> str:
    return (getattr(settings, "FRONTEND_BASE_URL", None) or "").rstrip("/")


def privacy_policy_url() -> str:
    base = frontend_base_url()
    return f"{base}/legal/privacy/" if base else "/legal/privacy/"


def terms_of_service_url() -> str:
    base = frontend_base_url()
    return f"{base}/legal/terms/" if base else "/legal/terms/"


def email_legal_context(**extra) -> dict:
    """Merge into Celery email template context when needed."""
    from datetime import datetime

    year = extra.pop("year", None)
    ctx = {
        "privacy_policy_url": privacy_policy_url(),
        "terms_of_service_url": terms_of_service_url(),
        "current_year": str(year if year is not None else datetime.now().year),
    }
    ctx.update(extra)
    return ctx
