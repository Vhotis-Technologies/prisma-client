"""
Celery tasks to publish booking events to Redis streams for the detailer app.

publish_booking_cancelled, publish_booking_rescheduled, publish_review_to_detailer use STREAM_JOB_EVENTS.
"""
import json
from decimal import Decimal

from celery import shared_task
from main.utils.observability import log_timed, new_request_id
import time
from main.utils.redis_streams import stream_add, STREAM_JOB_EVENTS
import logging

_obs = logging.getLogger("main.observability")


def _stream_job_event(event, payload, request_id=None):
    """XADD a job_events entry with booking_reference and request_id on the stream."""
    body = dict(payload or {})
    rid = request_id or body.get("request_id") or new_request_id()
    body["request_id"] = rid
    ref = body.get("booking_reference") or ""
    msg_id = stream_add(
        STREAM_JOB_EVENTS,
        {
            "event": event,
            "payload": json.dumps(body),
            "booking_reference": str(ref),
            "request_id": rid,
        },
    )
    _obs.info(
        "redis_publish event=%s booking_reference=%s request_id=%s msg_id=%s",
        event,
        ref,
        rid,
        msg_id,
    )
    return msg_id


def _serialize_reschedule_fields(new_date, new_time, total_cost):
    """
    Normalize reschedule fields for JSON Redis payloads.

    Args:
        new_date: ``date`` or ISO date string.
        new_time: ``time`` or HH:MM(:SS) string.
        total_cost: ``Decimal``, float, or None.

    Returns:
        tuple: ``(date_str, time_str, total_float)``.
    """
    if hasattr(new_date, "isoformat") and not hasattr(new_date, "hour"):
        d = new_date.isoformat()[:10]
    else:
        d = str(new_date).strip()[:10]
    if hasattr(new_time, "hour"):
        t = new_time.strftime("%H:%M:%S")
    else:
        t = str(new_time).strip()
    if isinstance(total_cost, Decimal):
        tot = float(total_cost)
    elif total_cost is not None:
        try:
            tot = float(total_cost)
        except (TypeError, ValueError):
            tot = 0.0
    else:
        tot = 0.0
    return d, t, tot


@shared_task
def publish_booking_cancelled(booking_reference):
    """
    Publish ``booking_cancelled`` to the detailer Redis job-events stream.

    Args:
        booking_reference: Client booking reference string.

    Returns:
        str: Success message with stream message id, or error text.
    """
    try:
        msg_id = _stream_job_event("booking_cancelled", {"booking_reference": booking_reference})
        return f"Booking cancelled published to stream: {msg_id}"
    except Exception as e:
        return f"Failed to publish booking cancelled to redis: {str(e)}"


@shared_task
def publish_booking_rescheduled(booking_reference, new_date, new_time, total_cost):
    """
    Publish ``booking_rescheduled`` with new date, time, and total to Redis.

    Args:
        booking_reference: Client booking reference.
        new_date: New appointment date.
        new_time: New start time.
        total_cost: Updated total amount.

    Returns:
        str: Success message with stream message id, or error text.
    """
    try:
        d, t, tot = _serialize_reschedule_fields(new_date, new_time, total_cost)
        msg_id = _stream_job_event(
            "booking_rescheduled",
            {
                "booking_reference": booking_reference,
                "new_appointment_date": d,
                "new_appointment_time": t,
                "total_amount": tot,
            },
        )
        return f"Booking rescheduled published to stream: {msg_id}"
    except Exception as e:
        return f"Failed to publish booking rescheduled to redis: {str(e)}"


@shared_task
def publish_booking_reassigned(booking_reference, assigned_detailers, is_bulk=False):
    """
    Publish ``booking_reassigned`` so client subscribers and crew apps refresh detailers.

    Silent for customers (no push/email); used for operational detailer swaps.

    Args:
        booking_reference: Booking or bulk order reference.
        assigned_detailers: List of detailer dicts (id, name, phone, etc.).
        is_bulk: True when reference is a bulk order parent ref.

    Returns:
        str: Success message with stream message id, or error text.
    """
    try:
        msg_id = _stream_job_event(
            "booking_reassigned",
            {
                "booking_reference": booking_reference,
                "detailers": assigned_detailers or [],
                "is_bulk": bool(is_bulk),
            },
        )
        return f"Booking reassigned published to stream: {msg_id}"
    except Exception as e:
        return f"Failed to publish booking reassigned to redis: {str(e)}"


