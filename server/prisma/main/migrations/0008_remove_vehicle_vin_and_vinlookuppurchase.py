"""Drop VinLookupPurchase and vehicle VIN storage fields."""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0007_vehicle_vin_encryption_reg_payload"),
    ]

    operations = [
        migrations.DeleteModel(name="VinLookupPurchase"),
        migrations.RemoveConstraint(
            model_name="vehicle",
            name="uniq_vehicle_vin_search_hash_when_set",
        ),
        migrations.RemoveField(model_name="vehicle", name="vin_ciphertext"),
        migrations.RemoveField(model_name="vehicle", name="vin_search_hash"),
    ]
