# Generated manually for encrypted VIN and registration lookup fields

import base64
import hashlib
import re

from django.db import migrations, models

_VIN_CHARS = re.compile(r"^[A-HJ-NPR-Z0-9]{17}$")


def forwards_migrate_vin(apps, schema_editor):
    """Copy legacy plaintext ``vin`` into ciphertext + hash columns (stdlib only; 0008 removes these)."""
    from django.conf import settings

    Vehicle = apps.get_model("main", "Vehicle")
    pepper = (getattr(settings, "SECRET_KEY", None) or "legacy").encode("utf-8")

    for row in Vehicle.objects.all().iterator():
        old_vin = getattr(row, "vin", None)
        if old_vin is None or str(old_vin).strip() == "":
            continue
        normalized = str(old_vin).strip().upper()
        if not _VIN_CHARS.fullmatch(normalized):
            continue
        row.vin_ciphertext = (
            "__migrated__"
            + base64.urlsafe_b64encode(normalized.encode("ascii")).decode("ascii")
        )
        row.vin_search_hash = hashlib.sha256(pepper + normalized.encode("ascii")).hexdigest()
        row.save(update_fields=["vin_ciphertext", "vin_search_hash"])

def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0006_vehicle_abi_code_vehicle_body_style_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="vehicle",
            name="vin_ciphertext",
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="vehicle",
            name="vin_search_hash",
            field=models.CharField(blank=True, max_length=64, null=True),
        ),
        migrations.AddField(
            model_name="vehicle",
            name="county",
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name="vehicle",
            name="registration_provider_payload",
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="vehicle",
            name="vin",
            field=models.CharField(blank=True, max_length=17, null=True),
        ),
        migrations.RunPython(forwards_migrate_vin, noop_reverse),
        migrations.RemoveIndex(model_name="vehicle", name="main_vehicl_vin_85be95_idx"),
        migrations.RemoveField(model_name="vehicle", name="vin"),
        migrations.AddConstraint(
            model_name="vehicle",
            constraint=models.UniqueConstraint(
                fields=("vin_search_hash",),
                condition=models.Q(vin_search_hash__isnull=False)
                & ~models.Q(vin_search_hash=""),
                name="uniq_vehicle_vin_search_hash_when_set",
            ),
        ),
    ]
