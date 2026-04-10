"""User, referral, address, loyalty, promotions, notifications - user and notification related models."""
import random
import string
import uuid
from datetime import timedelta

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=155)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=15, blank=True)
    is_active = models.BooleanField(default=True)
    referral_code = models.CharField(max_length=10, blank=True, null=True)
    referred_by = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='referrals')
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)
    is_fleet_owner = models.BooleanField(default=False)
    is_branch_admin = models.BooleanField(default=False)
    notification_token = models.CharField(max_length=255, blank=True, null=True)
    allow_marketing_emails = models.BooleanField(default=False)
    allow_push_notifications = models.BooleanField(default=True)
    allow_email_notifications = models.BooleanField(default=True)
    stripe_customer_id = models.CharField(max_length=255, blank=True, null=True)
    has_signup_promotions = models.BooleanField(default=True)
    has_booking_promotions = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['name']

    def __str__(self):
        return f"{self.name} - {self.email}"

    def create_referral_code(self):
        return ''.join(random.choices(string.ascii_uppercase + string.digits, k=10))

    def get_current_vehicles(self):
        from main.models import Vehicle
        return Vehicle.objects.filter(
            ownerships__owner=self,
            ownerships__end_date__isnull=True
        ).distinct()

    def get_all_vehicles(self):
        from main.models import Vehicle
        return Vehicle.objects.filter(ownerships__owner=self).distinct()

    def is_fleet_admin_or_manager(self):
        from main.models import FleetMember
        return FleetMember.objects.filter(
            user=self,
            role__in=['admin', 'manager']
        ).exists()

    def get_managed_branch(self):
        from main.models import FleetMember
        if not self.is_branch_admin:
            return None
        fleet_membership = FleetMember.objects.filter(
            user=self,
            role='admin'
        ).first()
        return fleet_membership.branch if fleet_membership else None

    def is_fleet_user(self):
        return self.is_fleet_owner or self.is_branch_admin

    def can_view_vehicle_details(self, vehicle=None):
        from main.models import Fleet, FleetMember
        if not (self.is_fleet_owner or self.is_branch_admin):
            return True
        fleet = None
        if self.is_fleet_owner:
            fleet = Fleet.objects.filter(owner=self).first()
        else:
            membership = FleetMember.objects.filter(user=self).first()
            fleet = membership.fleet if membership else None
        if not fleet:
            return False
        subscription = fleet.get_active_subscription()
        return subscription is not None

    def create_fleet(self, business_name=None, business_address=None):
        from main.models import Fleet, Branch
        from decimal import Decimal
        if not self.is_fleet_owner:
            return None
        fleet = Fleet.objects.filter(owner=self).first()
        name = (business_name or '').strip() or f"{self.name}'s Fleet"
        if fleet:
            if business_name and business_name.strip():
                fleet.name = business_name.strip()
                fleet.save(update_fields=['name'])
        else:
            fleet = Fleet.objects.create(
                name=name,
                owner=self,
                description=f"Fleet managed by {self.name}"
            )
        if business_address and fleet and not fleet.branches.exists():
            Branch.objects.create(
                fleet=fleet,
                name=(business_name or '').strip() or "Head Office",
                address=business_address.get('address') or '',
                postcode=business_address.get('post_code') or '',
                city=business_address.get('city') or '',
                country=business_address.get('country') or '',
                latitude=Decimal(str(business_address['latitude'])) if business_address.get('latitude') is not None else None,
                longitude=Decimal(str(business_address['longitude'])) if business_address.get('longitude') is not None else None,
            )
        return fleet

    def save(self, *args, **kwargs):
        from datetime import datetime
        self.username = self.email
        is_new_user = self.pk is None
        became_fleet_owner = False
        if not is_new_user:
            try:
                old_user = User.objects.get(pk=self.pk)
                became_fleet_owner = not old_user.is_fleet_owner and self.is_fleet_owner
            except User.DoesNotExist:
                pass
        if is_new_user and not self.referral_code:
            self.referral_code = self.create_referral_code()
        super().save(*args, **kwargs)
        if is_new_user and self.has_signup_promotions:
            valid_until = (datetime.now() + timedelta(days=30)).date()
            Promotions.objects.create(
                user=self,
                title="Welcome Bonus",
                description="Get 10% off your first service!",
                discount_percentage=10,
                valid_until=valid_until,
                is_active=True,
                terms_conditions=f"Valid for 30 days from {datetime.now().strftime('%Y-%m-%d')}. New customers only. Cannot be combined with other offers.",
            )
        if is_new_user:
            LoyaltyProgram.objects.create(user=self)
        if (is_new_user and self.is_fleet_owner) or became_fleet_owner:
            self.create_fleet()
        if is_new_user:
            self.referral_code = self.create_referral_code()
            self.save(update_fields=['referral_code'])


class Referral(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    referrer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='referrer')
    referred = models.ForeignKey(User, on_delete=models.CASCADE, related_name='referred')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.referrer.name} - {self.referred.name}"


