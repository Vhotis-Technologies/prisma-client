"""
Bookings and fleet bulk orders for support tooling.

**Auth:** internal support key.

**Features:** list with appointment summaries (single rows + rolled-up bulk orders), rich detail
for reschedule/cancel flows, image groups, payment rollup, and PATCH handlers that notify clients
via tasks (push, events).

**Status mapping:** raw DB statuses are normalized for the app via :func:`_display_status`
(e.g. ``scheduled`` → ``confirmed``).
"""
from __future__ import annotations

import json
import logging
import traceback
from datetime import datetime
from decimal import Decimal

from django.conf import settings
from django.db.models import Prefetch, Q, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from main.models import (
    BookedAppointment,
    BookedAppointmentImage,
    BulkOrder,
    LoyaltyProgram,
    PaymentTransaction,
)
from main.tasks import publish_booking_cancelled, publish_booking_rescheduled
from main.services.NotificationServices import NotificationService
from main.views.events import EventsView
from main.views.fleet import perform_bulk_order_cancellation, perform_bulk_order_reschedule
from main.views.support.support_permission_access import SupportPermissionAccess

logger = logging.getLogger(__name__)


def _display_status(raw: str) -> str:
    """Collapse operational states into the small set the support UI understands."""
    if raw in ("confirmed", "scheduled", "in_progress"):
        return "confirmed"
    if raw == "pending":
        return "pending"
    if raw == "completed":
        return "completed"
    if raw == "cancelled":
        return "cancelled"
    return "pending"


def _fmt_date(d) -> str:
    if not d:
        return ""
    return d.strftime("%d %b %Y")


def _fmt_appointment(booking: BookedAppointment) -> str:
    base = _fmt_date(booking.appointment_date)
    if booking.start_time:
        return f"{base}, {booking.start_time.strftime('%H:%M')}"
    return base


def _service_description(booking: BookedAppointment) -> str:
    raw = booking.service_type.description
    if raw is None:
        return ""
    if isinstance(raw, str):
        return raw
    if isinstance(raw, dict):
        for key in ("summary", "short", "en", "text", "body"):
            val = raw.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
        try:
            return json.dumps(raw)[:500]
        except (TypeError, ValueError):
            return str(raw)[:500]
    return str(raw)[:500]


def _payment_status(booking: BookedAppointment) -> str:
    """Paid state for line items: bulk fleet payments attach to BulkOrder, not each BookedAppointment."""
    if booking.bulk_order_id:
        bulk = booking.bulk_order
        succeeded = PaymentTransaction.objects.filter(bulk_order_id=bulk.id, status="succeeded")
        payments = (
            succeeded.filter(transaction_type="payment").aggregate(s=Sum("amount"))["s"]
            or Decimal("0")
        )
        refunds = (
            succeeded.filter(transaction_type="refund").aggregate(s=Sum("amount"))["s"]
            or Decimal("0")
        )
        total = bulk.total_amount or Decimal("0")
        bulk_ps = (bulk.payment_status or "").strip()
    else:
        ref = (booking.booking_reference or "").strip()
        tx_filter = Q(booking=booking)
        if ref:
            tx_filter |= Q(booking_reference=ref, booking__isnull=True)
        succeeded = PaymentTransaction.objects.filter(tx_filter, status="succeeded")
        payments = (
            succeeded.filter(transaction_type="payment").aggregate(s=Sum("amount"))["s"]
            or Decimal("0")
        )
        refunds = (
            succeeded.filter(transaction_type="refund").aggregate(s=Sum("amount"))["s"]
            or Decimal("0")
        )
        total = booking.total_amount or Decimal("0")
        bulk_ps = ""

    if booking.status == "cancelled" and refunds > 0:
        return "refunded"
    if booking.status == "cancelled" and payments == 0:
        return "unpaid"

    # Trust BulkOrder.payment_status over stale succeeded rows (e.g. switched to invoice_later).
    if booking.bulk_order_id:
        if bulk_ps == "invoice_later":
            return "invoice later"
        if bulk_ps in ("pending", "failed"):
            return "unpaid"
        if bulk_ps == "cancelled":
            return "refunded" if refunds > 0 else "unpaid"

    bulk_marked_paid = bool(booking.bulk_order_id) and bulk_ps == "succeeded"
    if total > 0 and (payments >= total or bulk_marked_paid):
        return "paid"
    if payments > 0:
        return "partial"
    if bulk_marked_paid:
        return "paid"
    return "unpaid"


