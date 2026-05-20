"""Paid gift vouchers: link to new user on signup when email matches paid voucher."""
from django.db.models import Q
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from main.models import GiftVoucher, User


@receiver(post_save, sender=User)
def link_gift_vouchers_on_user_create(sender, instance, created, raw, **kwargs):
    """
    Attach paid gift vouchers (by email) to a newly created active user.

    Only vouchers with a non-empty code (Stripe payment fulfilled) and valid date window.

    Args:
        sender: ``User`` model class.
        instance: The new user.
        created: Only on insert.
        raw: Skips fixture loads.
    """
    if not created or raw:
        return
    if not instance.is_active:
        return

    now = timezone.now()
    GiftVoucher.objects.filter(
        assigned_email=instance.email,
        assigned_user__isnull=True,
        is_active=True,
        redeemed_at__isnull=True,
    ).exclude(code__isnull=True).exclude(code='').filter(
        Q(valid_from__isnull=True) | Q(valid_from__lte=now)
    ).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now)).update(assigned_user=instance)
