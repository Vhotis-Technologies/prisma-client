"""Contest / marketing winner vouchers: pre-assigned email, secret code, credit, redemption."""
import uuid

from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone


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
