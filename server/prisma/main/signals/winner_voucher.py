"""Winner vouchers: link on signup; notify by email when a voucher is created."""
from django.db.models import Q
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone
import logging

from main.models import User, WinnerVoucher

logger = logging.getLogger(__name__)


@receiver(post_save, sender=WinnerVoucher)
def send_winner_voucher_email_on_create(sender, instance, created, **kwargs):
    if not created:
        return
    if not instance.is_active:
        return
    from main.tasks.emails.voucher_email import send_winner_voucher_email
    send_winner_voucher_email.delay(str(instance.pk))

    # If the voucher is assigned to a preexisting user, send them a push notification
    try:
        user = instance.assigned_user
        if user:
            from main.tasks.notifications.push import send_push_notification
            send_push_notification.delay(
                user.id,
                "Hurray! You've won a voucher",
                f"You've won a voucher worth {instance.credit_amount} open the app to redeem it",
                "winner_voucher"
            )
            logger.info(f"Push notification sent to user {user.id}")
    except Exception as e:
        logger.error(f"Error sending push notification: {e}")


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
