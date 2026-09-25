# Generated manually: B2C payment-failure grace period (3 days) then expired.

from datetime import timedelta

from django.db import migrations, models
from django.utils import timezone


B2C_PAYMENT_GRACE_DAYS = 3


def seed_grace_for_existing_past_due(apps, schema_editor):
    """Give existing past_due B2C rows a 3-day window from migration time."""
    B2CSubcription = apps.get_model('main', 'B2CSubcription')
    until = timezone.now() + timedelta(days=B2C_PAYMENT_GRACE_DAYS)
    B2CSubcription.objects.filter(
        status='past_due',
        grace_period_until__isnull=True,
    ).update(grace_period_until=until)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0106_alter_user_is_guest'),
    ]

    operations = [
        migrations.AddField(
            model_name='b2csubcription',
            name='grace_period_until',
            field=models.DateTimeField(
                blank=True,
                help_text=(
                    'After a failed renewal, subscriber benefits continue until this time; '
                    'then the subscription is marked expired.'
                ),
                null=True,
            ),
        ),
        migrations.RunPython(seed_grace_for_existing_past_due, noop_reverse),
    ]
