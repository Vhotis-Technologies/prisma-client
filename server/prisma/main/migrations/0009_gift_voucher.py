"""Gift vouchers (Stripe) and PaymentTransaction gift_voucher type."""

import django.db.models.deletion
import uuid

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0008_remove_vehicle_vin_and_vinlookuppurchase"),
    ]

    operations = [
        migrations.AlterField(
            model_name="paymenttransaction",
            name="transaction_type",
            field=models.CharField(
                choices=[
                    ("payment", "Payment"),
                    ("refund", "Refund"),
                    ("vin_lookup", "Legacy VIN lookup (deprecated)"),
                    ("tip", "Tip"),
                    ("fleet_subscription", "Fleet Subscription"),
                    ("b2c_subscription", "B2C Subscription"),
                    ("reschedule_fee", "Reschedule Fee"),
                    ("gift_voucher", "Gift Voucher Purchase"),
                ],
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name="GiftVoucher",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("code", models.CharField(blank=True, db_index=True, max_length=64, null=True, unique=True)),
                ("assigned_email", models.EmailField(db_index=True, max_length=254)),
                ("credit_amount", models.DecimalField(decimal_places=2, max_digits=10)),
                ("validity_days", models.PositiveSmallIntegerField()),
                ("valid_from", models.DateTimeField(blank=True, null=True)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("redeemed_at", models.DateTimeField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                (
                    "stripe_payment_intent_id",
                    models.CharField(blank=True, db_index=True, max_length=255, null=True, unique=True),
                ),
                ("email_sent_at", models.DateTimeField(blank=True, null=True)),
                ("purchase_currency", models.CharField(default="eur", max_length=3)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "assigned_user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="gift_vouchers",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "consumed_booking",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="gift_voucher_redemptions",
                        to="main.bookedappointment",
                    ),
                ),
                (
                    "payment_transaction",
                    models.OneToOneField(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="gift_voucher_grant",
                        to="main.paymenttransaction",
                    ),
                ),
                (
                    "purchased_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="purchased_gift_vouchers",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
