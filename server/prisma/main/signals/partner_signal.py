"""Partner/commission related signals - commission on booking, reverse on refund, payout notifications."""
from decimal import Decimal

from django.db.models.signals import post_save
from django.dispatch import receiver

from main.models import BookedAppointment, CommissionEarning, Notification, PartnerPayoutRequest, RefundRecord
from main.tasks import send_push_notification
from main.utils.partner_attribution import get_partner_for_user
from main.models.b2c import B2CSubcription, B2CSubcriptionBilling


def _latest_paid_subscription_billing(user):
    """Most recent active B2C subscription with a paid billing row, if any."""
    subscription = (
        B2CSubcription.objects.filter(user=user, status='active')
        .select_related('plan', 'plan__tier')
        .order_by('-start_date')
        .first()
    )
    if not subscription:
        return None, None
    billing = (
        B2CSubcriptionBilling.objects.filter(subscription=subscription, status='paid')
        .order_by('-billing_date')
        .first()
    )
    return subscription, billing


@receiver(post_save, sender=BookedAppointment)
def handle_booking_completion_commission(sender, instance, created, **kwargs):
    if not created and instance.status == 'completed':
        partner = get_partner_for_user(instance.user)
        if partner is None:
            return
        if CommissionEarning.objects.filter(partner=partner, booking=instance).exists():
            return

        gross = instance.total_amount
        if gross is None or gross <= 0:
            if not (
                instance.applied_free_quick_sparkle
                and instance.complimentary_quick_sparkle_source == 'subscription'
            ):
                return
            subscription, b2c_billing = _latest_paid_subscription_billing(instance.user)
            if not b2c_billing:
                return
            max_sparkles = (subscription.plan.get_limits().get('max_prisma_sparkles') or 1)
            gross = Decimal(b2c_billing.amount) / Decimal(max(1, max_sparkles))

        rate = partner.commission_rate
        commission_amount = round(Decimal(gross) * Decimal(rate) / Decimal('100'), 2)
        if commission_amount <= 0:
            return

        CommissionEarning.objects.create(
            partner=partner,
            booking=instance,
            referred_user=instance.user,
            gross_amount=gross,
            commission_rate=rate,
            commission_amount=commission_amount,
            status='approved',
        )


@receiver(post_save, sender=RefundRecord)
def handle_refund_reverse_commission(sender, instance, created, **kwargs):
    if instance.status == 'succeeded':
        CommissionEarning.objects.filter(booking=instance.booking).update(status='reversed')


@receiver(post_save, sender=PartnerPayoutRequest)
def handle_payout_request_creation(sender, instance, created, **kwargs):
    """Notify partner when payout request is created or paid."""
    if created:
        # Notify partner their request was submitted
        partner = instance.partner
        user = partner.user
        if user:
            amount_str = f"£{instance.amount_requested:,.2f}"
            title = "Payout Request Submitted"
            message = f"Your payout request for {amount_str} has been submitted. You will be paid within 24 hours."

            Notification.objects.create(
                user=user,
                title=title,
                message=message,
                type='info',
                status='success'
            )
            if user.allow_push_notifications and user.notification_token:
                send_push_notification.delay(
                    user.id,
                    title,
                    message,
                    "partner_payout_requested"
                )


@receiver(post_save, sender=PartnerPayoutRequest)
def handle_payout_request_paid(sender, instance, created, **kwargs):
    """Notify partner when payout is marked as paid by support."""
    if not created and instance.status == 'paid':
        partner = instance.partner
        user = partner.user
        if user:
            amount_str = f"£{instance.amount_requested:,.2f}"
            title = "Payout Completed! 💰"
            message = f"Your commission payout of {amount_str} has been processed. Funds should arrive in your account shortly."

            Notification.objects.create(
                user=user,
                title=title,
                message=message,
                type='info',
                status='success'
            )
            if user.allow_push_notifications and user.notification_token:
                send_push_notification.delay(
                    user.id,
                    title,
                    message,
                    "partner_payout_paid"
                )
