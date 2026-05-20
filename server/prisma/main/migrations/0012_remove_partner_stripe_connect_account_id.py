from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0011_bookedappointment_review_comment"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="partner",
            name="stripe_connect_account_id",
        ),
    ]
