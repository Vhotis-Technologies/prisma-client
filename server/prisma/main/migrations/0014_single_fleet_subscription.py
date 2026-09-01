"""Collapse fleet SaaS to one Prisma Fleet plan at 49.99 / month."""

from decimal import Decimal

from django.db import migrations


FLEET_FEATURES = [
    "Invoice later — pay within 30 days",
    "Before and after job photos",
    "Unlimited vehicles, branches, and admins",
]


def apply_single_fleet_plan(apps, schema_editor):
    SubscriptionTier = apps.get_model("main", "SubscriptionTier")
    SubscriptionPlan = apps.get_model("main", "SubscriptionPlan")

    SubscriptionTier.objects.update(is_active=False)

    tier, _created = SubscriptionTier.objects.update_or_create(
        name="Prisma Fleet",
        defaults={
            "tagLine": "Invoice later and job photos for your business",
            "monthlyPrice": Decimal("49.99"),
            "yearly_price": Decimal("499.90"),
            "yearly_billing_text": "2 months free",
            "features": FLEET_FEATURES,
            "badge": "",
            "is_active": True,
        },
    )

    monthly, _ = SubscriptionPlan.objects.get_or_create(
        tier=tier,
        billing_cycle="monthly",
        defaults={"name": "Prisma Fleet - monthly", "price": Decimal("49.99"), "is_active": True},
    )
    monthly.name = "Prisma Fleet - monthly"
    monthly.price = Decimal("49.99")
    monthly.is_active = True
    monthly.save(update_fields=["name", "price", "is_active"])

    yearly, _ = SubscriptionPlan.objects.get_or_create(
        tier=tier,
        billing_cycle="yearly",
        defaults={"name": "Prisma Fleet - yearly", "price": Decimal("499.90"), "is_active": True},
    )
    yearly.name = "Prisma Fleet - yearly"
    yearly.price = Decimal("499.90")
    yearly.is_active = True
    yearly.save(update_fields=["name", "price", "is_active"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0013_account_invite"),
    ]

    operations = [
        migrations.RunPython(apply_single_fleet_plan, noop_reverse),
    ]
