"""Partner, referral attribution, commission - partner related models."""
import random
import string
import uuid

from django.db import models

from .user import User
from .vehicle import BookedAppointment


class Partner(models.Model):
    PARTNER_TYPE_CHOICES = [
        ('dealership', 'Dealership'),
        ('garage', 'Garage'),
        ('vehicle_sales', 'Vehicle Sales'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='partner_profile')
    partner_type = models.CharField(max_length=30, choices=PARTNER_TYPE_CHOICES, default='dealership')
    business_name = models.CharField(max_length=255)
    referral_code = models.CharField(max_length=12, unique=True, db_index=True)
    is_active = models.BooleanField(default=True)
    commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=5.00)
    min_payout_threshold = models.DecimalField(max_digits=10, decimal_places=2, default=50.00)
    stripe_connect_account_id = models.CharField(max_length=255, blank=True, null=True)
    business_address = models.CharField(max_length=255, blank=True)
    business_postcode = models.CharField(max_length=20, blank=True)
    business_city = models.CharField(max_length=100, blank=True)
    business_country = models.CharField(max_length=100, blank=True)
    business_latitude = models.DecimalField(max_digits=10, decimal_places=8, null=True, blank=True)
    business_longitude = models.DecimalField(max_digits=10, decimal_places=8, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def _generate_referral_code(self):
        prefix = 'DP'
        suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        return f"{prefix}{suffix}"

    def save(self, *args, **kwargs):
        if not self.referral_code:
            while True:
                code = self._generate_referral_code()
                if not Partner.objects.filter(referral_code=code).exists() and not User.objects.filter(referral_code=code).exists():
                    self.referral_code = code
                    break
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.business_name} ({self.partner_type})"


class ReferralAttribution(models.Model):
    SOURCE_CHOICES = [
        ('user', 'User'),
        ('partner', 'Partner'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    referred_user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='partner_attribution')
    partner = models.ForeignKey(Partner, on_delete=models.PROTECT, related_name='attributed_users')
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default='partner')
    attribution_type = models.CharField(max_length=20, default='lifetime')
    attributed_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_transferable = models.BooleanField(default=False)
    partner_free_wash_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.partner.business_name} -> {self.referred_user.name}"

    class Meta:
        indexes = [
            models.Index(fields=['partner']),
            models.Index(fields=['referred_user']),
        ]


class CommissionPayout(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(Partner, on_delete=models.CASCADE, related_name='payouts')
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    period_start = models.DateField()
    period_end = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    stripe_payout_id = models.CharField(max_length=255, null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    admin_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Payout {self.period_start} - {self.period_end} for {self.partner.business_name}"


class CommissionEarning(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('paid', 'Paid'),
        ('reversed', 'Reversed'),
        ('disputed', 'Disputed'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(Partner, on_delete=models.CASCADE, related_name='commission_earnings')
    booking = models.ForeignKey(BookedAppointment, on_delete=models.CASCADE, related_name='commission_earnings')
    referred_user = models.ForeignKey(User, on_delete=models.CASCADE)
    gross_amount = models.DecimalField(max_digits=10, decimal_places=2)
    commission_rate = models.DecimalField(max_digits=5, decimal_places=2)
    commission_amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    payout = models.ForeignKey(CommissionPayout, on_delete=models.SET_NULL, null=True, blank=True, related_name='earnings')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['partner', 'booking']]
        indexes = [
            models.Index(fields=['partner']),
            models.Index(fields=['booking']),
        ]

    def __str__(self):
        return f"{self.partner.business_name} - {self.booking.booking_reference} - {self.commission_amount}"


class PartnerMetricsCache(models.Model):
    partner = models.OneToOneField(Partner, on_delete=models.CASCADE, related_name='metrics_cache')
    total_referred_users = models.IntegerField(default=0)
    active_referred_users = models.IntegerField(default=0)
    total_revenue_from_referrals = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_commission_earned = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    pending_commission = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    last_updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Metrics for {self.partner.business_name}"


class CommissionAdminLog(models.Model):
    ACTION_CHOICES = [
        ('reverse', 'Reversed'),
        ('adjust', 'Adjusted'),
        ('approve', 'Approved'),
        ('dispute', 'Disputed'),
        ('other', 'Other'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    commission_earning = models.ForeignKey(CommissionEarning, on_delete=models.CASCADE, related_name='admin_logs')
    admin_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='commission_admin_actions')
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    reason = models.TextField(blank=True)
    previous_status = models.CharField(max_length=20, blank=True)
    previous_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.action} on {self.commission_earning} by {self.admin_user}"


class PartnerBankAccount(models.Model):
    """One bank account per partner for payouts. Uses account holder name + IBAN (sort_code/account_number optional for legacy)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.OneToOneField(Partner, on_delete=models.CASCADE, related_name='bank_account')
    account_holder_name = models.CharField(max_length=255)
    sort_code = models.CharField(max_length=10, blank=True, default='')
    account_number = models.CharField(max_length=20, blank=True, default='')
    iban = models.CharField(max_length=34, blank=True)  # required in API for new flow
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Bank account for {self.partner.business_name}"


class PartnerPayoutRequest(models.Model):
    """Partner requests a payout; support processes within 24 hours."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('paid', 'Paid'),
        ('cancelled', 'Cancelled'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(Partner, on_delete=models.CASCADE, related_name='payout_requests')
    amount_requested = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    requested_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    admin_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-requested_at']
        indexes = [
            models.Index(fields=['partner']),
            models.Index(fields=['status']),
            models.Index(fields=['requested_at']),
        ]

    def __str__(self):
        return f"Payout request {self.id} - {self.partner.business_name} - {self.amount_requested}"
