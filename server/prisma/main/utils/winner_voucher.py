"""Winner voucher validation and atomic redemption (single-use, user-bound)."""
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from django.db import transaction
from django.utils import timezone

from main.models import User, WinnerVoucher


def normalize_winner_code(code):
    """
    Normalise a winner voucher code for lookup (strip, uppercase).

    Args:
        code: Raw code from user input or API.

    Returns:
        str: Normalised code string.
    """
    return str(code or "").strip().upper()


def _normalized_emails_match(voucher_email: str, user_email: str) -> bool:
    """
    Compare emails the same way as User creation (handles stray whitespace).

    Args:
        voucher_email: Email stored on the voucher.
        user_email: Authenticated user's email.

    Returns:
        bool: True when normalised addresses match and are non-empty.
    """
    a = User.objects.normalize_email(str(voucher_email or "").strip())
    b = User.objects.normalize_email(str(user_email or "").strip())
    return bool(a and b and a == b)


def winner_voucher_validity_issue(voucher: WinnerVoucher, at=None) -> Optional[str]:
    """
    If the voucher cannot be used for checkout at ``at``, return a stable issue code.

    Args:
        voucher: ``WinnerVoucher`` row.
        at: Optional datetime (defaults to now).

    Returns:
        str | None: Issue code (``inactive``, ``redeemed``, etc.) or None if valid.
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
    """
    Human-readable API error for a ``winner_voucher_validity_issue`` code.

    Args:
        issue: Issue code string.

    Returns:
        str: User-facing message.
    """
    return {
        "inactive": "This voucher code is no longer active.",
        "redeemed": "This voucher code has already been used.",
        "not_yet_valid": "This voucher code is not valid yet.",
        "expired": "This voucher code has expired.",
    }.get(issue, "This code cannot be used right now.")


def voucher_eligible_for_checkout(voucher: WinnerVoucher, user) -> bool:
    """
    Whether ``user`` may apply this winner voucher at checkout.

    Links ``assigned_user`` on first successful email match; handles concurrent claims.

    Args:
        voucher: ``WinnerVoucher`` (may update in-memory ``assigned_user_id``).
        user: Authenticated ``User``.

    Returns:
        bool: True when date/status rules pass and user owns or claims the voucher.
    """
    now = timezone.now()
    if winner_voucher_validity_issue(voucher, now):
        return False
    if voucher.assigned_user_id:
        return voucher.assigned_user_id == user.id
    if not _normalized_emails_match(voucher.assigned_email, user.email):
        return False
    updated = WinnerVoucher.objects.filter(
        pk=voucher.pk,
        assigned_user__isnull=True,
    ).update(assigned_user_id=user.id)
    if updated:
        voucher.assigned_user_id = user.id
    else:
        fresh = WinnerVoucher.objects.filter(pk=voucher.pk).values_list(
            "assigned_user_id", flat=True
        ).first()
        if fresh != user.id:
            return False
        voucher.assigned_user_id = user.id
    return True


def compute_winner_discount(voucher: WinnerVoucher, pre_total: Decimal) -> Decimal:
    """
    Credit applied from a winner voucher (capped at pre-voucher total).

    Args:
        voucher: ``WinnerVoucher`` with ``credit_amount``.
        pre_total: Order total before voucher.

    Returns:
        Decimal: min(credit_amount, pre_total), or zero when pre_total <= 0.
    """
    pre_total = Decimal(pre_total)
    if pre_total <= 0:
        return Decimal("0")
    return min(voucher.credit_amount, pre_total)


def amount_due_cents(pre_total: Decimal, discount: Decimal) -> int:
    """
    Convert post-discount total to integer cents for Stripe amount validation.

    Args:
        pre_total: Total before voucher discount.
        discount: Voucher credit to subtract.

    Returns:
        int: Rounded half-up cents due (never negative).
    """
    due = pre_total - discount
    if due < 0:
        due = Decimal("0")
    return int((due * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def parse_pre_voucher_total(booking_data: dict) -> Decimal:
    """
    Read ``pre_voucher_total_amount`` from client booking payload.

    Args:
        booking_data: Client booking dict.

    Returns:
        Decimal: Pre-discount total.

    Raises:
        ValueError: When the field is missing (required for voucher checkout).
    """
    raw = booking_data.get("pre_voucher_total_amount")
    if raw is None:
        raise ValueError(
            "pre_voucher_total_amount is required when using a voucher for payment"
        )
    return Decimal(str(raw))


def validate_winner_voucher_for_payment(user, booking_data: dict, amount_cents: int) -> Optional[WinnerVoucher]:
    """
    If booking_data contains winner_voucher_id, validate voucher and payment amount.

    Ensures ``amount_cents`` matches server-computed due; normalises booking_data totals.

    Args:
        user: Paying user.
        booking_data: Client booking payload.
        amount_cents: Stripe charge amount in cents.

    Returns:
        WinnerVoucher | None: Voucher when id present and valid.

    Raises:
        ValueError: On invalid voucher, dual voucher use, or amount mismatch.
    """
    vid = booking_data.get("winner_voucher_id")
    if not vid:
        return None
    if booking_data.get("gift_voucher_id"):
        raise ValueError("Use only one of winner voucher or gift voucher per booking")
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
    """
    Atomically redeem a winner voucher and attach it to ``booking``.

    Args:
        voucher_id: ``WinnerVoucher`` primary key.
        user: User completing payment.
        booking: Booking record consuming the voucher.

    Returns:
        bool: True when redeemed or already tied to this booking; False if ineligible.
    """
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
