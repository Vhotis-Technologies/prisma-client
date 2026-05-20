"""
Partner payout management for support app.

**Auth:** internal support key (see :mod:`main.views.support.support_permission_access`).

**GET actions:**
- ``get_payout_queue``: pending/processing partner payout requests
- ``get_partner_payouts``: payout requests for a specific partner

**POST actions:**
- ``mark_payout_paid``: complete a payout request, update earnings, notify partner
"""
from __future__ import annotations

import logging
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from main.models import (
    CommissionAdminLog,
    CommissionEarning,
    Partner,
    PartnerBankAccount,
    PartnerMetricsCache,
    PartnerPayoutRequest,
)
from main.utils.support_audit import get_support_actor_email
from main.views.support.support_permission_access import SupportPermissionAccess

logger = logging.getLogger(__name__)


def _fmt_display_date(d) -> str:
    """Human-readable date for support UI (``%d %b %Y``)."""
    if not d:
        return ""
    if hasattr(d, "strftime"):
        return d.strftime("%d %b %Y")
    return str(d)


def _iso(dt) -> str:
    """ISO-8601 string for API payloads; empty string if falsy."""
    if not dt:
        return ""
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


def _mask_iban(value: str | None) -> str:
    """Mask IBAN for display: show only last 4 chars."""
    if not value or len(value) < 4:
        return value or ""
    clean = (value or "").replace(" ", "")
    return "****" + clean[-4:]


def _serialize_payout_request(pr: PartnerPayoutRequest) -> dict:
    """Serialize a payout request for support display."""
    partner = pr.partner
    return {
        "id": str(pr.id),
        "partner_id": str(partner.id) if partner else None,
        "partner_name": partner.business_name if partner else "",
        "partner_user_email": partner.user.email if partner and partner.user else "",
        "amount_requested": float(pr.amount_requested),
        "status": pr.status,
        "requested_at": _iso(pr.requested_at),
        "requested_at_display": _fmt_display_date(pr.requested_at),
        "paid_at": _iso(pr.paid_at),
        "paid_at_display": _fmt_display_date(pr.paid_at),
        "admin_notes": pr.admin_notes or "",
    }


def _serialize_bank_account_summary(partner: Partner) -> dict:
    """Return masked bank account info for support display."""
    try:
        bank = partner.bank_account
        return {
            "has_bank_account": True,
            "account_holder_name": bank.account_holder_name or "",
            "iban_masked": _mask_iban(bank.iban),
        }
    except PartnerBankAccount.DoesNotExist:
        return {"has_bank_account": False}


def _serialize_partner_payout_summary(partner: Partner) -> dict:
    """Serialize partner payout summary for support display."""
    approved_balance = CommissionEarning.objects.filter(
        partner=partner, status="approved"
    ).aggregate(s=Sum("commission_amount"))["s"] or Decimal("0")

    total_paid = CommissionEarning.objects.filter(
        partner=partner, status="paid"
    ).aggregate(s=Sum("commission_amount"))["s"] or Decimal("0")

    payout_requests = PartnerPayoutRequest.objects.filter(partner=partner).order_by("-requested_at")[:20]

    return {
        "partner_id": str(partner.id),
        "partner_name": partner.business_name,
        "partner_user_email": partner.user.email if partner.user else "",
        "approved_balance": float(approved_balance),
        "total_paid": float(total_paid),
        "bank_account": _serialize_bank_account_summary(partner),
        "payout_requests": [_serialize_payout_request(pr) for pr in payout_requests],
    }


