"""
Winner voucher admin for support tooling: list, detail, create, patch.

**Auth:** ``SupportPermissionAccess`` (internal key via support server proxy).

**GET actions:** ``list_vouchers``, ``get_voucher_detail``.

**POST actions:** ``create_voucher``.

**PATCH actions:** ``update_voucher`` — ``is_active``, ``valid_from``, ``expires_at``.

After create/detail, attempts to link ``assigned_user`` when an active user already exists
with ``assigned_email`` (same linkability rules as signup signal).
"""
from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Any

from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from main.models import User, WinnerVoucher
from main.services.winner_voucher import normalize_winner_code
from main.views.support.support_permission_access import SupportPermissionAccess

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _iso_or_null(dt):
    """ISO string for API payloads, or ``None`` when the datetime is unset."""
    if dt is None:
        return None
    return dt.isoformat()


def _serialize_voucher(v: WinnerVoucher) -> dict[str, Any]:
    """CamelCase dict for support-app winner voucher screens."""
    assigned = None
    if v.assigned_user_id:
        try:
            assigned = v.assigned_user
        except ObjectDoesNotExist:
            assigned = None
    booking = None
    if v.consumed_booking_id:
        try:
            booking = v.consumed_booking
        except ObjectDoesNotExist:
            booking = None
    return {
        "id": str(v.id),
        "code": v.code,
        "assignedEmail": v.assigned_email,
        "creditAmount": str(v.credit_amount.quantize(Decimal("0.01"))),
        "validFrom": _iso_or_null(v.valid_from),
        "expiresAt": _iso_or_null(v.expires_at),
        "isActive": v.is_active,
        "redeemedAt": _iso_or_null(v.redeemed_at),
        "assignedUserLabel": (getattr(assigned, "name", None) or None) if v.assigned_user_id else None,
        "consumedBookingRef": (
            booking.booking_reference if v.consumed_booking_id and booking else None
        ),
        "createdAt": v.created_at.isoformat(),
    }


def _parse_optional_datetime(raw) -> tuple:
    """Return (dt or None, error_message or None). Empty input -> (None, None)."""
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return None, None
    dt = parse_datetime(str(raw).strip())
    if dt is None:
        return None, "Invalid valid_from or expires_at (use ISO 8601 datetime)"
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt, None


def _try_link_existing_user(voucher: WinnerVoucher) -> None:
    """If voucher is linkable and a user exists for assigned_email, set assigned_user."""
    if voucher.assigned_user_id:
        return
    if not voucher.is_active or voucher.redeemed_at:
        return
    # Do not require valid_from/expires window here: association is for support UX and ownership;
    # checkout still enforces dates via winner_voucher_validity_issue / voucher_eligible_for_checkout.
    user = (
        User.objects.filter(
            email=voucher.assigned_email,
            is_active=True,
        )
        .first()
    )
    if user is None:
        return
    WinnerVoucher.objects.filter(pk=voucher.pk, assigned_user__isnull=True).update(
        assigned_user=user
    )


