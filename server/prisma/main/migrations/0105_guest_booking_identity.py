# Generated manually: guest checkout identity (is_guest users + hashed results tokens).

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0104_b2c_tier_max_complimentary_washes"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="is_guest",
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.CreateModel(
            name="GuestAccessToken",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "token_hash",
                    models.CharField(db_index=True, max_length=64, unique=True),
                ),
                ("expires_at", models.DateTimeField()),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                ("last_used_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "booking",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="guest_access_tokens",
                        to="main.bookedappointment",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="guest_access_tokens",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "guest_access_tokens",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="guestaccesstoken",
            index=models.Index(
                fields=["booking", "revoked_at"],
                name="guest_tok_booking_revoked_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="guestaccesstoken",
            index=models.Index(
                fields=["user", "-created_at"],
                name="guest_tok_user_created_idx",
            ),
        ),
    ]
