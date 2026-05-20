"""Celery tasks: winner voucher notification emails (Graph API)."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from celery import shared_task
from django.conf import settings
from django.template.loader import render_to_string
from django.utils import timezone

from main.models import GiftVoucher, WinnerVoucher
from main.util.graph_mail import send_mail as graph_send_mail


def _voucher_email_window_context(voucher) -> dict:
    """
    Build display fields for valid-from, expiry, and approximate days in the use window.

    Args:
        voucher: ``WinnerVoucher`` or ``GiftVoucher`` instance.

    Returns:
        dict: ``valid_from_display``, ``expires_at_display``, ``days_to_use`` keys.
    """
    now = timezone.now()
    vf = voucher.valid_from
    exp = voucher.expires_at
    ctx: dict = {
        'valid_from_display': None,
        'expires_at_display': None,
        'days_to_use': None,
    }
    if vf:
        ctx['valid_from_display'] = timezone.localtime(vf).strftime('%B %d, %Y')
    if exp:
        ctx['expires_at_display'] = timezone.localtime(exp).strftime('%B %d, %Y')
        window_start = vf if (vf and vf > now) else now
        if window_start < exp:
            ctx['days_to_use'] = max(0, (exp - window_start).days)
        else:
            ctx['days_to_use'] = 0
    return ctx


@shared_task
def send_winner_voucher_email(voucher_id: str):
    """
    Email the assigned address with voucher code, credit, validity window, rules, and app links.

    Args:
        voucher_id: ``WinnerVoucher`` UUID/string primary key.

    Returns:
        str: Skip reason, success, or error message.
    """
    try:
        voucher = WinnerVoucher.objects.get(pk=voucher_id)
    except WinnerVoucher.DoesNotExist:
        return f'Winner voucher not found: {voucher_id}'

    if not voucher.is_active or voucher.redeemed_at:
        return f'Skip email for voucher {voucher_id} (inactive or redeemed)'

    recipient = (voucher.assigned_email or '').strip()
    if not recipient:
        return f'No assigned email for voucher {voucher_id}'

    credit = voucher.credit_amount.quantize(Decimal('0.01'))
    validity = _voucher_email_window_context(voucher)

    try:
        html_message = render_to_string(
            'winner_voucher_email.html',
            {
                'voucher_code': voucher.code,
                'credit_amount': str(credit),
                'valid_from_display': validity['valid_from_display'],
                'expires_at_display': validity['expires_at_display'],
                'days_to_use': validity['days_to_use'],
                'app_store_url': settings.APP_STORE_URL,
                'play_store_url': settings.PLAY_STORE_URL,
                'current_year': datetime.now().year,
            },
        )
        subject = f'Your Prisma Car Care voucher — {voucher.code}'
        graph_send_mail(subject, html_message, recipient)
        return f'Winner voucher email sent to {recipient}'
    except Exception as e:
        return f'Failed to send winner voucher email: {e!s}'


@shared_task
def send_gift_voucher_email(voucher_id: str):
    """
    Email gift recipient after Stripe payment confirms.

    Idempotent: skips if already sent, unpaid, redeemed, or inactive.

    Args:
        voucher_id: ``GiftVoucher`` primary key.

    Returns:
        str: Skip reason, success, or error message.
    """
    try:
        voucher = GiftVoucher.objects.select_related("purchased_by").get(pk=voucher_id)
    except GiftVoucher.DoesNotExist:
        return f"Gift voucher not found: {voucher_id}"

    if voucher.email_sent_at:
        return f"Gift voucher email already sent: {voucher_id}"
    if not voucher.is_paid():
        return f"Skip email for unpaid gift voucher {voucher_id}"
    if not voucher.is_active or voucher.redeemed_at:
        return f"Skip gift email {voucher_id} (inactive or redeemed)"

    recipient = (voucher.assigned_email or "").strip()
    if not recipient:
        return f"No assigned email for gift voucher {voucher_id}"

    credit = voucher.credit_amount.quantize(Decimal("0.01"))
    validity = _voucher_email_window_context(voucher)
    purchaser = voucher.purchased_by
    purchaser_display = ""
    if purchaser:
        purchaser_display = (getattr(purchaser, "name", "") or "").strip() or (
            purchaser.email or ""
        )

    try:
        html_message = render_to_string(
            "gift_voucher_email.html",
            {
                "voucher_code": voucher.code,
                "credit_amount": str(credit),
                "valid_from_display": validity["valid_from_display"],
                "expires_at_display": validity["expires_at_display"],
                "days_to_use": validity["days_to_use"],
                "purchaser_display": purchaser_display,
                "validity_days": voucher.validity_days,
                "app_store_url": settings.APP_STORE_URL,
                "play_store_url": settings.PLAY_STORE_URL,
                "current_year": datetime.now().year,
            },
        )
        subject = f"You received a Prisma Car Care gift — {voucher.code}"
        graph_send_mail(subject, html_message, recipient)
        GiftVoucher.objects.filter(pk=voucher.pk, email_sent_at__isnull=True).update(
            email_sent_at=timezone.now()
        )
        return f"Gift voucher email sent to {recipient}"
    except Exception as e:
        return f"Failed to send gift voucher email: {str(e)}"