class SupportVouchersView(APIView):
    """
    Winner (promotional) voucher CRUD for the internal support app.

    **GET:** list, detail. **POST:** create. **PATCH:** update active flag and validity window.
    """

    permission_classes = [SupportPermissionAccess]

    get_action_handler = {
        "list_vouchers": "_list_vouchers",
        "get_voucher_detail": "_get_voucher_detail",
    }
    post_action_handler = {
        "create_voucher": "_post_create_voucher",
    }
    patch_action_handler = {
        "update_voucher": "_patch_update_voucher",
    }

    def get(self, request, *args, **kwargs):
        """Dispatch GET by URL ``action`` (list or detail)."""
        action = kwargs.get("action")
        if action not in self.get_action_handler:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
        return getattr(self, self.get_action_handler[action])(request, **kwargs)

    def post(self, request, *args, **kwargs):
        """Dispatch POST by URL ``action`` (``create_voucher``)."""
        action = kwargs.get("action")
        if action not in self.post_action_handler:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
        return getattr(self, self.post_action_handler[action])(request, **kwargs)

    def patch(self, request, *args, **kwargs):
        """Dispatch PATCH by URL ``action`` (``update_voucher``)."""
        action = kwargs.get("action")
        if action not in self.patch_action_handler:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
        return getattr(self, self.patch_action_handler[action])(request, **kwargs)

    def _list_vouchers(self, request, **kwargs):
        """Return all winner vouchers newest-first."""
        qs = (
            WinnerVoucher.objects.select_related("assigned_user", "consumed_booking")
            .order_by("-created_at")
        )
        rows = [_serialize_voucher(v) for v in qs]
        return Response({"data": {"vouchers": rows}})

    def _get_voucher_detail(self, request, **kwargs):
        """
        Single voucher by ``voucher_id``; re-link ``assigned_user`` when email matches.

        Returns:
            ``{'data': {'voucher': ...}}`` or 400/404.
        """
        vid = request.query_params.get("voucher_id")
        if not vid:
            return Response(
                {"error": "voucher_id required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            v = WinnerVoucher.objects.select_related("assigned_user", "consumed_booking").get(
                pk=vid
            )
        except (WinnerVoucher.DoesNotExist, ValidationError, ValueError, TypeError):
            return Response({"error": "Voucher not found"}, status=status.HTTP_404_NOT_FOUND)
        _try_link_existing_user(v)
        v = WinnerVoucher.objects.select_related("assigned_user", "consumed_booking").get(pk=vid)
        return Response({"data": {"voucher": _serialize_voucher(v)}})

    def _post_create_voucher(self, request, **kwargs):
        """
        Create a winner voucher (code, email, credit, optional validity, ``is_active``).

        Body: ``code``, ``assigned_email``, ``credit_amount``, optional ``valid_from`` / ``expires_at``.

        Returns:
            201 with voucher payload, or 400 on validation/duplicate code.
        """
        code_raw = request.data.get("code")
        email_raw = (request.data.get("assigned_email") or "").strip()
        credit_raw = request.data.get("credit_amount")
        is_active = request.data.get("is_active")
        if is_active is None:
            is_active = True
        elif not isinstance(is_active, bool):
            is_active = bool(is_active)

        code = normalize_winner_code(code_raw)
        if not code:
            return Response({"error": "code is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not email_raw or not _EMAIL_RE.match(email_raw):
            return Response(
                {"error": "valid assigned_email is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            credit = Decimal(str(credit_raw))
        except (InvalidOperation, TypeError, ValueError):
            return Response(
                {"error": "credit_amount must be a positive decimal"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if credit <= 0:
            return Response(
                {"error": "credit_amount must be positive"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        vf, err = _parse_optional_datetime(request.data.get("valid_from"))
        if err:
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)
        exp, err = _parse_optional_datetime(request.data.get("expires_at"))
        if err:
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)
        if vf and exp and vf > exp:
            return Response(
                {"error": "valid_from must be before or equal to expires_at"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                voucher = WinnerVoucher.objects.create(
                    code=code,
                    assigned_email=email_raw,
                    credit_amount=credit,
                    valid_from=vf,
                    expires_at=exp,
                    is_active=is_active,
                )
        except IntegrityError:
            return Response(
                {"error": "A voucher with this code already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        _try_link_existing_user(voucher)
        voucher.refresh_from_db()
        return Response(
            {"data": {"voucher": _serialize_voucher(voucher)}},
            status=status.HTTP_201_CREATED,
        )

    def _patch_update_voucher(self, request, **kwargs):
        """
        Update ``is_active``, ``valid_from``, and/or ``expires_at`` for an existing voucher.

        Returns:
            Updated voucher dict; 400 on date ordering errors, 404 if not found.
        """
        vid = request.data.get("voucher_id")
        if not vid:
            return Response(
                {"error": "voucher_id required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            voucher = WinnerVoucher.objects.select_related(
                "assigned_user", "consumed_booking"
            ).get(pk=vid)
        except (WinnerVoucher.DoesNotExist, ValidationError, ValueError, TypeError):
            return Response({"error": "Voucher not found"}, status=status.HTTP_404_NOT_FOUND)

        if "is_active" in request.data:
            raw = request.data.get("is_active")
            voucher.is_active = bool(raw)

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
        return Response({"data": {"voucher": _serialize_voucher(voucher)}})
