"""
Account invite tokens — create / validate / consume.

Raw tokens are emailed once; only SHA-256 hashes are stored.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from main.models.user import AccountInvite
from main.utils.legal_urls import accept_invite_url

logger = logging.getLogger(__name__)


def hash_invite_token(raw_token: str) -> str:
    """SHA-256 hex digest of the raw invite token."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def invite_expiry_hours() -> int:
    """Invite link lifetime in hours (default 48)."""
    return int(getattr(settings, "INVITE_TOKEN_EXPIRY_HOURS", 48))


def create_account_invite(user, purpose: str, invited_by=None) -> tuple[AccountInvite, str]:
    """
    Invalidate prior unused invites for this user, then create a new token.

    Returns:
        (invite_row, raw_token) — email the raw_token only; never persist it.
    """
    if purpose not in dict(AccountInvite.PURPOSE_CHOICES):
        raise ValueError(f"Invalid invite purpose: {purpose}")

    AccountInvite.objects.filter(user=user, used_at__isnull=True).update(
        used_at=timezone.now()
    )

    raw_token = secrets.token_urlsafe(32)
    invite = AccountInvite.objects.create(
        user=user,
        token_hash=hash_invite_token(raw_token),
        purpose=purpose,
        invited_by=invited_by,
        expires_at=timezone.now() + timedelta(hours=invite_expiry_hours()),
    )
    return invite, raw_token


def get_valid_invite(raw_token: str) -> AccountInvite | None:
    """Return a valid (unused, unexpired) invite for ``raw_token``, else None."""
    if not raw_token:
        return None
    try:
        invite = AccountInvite.objects.select_related("user").get(
            token_hash=hash_invite_token(raw_token.strip())
        )
    except AccountInvite.DoesNotExist:
        return None
    if not invite.is_valid():
        return None
    return invite


def consume_invite(invite: AccountInvite, new_password: str) -> None:
    """Set the user's password and mark the invite used."""
    user = invite.user
    user.set_password(new_password)
    user.save(update_fields=["password"])
    invite.used_at = timezone.now()
    invite.save(update_fields=["used_at"])


def validate_invite_password(password: str) -> str | None:
    """
    Return an error message if the password fails strength checks, else None.

    Matches Prisma web password-reset rules: 8+ chars, upper, lower.
    """
    if not password or len(password) < 8:
        return "Password must be at least 8 characters long"
    if not any(c.isupper() for c in password):
        return "Password must contain at least one uppercase letter"
    if not any(c.islower() for c in password):
        return "Password must contain at least one lowercase letter"
    return None


def purpose_label(purpose: str) -> str:
    """Human-readable label for an invite purpose."""
    return dict(AccountInvite.PURPOSE_CHOICES).get(purpose, purpose)


def build_accept_invite_url(raw_token: str) -> str:
    """Absolute URL for the accept-invite page (SPA when configured)."""
    return accept_invite_url(raw_token)


def expires_in_label() -> str:
    """Human-readable expiry for invite emails (e.g. ``48 hours``, ``2 days``)."""
    hours = invite_expiry_hours()
    if hours == 1:
        return "1 hour"
    if hours % 24 == 0 and hours >= 24:
        days = hours // 24
        return "1 day" if days == 1 else f"{days} days"
    return f"{hours} hours"


def enqueue_account_invite_email(
    user,
    purpose: str,
    *,
    invited_by=None,
    branch_name: str | None = None,
    branch_address: str | None = None,
    role_label: str | None = None,
    display_name: str | None = None,
) -> dict:
    """
    Create an invite token and enqueue the matching Celery email task.

    Returns:
        dict with ``invite_id``, ``email_sent``, and ``invite_url`` (for logs/tests;
        callers must not return ``invite_url`` to end-user API responses).
    """
    invite, raw_token = create_account_invite(user, purpose, invited_by=invited_by)
    invite_url = build_accept_invite_url(raw_token)
    expires = expires_in_label()
    recipient = user.email
    name = display_name or getattr(user, "name", "") or recipient
    label = role_label or purpose_label(purpose)
    email_sent = False

    send_kwargs = {
        "recipient_email": recipient,
        "recipient_name": name,
        "branch_name": branch_name or "—",
        "branch_address": branch_address or "—",
        "invite_url": invite_url,
        "expires_in": expires,
        "role_label": label,
    }

    try:
        from main.tasks.emails.branch_admin import send_branch_admin_invite_email

        send_branch_admin_invite_email.delay(**send_kwargs)
        email_sent = True
    except Exception:
        logger.exception(
            "Celery broker unavailable for branch-admin invite to %s; sending inline",
            recipient,
        )
        try:
            from main.tasks.emails.branch_admin import send_branch_admin_invite_email

            send_branch_admin_invite_email(**send_kwargs)
            email_sent = True
        except Exception:
            logger.exception("Failed to send branch-admin invite email to %s", recipient)
            email_sent = False

    return {
        "invite_id": invite.id,
        "email_sent": email_sent,
        "invite_url": invite_url,
        "purpose": purpose,
    }