class Address(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    address = models.CharField(max_length=255)
    post_code = models.CharField(max_length=10)
    city = models.CharField(max_length=100)
    country = models.CharField(max_length=100)
    latitude = models.DecimalField(max_digits=10, decimal_places=8, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=8, null=True, blank=True)

    def __str__(self):
        return f"{self.user.name} - {self.address}"


class LoyaltyProgram(models.Model):
    TIER_CHOICES = [
        ('bronze', 'Bronze'),
        ('silver', 'Silver'),
        ('gold', 'Gold'),
        ('platinum', 'Platinum'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    current_tier = models.CharField(max_length=50, choices=TIER_CHOICES, default='bronze')
    completed_bookings = models.IntegerField(default=0)
    last_booking_date = models.DateField(null=True, blank=True)
    free_quick_sparkle_used = models.IntegerField(default=0)
    free_quick_sparkle_reset_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def get_tier_benefits(self):
        is_fleet_user = self.user.is_fleet_admin_or_manager()
        if is_fleet_user:
            benefits = {
                'bronze': {'discount': 0, 'free_service': []},
                'silver': {'discount': 5, 'free_service': ['Air freshner', 'One easy bill per month']},
                'gold': {'discount': 8, 'free_service': ['Air freshner', 'One easy bill per month', 'Digital health check']},
                'platinum': {'discount': 10, 'free_service': ['Air freshner', 'One easy bill per month', 'Digital health check', 'Interior protection', '3 Free Quick sparkle per month']},
            }
        else:
            benefits = {
                'bronze': {'discount': 0, 'free_service': []},
                'silver': {'discount': 5, 'free_service': ['Air freshner']},
                'gold': {'discount': 8, 'free_service': ['Air freshner', 'Digital health check']},
                'platinum': {'discount': 12, 'free_service': ['Air freshner', 'Interior protection', '1 Free Quick sparkle per month', 'Digital health check']},
            }
        return benefits.get(self.current_tier, benefits['bronze'])

    def get_free_wash_limit(self):
        if self.current_tier != 'platinum':
            return 0
        if self.user.is_fleet_admin_or_manager():
            return 3
        return 1

    def can_use_free_quick_sparkle(self):
        if self.current_tier != 'platinum':
            return False
        today = timezone.now().date()
        if self.free_quick_sparkle_reset_date:
            days_since_reset = (today - self.free_quick_sparkle_reset_date).days
            if days_since_reset >= 30:
                self.free_quick_sparkle_used = 0
                self.free_quick_sparkle_reset_date = today
                self.save()
        else:
            self.free_quick_sparkle_reset_date = today
            self.save()
        limit = self.get_free_wash_limit()
        return self.free_quick_sparkle_used < limit

    def use_free_quick_sparkle(self):
        self.free_quick_sparkle_used += 1
        self.save()

    def get_remaining_free_quick_sparkles(self):
        limit = self.get_free_wash_limit()
        remaining = limit - self.free_quick_sparkle_used
        return max(0, remaining)


class Promotions(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    description = models.TextField()
    discount_percentage = models.IntegerField()
    valid_until = models.DateField()
    is_active = models.BooleanField(default=True)
    terms_conditions = models.TextField()
    is_used = models.BooleanField(default=False)
    used_in_booking = models.ForeignKey('BookedAppointment', on_delete=models.SET_NULL, null=True, blank=True)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} - {self.discount_percentage}%"

    def save(self, *args, **kwargs):
        today = timezone.now().date()
        if (self.valid_until and self.valid_until < today) or \
           (self.created_at and timezone.now() - self.created_at > timedelta(days=30)) or \
           self.is_used:
            self.is_active = False
        super().save(*args, **kwargs)

    def mark_as_used(self, booking):
        self.is_used = True
        self.used_in_booking = booking
        self.used_at = timezone.now()
        self.is_active = False
        self.save()


class Notification(models.Model):
    NOTIFICATION_TYPE_CHOICES = [
        ('booking_confirmed', 'Booking Confirmed'),
        ('booking_cancelled', 'Booking Cancelled'),
        ('booking_rescheduled', 'Booking Rescheduled'),
        ('cleaning_completed', 'Cleaning Completed'),
        ('appointment_started', 'Appointment Started'),
        ('pending', 'Pending'),
    ]
    NOTIFICATION_STATUS_CHOICES = [
        ('success', 'Success'),
        ('warning', 'Warning'),
        ('error', 'Error'),
        ('info', 'Info'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    message = models.TextField()
    type = models.CharField(max_length=255, choices=NOTIFICATION_TYPE_CHOICES, default='pending')
    status = models.CharField(max_length=255, choices=NOTIFICATION_STATUS_CHOICES, default='info')
    timestamp = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.user.name} - {self.title}"


class TermsAndConditions(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    version = models.CharField(max_length=20, unique=True)
    content = models.TextField()
    last_updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Terms and Conditions - {self.version}"


class PrivacyPolicy(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    version = models.CharField(max_length=20, unique=True)
    content = models.TextField()
    last_updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Privacy Policy - {self.version}"


class PasswordResetToken(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    token = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)

    class Meta:
        db_table = 'password_reset_tokens'

    def is_expired(self):
        return timezone.now() > self.expires_at

    def is_valid(self):
        return not self.used and not self.is_expired()

    def __str__(self):
        return f"Password reset token for {self.user.email}"
