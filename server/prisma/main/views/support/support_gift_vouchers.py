"""
Paid gift voucher listing for support: list, detail, patch (is_active / optional dates).

**Auth:** ``SupportPermissionAccess`` (internal key via support server proxy).

**GET actions:** ``list_gift_vouchers``, ``get_gift_voucher_detail`` (re-links recipient user when possible).

**PATCH actions:** ``update_gift_voucher`` — ``is_active``, ``valid_from``, ``expires_at``.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from main.models import GiftVoucher
from main.utils.gift_voucher import try_link_gift_voucher_existing_user
from main.views.support.support_permission_access import SupportPermissionAccess


def _iso_or_null(dt):
    """ISO string for API payloads, or ``None`` when the datetime is unset."""
    if dt is None:
        return None
    return dt.isoformat()


def _serialize_gift(v: GiftVoucher) -> dict[str, Any]:
    """CamelCase dict for support-app gift voucher screens (payment + redemption metadata)."""
    assigned = None
    if v.assigned_user_id:
        try:
            assigned = v.assigned_user
        except ObjectDoesNotExist:
            assigned = None
    purchaser = None
    if v.purchased_by_id:
        try:
            purchaser = v.purchased_by
        except ObjectDoesNotExist:
            purchaser = None
    booking = None
    if v.consumed_booking_id:
        try:
            booking = v.consumed_booking
        except ObjectDoesNotExist:
            booking = None
    txn = None
    if v.payment_transaction_id:
        try:
            txn = v.payment_transaction
        except ObjectDoesNotExist:
            txn = None
    return {
        "id": str(v.id),
        "code": v.code or "",
        "assignedEmail": v.assigned_email,
        "creditAmount": str(v.credit_amount.quantize(Decimal("0.01"))),
        "validityDays": v.validity_days,
        "purchaseCurrency": getattr(v, "purchase_currency", "eur"),
        "validFrom": _iso_or_null(v.valid_from),
        "expiresAt": _iso_or_null(v.expires_at),
        "isActive": v.is_active,
        "redeemedAt": _iso_or_null(v.redeemed_at),
        "emailSentAt": _iso_or_null(v.email_sent_at),
        "isPaid": v.is_paid(),
        "stripePaymentIntentId": v.stripe_payment_intent_id or None,
        "assignedUserLabel": (getattr(assigned, "name", None) or None)
        if v.assigned_user_id
        else None,
        "purchaserEmail": purchaser.email if purchaser else None,
        "purchaserLabel": (
            (getattr(purchaser, "name", "") or "").strip() or purchaser.email
            if purchaser
            else None
        ),
        "paymentAmount": str(txn.amount.quantize(Decimal("0.01"))) if txn else None,
        "paymentCurrency": txn.currency if txn else None,
        "paymentLast4": txn.last_4_digits if txn else None,
        "paymentCardBrand": txn.card_brand if txn else None,
        "consumedBookingRef": (
            booking.booking_reference if v.consumed_booking_id and booking else None
        ),
        "createdAt": v.created_at.isoformat(),
    }


def _parse_optional_datetime(raw) -> tuple:
    """Parse PATCH body datetime; return ``(aware_dt, None)`` or ``(None, error_message)``."""
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return None, None
    dt = parse_datetime(str(raw).strip())
    if dt is None:
        return None, "Invalid valid_from or expires_at (use ISO 8601 datetime)"
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt, None


class SupportGiftVouchersView(APIView):
    """List, detail, and patch paid gift vouchers for the internal support app."""

    permission_classes = [SupportPermissionAccess]

    get_action_handler = {
        "list_gift_vouchers": "_list_gift_vouchers",
        "get_gift_voucher_detail": "_get_gift_voucher_detail",
    }
    patch_action_handler = {
        "update_gift_voucher": "_patch_update_gift_voucher",
    }

    def get(self, request, *args, **kwargs):
        """
        Dispatch GET by URL ``action`` (list or detail).

        Returns:
            DRF ``Response`` from the matched handler, or 400 for unknown actions.
        """
        action = kwargs.get("action")
        if action not in self.get_action_handler:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
        return getattr(self, self.get_action_handler[action])(request, **kwargs)

    def patch(self, request, *args, **kwargs):
        """Route PATCH ``action`` to ``patch_action_handler`` (update fields)."""
        action = kwargs.get("action")
        if action not in self.patch_action_handler:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
        return getattr(self, self.patch_action_handler[action])(request, **kwargs)

    def _list_gift_vouchers(self, request, **kwargs):
        """Return all gift vouchers newest-first with related user/booking/payment data."""
        qs = GiftVoucher.objects.select_related(
            "assigned_user", "consumed_booking", "purchased_by", "payment_transaction"
        ).order_by("-created_at")
        rows = [_serialize_gift(v) for v in qs]
        return Response({"data": {"gift_vouchers": rows}})

    def _get_gift_voucher_detail(self, request, **kwargs):
        """Single voucher by ``gift_voucher_id``; re-link recipient if email matches existing user."""
        vid = request.query_params.get("gift_voucher_id")
        if not vid:
            return Response(
                {"error": "gift_voucher_id required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            v = GiftVoucher.objects.select_related(
                "assigned_user",
                "consumed_booking",
                "purchased_by",
                "payment_transaction",
            ).get(pk=vid)
        except (GiftVoucher.DoesNotExist, ValidationError, ValueError, TypeError):
            return Response({"error": "Gift voucher not found"}, status=status.HTTP_404_NOT_FOUND)
        try_link_gift_voucher_existing_user(v)
        v = GiftVoucher.objects.select_related(
            "assigned_user",
            "consumed_booking",
            "purchased_by",
            "payment_transaction",
        ).get(pk=vid)
        return Response({"data": {"gift_voucher": _serialize_gift(v)}})

    def _patch_update_gift_voucher(self, request, **kwargs):
        """Update ``is_active``, ``valid_from``, and/or ``expires_at``; validate date ordering."""
        vid = request.data.get("gift_voucher_id")
        if not vid:
            return Response(
                {"error": "gift_voucher_id required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            voucher = GiftVoucher.objects.select_related(
                "assigned_user",
                "consumed_booking",
                "purchased_by",
                "payment_transaction",
            ).get(pk=vid)
        except (GiftVoucher.DoesNotExist, ValidationError, ValueError, TypeError):
            return Response({"error": "Gift voucher not found"}, status=status.HTTP_404_NOT_FOUND)

        if "is_active" in request.data:
            voucher.is_active = bool(request.data.get("is_active"))

        if "valid_from" in request.data:
            vf_tuple = _parse_optional_datetime(request.data.get("valid_from"))
            if vf_tuple[1]:
                return Response({"error": vf_tuple[1]}, status=status.HTTP_400_BAD_REQUEST)
            voucher.valid_from = vf_tuple[0]

        if "expires_at" in request.data:
            exp_tuple = _parse_optional_datetime(request.data.get("expires_at"))
            if exp_tuple[1]:
                return Response({"error": exp_tuple[1]}, status=status.HTTP_400_BAD_REQUEST)
            voucher.expires_at = exp_tuple[0]

        if voucher.valid_from and voucher.expires_at and voucher.valid_from > voucher.expires_at:
            return Response(
                {"error": "valid_from must be before or equal to expires_at"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        voucher.save()
        voucher.refresh_from_db()
        try_link_gift_voucher_existing_user(voucher)
        voucher.refresh_from_db()
        return Response({"data": {"gift_voucher": _serialize_gift(voucher)}})
