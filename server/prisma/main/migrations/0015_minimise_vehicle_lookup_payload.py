"""Drop stored Ireland lookup dumps and extra identifiers (GDPR minimisation)."""

from django.db import migrations


def clear_lookup_surplus(apps, schema_editor):
    Vehicle = apps.get_model("main", "Vehicle")
    Vehicle.objects.update(
        registration_provider_payload=None,
        abi_code=None,
        county=None,
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0014_single_fleet_subscription"),
    ]

    operations = [
        migrations.RunPython(clear_lookup_surplus, noop_reverse),
    ]
