"""Fleet related signals - trial activation, branch admin flag."""
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from main.models import FleetMember, FleetSubscription, User
from main.tasks import send_trial_subscription_welcome_email


@receiver(post_save, sender=FleetSubscription)
def handle_trial_subscription_activation(sender, instance, created, **kwargs):
    if created and instance.status == 'trialing':
        fleet_owner = instance.fleet.owner
        if fleet_owner.allow_email_notifications:
            plan_name = instance.plan.tier.name if instance.plan and instance.plan.tier else "Subscription"
            trial_days = instance.trial_days or 30
            send_trial_subscription_welcome_email.delay(
                fleet_owner.email,
                instance.fleet.name,
                plan_name,
                trial_days,
                instance.trial_end_date.isoformat() if instance.trial_end_date else None
            )


@receiver(post_delete, sender=FleetMember)
def clear_branch_admin_flag_on_removal(sender, instance, **kwargs):
    if instance.role != 'admin':
        return
    user_id = instance.user_id
    user = User.objects.filter(id=user_id).first()
    if not user or not user.is_branch_admin:
        return
    has_other_admin = FleetMember.objects.filter(user_id=user_id, role='admin').exists()
    if not has_other_admin:
        user.is_branch_admin = False
        user.save(update_fields=['is_branch_admin'])
