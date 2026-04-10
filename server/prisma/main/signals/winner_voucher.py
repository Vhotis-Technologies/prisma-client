"""Link winner vouchers to users when signup email matches assigned_email."""
from django.db.models import Q
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from main.models import User, WinnerVoucher


@receiver(post_save, sender=User)
def link_winner_vouchers_on_user_create(sender, instance, created, raw, **kwargs):
    if not created or raw:
        return
    if not instance.is_active:
        return

    now = timezone.now()
    WinnerVoucher.objects.filter(
        assigned_email=instance.email,
        assigned_user__isnull=True,
        is_active=True,
        redeemed_at__isnull=True,
    ).filter(Q(valid_from__isnull=True) | Q(valid_from__lte=now)).filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=now)
    ).update(assigned_user=instance)
