"""Winner voucher validation and atomic redemption (single-use, user-bound)."""
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from django.db import transaction
from django.utils import timezone

from main.models import User, WinnerVoucher


def normalize_winner_code(code):
    return str(code or "").strip().upper()


def _normalized_emails_match(voucher_email: str, user_email: str) -> bool:
    """Compare emails the same way as User creation (handles stray whitespace)."""
    a = User.objects.normalize_email(str(voucher_email or "").strip())
    b = User.objects.normalize_email(str(user_email or "").strip())
    return bool(a and b and a == b)


def winner_voucher_validity_issue(voucher: WinnerVoucher, at=None) -> Optional[str]:
    """
    If the voucher cannot be used for checkout at ``at`` due to status or date window,
    return a stable issue code; otherwise None.
    """
    at = at or timezone.now()
    if not voucher.is_active:
        return "inactive"
    if voucher.redeemed_at:
        return "redeemed"
    if voucher.valid_from and at < voucher.valid_from:
        return "not_yet_valid"
    if voucher.expires_at and at > voucher.expires_at:
        return "expired"
    return None


def winner_voucher_validity_user_message(issue: str) -> str:
    """Human-readable API error for a ``winner_voucher_validity_issue`` code."""
    return {
        "inactive": "This voucher code is no longer active.",
        "redeemed": "This voucher code has already been used.",
        "not_yet_valid": "This voucher code is not valid yet.",
        "expired": "This voucher code has expired.",
    }.get(issue, "This code cannot be used right now.")


def voucher_eligible_for_checkout(voucher: WinnerVoucher, user) -> bool:
    now = timezone.now()
    if winner_voucher_validity_issue(voucher, now):
        return False
    if voucher.assigned_user_id:
        return voucher.assigned_user_id == user.id
    # Voucher not linked yet (e.g. created before signup): allow if valid email matches, then link.
    if not _normalized_emails_match(voucher.assigned_email, user.email):
        return False
    updated = WinnerVoucher.objects.filter(
        pk=voucher.pk,
        assigned_user__isnull=True,
    ).update(assigned_user_id=user.id)
    if updated:
        voucher.assigned_user_id = user.id
    else:
        # Concurrent link or prior row state; re-fetch ownership
        fresh = WinnerVoucher.objects.filter(pk=voucher.pk).values_list(
            "assigned_user_id", flat=True
        ).first()
        if fresh != user.id:
            return False
        voucher.assigned_user_id = user.id
    return True


def compute_winner_discount(voucher: WinnerVoucher, pre_total: Decimal) -> Decimal:
    pre_total = Decimal(pre_total)
    if pre_total <= 0:
        return Decimal("0")
    return min(voucher.credit_amount, pre_total)


def amount_due_cents(pre_total: Decimal, discount: Decimal) -> int:
    due = pre_total - discount
    if due < 0:
        due = Decimal("0")
    return int((due * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def parse_pre_voucher_total(booking_data: dict) -> Decimal:
    raw = booking_data.get("pre_voucher_total_amount")
    if raw is None:
        raise ValueError("pre_voucher_total_amount is required when using a winner voucher")
    return Decimal(str(raw))


def validate_winner_voucher_for_payment(user, booking_data: dict, amount_cents: int) -> Optional[WinnerVoucher]:
    """
    If booking_data contains winner_voucher_id, validate voucher ownership and that amount_cents
    matches server-computed amount due. Normalizes booking_data totals for downstream use.
    """
    vid = booking_data.get("winner_voucher_id")
    if not vid:
        return None
    try:
        voucher = WinnerVoucher.objects.get(pk=vid)
    except WinnerVoucher.DoesNotExist as exc:
        raise ValueError("Invalid winner voucher") from exc
    v_issue = winner_voucher_validity_issue(voucher)
    if v_issue:
        raise ValueError(winner_voucher_validity_user_message(v_issue))
    if not voucher_eligible_for_checkout(voucher, user):
        raise ValueError("This voucher cannot be used for this booking")
    pre_total = parse_pre_voucher_total(booking_data)
    discount = compute_winner_discount(voucher, pre_total)
    expected_cents = amount_due_cents(pre_total, discount)
    if expected_cents != int(amount_cents):
        raise ValueError("Payment amount does not match voucher-adjusted total. Refresh and try again.")
    due = (pre_total - discount).max(Decimal("0"))
    booking_data["total_amount"] = float(due)
    booking_data["winner_voucher_discount_applied"] = float(discount)
    return voucher


def redeem_winner_voucher_for_booking(voucher_id, user, booking) -> bool:
    with transaction.atomic():
        voucher = WinnerVoucher.objects.select_for_update().get(pk=voucher_id)
        if voucher.redeemed_at:
            return voucher.consumed_booking_id == booking.id
        if not voucher_eligible_for_checkout(voucher, user):
            return False
        voucher.redeemed_at = timezone.now()
        voucher.consumed_booking = booking
        voucher.save(update_fields=["redeemed_at", "consumed_booking", "updated_at"])
    return True
