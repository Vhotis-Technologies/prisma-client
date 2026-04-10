"""Vehicle/booking related signals - loyalty, activity bonus, status change, create event."""
from datetime import datetime, timedelta

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from main.models import (
    BookedAppointment,
    BookedAppointmentImage,
    LoyaltyProgram,
    Notification,
    Partner,
    Promotions,
    VehicleEvent,
)
from main.tasks import send_promotional_email, send_push_notification
from main.utils.bulk_notifications import try_send_bulk_client_confirmation_notifications


@receiver(post_save, sender=BookedAppointment)
def handle_booking_completion(sender, instance, created, **kwargs):
    if instance.status == 'completed':
        user = instance.user
        now = timezone.now()

        if instance.service_type.name != 'Basic Wash':
            loyalty, _ = LoyaltyProgram.objects.get_or_create(user=user)
            loyalty.completed_bookings += 1
            loyalty.last_booking_date = now.date()
            old_tier = loyalty.current_tier
            is_fleet_user = user.is_fleet_admin_or_manager()
            if is_fleet_user:
                if loyalty.completed_bookings >= 100:
                    loyalty.current_tier = 'platinum'
                elif loyalty.completed_bookings >= 50:
                    loyalty.current_tier = 'gold'
                elif loyalty.completed_bookings >= 20:
                    loyalty.current_tier = 'silver'
                else:
                    loyalty.current_tier = 'bronze'
            else:
                if loyalty.completed_bookings >= 40:
                    loyalty.current_tier = 'platinum'
                elif loyalty.completed_bookings >= 25:
                    loyalty.current_tier = 'gold'
                elif loyalty.completed_bookings >= 10:
                    loyalty.current_tier = 'silver'
                else:
                    loyalty.current_tier = 'bronze'
            loyalty.save()
        else:
            loyalty, _ = LoyaltyProgram.objects.get_or_create(user=user)
            old_tier = loyalty.current_tier

        if old_tier != loyalty.current_tier:
            if user.allow_push_notifications and user.notification_token:
                send_push_notification.delay(
                    user.id,
                    f"Tier Upgraded to {loyalty.current_tier.title()}! ⭐",
                    f"Congratulations! You've been upgraded to {loyalty.current_tier.title()} tier!",
                    "tier_upgrade"
                )

        thirty_days_ago = now - timedelta(days=30)
        recent_washes = BookedAppointment.objects.filter(
            user=user,
            status='completed',
            updated_at__gte=thirty_days_ago
        ).exclude(service_type__name='Basic Wash').count()

        existing_promotion = Promotions.objects.filter(
            user=user,
            title__contains="Activity Bonus",
            created_at__gte=thirty_days_ago,
            is_active=True,
            valid_until__gte=now.date()
        ).exists()

        if instance.service_type.name != 'Basic Wash':
            # Activity Bonus: only for regular users (not fleet, not partner)
            is_fleet = user.is_fleet_owner or user.is_branch_admin or user.is_fleet_admin_or_manager()
            is_partner = Partner.objects.filter(user=user).exists()
            is_regular_user = not is_fleet and not is_partner

            if recent_washes >= 3 and not existing_promotion and is_regular_user:
                Promotions.objects.create(
                    title=f"Activity Bonus - {user.name}",
                    description=f"Congratulations! You have completed 3 washes in 30 days. You have earned a 5% discount on your next wash!",
                    discount_percentage=5,
                    valid_until=(now + timedelta(days=30)).date(),
                    is_active=True,
                    terms_conditions="Valid for 30 days from earning. Cannot be combined with other offers.",
                    user=user
                )
                if user.allow_email_notifications:
                    send_promotional_email.delay(user.email, user.name)
                if user.allow_push_notifications and user.notification_token:
                    send_push_notification.delay(
                        user.id,
                        "Activity Bonus Earned!🎉",
                        "Great job! You've completed 3 washes in 30 days. You've earned a 5% discount on your next wash!",
                        "activity_bonus"
                    )
                Notification.objects.create(
                    user=user,
                    title="Activity Bonus Earned! 🎉",
                    message=f"Great job! You've completed 3 washes in 30 days. You've earned a 5% discount on your next wash!",
                    type='info',
                    status='success'
                )

        if old_tier != loyalty.current_tier:
            Notification.objects.create(
                user=user,
                title=f"Tier Upgraded to {loyalty.current_tier.title()}! ⭐",
                message=f"Congratulations! You've been upgraded to {loyalty.current_tier.title()} tier!",
                type='info',
                status='success'
            )


@receiver(post_save, sender=BookedAppointment)
def handle_booking_status_change(sender, instance, created, **kwargs):
    if not created and instance.status == 'confirmed':
        # Bulk: one confirmation package per BulkOrder (same atomic flag as subscribe_redis).
        if instance.bulk_order_id:
            try_send_bulk_client_confirmation_notifications(instance.bulk_order, instance)
            return
        appointment_datetime = timezone.datetime.combine(
            instance.appointment_date,
            instance.start_time or timezone.datetime.min.time()
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
                "appointment_reminder"
            )


@receiver(post_save, sender=BookedAppointment)
def handle_booking_completion_create_event(sender, instance, created, **kwargs):
    if not created and instance.status == 'completed' and instance.vehicle:
        if not VehicleEvent.objects.filter(booking=instance).exists():
            if instance.appointment_date:
                event_date = timezone.make_aware(
                    datetime.combine(instance.appointment_date, datetime.min.time())
                )
            else:
                event_date = instance.updated_at or timezone.now()

            event = VehicleEvent.objects.create(
                vehicle=instance.vehicle,
                event_type='wash',
                booking=instance,
                performed_by=instance.user,
                event_date=event_date,
                metadata={
                    'service_type': instance.service_type.name,
                    'valet_type': instance.valet_type.name,
                    'total_amount': str(instance.total_amount),
                    'detailer': instance.detailer.name if instance.detailer else None,
                }
            )
            BookedAppointmentImage.objects.filter(booking=instance).update(vehicle_event=event)
