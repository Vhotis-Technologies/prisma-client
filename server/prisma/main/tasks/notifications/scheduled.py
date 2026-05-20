"""
Scheduled Celery tasks: service reminders, 6h email reminders, promotion expiry,
loyalty decay, pending-booking cleanup, and transfer expiration.
"""
from celery import shared_task
from datetime import timedelta
from django.utils import timezone

from main.tasks.notifications.push import send_push_notification


@shared_task(name='main.tasks.send_service_reminders')
def send_service_reminders():
    """
    Push ~30 minutes before confirmed appointments (single and bulk).

    Uses atomic ``service_reminder_push_sent_at`` claims to avoid duplicate sends.
    Bulk orders send one push per order, then mark all child appointments.

    Returns:
        str: Summary counts of single vs bulk reminders sent.
    """
    from main.models import BookedAppointment, BulkOrder

    now = timezone.now()
    # 10-minute window centered on T-30 minutes from now.
    reminder_start = now + timedelta(minutes=25)
    reminder_end = now + timedelta(minutes=35)

    try:
        appointments = list(
            BookedAppointment.objects.filter(
                appointment_date=now.date(),
                start_time__gte=reminder_start.time(),
                start_time__lte=reminder_end.time(),
                status='confirmed',
                service_reminder_push_sent_at__isnull=True,
            ).select_related('user', 'service_type', 'bulk_order')
        )

        bulk_ids_handled = set()
        singles_sent = 0
        bulks_sent = 0

        for appointment in appointments:
            bulk = appointment.bulk_order
            if bulk is not None:
                if bulk.id in bulk_ids_handled:
                    continue
                bulk_ids_handled.add(bulk.id)
                rows = BulkOrder.objects.filter(
                    id=bulk.id,
                    service_reminder_push_sent_at__isnull=True,
                ).update(service_reminder_push_sent_at=now)
                if not rows:
                    continue
                send_push_notification.delay(
                    appointment.user.id,
                    "Bulk service reminder ⏰",
                    f"Your bulk valet ({bulk.number_of_vehicles} vehicles) starts in about 30 minutes at {appointment.start_time}.",
                    "bulk_service_reminder",
                )
                BookedAppointment.objects.filter(bulk_order_id=bulk.id).update(
                    service_reminder_push_sent_at=now
                )
                bulks_sent += 1
                continue

            rows = BookedAppointment.objects.filter(
                id=appointment.id,
                service_reminder_push_sent_at__isnull=True,
            ).update(service_reminder_push_sent_at=now)
            if not rows:
                continue
            send_push_notification.delay(
                appointment.user.id,
                "Service Reminder ⏰",
                f"Your {appointment.service_type.name} service is starting in 30 minutes at {appointment.start_time}",
                "service_reminder",
            )
            singles_sent += 1

        return (
            f"Reminders: {singles_sent} single, {bulks_sent} bulk "
            f"(candidates {len(appointments)})"
        )

    except Exception as e:
        return f"Failed to send service reminder: {str(e)}"