def _original_succeeded_payment(booking: BookedAppointment):
    """Payment row for refund lookup: booking-level, orphan reference match, or bulk order."""
    if booking.bulk_order_id:
        return (
            PaymentTransaction.objects.filter(
                bulk_order_id=booking.bulk_order_id,
                transaction_type="payment",
                status="succeeded",
            )
            .order_by("-created_at")
            .first()
        )
    ref = (booking.booking_reference or "").strip()
    filt = Q(booking=booking)
    if ref:
        filt |= Q(booking_reference=ref, booking__isnull=True)
    return (
        PaymentTransaction.objects.filter(filt, transaction_type="payment", status="succeeded")
        .order_by("-created_at")
        .first()
    )


def _roll_up_bulk_status(appointments: list) -> str:
    if not appointments:
        return "pending"
    raw = [getattr(a, "status", "") or "" for a in appointments]
    if all(s == "cancelled" for s in raw):
        return _display_status("cancelled")
    if all(s == "completed" for s in raw):
        return _display_status("completed")
    if any(s == "pending" for s in raw):
        return "pending"
    if any(s in ("confirmed", "scheduled", "in_progress") for s in raw):
        return "confirmed"
    return _display_status(raw[0])


def _serialize_bulk_order_summary(bulk_order: BulkOrder, appointments: list) -> dict:
    user = bulk_order.user
    rep = min(
        appointments,
        key=lambda a: (
            a.appointment_date or datetime.min.date(),
            a.start_time or datetime.min.time(),
        ),
    )
    return {
        "kind": "bulk_order",
        "id": str(bulk_order.id),
        "bulk_order_id": str(bulk_order.id),
        "booking_reference": bulk_order.booking_reference,
        "booking_date": _fmt_date(bulk_order.created_at.date()) if bulk_order.created_at else "",
        "appointment_date": _fmt_appointment(rep),
        "status": _roll_up_bulk_status(appointments),
        "client_name": user.name or "",
        "client_type": _client_type(user),
        "vehicle_count": bulk_order.number_of_vehicles,
        "total_amount": float(bulk_order.total_amount or 0),
    }


def _bulk_order_payment_summary(bulk_order: BulkOrder) -> dict:
    succeeded = PaymentTransaction.objects.filter(bulk_order=bulk_order, status="succeeded")
    payments = (
        succeeded.filter(transaction_type="payment").aggregate(s=Sum("amount"))["s"]
        or Decimal("0")
    )
    refunds = (
        succeeded.filter(transaction_type="refund").aggregate(s=Sum("amount"))["s"]
        or Decimal("0")
    )
    total = bulk_order.total_amount or Decimal("0")
    raw_ps = (bulk_order.payment_status or "").strip()
    marked = raw_ps == "succeeded"

    if raw_ps == "invoice_later":
        label = "invoice_later"
    elif raw_ps == "cancelled":
        label = "refunded" if refunds > 0 else "unpaid"
    elif raw_ps in ("pending", "failed"):
        label = "unpaid"
    elif total > 0 and (payments >= total or marked):
        label = "paid"
    elif payments > 0:
        label = "partial"
    elif marked:
        label = "paid"
    else:
        label = "unpaid"
    return {
        "payment_status": label,
        "order_total": float(total),
        "payments_total": float(payments),
        "refunds_total": float(refunds),
        "bulk_payment_status": bulk_order.payment_status,
    }


def _client_type(user) -> str:
    if user.is_fleet_user():
        return "Corporate"
    return "Individual"


def _loyalty(user):
    loyalty = LoyaltyProgram.objects.filter(user=user).first()
    if not loyalty:
        return "Bronze", []
    tier = (loyalty.current_tier or "bronze").replace("_", " ").title()
    benefits_obj = loyalty.get_tier_benefits() or {}
    benefits = list(benefits_obj.get("free_service") or [])
    disc = benefits_obj.get("discount")
    if disc:
        benefits.append(f"{disc}% tier discount")
    return tier, benefits