def notify_client_booking_confirmed(booking):
    """
    Send the one-shot client confirmation (email, push, in-app) after a detailer is assigned.

    Used by the paid-fulfillment Celery task and by ``subscribe_redis`` only when Redis
    is the first path to learn the assignment (backup).

    Guests skip push. They still get email even without a detailer name, and the
    message includes a time-limited results URL. Issuing that token revokes any
    unused token created at booking-create time so only the emailed link works.

    Args:
        booking: ``BookedAppointment`` with ``user`` set.
    """
    if not booking or not getattr(booking, "user", None):
        return
    from main.models import Notification
    from main.tasks import send_booking_confirmation_email, send_push_notification

    user = booking.user
    detailer_name = ""
    if getattr(booking, "detailer", None) and getattr(booking.detailer, "name", None):
        detailer_name = booking.detailer.name
    elif isinstance(getattr(booking, "assigned_detailers", None), list) and booking.assigned_detailers:
        detailer_name = (booking.assigned_detailers[0] or {}).get("name") or ""

    vehicle = getattr(booking, "vehicle", None)
    vmake = getattr(vehicle, "make", None) or "Vehicle"
    vmodel = getattr(vehicle, "model", None) or "—"
    guest_results_url = None
    guest_results_expires_days = None
    guest_claim_url = None
    if getattr(user, "is_guest", False):
        from main.services.guest import (
            build_guest_claim_url,
            build_guest_results_url,
            guest_access_token_expiry_days,
            issue_guest_access_token,
        )

        _token_row, raw_token = issue_guest_access_token(booking)
        guest_results_url = build_guest_results_url(raw_token)
        guest_claim_url = build_guest_claim_url(raw_token)
        guest_results_expires_days = guest_access_token_expiry_days()

    should_email = user.allow_email_notifications and (
        bool(detailer_name) or getattr(user, "is_guest", False)
    )
    if should_email:
        send_booking_confirmation_email.delay(
            user.email,
            user.name,
            booking.booking_reference,
            vmake,
            vmodel,
            booking.appointment_date,
            booking.start_time,
            booking.service_type.name if booking.service_type else "",
            booking.valet_type.name if booking.valet_type else "",
            booking.total_amount,
            detailer_name,
            guest_results_url=guest_results_url,
            guest_results_expires_days=guest_results_expires_days,
            guest_claim_url=guest_claim_url,
        )
    if not getattr(user, "is_guest", False):
        send_push_notification.delay(
            user.id,
            "Booking Confirmed! 🎉",
            (
                f"Your valet service is confirmed for {booking.appointment_date} at {booking.start_time}."
                + (f" Your detailer is {detailer_name}" if detailer_name else "")
            ),
            {
                "type": "booking_confirmed",
                "booking_reference": booking.booking_reference,
                "screen": "booking_details",
            },
        )
    Notification.objects.create(
        user=user,
        title="Booking Confirmed",
        type="booking_confirmed",
        status="success",
        message=(
            "Your booking has been confirmed! Your detailer will be with you at the specified time."
            + (f" Your detailer is {detailer_name}" if detailer_name else "")
        ),
    )


def _has_assignees(obj) -> bool:
    """True when a booking or bulk order already has assigned_detailers."""
    assigned = getattr(obj, "assigned_detailers", None)
    return isinstance(assigned, list) and len(assigned) > 0


