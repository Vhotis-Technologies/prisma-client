"""Paid gift vouchers: eligibility, atomic redemption (single-use), checkout validation."""
from decimal import Decimal
from typing import Optional

from django.db import transaction
from django.utils import timezone

from main.models import User, GiftVoucher

from main.utils.winner_voucher import amount_due_cents, compute_winner_discount, parse_pre_voucher_total


def _normalized_emails_match(voucher_email: str, user_email: str) -> bool:
    a = User.objects.normalize_email(str(voucher_email or "").strip())
    b = User.objects.normalize_email(str(user_email or "").strip())
    return bool(a and b and a == b)


def gift_voucher_validity_issue(voucher: GiftVoucher, at=None) -> Optional[str]:
    """Return issue code when not usable at ``at``; None if usable for checkout."""
    at = at or timezone.now()
    if not voucher.is_paid():
        return "not_paid"
    if not voucher.is_active:
        return "inactive"
    if voucher.redeemed_at:
        return "redeemed"
    if voucher.valid_from and at < voucher.valid_from:
        return "not_yet_valid"
    if voucher.expires_at and at > voucher.expires_at:
        return "expired"
    return None


def gift_voucher_validity_user_message(issue: str) -> str:
    return {
        "not_paid": "This voucher is not active yet.",
        "inactive": "This voucher code is no longer active.",
        "redeemed": "This voucher code has already been used.",
        "not_yet_valid": "This voucher code is not valid yet.",
        "expired": "This voucher code has expired.",
    }.get(issue, "This code cannot be used right now.")


def gift_voucher_eligible_for_checkout(voucher: GiftVoucher, user) -> bool:
    now = timezone.now()
    if gift_voucher_validity_issue(voucher, now):
        return False
    if voucher.assigned_user_id:
        return voucher.assigned_user_id == user.id
    if not _normalized_emails_match(voucher.assigned_email, user.email):
        return False
    updated = GiftVoucher.objects.filter(
        pk=voucher.pk,
        assigned_user__isnull=True,
    ).update(assigned_user_id=user.id)
    if updated:
        voucher.assigned_user_id = user.id
    else:
        fresh = GiftVoucher.objects.filter(pk=voucher.pk).values_list(
            "assigned_user_id", flat=True
        ).first()
        if fresh != user.id:
            return False
        voucher.assigned_user_id = user.id
    return True


def compute_gift_discount(voucher: GiftVoucher, pre_total: Decimal) -> Decimal:
    return compute_winner_discount(voucher, pre_total)


def validate_gift_voucher_for_payment(user, booking_data: dict, amount_cents: int) -> Optional[GiftVoucher]:
    vid = booking_data.get("gift_voucher_id")
    if not vid:
        return None
    if booking_data.get("winner_voucher_id"):
        raise ValueError("Use only one of winner voucher or gift voucher per booking")
    try:
        voucher = GiftVoucher.objects.get(pk=vid)
    except GiftVoucher.DoesNotExist as exc:
        raise ValueError("Invalid giPft voucher") from exc
    v_issue = gift_voucher_validity_issue(voucher)
    if v_issue:
        raise ValueError(gift_voucher_validity_user_message(v_issue))
    if not gift_voucher_eligible_for_checkout(voucher, user):
        raise ValueError("This voucher cannot be used for this booking")
    pre_total = parse_pre_voucher_total(booking_data)
    discount = compute_gift_discount(voucher, pre_total)
    expected_cents = amount_due_cents(pre_total, discount)
    if expected_cents != int(amount_cents):
        raise ValueError("Payment amount does not match voucher-adjusted total. Refresh and try again.")
    due = (pre_total - discount).max(Decimal("0"))
    booking_data["total_amount"] = float(due)
    booking_data["gift_voucher_discount_applied"] = float(discount)
    return voucher


def redeem_gift_voucher_for_booking(voucher_id, user, booking) -> bool:
    with transaction.atomic():
        voucher = GiftVoucher.objects.select_for_update().get(pk=voucher_id)
        if voucher.redeemed_at:
            return voucher.consumed_booking_id == booking.id
        if not gift_voucher_eligible_for_checkout(voucher, user):
            return False
        voucher.redeemed_at = timezone.now()
        voucher.consumed_booking = booking
        voucher.save(update_fields=["redeemed_at", "consumed_booking", "updated_at"])
    return True


def try_link_gift_voucher_existing_user(voucher: GiftVoucher) -> None:
    """After payment: link ``assigned_user`` when an active user already has ``assigned_email``."""
    if voucher.assigned_user_id:
        return
    if not voucher.is_active or voucher.redeemed_at:
        return
    if not voucher.is_paid():
        return
    user = (
        User.objects.filter(email=voucher.assigned_email, is_active=True).first()
    )
    if user is None:
        return
    GiftVoucher.objects.filter(pk=voucher.pk, assigned_user__isnull=True).update(
        assigned_user=user
    )