def _team_members(booking: BookedAppointment):
    team = []
    for i, m in enumerate(booking.assigned_detailers or []):
        if not isinstance(m, dict):
            continue
        tid = m.get("id")
        team.append(
            {
                "id": str(tid) if tid is not None else f"tm_{i}",
                "name": m.get("name") or "Unknown",
                "role": m.get("role") or "Detailer",
                "phone": (m.get("phone") or "") or "",
                "email": (m.get("email") or "") or "",
            }
        )
    detailer = booking.detailer
    if not team and detailer:
        team.append(
            {
                "id": str(detailer.id),
                "name": detailer.name,
                "role": "Lead detailer",
                "phone": detailer.phone or "",
                "email": "",
            }
        )
    return team


def _address_payload(addr) -> dict:
    lat = addr.latitude
    lng = addr.longitude
    return {
        "address": addr.address or "",
        "city": addr.city or "",
        "postcode": addr.post_code or "",
        "country": addr.country or "",
        "latitude": float(lat) if lat is not None else 0.0,
        "longitude": float(lng) if lng is not None else 0.0,
    }


def _booking_images(booking: BookedAppointment) -> dict:
    groups = {
        "before_images_interior": [],
        "before_images_exterior": [],
        "after_images_interior": [],
        "after_images_exterior": [],
    }
    for idx, img in enumerate(booking.job_images.all()):
        seg = (img.segment or "exterior").lower()
        typ = (img.image_type or "before").lower()
        key = f"{typ}_images_{seg}"
        if key not in groups:
            continue
        sid = str(img.id)
        numeric_id = (abs(hash(sid)) % (10**9)) or (idx + 1)
        groups[key].append(
            {
                "id": numeric_id,
                "image_url": img.image_url,
                "created_at": img.created_at.isoformat() if img.created_at else "",
            }
        )
    return groups


def _serialize_booking_summary(booking: BookedAppointment) -> dict:
    user = booking.user
    return {
        "kind": "appointment",
        "id": str(booking.id),
        "booking_reference": booking.booking_reference,
        "booking_date": _fmt_date(booking.booking_date),
        "appointment_date": _fmt_appointment(booking),
        "status": _display_status(booking.status),
        "client_name": user.name or "",
        "client_type": _client_type(user),
    }


def _serialize_booking_detail(booking: BookedAppointment) -> dict:
    user = booking.user
    tier, benefits = _loyalty(user)
    addons = [a.name for a in booking.add_ons.all()]
    images_qs = booking.job_images.all()
    has_images = images_qs.exists()
    appt = getattr(booking, "appointment_date", None)
    payload = {
        **_serialize_booking_summary(booking),
        "appointment_date_iso": appt.isoformat() if appt else "",
        "start_time_hhmm": booking.start_time.strftime("%H:%M") if booking.start_time else "",
        "client_email": user.email or "",
        "client_phone": user.phone or "",
        "service_type": booking.service_type.name or "",
        "valet_type": booking.valet_type.name or "",
        "service_description": _service_description(booking) or None,
        "address": _address_payload(booking.address),
        "duration_minutes": int(booking.duration or booking.service_type.duration or 0),
        "team_members": _team_members(booking),
        "payment_status": _payment_status(booking),
        "loyalty_tier": tier,
        "loyalty_benefits": benefits,
        "is_express_service": bool(booking.is_express_service),
        "addons": addons,
        "special_instructions": (booking.special_instructions or "").strip(),
        "total_amount": float(booking.total_amount or 0),
        "is_reviewed": bool(booking.is_reviewed),
        "review_rating": booking.review_rating if booking.is_reviewed else None,
        "review_comment": (
            (booking.review_comment or "").strip() or None
            if booking.is_reviewed
            else None
        ),
        "review_submitted_at": (
            booking.review_submitted_at.isoformat()
            if booking.is_reviewed and booking.review_submitted_at
            else None
        ),
    }
    if has_images:
        payload["booking_images"] = _booking_images(booking)
    return payload


def _booking_by_reference(booking_reference: str):
    return BookedAppointment.objects.select_related(
        "user", "address", "service_type", "valet_type", "detailer", "vehicle"
    ).get(booking_reference=booking_reference)


