"""Add review_comment to BookedAppointment (model field existed without migration)."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0010_b2csubcription_complimentary_sparkles_used_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="bookedappointment",
            name="review_comment",
            field=models.TextField(blank=True, null=True),
        ),
    ]
