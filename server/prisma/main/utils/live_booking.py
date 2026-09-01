"""Publish live booking updates to the user's Channels group."""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def publish_live_booking_update(user_id, booking_reference, event, status=None):
    """
    Send a booking.update to ``user_{id}`` after subscribe_redis writes the DB.

    Args:
        user_id: Client user primary key.
        booking_reference: Appointment or bulk reference.
        event: Redis/job event name (job_started, job_completed, ...).
        status: Optional appointment status string.
    """
    if not user_id:
        return
    layer = get_channel_layer()
    if layer is None:
        return
    try:
        async_to_sync(layer.group_send)(
            f"user_{user_id}",
            {
                "type": "booking.update",
                "event": event,
                "booking_reference": booking_reference,
                "status": status,
            },
        )
    except Exception as exc:
        logger.warning("live booking publish failed for user %s: %s", user_id, exc)
