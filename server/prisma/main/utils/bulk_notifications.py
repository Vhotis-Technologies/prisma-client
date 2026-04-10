"""
One-shot client confirmation for bulk orders (email, push, in-app).
Uses BulkOrder.client_confirmation_notifications_sent_at so only the first
successful claim sends, whether job_acceptance arrives on slot -1 first or not.
"""
from django.utils import timezone

from main.models import BulkOrder, Notification


def try_send_bulk_client_confirmation_notifications(bulk_order, sample_appointment):
    """
    Send bulk confirmation email + push + Notification row once per BulkOrder.
    sample_appointment: any BookedAppointment linked to this bulk (for date/time in push body).
    Returns True if this call sent the package; False if already sent or nothing to do.
    """
    if not bulk_order or not sample_appointment:
        return False
    updated = BulkOrder.objects.filter(
        id=bulk_order.id,
        client_confirmation_notifications_sent_at__isnull=True,
    ).update(client_confirmation_notifications_sent_at=timezone.now())
    if not updated:
        return False

    from main.tasks import send_bulk_booking_confirmation_email, send_push_notification

    user = bulk_order.user
    if user.allow_email_notifications:
        send_bulk_booking_confirmation_email.delay(str(bulk_order.id))
    if user.allow_push_notifications and user.notification_token:
        send_push_notification.delay(
            user.id,
            "Bulk booking confirmed! 🎉",
            f"Your bulk booking ({bulk_order.number_of_vehicles} vehicles) is confirmed for "
            f"{sample_appointment.appointment_date} at {sample_appointment.start_time}.",
            "bulk_booking_confirmed",
        )
    Notification.objects.create(
        user=user,
        title="Bulk booking confirmed",
        type="bulk_booking_confirmed",
        status="success",
        message=(
            f"Your bulk booking of {bulk_order.number_of_vehicles} vehicles has been confirmed. "
            "Your team will arrive at the scheduled time."
        ),
    )
    return True
