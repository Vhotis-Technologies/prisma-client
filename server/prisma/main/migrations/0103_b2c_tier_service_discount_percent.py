# Generated manually: admin-editable B2C booking discount percent on tiers.

from django.db import migrations, models


def backfill_service_discount_percent(apps, schema_editor):
    """
    Seed from the previous name-based mapping in get_service_discount_percent:
    spectacular → 20, spectrum → 15, lite/pro → 10.
    """
    B2CSubcriptionTier = apps.get_model('main', 'B2CSubcriptionTier')
    ordered = [('spectacular', 20), ('spectrum', 15), ('lite', 10), ('pro', 10)]
    for tier in B2CSubcriptionTier.objects.all():
        slug = (tier.name or '').lower()
        pct = 0
        for key, value in ordered:
            if key in slug:
                pct = value
                break
        if tier.service_discount_percent != pct:
            tier.service_discount_percent = pct
            tier.save(update_fields=['service_discount_percent', 'updated_at'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0102_b2c_vehicle_category_pricing'),
    ]

    operations = [
        migrations.AddField(
            model_name='b2csubcriptiontier',
            name='service_discount_percent',
            field=models.PositiveSmallIntegerField(
                default=0,
                help_text=(
                    'Percent off paid bookings (VAT-inc stack) for active subscribers, '
                    'e.g. 10 or 15.'
                ),
            ),
        ),
        migrations.RunPython(backfill_service_discount_percent, noop_reverse),
    ]
