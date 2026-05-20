"""
Celery tasks to publish booking events to Redis streams for the detailer app.

publish_booking_cancelled, publish_booking_rescheduled, publish_review_to_detailer use STREAM_JOB_EVENTS.
"""
import json
from decimal import Decimal

from celery import shared_task
from main.utils.redis_streams import stream_add, STREAM_JOB_EVENTS


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
        payload = json.dumps({'booking_reference': booking_reference})
        msg_id = stream_add(STREAM_JOB_EVENTS, {'event': 'booking_cancelled', 'payload': payload})
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
        payload = json.dumps({
            'booking_reference': booking_reference,
            'new_appointment_date': d,
            'new_appointment_time': t,
            'total_amount': tot,
        })
        msg_id = stream_add(STREAM_JOB_EVENTS, {'event': 'booking_rescheduled', 'payload': payload})
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
        payload = json.dumps({
            'booking_reference': booking_reference,
            'detailers': assigned_detailers or [],
            'is_bulk': bool(is_bulk),
        })
        msg_id = stream_add(STREAM_JOB_EVENTS, {'event': 'booking_reassigned', 'payload': payload})
        return f"Booking reassigned published to stream: {msg_id}"
    except Exception as e:
        return f"Failed to publish booking reassigned to redis: {str(e)}"


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
        payload = json.dumps(body)
        msg_id = stream_add(STREAM_JOB_EVENTS, {'event': 'review_received', 'payload': payload})
        return f"Review published to detailer: {msg_id}"
    except Exception as e:
        return f"Failed to publish review to detailer: {e}"
