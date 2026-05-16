"""Partner/commission related signals - commission on booking, reverse on refund."""
from django.db.models.signals import post_save
from django.dispatch import receiver

from main.models import BookedAppointment, CommissionEarning, PartnerPayoutRequest, RefundRecord
from main.utils.partner_attribution import get_partner_for_user


@receiver(post_save, sender=BookedAppointment)
def handle_booking_completion_commission(sender, instance, created, **kwargs):
    if not created and instance.status == 'completed':
        partner = get_partner_for_user(instance.user)
        if partner is None:
            return
        if CommissionEarning.objects.filter(partner=partner, booking=instance).exists():
            return
        rate = partner.commission_rate
        gross = instance.total_amount
        commission_amount = round(gross * rate / 100, 2)
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
    if created:
        pass
    