def _reject_bulk_booking(booking: BookedAppointment):
    if booking.bulk_order_id:
        return Response(
            {
                "error": "This booking is part of a fleet bulk order. Cancel or reschedule it from the fleet bulk flow.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


class SupportBookingsView(APIView):
    """
    GET for read models; PATCH for cancel/reschedule (with fee intent where applicable).
    """

    permission_classes = [SupportPermissionAccess]

    get_action_handler = {
        "get_bookings_list": "_get_bookings_list",
        "get_booking_detail": "_get_booking_detail",
        "get_bulk_order_detail": "_get_bulk_order_detail",
        "get_reschedule_slots": "_get_reschedule_slots",
        "get_bulk_reschedule_slots": "_get_bulk_reschedule_slots",
    }
    patch_action_handler = {
        "cancel_booking": "_patch_cancel_booking",
        "reschedule_intent": "_patch_reschedule_intent",
        "reschedule_booking": "_patch_reschedule_booking",
        "cancel_bulk_order": "_patch_cancel_bulk_order",
        "reschedule_bulk_order": "_patch_reschedule_bulk_order",
    }

    def get(self, request, *args, **kwargs):
        action = kwargs.get("action")
        if action not in self.get_action_handler:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.get_action_handler[action])
        return handler(request, **kwargs)

    def patch(self, request, *args, **kwargs):
        action = kwargs.get("action")
        if action not in self.patch_action_handler:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.patch_action_handler[action])
        return handler(request, **kwargs)

    def _get_bookings_list(self, request, **kwargs):
        qs = (
            BookedAppointment.objects.select_related(
                "user",
                "address",
                "service_type",
                "valet_type",
                "detailer",
                "bulk_order",
                "bulk_order__user",
            )
            .order_by("-created_at")[:250]
        )
        seen_bulk: set = set()
        bulk_appointments_cache: dict = {}

        def appointments_for_bulk(bulk_id):
            if bulk_id not in bulk_appointments_cache:
                bulk_appointments_cache[bulk_id] = list(
                    BookedAppointment.objects.filter(bulk_order_id=bulk_id)
                )
            return bulk_appointments_cache[bulk_id]

        bookings = []
        for b in qs:
            if b.bulk_order_id:
                bid = b.bulk_order_id
                if bid in seen_bulk:
                    continue
                seen_bulk.add(bid)
                kids = appointments_for_bulk(bid)
                if not kids:
                    kids = [b]
                bulk = b.bulk_order
                if bulk is None:
                    continue
                bookings.append(_serialize_bulk_order_summary(bulk, kids))
            else:
                bookings.append(_serialize_booking_summary(b))

        return Response({"data": {"bookings": bookings}})

    def _get_booking_detail(self, request, **kwargs):
        booking_id = request.query_params.get("booking_id")
        if not booking_id:
            return Response({"error": "booking_id required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            booking = BookedAppointment.objects.select_related(
                "user",
                "address",
                "service_type",
                "valet_type",
                "detailer",
                "bulk_order",
            ).prefetch_related(
                "add_ons",
                Prefetch("job_images", queryset=BookedAppointmentImage.objects.order_by("created_at")),
            ).get(pk=booking_id)
        except BookedAppointment.DoesNotExist:
            return Response({"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"data": {"booking": _serialize_booking_detail(booking)}})

    def _get_bulk_order_detail(self, request, **kwargs):
        bulk_order_id = request.query_params.get("bulk_order_id")
        if not bulk_order_id:
            return Response({"error": "bulk_order_id required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            bulk = BulkOrder.objects.select_related("user", "address", "branch", "fleet").get(
                pk=bulk_order_id
            )
        except BulkOrder.DoesNotExist:
            return Response({"error": "Bulk order not found"}, status=status.HTTP_404_NOT_FOUND)

        appts = (
            BookedAppointment.objects.filter(bulk_order=bulk)
            .select_related("user", "address", "service_type", "valet_type", "detailer")
            .prefetch_related(
                "add_ons",
                Prefetch(
                    "job_images",
                    queryset=BookedAppointmentImage.objects.order_by("created_at"),
                ),
            )
            .order_by("appointment_date", "start_time")
        )
        user = bulk.user
        data = {
            "bulk_order": {
                "id": str(bulk.id),
                "booking_reference": bulk.booking_reference,
                "payment_status": bulk.payment_status,
                "total_amount": float(bulk.total_amount or 0),
                "number_of_vehicles": bulk.number_of_vehicles,
                "client_name": user.name or "",
                "client_email": user.email or "",
                "client_phone": getattr(user, "phone", None) or "",
                "client_type": _client_type(user),
                "address": _address_payload(bulk.address) if bulk.address_id else None,
            },
            "appointments": [_serialize_booking_detail(b) for b in appts],
            "payment_summary": _bulk_order_payment_summary(bulk),
        }
        return Response({"data": data})

    def _get_reschedule_slots(self, request, **kwargs):
        booking_id = request.query_params.get("booking_id")
        date_str = request.query_params.get("date")
        if not booking_id or not date_str:
            return Response(
                {"error": "booking_id and date are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            slot_day = datetime.strptime(date_str.strip()[:10], "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return Response({"error": "Invalid date"}, status=status.HTTP_400_BAD_REQUEST)
        if slot_day < timezone.now().date():
            return Response(
                {"error": "Cannot load slots for a date in the past"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            booking = BookedAppointment.objects.select_related(
                "address", "service_type"
            ).get(pk=booking_id)
        except BookedAppointment.DoesNotExist:
            return Response({"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND)
        bulk_err = _reject_bulk_booking(booking)
        if bulk_err:
            return bulk_err

        address = booking.address
        country = (address.country or "").strip() or "Ireland"
        city = (address.city or "").strip() or "Dublin"
        lat = address.latitude
        lng = address.longitude
        duration = 60
        if booking.service_type_id and booking.service_type and booking.service_type.duration:
            duration = int(booking.service_type.duration)
        is_express = bool(getattr(booking, "is_express_service", False))

        events = EventsView()
        start_times, err = events._fetch_detailer_timeslots(
            date_str[:10],
            duration,
            country,
            city,
            latitude=lat,
            longitude=lng,
            is_express_service=is_express,
        )
        if err is not None:
            return Response({"error": err}, status=status.HTTP_502_BAD_GATEWAY)
        slots = sorted(start_times)
        return Response({"data": {"slots": slots}})

    def _get_bulk_reschedule_slots(self, request, **kwargs):
        """Availability for a new bulk-order date using the first line appointment’s address/service."""
        bulk_order_id = request.query_params.get("bulk_order_id")
        date_str = request.query_params.get("date")
        if not bulk_order_id or not date_str:
            return Response(
                {"error": "bulk_order_id and date are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            slot_day = datetime.strptime(date_str.strip()[:10], "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return Response({"error": "Invalid date"}, status=status.HTTP_400_BAD_REQUEST)
        if slot_day < timezone.now().date():
            return Response(
                {"error": "Cannot load slots for a date in the past"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            bulk = BulkOrder.objects.get(pk=bulk_order_id)
        except BulkOrder.DoesNotExist:
            return Response({"error": "Bulk order not found"}, status=status.HTTP_404_NOT_FOUND)
        booking = (
            BookedAppointment.objects.filter(bulk_order=bulk)
            .select_related("address", "service_type")
            .order_by("appointment_date", "start_time")
            .first()
        )
        if not booking:
            return Response({"error": "No appointments for this bulk order"}, status=status.HTTP_400_BAD_REQUEST)
        if not booking.address_id:
            return Response(
                {"error": "Bulk order appointments have no address for slot lookup"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        address = booking.address
        country = (address.country or "").strip() or "Ireland"
        city = (address.city or "").strip() or "Dublin"
        lat = address.latitude
        lng = address.longitude
        duration = 60
        if booking.service_type_id and booking.service_type and booking.service_type.duration:
            duration = int(booking.service_type.duration)
        is_express = bool(getattr(booking, "is_express_service", False))
        events = EventsView()
        start_times, err = events._fetch_detailer_timeslots(
            date_str[:10],
            duration,
            country,
            city,
            latitude=lat,
            longitude=lng,
            is_express_service=is_express,
        )
        if err is not None:
            return Response({"error": err}, status=status.HTTP_502_BAD_GATEWAY)
        slots = sorted(start_times)
        return Response({"data": {"slots": slots}})

    def _patch_cancel_bulk_order(self, request, **kwargs):
        data = request.data.get("data") or request.data or {}
        bulk_order_id = (data.get("bulk_order_id") or "").strip()
        if not bulk_order_id:
            return Response(
                {"error": "bulk_order_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            bulk = BulkOrder.objects.get(pk=bulk_order_id)
        except BulkOrder.DoesNotExist:
            return Response({"error": "Bulk order not found"}, status=status.HTTP_404_NOT_FOUND)
        return perform_bulk_order_cancellation(bulk)

    def _patch_reschedule_bulk_order(self, request, **kwargs):
        data = request.data.get("data") or request.data or {}
        bulk_order_id = (data.get("bulk_order_id") or "").strip()
        if not bulk_order_id:
            return Response(
                {"error": "bulk_order_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            bulk = BulkOrder.objects.get(pk=bulk_order_id)
        except BulkOrder.DoesNotExist:
            return Response({"error": "Bulk order not found"}, status=status.HTTP_404_NOT_FOUND)
        payload = dict(data)
        if payload.get("new_time") and not payload.get("start_time"):
            payload["start_time"] = payload["new_time"]
        return perform_bulk_order_reschedule(bulk, payload)

    def _patch_reschedule_intent(self, request, **kwargs):
        data = request.data.get("data") or request.data
        booking_reference = data.get("booking_reference")
        new_date = data.get("new_date")
        new_time = data.get("new_time")
        if not booking_reference or not new_date or not new_time:
            return Response(
                {"error": "booking_reference, new_date, and new_time are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            booking = _booking_by_reference(booking_reference)
        except BookedAppointment.DoesNotExist:
            return Response({"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND)

        bulk_err = _reject_bulk_booking(booking)
        if bulk_err:
            return bulk_err

        if booking.status in ("completed", "cancelled", "in_progress"):
            return Response(
                {"error": "This booking cannot be rescheduled"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        now = timezone.now()
        try:
            apt_dt = timezone.datetime.combine(
                booking.appointment_date,
                booking.start_time or datetime.min.time(),
            )
            apt_dt = timezone.make_aware(apt_dt)
            hours_until = (apt_dt - now).total_seconds() / 3600
        except Exception:
            hours_until = 24
        requires_fee = hours_until < 12
        fee_cents = int(getattr(settings, "RESCHEDULE_FEE_CENTS", 1000))
        fee_amount_cents = fee_cents if requires_fee else 0

        events = EventsView()
        valid, err_msg = events._validate_reschedule_slot(booking, new_date, new_time)
        if not valid:
            return Response(
                {"error": err_msg or "Selected time is no longer available"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {
                "requires_fee": requires_fee,
                "fee_amount_cents": fee_amount_cents,
                "slot_valid": True,
            },
            status=status.HTTP_200_OK,
        )

    def _patch_reschedule_booking(self, request, **kwargs):
        data = request.data.get("data") or request.data
        booking_reference = data.get("booking_reference") or data.get("booking_id")
        new_date = data.get("new_date")
        new_time = data.get("new_time")
        total_cost = data.get("total_cost")
        if not booking_reference or not new_date or not new_time:
            return Response(
                {"error": "booking_reference, new_date, and new_time are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            booking = _booking_by_reference(booking_reference)
        except BookedAppointment.DoesNotExist:
            return Response({"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND)

        bulk_err = _reject_bulk_booking(booking)
        if bulk_err:
            return bulk_err

        if booking.status in ("completed", "cancelled", "in_progress"):
            return Response(
                {"error": "This booking cannot be rescheduled"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        events = EventsView()
        valid, err_msg = events._validate_reschedule_slot(booking, new_date, new_time)
        if not valid:
            return Response(
                {"error": err_msg or "Selected time is no longer available"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        nd, nt, parse_err = events._parse_reschedule_date_time(new_date, new_time)
        if parse_err:
            return Response({"error": parse_err}, status=status.HTTP_400_BAD_REQUEST)

        if total_cost is not None:
            booking.total_amount = total_cost
        booking.appointment_date = nd
        booking.start_time = nt
        booking.save()
        publish_booking_rescheduled.delay(
            booking.booking_reference,
            booking.appointment_date,
            booking.start_time,
            booking.total_amount,
        )
        try:
            NotificationService().send_booking_rescheduled(booking.user, booking)
        except Exception as exc:
            logger.error("Support reschedule: notification error: %s", exc)
        vehicle_name = (
            f"{booking.vehicle.make} {booking.vehicle.model}"
            if booking.vehicle_id
            else "your vehicle"
        )
        return Response(
            {
                "message": f"You have rescheduled your booking for {vehicle_name} on {booking.appointment_date}",
            },
            status=status.HTTP_200_OK,
        )

    def _patch_cancel_booking(self, request, **kwargs):
        booking_reference = (request.data.get("booking_reference") or "").strip()
        if not booking_reference:
            return Response(
                {"error": "Booking reference is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            booking = _booking_by_reference(booking_reference)
        except BookedAppointment.DoesNotExist:
            return Response({"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND)

        bulk_err = _reject_bulk_booking(booking)
        if bulk_err:
            return bulk_err

        if booking.status in ["completed", "cancelled", "in_progress"]:
            if booking.status == "in_progress":
                return Response(
                    {"error": "Cannot cancel - service is already in progress"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {"error": "Booking cannot be cancelled"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        try:
            appointment_datetime = timezone.datetime.combine(
                booking.appointment_date,
                booking.start_time or datetime.min.time(),
            )
            appointment_datetime = timezone.make_aware(appointment_datetime)
            hours_until_appointment = (appointment_datetime - now).total_seconds() / 3600
        except Exception as exc:
            logger.error("Support cancel: invalid appointment data: %s", exc)
            return Response(
                {"error": "Invalid appointment data"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if hours_until_appointment <= 12:
            refund_tier = "none"
        elif hours_until_appointment <= 24:
            refund_tier = "half"
        else:
            refund_tier = "full"

        booking.status = "cancelled"
        booking.save()

        try:
            publish_booking_cancelled.delay(booking_reference)
        except Exception as exc:
            logger.error("Support cancel: Redis publish error: %s", exc)

        refund_data = {
            "eligible": refund_tier != "none",
            "amount": 0,
            "tier": refund_tier,
            "processed": False,
        }
        events = EventsView()
        if refund_tier != "none":
            try:
                original_transaction = _original_succeeded_payment(booking)
                if original_transaction:
                    if refund_tier == "full":
                        refund_amount = float(original_transaction.amount)
                    else:
                        refund_amount = float(original_transaction.amount) * 0.5
                    refund_data["amount"] = refund_amount
                    if refund_amount > 0:
                        refund_result = events._process_refund(booking, amount=refund_amount)
                        refund_data.update(refund_result)
            except Exception as exc:
                logger.error("Support cancel: refund error: %s", exc)
                refund_data["error"] = str(exc)

        vehicle_name = (
            f"{booking.vehicle.make} {booking.vehicle.model}"
            if booking.vehicle_id
            else "your service"
        )
        message = f"Your booking for {vehicle_name} on {booking.appointment_date} was cancelled by support."

        if refund_data.get("processed", False):
            message += (
                f"\n\nRefund of £{refund_data['amount']} has been processed and will appear "
                "in your account within 3-5 business days."
            )
        elif refund_tier == "half":
            message += "\n\n50% refund was available but could not be processed. Please contact support."
        else:
            if refund_tier == "none":
                if hours_until_appointment <= 0:
                    message += (
                        "\n\nNo refund available — the appointment start time has already passed."
                    )
                else:
                    message += (
                        "\n\nNo refund available — cancellations within 12 hours of the "
                        "start time are non-refundable."
                    )
            else:
                message += (
                    "\n\nNo refund available — please contact support if this looks wrong."
                )

        try:
            NotificationService().send_booking_cancelled(booking.user, booking, message)
        except Exception as exc:
            logger.error("Support cancel: notification error: %s", exc)

        return Response(
            {
                "message": message,
                "booking_status": "cancelled",
                "refund": refund_data,
                "hours_until_appointment": hours_until_appointment,
            },
            status=status.HTTP_200_OK,
        )