class SupportPayoutsView(APIView):
    """
    Partner payout management for support app.
    """

    permission_classes = [SupportPermissionAccess]

    get_action_handler = {
        "get_payout_queue": "_get_payout_queue",
        "get_partner_payouts": "_get_partner_payouts",
        "get_partner_balance": "_get_partner_balance",
    }
    post_action_handler = {
        "mark_payout_paid": "_post_mark_payout_paid",
    }

    def get(self, request, *args, **kwargs):
        """Dispatch GET ``action`` to queue, partner summary, or balance verification."""
        action = kwargs.get("action")
        if action not in self.get_action_handler:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.get_action_handler[action])
        return handler(request, **kwargs)

    def post(self, request, *args, **kwargs):
        """Dispatch POST ``action`` (currently ``mark_payout_paid`` only)."""
        action = kwargs.get("action")
        if action not in self.post_action_handler:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.post_action_handler[action])
        return handler(request, **kwargs)

    def _get_payout_queue(self, request, **kwargs):
        """
        Return all pending/processing payout requests for support dashboard.
        Optional query params:
        - status: filter by status (pending, processing, paid, cancelled)
        """
        status_filter = (request.query_params.get("status") or "").strip().lower()

        qs = PartnerPayoutRequest.objects.select_related("partner", "partner__user").order_by("-requested_at")

        if status_filter:
            if status_filter in ("pending", "processing", "paid", "cancelled"):
                qs = qs.filter(status=status_filter)
        else:
            qs = qs.filter(status__in=["pending", "processing"])

        payout_requests = [_serialize_payout_request(pr) for pr in qs[:100]]

        return Response(
            {"data": {"payout_requests": payout_requests}},
            status=status.HTTP_200_OK,
        )

    def _get_partner_payouts(self, request, **kwargs):
        """
        Return payout summary for a specific partner.
        Query params:
        - partner_id (required)
        """
        partner_id = (request.query_params.get("partner_id") or "").strip()
        if not partner_id:
            return Response({"error": "partner_id required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            partner = Partner.objects.select_related("user").get(pk=partner_id)
        except Partner.DoesNotExist:
            return Response({"error": "Partner not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response(
            {"data": _serialize_partner_payout_summary(partner)},
            status=status.HTTP_200_OK,
        )

    def _get_partner_balance(self, request, **kwargs):
        """
        Return live approved/paid commission balances for a partner so support can
        verify the request amount against the actual ledger before paying.

        Query params:
        - payout_request_id (preferred) - resolves partner via the request
        - or partner_id
        """
        payout_request_id = (request.query_params.get("payout_request_id") or "").strip()
        partner_id = (request.query_params.get("partner_id") or "").strip()

        partner = None
        payout_request = None
        if payout_request_id:
            try:
                payout_request = PartnerPayoutRequest.objects.select_related(
                    "partner", "partner__user"
                ).get(pk=payout_request_id)
                partner = payout_request.partner
            except PartnerPayoutRequest.DoesNotExist:
                return Response(
                    {"error": "Payout request not found"}, status=status.HTTP_404_NOT_FOUND
                )
        elif partner_id:
            try:
                partner = Partner.objects.select_related("user").get(pk=partner_id)
            except Partner.DoesNotExist:
                return Response(
                    {"error": "Partner not found"}, status=status.HTTP_404_NOT_FOUND
                )
        else:
            return Response(
                {"error": "payout_request_id or partner_id required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        approved_balance = CommissionEarning.objects.filter(
            partner=partner, status="approved"
        ).aggregate(s=Sum("commission_amount"))["s"] or Decimal("0")
        pending_balance = CommissionEarning.objects.filter(
            partner=partner, status="pending"
        ).aggregate(s=Sum("commission_amount"))["s"] or Decimal("0")
        paid_total = CommissionEarning.objects.filter(
            partner=partner, status="paid"
        ).aggregate(s=Sum("commission_amount"))["s"] or Decimal("0")

        amount_requested = float(payout_request.amount_requested) if payout_request else None
        matches_request = (
            amount_requested is not None
            and Decimal(str(amount_requested)) == approved_balance
        )

        return Response(
            {
                "data": {
                    "partner_id": str(partner.id),
                    "partner_name": partner.business_name,
                    "approved_balance": float(approved_balance),
                    "pending_balance": float(pending_balance),
                    "total_paid": float(paid_total),
                    "amount_requested": amount_requested,
                    "amount_matches_balance": matches_request,
                    "bank_account": _serialize_bank_account_summary(partner),
                }
            },
            status=status.HTTP_200_OK,
        )

    def _post_mark_payout_paid(self, request, **kwargs):
        """
        Mark a payout request as paid with server-side validation and an audit log.

        Request body:
        - payout_request_id (required)
        - admin_notes (optional)
        - payment_reference (optional) - added to admin_notes
        - support_user_email (optional) - recorded in CommissionAdminLog
        - confirmed_amount (optional) - if provided must match the request's
          amount_requested (defence-in-depth against stale clients)

        This will:
        1. Validate the payout against current approved commission balance
        2. Update PartnerPayoutRequest status to 'paid' and set paid_at
        3. Mark only the 'approved' CommissionEarnings that cover the requested
           amount (oldest first) as 'paid', linking them to the request via
           admin_notes so the audit trail stays clear
        4. Write a CommissionAdminLog entry per earning marked paid
        5. Refresh PartnerMetricsCache
        6. Signal triggers partner notification
        """
        data = request.data if hasattr(request.data, "get") else {}
        payout_request_id = (data.get("payout_request_id") or "").strip()
        admin_notes = (data.get("admin_notes") or "").strip()
        payment_reference = (data.get("payment_reference") or "").strip()
        support_user_email = get_support_actor_email(request)
        confirmed_amount_raw = data.get("confirmed_amount")

        if not payout_request_id:
            return Response(
                {"error": "payout_request_id required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            payout_request = PartnerPayoutRequest.objects.select_related(
                "partner", "partner__user"
            ).get(pk=payout_request_id)
        except PartnerPayoutRequest.DoesNotExist:
            return Response(
                {"error": "Payout request not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if payout_request.status == "paid":
            return Response(
                {
                    "data": {
                        "message": "Already paid",
                        "payout_request": _serialize_payout_request(payout_request),
                    }
                },
                status=status.HTTP_200_OK,
            )

        if payout_request.status not in ("pending", "processing"):
            return Response(
                {"error": f"Cannot mark {payout_request.status} payout as paid"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        partner = payout_request.partner
        requested_amount = Decimal(payout_request.amount_requested or 0)

        if confirmed_amount_raw is not None:
            try:
                confirmed_decimal = Decimal(str(confirmed_amount_raw))
            except (TypeError, ValueError):
                return Response(
                    {"error": "confirmed_amount must be numeric"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if confirmed_decimal != requested_amount:
                return Response(
                    {
                        "error": "confirmed_amount does not match the requested amount on record. "
                        "Refresh and try again.",
                        "expected": float(requested_amount),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        approved_earnings_qs = CommissionEarning.objects.filter(
            partner=partner, status="approved"
        ).order_by("created_at")
        approved_balance = approved_earnings_qs.aggregate(
            s=Sum("commission_amount")
        )["s"] or Decimal("0")

        if approved_balance <= 0:
            return Response(
                {"error": "Partner has no approved commission to pay out."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if requested_amount <= 0:
            return Response(
                {"error": "Payout amount must be greater than zero."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if requested_amount > approved_balance:
            return Response(
                {
                    "error": "Approved balance is lower than the requested amount. "
                    "The partner may have had a reversal since this request was created.",
                    "approved_balance": float(approved_balance),
                    "amount_requested": float(requested_amount),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        notes_parts = [f"Paid request {payout_request_id}"]
        if payment_reference:
            notes_parts.append(f"Payment ref: {payment_reference}")
        if support_user_email:
            notes_parts.append(f"By: {support_user_email}")
        if admin_notes:
            notes_parts.append(admin_notes)
        final_notes = " | ".join(notes_parts)

        with transaction.atomic():
            payout_request.status = "paid"
            payout_request.paid_at = timezone.now()
            payout_request.admin_notes = final_notes
            payout_request.save(update_fields=["status", "paid_at", "admin_notes"])

            running = Decimal("0")
            earnings_to_pay = []
            for earning in approved_earnings_qs.select_for_update():
                if running >= requested_amount:
                    break
                earnings_to_pay.append(earning)
                running += earning.commission_amount or Decimal("0")

            earnings_updated = len(earnings_to_pay)
            for earning in earnings_to_pay:
                previous_status = earning.status
                earning.status = "paid"
                earning.save(update_fields=["status"])
                CommissionAdminLog.objects.create(
                    commission_earning=earning,
                    admin_user=None,
                    action="approve",
                    reason=final_notes,
                    previous_status=previous_status,
                    previous_amount=earning.commission_amount,
                )

            try:
                cache = PartnerMetricsCache.objects.get(partner=partner)
                paid_total = CommissionEarning.objects.filter(
                    partner=partner, status="paid"
                ).aggregate(s=Sum("commission_amount"))["s"] or Decimal("0")
                pending_after = CommissionEarning.objects.filter(
                    partner=partner, status__in=["pending", "approved"]
                ).aggregate(s=Sum("commission_amount"))["s"] or Decimal("0")
                cache.pending_commission = pending_after
                cache.total_commission_earned = paid_total
                cache.save(
                    update_fields=[
                        "pending_commission",
                        "total_commission_earned",
                        "last_updated",
                    ]
                )
            except PartnerMetricsCache.DoesNotExist:
                pass

        logger.info(
            "Support payout marked paid: request_id=%s partner=%s amount=%s "
            "earnings_updated=%s by=%s ref=%s",
            payout_request_id,
            partner.business_name,
            payout_request.amount_requested,
            earnings_updated,
            support_user_email or "unknown",
            payment_reference or "n/a",
        )

        return Response(
            {
                "data": {
                    "message": "Payout marked as paid",
                    "payout_request": _serialize_payout_request(payout_request),
                    "earnings_marked_paid": earnings_updated,
                    "amount_paid": float(running),
                }
            },
            status=status.HTTP_200_OK,
        )
