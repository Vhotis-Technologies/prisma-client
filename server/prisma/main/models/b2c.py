"""
B2C consumer subscription catalog and billing.

Tiers define marketing copy and reference prices (sedan vs SUV/MPV); :class:`B2CSubcriptionPlan`
rows are the billable SKUs (monthly/yearly × vehicle category). Active subscriptions live on
:class:`B2CSubcription` with Stripe ids and complimentary Quick Sparkle usage tracked per period.
"""
import uuid
from decimal import Decimal

from django.db import models


class B2CSubcriptionTier(models.Model):
    """Named subscription tier (Lite, Pro, Spectrum, etc.) with list pricing and feature bullets."""

    VEHICLE_CATEGORY_SEDAN = 'sedan'
    VEHICLE_CATEGORY_SUV_MPV = 'suv_mpv'
    VEHICLE_CATEGORY_CHOICES = [
        (VEHICLE_CATEGORY_SEDAN, 'Sedan'),
        (VEHICLE_CATEGORY_SUV_MPV, 'SUV / MPV'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    tagLine = models.CharField(max_length=255, blank=True, null=True)
    monthlyPrice = models.DecimalField(max_digits=10, decimal_places=2)
    yearly_price = models.DecimalField(max_digits=10, decimal_places=2)
    monthlyPriceSedan = models.DecimalField(max_digits=10, decimal_places=2)
    yearly_price_sedan = models.DecimalField(max_digits=10, decimal_places=2)
    service_discount_percent = models.PositiveSmallIntegerField(
        default=0,
        help_text='Percent off paid bookings (VAT-inc stack) for active subscribers, e.g. 10 or 15.',
    )
    max_complimentary_washes = models.PositiveSmallIntegerField(
        default=1,
        help_text='Complimentary Prisma Quick Sparkle washes per billing period for active subscribers.',
    )
    features = models.JSONField(default=list)
    badge = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['monthlyPrice']

    def __str__(self) -> str:
        return self.name

    def list_price(self, vehicle_category: str, billing_cycle: str) -> Decimal:
        """Reference list price for a vehicle category and billing cycle."""
        is_sedan = vehicle_category == self.VEHICLE_CATEGORY_SEDAN
        if billing_cycle == 'yearly':
            return self.yearly_price_sedan if is_sedan else self.yearly_price
        return self.monthlyPriceSedan if is_sedan else self.monthlyPrice


class B2CSubcriptionPlan(models.Model):
    """Concrete plan row: tier + billing cycle + vehicle category + price; entitlements from tier name."""

    BILLING_CYCLE_CHOICES = [('monthly', 'Monthly'), ('yearly', 'Yearly')]
    VEHICLE_CATEGORY_SEDAN = B2CSubcriptionTier.VEHICLE_CATEGORY_SEDAN
    VEHICLE_CATEGORY_SUV_MPV = B2CSubcriptionTier.VEHICLE_CATEGORY_SUV_MPV
    VEHICLE_CATEGORY_CHOICES = B2CSubcriptionTier.VEHICLE_CATEGORY_CHOICES

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tier = models.ForeignKey(B2CSubcriptionTier, on_delete=models.CASCADE, related_name='plans')
    billing_cycle = models.CharField(max_length=20, choices=BILLING_CYCLE_CHOICES)
    vehicle_category = models.CharField(
        max_length=20,
        choices=VEHICLE_CATEGORY_CHOICES,
        default=VEHICLE_CATEGORY_SUV_MPV,
    )
    price = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [['tier', 'billing_cycle', 'vehicle_category']]

    def __str__(self) -> str:
        return (
            f"{self.tier.name} ({self.get_billing_cycle_display()}, "
            f"{self.get_vehicle_category_display()})"
        )

    def get_limits(self):
        """Entitlement caps for this plan, from the tier's admin-editable ``max_complimentary_washes``."""
        try:
            max_sparkles = int(getattr(self.tier, 'max_complimentary_washes', 1) or 1)
        except (TypeError, ValueError):
            max_sparkles = 1
        return {'max_prisma_sparkles': max_sparkles}

    def get_service_discount_percent(self) -> int:
        """Percent off paid bookings from the tier's admin-editable ``service_discount_percent``."""
        try:
            return int(getattr(self.tier, 'service_discount_percent', 0) or 0)
        except (TypeError, ValueError):
            return 0


class B2CSubcription(models.Model):
    """A user's active or historical B2C subscription instance (Stripe-backed)."""

    STATUS_CHOICES = [
        ('active', 'Active'),
        ('pending', 'Pending'),
        ('past_due', 'Past Due'),
        ('cancelled', 'Cancelled'),
        ('expired', 'Expired'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey('User', on_delete=models.CASCADE, related_name='b2c_subscription_user')
    plan = models.ForeignKey(
        B2CSubcriptionPlan,
        on_delete=models.CASCADE,
        related_name='b2c_subscriptions',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()
    stripe_subscription_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    auto_renew = models.BooleanField(default=True)
    cancellation_date = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True, null=True)
    expiring_notice_sent_for_end_date = models.DateField(null=True, blank=True)
    complimentary_sparkles_used = models.PositiveIntegerField(default=0)

    def __str__(self) -> str:
        return f"{self.user} — {self.plan} [{self.status}]"

    def save(self, *args, **kwargs):
        """New subscription row starts with a fresh ledger; mid-cycle tier change resets entitlement."""
        if self.pk:
            prior = (
                type(self).objects.filter(pk=self.pk)
                .values_list('plan_id', flat=True)
                .first()
            )
            if prior is not None and prior != self.plan_id:
                self.complimentary_sparkles_used = 0
        super().save(*args, **kwargs)


class B2CSubcriptionBilling(models.Model):
    """Invoice/charge row for a B2C subscription renewal or initial payment."""

    STATUS_CHOICES = [
        ('paid', 'Paid'),
        ('pending', 'Pending'),
        ('failed', 'Failed'),
        ('refunded', 'Refunded'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subscription = models.ForeignKey(B2CSubcription, on_delete=models.CASCADE, related_name='billing_records')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    billing_date = models.DateTimeField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    transaction_id = models.CharField(max_length=255, null=True, blank=True)
    payment = models.ForeignKey('PaymentTransaction', on_delete=models.SET_NULL, null=True, blank=True, related_name='b2c_subscription_billings')

    def __str__(self) -> str:
        return f"{self.subscription} — {self.amount} ({self.status})"
