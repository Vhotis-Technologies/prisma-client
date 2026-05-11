""" This model is specifically for all entries of a b2c users subscription """
import uuid
from django.db import models

class B2CSubcriptionTier(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    tagLine = models.CharField(max_length=255, blank=True, null=True)
    monthlyPrice = models.DecimalField(max_digits=10, decimal_places=2)
    yearly_price = models.DecimalField(max_digits=10, decimal_places=2)
    features = models.JSONField(default=list)
    badge = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['monthlyPrice']

    def __str__(self) -> str:
        return self.name


class B2CSubcriptionPlan(models.Model):
    BILLING_CYCLE_CHOICES = [('monthly', 'Monthly'), ('yearly', 'Yearly')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tier = models.ForeignKey(B2CSubcriptionTier, on_delete=models.CASCADE, related_name='plans')
    billing_cycle = models.CharField(max_length=20, choices=BILLING_CYCLE_CHOICES)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [['tier', 'billing_cycle']]

    def __str__(self) -> str:
        return f"{self.tier.name} ({self.get_billing_cycle_display()})"

    def get_limits(self):
        """Entitlement caps for this plan (no promotional discount on subscription list price)."""
        # Longer substrings first so e.g. "spectrum" beats "pro" if both appear.
        ordered = [('spectacular', 4), ('spectrum', 4), ('lite', 1), ('pro', 2)]
        tier_slug = self.tier.name.lower()
        for key, max_sparkles in ordered:
            if key in tier_slug:
                return {'max_prisma_sparkles': max_sparkles}
        return {'max_prisma_sparkles': 1}

    def get_service_discount_percent(self) -> int:
        """Percent off paid bookings (VAT-inc stack) for active subscribers — Lite/Pro 5%, Spectrum/Spectacular 7%."""
        ordered = [('spectacular', 7), ('spectrum', 7), ('lite', 5), ('pro', 5)]
        tier_slug = self.tier.name.lower()
        for key, pct in ordered:
            if key in tier_slug:
                return pct
        return 0


class B2CSubcription(models.Model):
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
    # Last subscription end-date (calendar day) we emailed "benefits ending soon" for — avoids duplicates.
    expiring_notice_sent_for_end_date = models.DateField(null=True, blank=True)
    # Complimentary Quick Sparkle uses consumed for this subscription row (reset on renewal / plan change).
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
