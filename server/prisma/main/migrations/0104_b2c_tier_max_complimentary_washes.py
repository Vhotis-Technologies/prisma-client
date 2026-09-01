# Generated manually: admin-editable B2C complimentary Quick Sparkle wash quota on tiers.

from django.db import migrations, models


def backfill_max_complimentary_washes(apps, schema_editor):
    """
    Seed from the previous name-based mapping in B2CSubcriptionPlan.get_limits:
    spectacular/spectrum → 4, pro → 2, lite → 1, else → 1.
    """
    B2CSubcriptionTier = apps.get_model('main', 'B2CSubcriptionTier')
    ordered = [('spectacular', 4), ('spectrum', 4), ('lite', 1), ('pro', 2)]
    for tier in B2CSubcriptionTier.objects.all():
        slug = (tier.name or '').lower()
        max_washes = 1
        for key, value in ordered:
            if key in slug:
                max_washes = value
                break
        if tier.max_complimentary_washes != max_washes:
            tier.max_complimentary_washes = max_washes
            tier.save(update_fields=['max_complimentary_washes', 'updated_at'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0103_b2c_tier_service_discount_percent'),
    ]

    operations = [
        migrations.AddField(
            model_name='b2csubcriptiontier',
            name='max_complimentary_washes',
            field=models.PositiveSmallIntegerField(
                default=1,
                help_text=(
                    'Complimentary Prisma Quick Sparkle washes per billing period for '
                    'active subscribers.'
                ),
            ),
        ),
        migrations.RunPython(backfill_max_complimentary_washes, noop_reverse),
    ]
