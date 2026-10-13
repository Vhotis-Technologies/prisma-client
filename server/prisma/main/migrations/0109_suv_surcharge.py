# SUV / MPV surcharge is an admin setting, starting at 15%.

from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models


def seed_suv_surcharge(apps, schema_editor):
    SuvSurcharge = apps.get_model("main", "SuvSurcharge")
    SuvSurcharge.objects.get_or_create(
        pk=1,
        defaults={"suv_surcharge_percent": Decimal("15.00")},
    )


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0108_partner_referral_lifetime_commission"),
    ]

    operations = [
        migrations.CreateModel(
            name="SuvSurcharge",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "suv_surcharge_percent",
                    models.DecimalField(
                        decimal_places=2,
                        default=Decimal("15.00"),
                        help_text="Percent added for SUV / MPV bookings, on the service and add-on total.",
                        max_digits=5,
                        validators=[
                            MinValueValidator(Decimal("0")),
                            MaxValueValidator(Decimal("100")),
                        ],
                    ),
                ),
            ],
            options={
                "verbose_name": "SUV surcharge",
                "verbose_name_plural": "SUV surcharge",
            },
        ),
        migrations.RunPython(seed_suv_surcharge, migrations.RunPython.noop),
    ]
