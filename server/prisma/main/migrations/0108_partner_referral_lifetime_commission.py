# Partner commission is lifetime. The customer discount stays 60 days, at 20%.

from django.db import migrations


def lifetime_commission_and_twenty_percent(apps, schema_editor):
    """
    Clear attribution expiry so existing partner links keep paying commission.

    Active 40% partner referral promotions become 20%. Their valid_until date
    is left as stored.
    """
    ReferralAttribution = apps.get_model("main", "ReferralAttribution")
    Promotions = apps.get_model("main", "Promotions")
    ReferralAttribution.objects.filter(source="partner").update(expires_at=None)
    promos = Promotions.objects.filter(
        title="Partner Referral Discount",
        discount_percentage=40,
    )
    for promo in promos:
        description = promo.description or ""
        promo.discount_percentage = 20
        promo.description = description.replace("40%", "20%")
        promo.save(update_fields=["discount_percentage", "description"])


def restore_forty_percent(apps, schema_editor):
    """Put the partner promotion percent back. Expiry dates are not restored."""
    Promotions = apps.get_model("main", "Promotions")
    promos = Promotions.objects.filter(
        title="Partner Referral Discount",
        discount_percentage=20,
    )
    for promo in promos:
        description = promo.description or ""
        promo.discount_percentage = 40
        promo.description = description.replace("20%", "40%")
        promo.save(update_fields=["discount_percentage", "description"])


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0107_b2csubcription_grace_period_until"),
    ]

    operations = [
        migrations.RunPython(lifetime_commission_and_twenty_percent, restore_forty_percent),
    ]
