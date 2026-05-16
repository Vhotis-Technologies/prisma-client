"""User/referral related signals - referral rewards on booking and payment."""
from decimal import Decimal
from datetime import timedelta

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from main.models import BookedAppointment, PaymentTransaction, Promotions
from main.tasks import send_push_notification


def check_referral_rewards(user):
    """Check if user's spending triggers referral rewards - only for completed bookings."""
    completed_bookings = BookedAppointment.objects.filter(
        user=user,
        status='completed'
    )
    total_completed_spending = Decimal('0.00')
    for booking in completed_bookings:
        payment_transaction = PaymentTransaction.objects.filter(
            booking=booking,
            transaction_type='payment',
            status='succeeded'
        ).first()
        if payment_transaction:
            total_completed_spending += payment_transaction.amount

    if total_completed_spending >= Decimal('100.00'):
        if user.referred_by:
            referrer = user.referred_by
            existing_reward = Promotions.objects.filter(
                user=referrer,
                title="Referral Reward",
                description__contains=user.name
            ).exists()

            if not existing_reward:
                Promotions.objects.create(
                    user=referrer,
                    title="Referral Reward",
                    description=f"Get 10% off your next service! (Referred: {user.name})",
                    discount_percentage=10,
                    valid_until=(timezone.now() + timedelta(days=30)).date(),
                    is_active=True,
                    terms_conditions="Valid for 30 days. Cannot be combined with other offers.",
                )
                if referrer.allow_push_notifications and referrer.notification_token:
                    send_push_notification.delay(
                        referrer.id,
                        "Referral Reward Earned! 🎉",
                        f"Your friend {user.name} has completed services worth €100+! You've earned a 10% discount on your next service!",
                        "referral_reward"
                    )


@receiver(post_save, sender=BookedAppointment)
def handle_booking_completion_referral(sender, instance, created, **kwargs):
    if not created and instance.status == 'completed':
        check_referral_rewards(instance.user)


@receiver(post_save, sender=PaymentTransaction)
def handle_payment_transaction_creation(sender, instance, created, **kwargs):
    if created and instance.status == 'succeeded' and instance.transaction_type == 'payment':
        check_referral_rewards(instance.user)