@shared_task(bind=True, max_retries=3, default_retry_delay=15)
def fulfill_paid_booking_on_detailer(self, pending_booking_id, payment_intent_id, booking_id=None, bulk_order_id=None, request_id=None):
    """
    Create the crew job after the Stripe webhook has already recorded payment.

    On success: assign detailers and send the single client confirmation.
    On slot failure: refund the PaymentIntent and cancel the client appointment/bulk order.
    Retries only when the refund itself fails.
    """
    from django.utils import timezone
    from main.models import BookedAppointment, BulkOrder, PendingBooking
    from main.services.bulk_notifications import try_send_bulk_client_confirmation_notifications
    from main.views.payment import (
        assign_detailers_to_booking,
        try_create_booking_on_detailer,
        try_create_bulk_booking_on_detailer,
        try_refund_payment_intent,
    )

    request_id = request_id or new_request_id()
    started = time.monotonic()
    outcome = "unknown"
    booking_reference = ""
    try:
        pending = PendingBooking.objects.filter(id=pending_booking_id).first()
        booking = BookedAppointment.objects.filter(id=booking_id).first() if booking_id else None
        bulk_order = BulkOrder.objects.filter(id=bulk_order_id).first() if bulk_order_id else None
        booking_reference = (
            (pending.booking_reference if pending else None)
            or (getattr(booking, "booking_reference", None))
            or (getattr(bulk_order, "booking_reference", None))
            or ""
        )

        if booking and booking.status == "cancelled":
            outcome = "booking_already_cancelled"
            return "booking already cancelled"
        if bulk_order and getattr(bulk_order, "payment_status", None) == "cancelled":
            outcome = "bulk_already_cancelled"
            return "bulk order already cancelled"

        if booking and _has_assignees(booking):
            if pending:
                pending.delete()
            outcome = "already_assigned"
            return "already assigned"
        if bulk_order and _has_assignees(bulk_order):
            if pending:
                pending.delete()
            outcome = "already_assigned"
            return "already assigned"

        if not pending:
            outcome = "pending_missing"
            return "pending booking missing"

        if bulk_order:
            success, result = try_create_bulk_booking_on_detailer(pending, request_id=request_id)
            refund_reason = "bulk_slot_unavailable"
        else:
            success, result = try_create_booking_on_detailer(pending, request_id=request_id)
            refund_reason = "slot_unavailable"

        if success:
            assigned = result if isinstance(result, list) else []
            if booking:
                assign_detailers_to_booking(booking, assigned)
                booking.refresh_from_db()
                if _has_assignees(booking):
                    notify_client_booking_confirmed(booking)
            if bulk_order:
                bulk_order.assigned_detailers = assigned
                bulk_order.save(update_fields=["assigned_detailers"])
                for apt in BookedAppointment.objects.filter(bulk_order=bulk_order):
                    assign_detailers_to_booking(apt, assigned)
                if _has_assignees(bulk_order):
                    sample = BookedAppointment.objects.filter(bulk_order=bulk_order).first()
                    try_send_bulk_client_confirmation_notifications(bulk_order, sample)
            pending.delete()
            outcome = "assigned"
            return "assigned"

        if not try_refund_payment_intent(payment_intent_id, booking_reference, refund_reason):
            outcome = "refund_retry"
            raise self.retry()

        pending.slot_conflict_refunded_at = timezone.now()
        pending.save(update_fields=["slot_conflict_refunded_at"])
        if booking and booking.status not in ("cancelled", "completed"):
            booking.status = "cancelled"
            booking.save(update_fields=["status"])
        if bulk_order:
            bulk_order.payment_status = "cancelled"
            bulk_order.save(update_fields=["payment_status"])
            BookedAppointment.objects.filter(bulk_order=bulk_order).exclude(
                status__in=["cancelled", "completed"]
            ).update(status="cancelled")
        outcome = "refunded_slot_unavailable"
        return "refunded_slot_unavailable"
    finally:
        log_timed(
            "celery.fulfill_paid_booking",
            started,
            booking_reference=booking_reference,
            request_id=request_id,
            outcome=outcome,
        )


@shared_task
def publish_review_to_detailer(booking_reference, rating, comment=None):
    """
    Publish ``review_received`` to the detailer Redis stream.

    Args:
        booking_reference: Completed booking reference.
        rating: Numeric rating value.
        comment: Optional customer comment text.

    Returns:
        str: Success message with stream message id, or error text.
    """
    try:
        body = {
            'booking_reference': booking_reference,
            'rating': rating,
        }
        if comment:
            body['comment'] = comment
        msg_id = _stream_job_event("review_received", body)
        return f"Review published to detailer: {msg_id}"
    except Exception as e:
        return f"Failed to publish review to detailer: {e}"