@shared_task(name='main.tasks.send_six_hour_booking_reminder_emails')
def send_six_hour_booking_reminder_emails():
    """
    Email clients ~6 hours before appointment start (10-minute send window).

    Bulk orders: one email per ``BulkOrder``; standard bookings: one per ``BookedAppointment``.
    Uses ``reminder_email_6h_sent_at`` claims; rolls back on send failure.

    Returns:
        str: Counts of single vs bulk emails sent (and up to 5 errors).
    """
    from datetime import datetime, time as time_cls

    from main.models import BookedAppointment, BulkOrder
    from main.tasks.emails.booking import (
        deliver_bulk_booking_reminder_6h_email,
        deliver_single_booking_reminder_6h_email,
    )

    now = timezone.now()
    w0 = now + timedelta(hours=5, minutes=50)
    w1 = now + timedelta(hours=6, minutes=10)

    def start_dt(apt):
        """Combine appointment date + start_time into a timezone-aware datetime for window checks."""
        d = apt.appointment_date
        t = apt.start_time or time_cls.min
        naive = datetime.combine(d, t)
        return timezone.make_aware(naive)

    min_d = w0.date()
    max_d = w1.date()

    candidates = BookedAppointment.objects.filter(
        status='confirmed',
        reminder_email_6h_sent_at__isnull=True,
        appointment_date__gte=min_d,
        appointment_date__lte=max_d,
    ).select_related('user', 'service_type', 'valet_type', 'detailer', 'vehicle', 'bulk_order')

    bulk_first = {}
    singles = []

    for apt in candidates:
        try:
            st = start_dt(apt)
        except Exception:
            continue
        if st < w0 or st > w1:
            continue
        user = apt.user
        if not user or not user.allow_email_notifications or not user.email:
            continue
        if apt.bulk_order_id:
            bid = apt.bulk_order_id
            if bid not in bulk_first:
                bulk_first[bid] = apt
        else:
            singles.append(apt)

    sent_bulk = 0
    sent_single = 0
    errors = []

    for _bid, apt in bulk_first.items():
        bulk = apt.bulk_order
        claim_ts = now
        rows = BulkOrder.objects.filter(
            id=bulk.id,
            reminder_email_6h_sent_at__isnull=True,
        ).update(reminder_email_6h_sent_at=claim_ts)
        if not rows:
            continue
        BookedAppointment.objects.filter(
            bulk_order_id=bulk.id,
            reminder_email_6h_sent_at__isnull=True,
        ).update(reminder_email_6h_sent_at=claim_ts)
        try:
            deliver_bulk_booking_reminder_6h_email(bulk, apt)
            sent_bulk += 1
        except Exception as e:
            BulkOrder.objects.filter(id=bulk.id).update(reminder_email_6h_sent_at=None)
            BookedAppointment.objects.filter(bulk_order_id=bulk.id).update(
                reminder_email_6h_sent_at=None
            )
            errors.append(f"bulk {bulk.booking_reference}: {e}")

    for apt in singles:
        claim_ts = now
        rows = BookedAppointment.objects.filter(
            id=apt.id,
            reminder_email_6h_sent_at__isnull=True,
        ).update(reminder_email_6h_sent_at=claim_ts)
        if not rows:
            continue
        try:
            deliver_single_booking_reminder_6h_email(apt)
            sent_single += 1
        except Exception as e:
            BookedAppointment.objects.filter(id=apt.id).update(reminder_email_6h_sent_at=None)
            errors.append(f"single {apt.booking_reference}: {e}")

    return (
        f"6h email reminders: {sent_single} single, {sent_bulk} bulk"
        + (f"; errors: {errors[:5]}" if errors else "")
    )


@shared_task(name='main.tasks.send_promotion_expiration')
def send_promotion_expiration():
    """
    Notify users whose active promotions expire within the next calendar day.

    Sends push (if enabled) and always creates an in-app ``Notification``.

    Returns:
        str: Summary of push notifications queued.
    """
    from main.models import Promotions

    now = timezone.now()
    tomorrow = now + timedelta(days=1)

    try:
        expiring_promotions = Promotions.objects.filter(
            is_active=True,
            is_used=False,
            valid_until__gte=now.date(),
            valid_until__lte=tomorrow.date()
        ).select_related('user')
        notifications_sent = 0

        for promotion in expiring_promotions:
            user = promotion.user

            if user.allow_push_notifications and user.notification_token:
                send_push_notification.delay(
                    user.id,
                    "Promotion Expiring Soon ⏰",
                    f"Your {promotion.title} ({promotion.discount_percentage}% off) expires tomorrow! Don't miss out on this great deal.",
                    "promotion_expiring"
                )
                notifications_sent += 1

            from main.models import Notification
            Notification.objects.create(
                user=user,
                title="Promotion Expiring Soon ⏰",
                message=f"Your {promotion.title} ({promotion.discount_percentage}% off) expires tomorrow! Book now to take advantage of this offer.",
                type='warning',
                status='active'
            )

        return f"Promotion expiration notifications processed: {notifications_sent} push notifications sent for {expiring_promotions.count()} expiring promotions"

    except Exception as e:
        return f"Failed to send promotion expiration notifications: {str(e)}"


