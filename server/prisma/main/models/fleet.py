"""Fleet, branch, subscription - fleet related models."""
import uuid

from django.db import models
from django.utils import timezone

from .user import User
from .vehicle import Vehicle, PaymentTransaction


class Fleet(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_fleets')
    description = models.TextField(blank=True)
    has_used_trial = models.BooleanField(default=False)
    trial_used_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.owner.name})"

    def get_active_subscription(self):
        return self.subscriptions.filter(
            status__in=['active', 'trialing'],
            end_date__gte=timezone.now()
        ).first()

    def check_subscription_limits(self):
        subscription = self.get_active_subscription()
        if not subscription:
            return {
                'has_subscription': False,
                'limits': {'max_admins': 0, 'max_branches': 0, 'max_vehicles': 0},
                'current': {'admins': 0, 'branches': 0, 'vehicles': 0}
            }
        tier = subscription.plan.tier
        limits = tier.get_limits()
        current_admins = FleetMember.objects.filter(fleet=self, role='admin').count()
        current_branches = Branch.objects.filter(fleet=self).count()
        current_vehicles = FleetVehicle.objects.filter(fleet=self).count()
        return {
            'has_subscription': True,
            'subscription_tier': tier.name,
            'limits': limits,
            'current': {'admins': current_admins, 'branches': current_branches, 'vehicles': current_vehicles}
        }

    def can_add_admin(self):
        limits_info = self.check_subscription_limits()
        if not limits_info['has_subscription']:
            return False, "No active subscription"
        max_admins = limits_info['limits']['max_admins']
        if max_admins is None:
            return True, None
        if limits_info['current']['admins'] >= max_admins:
            return False, f"Admin limit reached ({limits_info['current']['admins']}/{max_admins})"
        return True, None

    def can_add_branch(self):
        limits_info = self.check_subscription_limits()
        if not limits_info['has_subscription']:
            return False, "No active subscription"
        max_branches = limits_info['limits']['max_branches']
        if max_branches is None:
            return True, None
        if limits_info['current']['branches'] >= max_branches:
            return False, f"Branch limit reached ({limits_info['current']['branches']}/{max_branches})"
        return True, None

    def can_add_vehicle(self):
        limits_info = self.check_subscription_limits()
        if not limits_info['has_subscription']:
            return False, "No active subscription"
        max_vehicles = limits_info['limits']['max_vehicles']
        if max_vehicles is None:
            return True, None
        if limits_info['current']['vehicles'] >= max_vehicles:
            return False, f"Vehicle limit reached ({limits_info['current']['vehicles']}/{max_vehicles})"
        return True, None


class Branch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fleet = models.ForeignKey(Fleet, on_delete=models.CASCADE, related_name='branches')
    name = models.CharField(max_length=100, null=True, blank=True)
    address = models.CharField(max_length=150, null=True, blank=True)
    postcode = models.CharField(max_length=10, null=True, blank=True)
    city = models.CharField(max_length=100, null=True, blank=True)
    country = models.CharField(max_length=100, null=True, blank=True)
    latitude = models.DecimalField(max_digits=10, decimal_places=8, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=8, null=True, blank=True)
    spend_limit = models.DecimalField(max_digits=12, decimal_places=2, default=0, null=True, blank=True)
    spend_limit_period = models.CharField(max_length=10, choices=[('weekly', 'Weekly'), ('monthly', 'Monthly')], null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} - {self.fleet.name}"


class FleetMember(models.Model):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('manager', 'Manager')
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fleet = models.ForeignKey(Fleet, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='fleet_memberships')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name='fleet_members')
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['fleet', 'user']]

    def __str__(self):
        return f"{self.user.name} - {self.fleet.name} ({self.role})"


class FleetVehicle(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fleet = models.ForeignKey(Fleet, on_delete=models.CASCADE, related_name='fleet_vehicles')
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='fleet_associations')
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name='branch_vehicles')
    added_at = models.DateTimeField(auto_now_add=True)
    added_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)

    class Meta:
        unique_together = [['fleet', 'vehicle']]

    def __str__(self):
        return f"{self.fleet.name} - {self.vehicle.registration_number}"


