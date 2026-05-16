"""Contest winner vouchers + customer-purchased gift vouchers (Stripe)."""
import secrets
import string
import uuid

from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone


_GIFT_CODE_ALPHABET = string.ascii_uppercase + string.digits


def generate_gift_voucher_code_candidate() -> str:
    """Uppercase alphanumeric, avoids ambiguous O/0 and I/1."""
    safe = ''.join(c for c in _GIFT_CODE_ALPHABET if c not in {'0', '1', 'O', 'I'})
    part = ''.join(secrets.choice(safe) for _ in range(10))
    return f"GIFT-{part}"


class WinnerVoucher(models.Model):
    """
    Admin creates a voucher with assigned_email and code. On signup, if the new user's
    normalized email matches, assigned_user is set via signal so code entry can enforce ownership.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=64, unique=True, db_index=True)
    assigned_email = models.EmailField(db_index=True)
    assigned_user = models.ForeignKey(
        'User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='winner_vouchers',
    )
    credit_amount = models.DecimalField(max_digits=10, decimal_places=2)
    valid_from = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    redeemed_at = models.DateTimeField(null=True, blank=True)
    consumed_booking = models.ForeignKey(
        'BookedAppointment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='winner_voucher_redemptions',
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"WinnerVoucher {self.code} ({self.assigned_email})"

    def save(self, *args, **kwargs):
        User = get_user_model()
        if self.code:
            self.code = str(self.code).strip().upper()
        if self.assigned_email:
            self.assigned_email = User.objects.normalize_email(self.assigned_email)
        super().save(*args, **kwargs)

    def is_valid_window(self, at=None):
        at = at or timezone.now()
        if self.valid_from and at < self.valid_from:
            return False
        if self.expires_at and at > self.expires_at:
            return False
        return True


class GiftVoucher(models.Model):
    """
    Purchased by `purchased_by` for recipient `assigned_email`. Code is set only after
    Stripe webhook confirms payment. Email sends from webhook handler only.

    Recipient linking mirrors WinnerVoucher: existing user matched by normalized email gets
    `assigned_user`; new signups linked via signal.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=64, unique=True, db_index=True, null=True, blank=True)
    assigned_email = models.EmailField(db_index=True)
    assigned_user = models.ForeignKey(
        'User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gift_vouchers',
    )
    purchased_by = models.ForeignKey(
        'User',
        on_delete=models.CASCADE,
        related_name='purchased_gift_vouchers',
    )
    credit_amount = models.DecimalField(max_digits=10, decimal_places=2)
    validity_days = models.PositiveSmallIntegerField()
    valid_from = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    redeemed_at = models.DateTimeField(null=True, blank=True)
    consumed_booking = models.ForeignKey(
        'BookedAppointment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gift_voucher_redemptions',
    )
    is_active = models.BooleanField(default=True)
    stripe_payment_intent_id = models.CharField(
        max_length=255, unique=True, null=True, blank=True, db_index=True
    )
    purchase_currency = models.CharField(max_length=3, default='eur')
    payment_transaction = models.OneToOneField(
        'PaymentTransaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gift_voucher_grant',
    )
    email_sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        c = self.code or 'pending'
        return f'GiftVoucher {c} → {self.assigned_email}'

    def save(self, *args, **kwargs):
        User = get_user_model()
        if self.code:
            self.code = str(self.code).strip().upper()
        if self.assigned_email:
            self.assigned_email = User.objects.normalize_email(self.assigned_email)
        super().save(*args, **kwargs)

    def is_paid(self) -> bool:
        return bool(self.code)

    def is_valid_window(self, at=None):
        at = at or timezone.now()
        if self.valid_from and at < self.valid_from:
            return False
        if self.expires_at and at > self.expires_at:
            return False
        return True