@shared_task(name='main.tasks.check_loyalty_decay')
def check_loyalty_decay():
    """
    Reset B2C loyalty to bronze when last completed booking was 60+ days ago.

    Notifies users via push and in-app notification when tier is reset.

    Returns:
        str: Number of loyalty accounts reset.
    """
    from main.models import LoyaltyProgram, Notification

    sixty_days_ago = timezone.now().date() - timedelta(days=60)

    try:
        inactive_loyalties = LoyaltyProgram.objects.filter(
            last_booking_date__lt=sixty_days_ago,
            completed_bookings__gt=0
        ).select_related('user')

        reset_count = 0
        for loyalty in inactive_loyalties:
            user = loyalty.user
            if not user.is_b2c_user():
                continue
            old_tier = loyalty.current_tier

            loyalty.completed_bookings = 0
            loyalty.current_tier = 'bronze'
            loyalty.save()
            reset_count += 1

            if user.allow_push_notifications and user.notification_token:
                send_push_notification.delay(
                    user.id,
                    "Loyalty Tier Reset",
                    "Your loyalty tier has been reset to Bronze due to 60 days of inactivity. Book a service to start earning points again!",
                    "loyalty_reset"
                )

            Notification.objects.create(
                user=user,
                title="Loyalty Tier Reset",
                message=f"Your loyalty tier has been reset from {old_tier.title()} to Bronze due to 60 days of inactivity. Book a service to start earning points again!",
                type='info',
                status='info'
            )

        return f"Reset {reset_count} inactive loyalty accounts"

    except Exception as e:
        return f"Failed to check loyalty decay: {str(e)}"


@shared_task(name='main.tasks.cleanup_expired_pending_bookings')
def cleanup_expired_pending_bookings():
    """
    Delete ``PendingBooking`` rows past ``expires_at`` with pending or failed payment.

    Returns:
        str: Count of deleted rows.
    """
    from main.models import PendingBooking

    try:
        expired_bookings = PendingBooking.objects.filter(
            expires_at__lt=timezone.now(),
            payment_status__in=['pending', 'failed']
        )

        count = expired_bookings.count()
        expired_bookings.delete()

        return f"Cleaned up {count} expired pending bookings"
    except Exception as e:
        return f"Failed to cleanup expired pending bookings: {str(e)}"


@shared_task(name='main.tasks.expire_old_transfers')
def expire_old_transfers():
    """
    Mark pending ``VehicleTransfer`` rows as expired when past ``expires_at``.

    Notifies the requester via push for each expired transfer.

    Returns:
        str: Count of transfers expired.
    """
    from main.models import VehicleTransfer

    try:
        now = timezone.now()
        expired_transfers = VehicleTransfer.objects.filter(
            status='pending',
            expires_at__lt=now
        )

        # Get list before update for notifications
        transfer_list = list(expired_transfers)
        count = len(transfer_list)
        expired_transfers.update(status='expired', responded_at=now)

        for transfer in transfer_list:
            if transfer.to_owner.allow_push_notifications and transfer.to_owner.notification_token:
                send_push_notification.delay(
                    transfer.to_owner.id,
                    "Transfer Request Expired",
                    f"Your transfer request for {transfer.vehicle.registration_number} has expired. You can submit a new request.",
                    "transfer_expired"
                )

        return f"Expired {count} transfer requests"
    except Exception as e:
        return f"Failed to expire old transfers: {str(e)}"