class SubscriptionTier(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    tagLine = models.CharField(max_length=255, blank=True, null=True)
    monthlyPrice = models.DecimalField(max_digits=10, decimal_places=2)
    yearly_price = models.DecimalField(max_digits=10, decimal_places=2)
    yearly_billing_text = models.CharField(max_length=100, blank=True, null=True)
    features = models.JSONField(default=list)
    badge = models.CharField(max_length=50, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['monthlyPrice']

    def __str__(self):
        return f"{self.name} - ${self.monthlyPrice}/month"

    def get_limits(self):
        limits = {
            'Basic': {'max_admins': 3, 'max_branches': 3, 'max_vehicles': 50},
            'Pro': {'max_admins': 10, 'max_branches': 10, 'max_vehicles': 200},
            'Enterprise': {'max_admins': None, 'max_branches': None, 'max_vehicles': None},
        }
        tier_name_lower = self.name.lower()
        if 'basic' in tier_name_lower:
            return limits['Basic']
        if 'pro' in tier_name_lower:
            return limits['Pro']
        if 'enterprise' in tier_name_lower:
            return limits['Enterprise']
        return limits['Basic']


class SubscriptionPlan(models.Model):
    BILLING_CYCLE_CHOICES = [('monthly', 'Monthly'), ('yearly', 'Yearly')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tier = models.ForeignKey(SubscriptionTier, on_delete=models.CASCADE, related_name='plans')
    billing_cycle = models.CharField(max_length=20, choices=BILLING_CYCLE_CHOICES)
    name = models.CharField(max_length=200, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [['tier', 'billing_cycle']]
        ordering = ['tier', 'billing_cycle']

    def __str__(self):
        return f"{self.tier.name} - {self.billing_cycle} (${self.price})"


class FleetSubscription(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('pending', 'Pending'),
        ('trialing', 'Trialing'),
        ('past_due', 'Past Due'),
        ('cancelled', 'Cancelled'),
        ('expired', 'Expired'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fleet = models.ForeignKey(Fleet, on_delete=models.CASCADE, related_name='subscriptions')
    plan = models.ForeignKey(SubscriptionPlan, on_delete=models.CASCADE, related_name='subscriptions')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()
    stripe_subscription_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    auto_renew = models.BooleanField(default=True)
    cancellation_date = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True, null=True)
    is_early_adopter = models.BooleanField(default=False)
    trial_days = models.IntegerField(null=True, blank=True)
    trial_start_date = models.DateTimeField(null=True, blank=True)
    trial_end_date = models.DateTimeField(null=True, blank=True)
    payment_failure_count = models.IntegerField(default=0)
    last_payment_failure_date = models.DateTimeField(null=True, blank=True)
    grace_period_until = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['fleet', 'status']),
            models.Index(fields=['stripe_subscription_id']),
        ]

    def __str__(self):
        return f"{self.fleet.name} - {self.plan.tier.name} ({self.status})"


class SubscriptionBilling(models.Model):
    STATUS_CHOICES = [
        ('paid', 'Paid'),
        ('pending', 'Pending'),
        ('failed', 'Failed'),
        ('refunded', 'Refunded'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subscription = models.ForeignKey(FleetSubscription, on_delete=models.CASCADE, related_name='billing_records')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    billing_date = models.DateTimeField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    transaction_id = models.CharField(max_length=255, null=True, blank=True)
    payment = models.ForeignKey(PaymentTransaction, on_delete=models.SET_NULL, null=True, blank=True, related_name='subscription_billings')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-billing_date']
        indexes = [
            models.Index(fields=['subscription', 'status']),
            models.Index(fields=['transaction_id']),
        ]

    def __str__(self):
        return f"Billing {self.id} - {self.subscription.fleet.name} - ${self.amount} ({self.status})"
