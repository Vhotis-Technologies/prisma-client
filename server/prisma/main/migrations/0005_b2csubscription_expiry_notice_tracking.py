"""Track B2C subscription end-of-period reminder emails."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("main", "0004_bookedappointment_complimentary_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="b2csubcription",
            name="expiring_notice_sent_for_end_date",
            field=models.DateField(blank=True, null=True),
        ),
    ]
