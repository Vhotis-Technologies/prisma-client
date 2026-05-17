# Ledger for subscription complimentary Quick Sparkle uses.

from django.db import migrations, models


def backfill_complimentary_sparkles_used(apps, schema_editor):
    """Seed ledger from historical appointment counts (capped per plan)."""
    B2CSubcription = apps.get_model("main", "B2CSubcription")
    BookedAppointment = apps.get_model("main", "BookedAppointment")

    def max_spark_for_tier(tier_name):
        if not tier_name:
            return 1
        low = tier_name.lower()
        ordered = [("spectacular", 4), ("spectrum", 4), ("lite", 1), ("pro", 2)]
        for key, n in ordered:
            if key in low:
                return n
        return 1

    for sub in B2CSubcription.objects.select_related("plan__tier").iterator():
        tier_name = getattr(sub.plan.tier, "name", "") if sub.plan_id else ""
        max_spark = max_spark_for_tier(tier_name)
        start = sub.start_date.date() if hasattr(sub.start_date, "date") else sub.start_date
        end = sub.end_date.date() if hasattr(sub.end_date, "date") else sub.end_date
        cnt = (
            BookedAppointment.objects.filter(
                user_id=sub.user_id,
                applied_free_quick_sparkle=True,
                complimentary_quick_sparkle_source="subscription",
                appointment_date__gte=start,
                appointment_date__lte=end,
            )
            .exclude(status="cancelled")
            .filter(service_type__name__icontains="quick sparkle")
            .count()
        )
        sub.complimentary_sparkles_used = min(cnt, max_spark)
        sub.save(update_fields=["complimentary_sparkles_used"])


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0009_gift_voucher"),
    ]

    operations = [
        migrations.AddField(
            model_name="b2csubcription",
            name="complimentary_sparkles_used",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.RunPython(backfill_complimentary_sparkles_used, migrations.RunPython.noop),
    ]
