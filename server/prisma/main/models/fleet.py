"""Fleet, branch, subscription - fleet related models."""
from datetime import timedelta
from dateutil.relativedelta import relativedelta
import uuid

from django.db import models, transaction
from django.db.models import Q, Sum
from django.utils import timezone

from .user import User
from .vehicle import Vehicle, PaymentTransaction

# Stripe bulk invoices use days_until_due=30; unpaid older than this blocks invoice-later.
INVOICE_LATER_OVERDUE_DAYS = 30


class Fleet(models.Model):
    """Business fleet owned by a :class:`~main.models.user.User` with branches, vehicles, and subscription."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_fleets')
    description = models.TextField(blank=True)
    has_used_trial = models.BooleanField(default=False)
    trial_used_date = models.DateTimeField(null=True, blank=True)
    complimentary_sparkle_quota = models.IntegerField(default=4)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.owner.name})"

    @classmethod
    def for_user(cls, user):
        """Fleet owned by this user, or the fleet a branch admin belongs to."""
        if not user:
            return None
        if getattr(user, 'is_fleet_owner', False):
            return cls.objects.filter(owner=user).first()
        if getattr(user, 'is_branch_admin', False):
            membership = FleetMember.objects.filter(user=user).select_related('fleet').first()
            return membership.fleet if membership else None
        return None

    def get_active_subscription(self):
        """Return the current active or trialing fleet subscription, if any.

        Trialing counts as subscribed and includes invoice-later and job photos.
        """
        return self.subscriptions.filter(
            status__in=['active', 'trialing'],
            end_date__gte=timezone.now()
        ).first()

    def has_overdue_invoice_later(self):
        """True when this fleet has an unpaid invoice-later order older than 30 days."""
        from .vehicle import BulkOrder

        cutoff = timezone.now() - timedelta(days=INVOICE_LATER_OVERDUE_DAYS)
        return BulkOrder.objects.filter(
            payment_status='invoice_later',
            created_at__lte=cutoff,
        ).filter(Q(fleet=self) | Q(branch__fleet=self)).exists()

    def invoice_later_eligibility(self):
        """Whether this fleet may create another Stripe invoice-later bulk order."""
        subscription = self.get_active_subscription()
        if not subscription:
            return {
                'allowed': False,
                'code': 'FLEET_SUBSCRIPTION_REQUIRED',
                'message': (
                    'Invoice later needs an active fleet subscription. '
                    'You can still book and pay now.'
                ),
                'has_subscription': False,
                'is_trialing': False,
            }
        if self.has_overdue_invoice_later():
            return {
                'allowed': False,
                'code': 'OVERDUE_INVOICE',
                'message': (
                    'An invoice is more than 30 days overdue. '
                    'Pay it to use invoice later again. You can still book and pay now.'
                ),
                'has_subscription': True,
                'is_trialing': subscription.status == 'trialing',
            }
        return {
            'allowed': True,
            'code': None,
            'message': '',
            'has_subscription': True,
            'is_trialing': subscription.status == 'trialing',
        }

    @classmethod
    def invoice_later_eligibility_for_user(cls, user):
        """Invoice-later gate for fleet owners and branch admins. Partners are not gated."""
        if not user or not (user.is_fleet_owner or user.is_branch_admin):
            return {
                'allowed': True,
                'code': None,
                'message': '',
                'has_subscription': False,
                'is_trialing': False,
                'gated': False,
            }
        fleet = cls.for_user(user)
        if not fleet:
            return {
                'allowed': False,
                'code': 'FLEET_SUBSCRIPTION_REQUIRED',
                'message': (
                    'Invoice later needs an active fleet subscription. '
                    'You can still book and pay now.'
                ),
                'has_subscription': False,
                'is_trialing': False,
                'gated': True,
            }
        payload = fleet.invoice_later_eligibility()
        payload['gated'] = True
        return payload

    def check_subscription_limits(self):
        """Fleet plan has no seat caps; unsubscribed fleets can still operate and pay now."""
        subscription = self.get_active_subscription()
        limits = {'max_admins': None, 'max_branches': None, 'max_vehicles': None}
        current_admins = FleetMember.objects.filter(fleet=self, role='admin').count()
        current_branches = Branch.objects.filter(fleet=self).count()
        current_vehicles = FleetVehicle.objects.filter(fleet=self).count()
        return {
            'has_subscription': bool(subscription),
            'subscription_tier': subscription.plan.tier.name if subscription and subscription.plan_id else None,
            'limits': limits,
            'current': {'admins': current_admins, 'branches': current_branches, 'vehicles': current_vehicles}
        }

    def can_add_admin(self):
        """Without subscription, only allow one admin (the onboarding admin)."""
        subscription = self.get_active_subscription()
        if subscription:
            return True, None  # Unlimited with subscription
        
        # Count existing admins
        current_count = FleetMember.objects.filter(fleet=self, role='admin').count()
        if current_count >= 1:
            return False, "Subscribe to invite additional branch admins"
        return True, None

    def can_add_branch(self):
        """Without subscription, only allow one branch (the onboarding branch)."""
        subscription = self.get_active_subscription()
        if subscription:
            return True, None  # Unlimited with subscription
        
        # Count existing branches
        current_count = Branch.objects.filter(fleet=self).count()
        if current_count >= 1:
            return False, "Subscribe to add more branches"
        return True, None

    def can_add_vehicle(self):
        """Vehicles are not gated by subscription; booking and pay-now stay available."""
        return True, None
    
    def _complimentary_period_end(self, period_start):
        """Complimentary sparkles reset monthly, even on a yearly plan."""
        return period_start + relativedelta(months=1)

    def get_complimentary_sparkle_period_start(self):
        """Current monthly window, anchored to the subscription start date."""
        subscription = self.get_active_subscription()
        if not subscription:
            return None

        now = timezone.now()
        period_start = subscription.start_date
        while period_start <= now:
            next_period = self._complimentary_period_end(period_start)
            if now < next_period:
                return period_start
            period_start = next_period
        return period_start

    def get_complimentary_sparkle_availability(self):
        """Get current period sparkle availability for this fleet."""
        subscription = self.get_active_subscription()
        if not subscription:
            return {
                'available': False,
                'quota': 0,
                'used': 0,
                'remaining': 0,
                'period_start': None,
                'period_end': None,
                'has_subscription': False,
            }

        period_start = self.get_complimentary_sparkle_period_start()
        if not period_start:
            return {
                'available': False,
                'quota': 0,
                'used': 0,
                'remaining': 0,
                'period_start': None,
                'period_end': None,
                'has_subscription': True,
            }

        period_end = self._complimentary_period_end(period_start)
        used_count = (
            FleetComplimentaryBooking.objects.filter(
                fleet=self,
                subscription_period_start=period_start,
            ).aggregate(total=Sum('vehicles_applied'))['total']
            or 0
        )

        return {
            'available': True,
            'quota': self.complimentary_sparkle_quota,
            'used': int(used_count),
            'remaining': max(0, self.complimentary_sparkle_quota - int(used_count)),
            'period_start': period_start,
            'period_end': period_end,
            'has_subscription': True,
        }

    def get_branch_complimentary_usage(self, branch, period_start=None):
        """How many complimentary vehicles a branch has used this period."""
        if period_start is None:
            period_start = self.get_complimentary_sparkle_period_start()
            if not period_start:
                return 0
        used = (
            FleetComplimentaryBooking.objects.filter(
                fleet=self,
                branch=branch,
                subscription_period_start=period_start,
            ).aggregate(total=Sum('vehicles_applied'))['total']
            or 0
        )
        return int(used)

    def record_complimentary_usage(
        self,
        *,
        vehicles_applied,
        user,
        branch=None,
        bulk_order=None,
        booking=None,
        period_start=None,
    ):
        """Lock the fleet and record complimentary vehicles used this period.

        Returns the number actually recorded (may be lower if another booking
        consumed the pool first). Does not raise if the pool is empty.
        """
        applied = int(vehicles_applied or 0)
        if applied < 1:
            return 0
        with transaction.atomic():
            fleet = Fleet.objects.select_for_update().get(pk=self.pk)
            availability = fleet.get_complimentary_sparkle_availability()
            remaining = int(availability.get('remaining') or 0)
            to_apply = min(applied, remaining)
            if to_apply < 1:
                return 0
            window_start = period_start or availability.get('period_start')
            if not window_start:
                return 0
            site = branch or fleet.branches.order_by('created_at').first()
            if not site:
                return 0
            FleetComplimentaryBooking.objects.create(
                fleet=fleet,
                branch=site,
                booking=booking,
                bulk_order=bulk_order,
                vehicles_applied=to_apply,
                subscription_period_start=window_start,
                created_by=user,
            )
            return to_apply


class Branch(models.Model):
    """Physical site under a fleet with optional spend limits and geolocation."""

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
    """Links a user to a fleet (and optionally a branch) with admin or manager role."""

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
    """Association between a fleet-owned vehicle and an optional branch."""

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
    """Single fleet SaaS plan (invoice later + job photos) with feature list and pricing."""

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
        """No seat caps — subscription gates invoice later and job photos, not fleet size."""
        return {'max_admins': None, 'max_branches': None, 'max_vehicles': None}


class SubscriptionPlan(models.Model):
    """Billable fleet plan: tier + monthly/yearly cycle + Stripe price."""

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
    """Active or historical fleet subscription tied to Stripe and trial/grace metadata."""

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
    """Payment record for a fleet subscription billing period."""

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


class FleetComplimentaryBooking(models.Model):
    """Tracks fleet complimentary Quick Sparkle usage per subscription period."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fleet = models.ForeignKey(Fleet, on_delete=models.CASCADE, related_name='complimentary_bookings')
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name='complimentary_bookings')
    booking = models.ForeignKey('BookedAppointment', on_delete=models.CASCADE, null=True, blank=True)
    bulk_order = models.ForeignKey('BulkOrder', on_delete=models.CASCADE, null=True, blank=True)
    vehicles_applied = models.PositiveIntegerField(default=1)
    used_at = models.DateTimeField(auto_now_add=True)
    subscription_period_start = models.DateTimeField()
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    
    class Meta:
        ordering = ['-used_at']
        indexes = [
            models.Index(fields=['fleet', 'subscription_period_start']),
            models.Index(fields=['branch', 'subscription_period_start']),
        ]
    
    def __str__(self):
        return f"Complimentary sparkle - {self.fleet.name} - {self.branch.name if self.branch else 'No branch'}"
