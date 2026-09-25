"""Vehicle/booking related signals - loyalty, activity bonus, status change, create event."""
from datetime import datetime, timedelta

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

from main.models import (
    BookedAppointment,
    BookedAppointmentImage,
    LoyaltyProgram,
    Notification,
    Promotions,
    VehicleEvent,
)
from main.services.booking_quote import (
    LOYALTY_TIER_THRESHOLDS,
    is_quick_sparkle_service_name,
    loyalty_tier_for_completed_count,
)
from main.tasks import send_promotional_email, send_push_notification
from main.services.bulk_notifications import try_send_bulk_client_confirmation_notifications


@receiver(pre_save, sender=BookedAppointment)
def cache_previous_booking_status(sender, instance, **kwargs):
    """
    Stash prior ``status`` on the instance so completion handlers can detect transitions.

    Args:
        sender: ``BookedAppointment`` model class.
        instance: Appointment about to be saved.
    """
    if not instance.pk:
        instance._previous_status = None
        return
    previous = (
        BookedAppointment.objects.filter(pk=instance.pk)
        .values_list("status", flat=True)
        .first()
    )
    instance._previous_status = previous


@receiver(post_save, sender=BookedAppointment)
def handle_booking_completion(sender, instance, created, **kwargs):
    """
    On transition into completed: advance B2C loyalty tier, grant activity bonus, notify user.

    Only runs when status changes *to* completed (not on later saves such as reviews).
    Quick-sparkle services are excluded from loyalty counters and activity-bonus wash counts.

    Args:
        sender: ``BookedAppointment`` model class.
        instance: The saved appointment.
        created: True when the row was inserted.
    """
    if instance.status != "completed":
        return

    previous_status = getattr(instance, "_previous_status", None)
    # Count only the first time a booking becomes completed.
    if previous_status == "completed":
        return

    user = instance.user
    now = timezone.now()
    service_name = getattr(getattr(instance, "service_type", None), "name", "") or ""
    is_quick_sparkle = is_quick_sparkle_service_name(service_name)

    if user.is_b2c_user() and not is_quick_sparkle:
        loyalty, _ = LoyaltyProgram.objects.get_or_create(user=user)
        old_tier = loyalty.current_tier
        loyalty.completed_bookings = int(loyalty.completed_bookings or 0) + 1
        loyalty.last_booking_date = now.date()
        loyalty.current_tier = loyalty_tier_for_completed_count(loyalty.completed_bookings)
        loyalty.save()

        if old_tier != loyalty.current_tier:
            if user.allow_push_notifications and user.notification_token:
                send_push_notification.delay(
                    user.id,
                    f"Tier Upgraded to {loyalty.current_tier.title()}! ⭐",
                    f"Congratulations! You've been upgraded to {loyalty.current_tier.title()} tier!",
                    "tier_upgrade",
                )
            Notification.objects.create(
                user=user,
                title=f"Tier Upgraded to {loyalty.current_tier.title()}! ⭐",
                message=f"Congratulations! You've been upgraded to {loyalty.current_tier.title()} tier!",
                type="info",
                status="success",
            )

    thirty_days_ago = now - timedelta(days=30)
    recent_washes = (
        BookedAppointment.objects.filter(
            user=user,
            status="completed",
            updated_at__gte=thirty_days_ago,
        )
        .exclude(service_type__name__icontains="quick sparkle")
        .count()
    )

    existing_promotion = Promotions.objects.filter(
        user=user,
        title__contains="Activity Bonus",
        created_at__gte=thirty_days_ago,
        is_active=True,
        valid_until__gte=now.date(),
    ).exists()

    if not is_quick_sparkle:
        # Activity Bonus: only for regular (B2C) users
        if recent_washes >= 3 and not existing_promotion and user.is_b2c_user():
            Promotions.objects.create(
                title=f"Activity Bonus - {user.name}",
                description=(
                    "Congratulations! You have completed 3 washes in 30 days. "
                    "You have earned a 10% discount on your next wash!"
                ),
                discount_percentage=10,
                valid_until=(now + timedelta(days=30)).date(),
                is_active=True,
                terms_conditions="Valid for 30 days from earning date. Cannot be combined with other offers.",
                user=user,
            )
            if user.allow_email_notifications:
                send_promotional_email.delay(user.email, user.name)
            if user.allow_push_notifications and user.notification_token:
                send_push_notification.delay(
                    user.id,
                    "Activity Bonus Earned!🎉",
                    "Great job! You've completed 3 washes in 30 days. You've earned a 5% discount on your next wash!",
                    "activity_bonus",
                )
            Notification.objects.create(
                user=user,
                title="Activity Bonus Earned! 🎉",
                message=(
                    "Great job! You've completed 3 washes in 30 days. "
                    "You've earned a 5% discount on your next wash!"
                ),
                type="info",
                status="success",
            )


@receiver(post_save, sender=BookedAppointment)
def handle_booking_status_change(sender, instance, created, **kwargs):
    """
    When a booking is confirmed, send reminder push (or bulk confirmation package).

    Bulk orders delegate to ``try_send_bulk_client_confirmation_notifications`` once per order.

    Args:
        sender: ``BookedAppointment`` model class.
        instance: The saved appointment.
        created: Skips insert; only handles transitions to confirmed.
    """
    if not created and instance.status == "confirmed":
        # Bulk: one confirmation package per BulkOrder (same atomic flag as subscribe_redis).
        if instance.bulk_order_id:
            try_send_bulk_client_confirmation_notifications(instance.bulk_order, instance)
            return
        appointment_datetime = timezone.datetime.combine(
            instance.appointment_date,
            instance.start_time or timezone.datetime.min.time(),
        )
        appointment_datetime = timezone.make_aware(appointment_datetime)
        now = timezone.now()
        end_time = appointment_datetime + timedelta(minutes=instance.duration or 0)
        closing_notification_time = end_time - timedelta(minutes=15)
        if closing_notification_time > now:
            send_push_notification.delay(
                instance.user.id,
                "Appointment Reminder ⏰",
                f"Your appointment is starting in 15 minutes at {instance.start_time}",
                "appointment_reminder",
            )


@receiver(post_save, sender=BookedAppointment)
def handle_booking_completion_create_event(sender, instance, created, **kwargs):
    """
    Create a ``VehicleEvent`` (wash) and link before/after images when a booking completes.

    Args:
        sender: ``BookedAppointment`` model class.
        instance: The saved appointment.
        created: Only on update to completed with a vehicle attached.
    """
    if not created and instance.status == "completed" and instance.vehicle:
        if not VehicleEvent.objects.filter(booking=instance).exists():
            if instance.appointment_date:
                event_date = timezone.make_aware(
                    datetime.combine(instance.appointment_date, datetime.min.time())
                )
            else:
                event_date = instance.updated_at or timezone.now()

            event = VehicleEvent.objects.create(
                vehicle=instance.vehicle,
                event_type="wash",
                booking=instance,
                performed_by=instance.user,
                event_date=event_date,
                metadata={
                    "service_type": instance.service_type.name,
                    "valet_type": instance.valet_type.name,
                    "total_amount": str(instance.total_amount),
                    "detailer": instance.detailer.name if instance.detailer else None,
                },
            )
            BookedAppointmentImage.objects.filter(booking=instance).update(vehicle_event=event)
