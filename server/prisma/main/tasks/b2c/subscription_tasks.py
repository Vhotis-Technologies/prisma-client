"""B2C subscription Celery tasks (non-email helpers and beat reminders)."""

from celery import shared_task
from datetime import timedelta
from dateutil.relativedelta import relativedelta

from django.utils import timezone


@shared_task(name='main.tasks.send_b2c_subscription_expiry_reminders')
def send_b2c_subscription_expiry_reminders():
    """
    Email B2C subscribers whose plan benefits end within the next 7 days.
    Sends at most once per subscription end-date (tracked on the model).
    """
    from main.models import B2CSubcription
    from main.tasks.b2c.subscription_emails import send_b2c_subscription_expiring_soon_email

    try:
        now = timezone.now()
        window_end = now + timedelta(days=7)

        qs = B2CSubcription.objects.filter(
            status__in=('active', 'past_due'),
            end_date__gte=now,
            end_date__lte=window_end,
        ).select_related('user', 'plan', 'plan__tier')

        sent = 0
        for sub in qs:
            user = sub.user
            if not getattr(user, 'allow_email_notifications', True) or not user.email:
                continue
            end_day = timezone.localtime(sub.end_date).date()
            if sub.expiring_notice_sent_for_end_date == end_day:
                continue
            plan_name = (
                sub.plan.tier.name if sub.plan and sub.plan.tier else 'Subscription'
            )
            access_until = timezone.localtime(sub.end_date).strftime('%B %d, %Y')

            send_b2c_subscription_expiring_soon_email.delay(
                user.email,
                user.name or '',
                plan_name,
                access_until,
            )
            B2CSubcription.objects.filter(pk=sub.pk).update(
                expiring_notice_sent_for_end_date=end_day
            )
            sent += 1

        return f'B2C subscription expiry reminder emails queued: {sent}'

    except Exception as e:
        return f'Failed B2C subscription expiry reminders: {str(e)}'


@shared_task(name='main.tasks.b2c.b2c_subscription_task.create_subscription')
def create_subscription(user_id, tier_id, billing_cycle):
    """
    Optionally used by admins or migrations: create B2C rows with catalog plan pricing via get_or_create.
    Does not integrate Stripe by itself.
    """
    from main.models import B2CSubcription, B2CSubcriptionPlan, User, B2CSubcriptionTier

    user = User.objects.get(id=user_id)
    tier = B2CSubcriptionTier.objects.get(id=tier_id)
    plan_price = tier.monthlyPrice if billing_cycle == 'monthly' else tier.yearly_price
    plan, _ = B2CSubcriptionPlan.objects.get_or_create(
        tier=tier,
        billing_cycle=billing_cycle,
        defaults={'price': plan_price},
    )
    plan.price = plan_price
    plan.save(update_fields=['price', 'updated_at'])

    now = timezone.now()
    end = now + (relativedelta(months=1) if billing_cycle == 'monthly' else relativedelta(years=1))
    subscription = B2CSubcription.objects.create(
        user=user,
        plan=plan,
        status='active',
        start_date=now,
        end_date=end,
    )
    return subscription
