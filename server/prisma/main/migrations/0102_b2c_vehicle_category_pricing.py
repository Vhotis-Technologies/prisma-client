# Generated manually for B2C dual vehicle-category pricing (Phase 1).

import uuid

from django.db import migrations, models


def backfill_sedan_prices_and_plans(apps, schema_editor):
    """
    Copy existing SUV/MPV list prices into sedan fields, mark existing plans as suv_mpv,
    and create matching sedan plan SKUs (same price until admin sets sedan pricing).
    """
    B2CSubcriptionTier = apps.get_model('main', 'B2CSubcriptionTier')
    B2CSubcriptionPlan = apps.get_model('main', 'B2CSubcriptionPlan')

    for tier in B2CSubcriptionTier.objects.all():
        if tier.monthlyPriceSedan is None:
            tier.monthlyPriceSedan = tier.monthlyPrice
        if tier.yearly_price_sedan is None:
            tier.yearly_price_sedan = tier.yearly_price
        tier.save(update_fields=['monthlyPriceSedan', 'yearly_price_sedan', 'updated_at'])

    for plan in (
        B2CSubcriptionPlan.objects.filter(vehicle_category='suv_mpv')
        .select_related('tier')
        .all()
    ):
        sedan_price = (
            plan.tier.yearly_price_sedan
            if plan.billing_cycle == 'yearly'
            else plan.tier.monthlyPriceSedan
        )
        B2CSubcriptionPlan.objects.get_or_create(
            tier_id=plan.tier_id,
            billing_cycle=plan.billing_cycle,
            vehicle_category='sedan',
            defaults={
                'id': uuid.uuid4(),
                'price': sedan_price,
            },
        )


def noop_reverse(apps, schema_editor):
    """Sedan plan rows and price copies are left in place on reverse."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0101_rename_fleetccomp_fleet_period_main_fleetc_fleet_i_8d2232_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='b2csubcriptiontier',
            name='monthlyPriceSedan',
            field=models.DecimalField(decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='b2csubcriptiontier',
            name='yearly_price_sedan',
            field=models.DecimalField(decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='b2csubcriptionplan',
            name='vehicle_category',
            field=models.CharField(
                choices=[('sedan', 'Sedan'), ('suv_mpv', 'SUV / MPV')],
                default='suv_mpv',
                max_length=20,
            ),
        ),
        migrations.AlterUniqueTogether(
            name='b2csubcriptionplan',
            unique_together={('tier', 'billing_cycle', 'vehicle_category')},
        ),
        migrations.RunPython(backfill_sedan_prices_and_plans, noop_reverse),
        migrations.AlterField(
            model_name='b2csubcriptiontier',
            name='monthlyPriceSedan',
            field=models.DecimalField(decimal_places=2, max_digits=10),
        ),
        migrations.AlterField(
            model_name='b2csubcriptiontier',
            name='yearly_price_sedan',
            field=models.DecimalField(decimal_places=2, max_digits=10),
        ),
    ]
