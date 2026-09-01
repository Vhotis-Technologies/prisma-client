"""
Vehicles, bookings, services, payments, and garage history.

Core flow: :class:`Vehicle` + :class:`VehicleOwnership` → :class:`BookedAppointment` →
:class:`PaymentTransaction` / :class:`VehicleEvent` / :class:`EventDataManagement`.
"""
import time
import uuid

from django.db import models
from django.utils import timezone

from .user import User, Address


class Vehicle(models.Model):
    """Registered vehicle identity (make/model/reg); ownership tracked separately."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    registration_number = models.CharField(max_length=50)
    country = models.CharField(max_length=100)
    county = models.CharField(max_length=100, blank=True, null=True)
    # Legacy JSON dump from Ireland lookup; new writes leave this null (data minimisation).
    registration_provider_payload = models.JSONField(blank=True, null=True)
    abi_code = models.CharField(max_length=100, null=True, blank=True)
    make = models.CharField(max_length=100)
    model = models.CharField(max_length=100)
    year = models.IntegerField()
    color = models.CharField(max_length=100)
    image = models.ImageField(upload_to='vehicles/', null=True, blank=True)
    owner_count = models.IntegerField(default=0)
    engine_size = models.IntegerField(null=True, blank=True)
    fuel_type = models.CharField(max_length=100, null=True, blank=True)
    transmission_type = models.CharField(max_length=100, null=True, blank=True)
    body_style = models.CharField(max_length=100, null=True, blank=True)
    number_of_doors = models.IntegerField(null=True, blank=True)
    number_of_seats = models.IntegerField(null=True, blank=True)
    driver_side = models.CharField(max_length=100, null=True, blank=True)
    wheel_pan = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    weight = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [['registration_number', 'country']]
        indexes = [
            models.Index(fields=['registration_number', 'country']),
        ]

    def __str__(self):
        return f"{self.make} {self.model} {self.year} ({self.registration_number}, {self.country})"

    def get_current_owner(self):
        """User who currently holds open ownership, if any."""
        current_ownership = self.ownerships.filter(end_date__isnull=True).first()
        return current_ownership.owner if current_ownership else None

    def has_active_owner(self):
        """True when at least one ownership row has no end_date."""
        return self.ownerships.filter(end_date__isnull=True).exists()

    def get_active_ownership(self):
        """Open :class:`VehicleOwnership` row, if any."""
        return self.ownerships.filter(end_date__isnull=True).first()

    def get_all_owners(self):
        """Distinct users who have ever owned this vehicle."""
        return User.objects.filter(vehicle_ownerships__vehicle=self).distinct()


class VehicleOwnership(models.Model):
    """Time-bounded link between a user and a vehicle (private, fleet, or lease)."""

    OWNERSHIP_TYPE_CHOICES = [
        ('private', 'Private'),
        ('fleet', 'Fleet'),
        ('lease', 'Lease'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='ownerships')
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='vehicle_ownerships')
    ownership_type = models.CharField(max_length=20, choices=OWNERSHIP_TYPE_CHOICES, default='private')
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    proof_of_transfer = models.FileField(upload_to='ownership_docs/', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        """Close any other open ownership on the same vehicle when this row is current."""
        if self.end_date is None:
            VehicleOwnership.objects.filter(
                vehicle=self.vehicle,
                end_date__isnull=True
            ).exclude(id=self.id if self.id else None).update(
                end_date=timezone.now().date()
            )
        super().save(*args, **kwargs)

    class Meta:
        ordering = ['-start_date']
        indexes = [
            models.Index(fields=['vehicle', '-start_date']),
            models.Index(fields=['owner', '-start_date']),
        ]

    def __str__(self):
        return f"{self.owner.name} - {self.vehicle.registration_number} ({self.ownership_type})"


class ServiceType(models.Model):
    """Bookable wash/detail service with B2C and optional fleet pricing."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    description = models.JSONField()
    price = models.DecimalField(max_digits=10, decimal_places=2)
    fleet_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    duration = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} - ${self.price}"

    def get_price_for_user(self, user):
        """Return fleet_price for fleet users when set, else standard price."""
        if user and (user.is_fleet_owner or user.is_branch_admin):
            return self.fleet_price if self.fleet_price is not None else self.price
        return self.price


class ValetType(models.Model):
    """On-site vs mobile valet modality for a booking."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    description = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name}"


class DetailerProfile(models.Model):
    """Assigned detailer metadata synced from the detailer service."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=15, unique=True)
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=0.00)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} - {self.phone}"

    def save(self, *args, **kwargs):
        """Normalize phone to E.164-style storage before persist."""
        from main.utils.phone_utils import normalize_phone
        if self.phone:
            self.phone = normalize_phone(self.phone)
        super().save(*args, **kwargs)


class AddOns(models.Model):
    """Optional add-on line item (price + extra duration) attached to bookings."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    description = models.TextField()
    price = models.DecimalField(max_digits=10, decimal_places=2)
    extra_duration = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} - ${self.price}"


class BookedAppointment(models.Model):
    """Single-vehicle booking (or line item under a :class:`BulkOrder`)."""

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('in_progress', 'In Progress'),
        ('scheduled', 'Scheduled'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking_reference = models.CharField(max_length=255, editable=False, unique=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    vehicle = models.ForeignKey(Vehicle, on_delete=models.SET_NULL, null=True, blank=True)
    bulk_order = models.ForeignKey('BulkOrder', on_delete=models.CASCADE, null=True, blank=True, related_name='appointments')
    valet_type = models.ForeignKey(ValetType, on_delete=models.CASCADE)
    service_type = models.ForeignKey(ServiceType, on_delete=models.CASCADE)
    add_ons = models.ManyToManyField(AddOns, blank=True)
    detailer = models.ForeignKey(DetailerProfile, on_delete=models.SET_NULL, null=True, blank=True)
    address = models.ForeignKey(Address, on_delete=models.CASCADE)
    booking_date = models.DateField(auto_now_add=True)
    appointment_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    subtotal_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    vat_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=13.50)
    start_time = models.TimeField(null=True, blank=True)
    duration = models.IntegerField(null=True, blank=True)
    special_instructions = models.TextField(null=True, blank=True)
    is_express_service = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_reviewed = models.BooleanField(default=False)
    review_rating = models.IntegerField(null=True, blank=True)
    review_comment = models.TextField(null=True, blank=True)
    review_submitted_at = models.DateTimeField(null=True, blank=True)
    assigned_detailers = models.JSONField(default=list, blank=True)  # list of {"id", "name", "rating", "phone", "image"} from job_acceptance (express = 2)
    service_reminder_push_sent_at = models.DateTimeField(null=True, blank=True)
    reminder_email_6h_sent_at = models.DateTimeField(null=True, blank=True)
    applied_free_quick_sparkle = models.BooleanField(default=False)
    complimentary_quick_sparkle_source = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        choices=[
            ("loyalty", "Loyalty"),
            ("subscription", "Subscription"),
            ("partner", "Partner referral"),
        ],
    )

    def __str__(self):
        vehicle = getattr(self, "vehicle", None)
        if vehicle is not None:
            make = getattr(vehicle, "make", None)
            model = getattr(vehicle, "model", None)
            if make is not None or model is not None:
                vehicle_info = f"{make or ''} {model or ''}".strip()
                if vehicle_info:
                    return f"{self.user.name} - {vehicle_info} - {self.appointment_date}"
        vehicle_info = "No Vehicle"
        return f"{self.user.name} - {vehicle_info} - {self.appointment_date}"

    def save(self, *args, **kwargs):
        """Assign a unique ``APT…`` reference on first save."""
        if not self.booking_reference:
            self.booking_reference = f"APT{int(time.time() * 1000)}{str(uuid.uuid4())[:8].upper()}"
        super().save(*args, **kwargs)


class GuestAccessToken(models.Model):
    """Time-limited hashed token for a guest to view booking photos and job notes.

    Raw token is emailed once; only ``token_hash`` is stored. Tokens are multi-view
    until ``expires_at`` or ``revoked_at``.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(
        BookedAppointment,
        on_delete=models.CASCADE,
        related_name="guest_access_tokens",
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="guest_access_tokens",
    )
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "guest_access_tokens"
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["booking", "revoked_at"],
                name="guest_tok_booking_revoked_idx",
            ),
            models.Index(
                fields=["user", "-created_at"],
                name="guest_tok_user_created_idx",
            ),
        ]

    def is_expired(self):
        """True when ``expires_at`` is in the past."""
        return timezone.now() >= self.expires_at

    def is_revoked(self):
        """True when support or a replacement issue has revoked this token."""
        return self.revoked_at is not None

    def is_valid(self):
        """True when not revoked and not expired. Multiple views are allowed until then."""
        return not self.is_revoked() and not self.is_expired()

    def __str__(self):
        return f"Guest access token for {self.booking.booking_reference}"


class VehicleEvent(models.Model):
    """Garage timeline event (wash, inspection, damage, etc.) for a vehicle."""

    EVENT_TYPE_CHOICES = [
        ('wash', 'Wash'),
        ('inspection', 'Inspection'),
        ('damage', 'Damage Report'),
        ('repair', 'Repair'),
        ('obd_scan', 'OBD Scan'),
        ('service', 'Service'),
    ]
    VISIBILITY_CHOICES = [
        ('public', 'Public'),
        ('private', 'Private'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='events')
    event_type = models.CharField(max_length=20, choices=EVENT_TYPE_CHOICES)
    booking = models.ForeignKey(BookedAppointment, on_delete=models.SET_NULL, null=True, blank=True, related_name='vehicle_events')
    performed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='performed_events')
    metadata = models.JSONField(default=dict, blank=True)
    visibility = models.CharField(max_length=10, choices=VISIBILITY_CHOICES, default='public')
    event_date = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-event_date']
        indexes = [
            models.Index(fields=['vehicle', '-event_date']),
            models.Index(fields=['booking']),
            models.Index(fields=['event_type', '-event_date']),
        ]

    def __str__(self):
        return f"{self.event_type} - {self.vehicle.registration_number} ({self.event_date})"


class BookedAppointmentImage(models.Model):
    """Before/after job photo URL stored against a booking or vehicle event."""

    IMAGE_TYPE_CHOICES = [
        ('before', 'Before'),
        ('after', 'After'),
    ]
    SEGMENT_CHOICES = [
        ('interior', 'Interior'),
        ('exterior', 'Exterior'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(BookedAppointment, on_delete=models.CASCADE, related_name='job_images')
    vehicle_event = models.ForeignKey(VehicleEvent, on_delete=models.SET_NULL, null=True, blank=True, related_name='images')
    image_type = models.CharField(max_length=10, choices=IMAGE_TYPE_CHOICES)
    segment = models.CharField(max_length=10, choices=SEGMENT_CHOICES, null=True, blank=True)
    image_url = models.URLField(max_length=1000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['booking', 'image_type', 'segment']),
            models.Index(fields=['vehicle_event']),
        ]

    def __str__(self):
        return f"{self.image_type} {self.segment or 'unknown'} image for Booking {self.booking.booking_reference}"


class VehicleTransfer(models.Model):
    """Peer-to-peer ownership transfer request between two users."""

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('expired', 'Expired'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='transfers')
    from_owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='outgoing_transfers')
    to_owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='incoming_transfers')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    requested_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-requested_at']
        indexes = [
            models.Index(fields=['vehicle', 'status']),
            models.Index(fields=['from_owner', 'status']),
            models.Index(fields=['to_owner', 'status']),
        ]

    def __str__(self):
        return f"Transfer {self.vehicle.registration_number} from {self.from_owner.name} to {self.to_owner.name} ({self.status})"

    def is_expired(self):
        """True after ``expires_at`` (pending transfers auto-expire in business logic)."""
        return timezone.now() > self.expires_at

    def can_be_approved(self):
        """True when status is pending and the request has not expired."""
        return self.status == 'pending' and not self.is_expired()


class EventDataManagement(models.Model):
    """Digital vehicle health check captured at the end of a completed booking."""
    WIPER_STATUS_CHOICES = [('good', 'Good'), ('needs_work', 'Needs Work'), ('bad', 'Bad')]
    FLUID_LEVEL_CHOICES = [('good', 'Good'), ('low', 'Low'), ('needs_change', 'Needs Change'), ('needs_refill', 'Needs Refill')]
    BATTERY_CONDITION_CHOICES = [('good', 'Good'), ('weak', 'Weak'), ('replace', 'Replace')]
    LIGHT_STATUS_CHOICES = [('working', 'Working'), ('dim', 'Dim'), ('not_working', 'Not Working')]
    INDICATOR_STATUS_CHOICES = [('working', 'Working'), ('not_working', 'Not Working')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.OneToOneField(BookedAppointment, on_delete=models.CASCADE, related_name='eventdatamanagement')
    tire_tread_depth = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    tire_condition = models.TextField(blank=True, null=True)
    wiper_status = models.CharField(max_length=20, choices=WIPER_STATUS_CHOICES, null=True, blank=True)
    oil_level = models.CharField(max_length=20, choices=FLUID_LEVEL_CHOICES, null=True, blank=True)
    coolant_level = models.CharField(max_length=20, choices=FLUID_LEVEL_CHOICES, null=True, blank=True)
    brake_fluid_level = models.CharField(max_length=20, choices=FLUID_LEVEL_CHOICES, null=True, blank=True)
    battery_condition = models.CharField(max_length=20, choices=BATTERY_CONDITION_CHOICES, null=True, blank=True)
    headlights_status = models.CharField(max_length=20, choices=LIGHT_STATUS_CHOICES, null=True, blank=True)
    taillights_status = models.CharField(max_length=20, choices=LIGHT_STATUS_CHOICES, null=True, blank=True)
    indicators_status = models.CharField(max_length=20, choices=INDICATOR_STATUS_CHOICES, null=True, blank=True)
    vehicle_condition_notes = models.TextField(blank=True, null=True)
    damage_report = models.TextField(blank=True, null=True)
    inspected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-inspected_at']
        indexes = [models.Index(fields=['booking']), models.Index(fields=['inspected_at'])]

    def __str__(self):
        return f"Event data management for Booking {self.booking.booking_reference}"


class PaymentTransaction(models.Model):
    """Stripe payment/refund/subscription charge record."""

    TRANSACTION_TYPES = [
        ('payment', 'Payment'),
        ('refund', 'Refund'),
        ('vin_lookup', 'Legacy VIN lookup (deprecated)'),
        ('tip', 'Tip'),
        ('fleet_subscription', 'Fleet Subscription'),
        ('b2c_subscription', 'B2C Subscription'),
        ('reschedule_fee', 'Reschedule Fee'),
        ('gift_voucher', 'Gift Voucher Purchase'),
    ]
    STATUS_CHOICES = [
        ('succeeded', 'Succeeded'),
        ('failed', 'Failed'),
        ('pending', 'Pending'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(BookedAppointment, on_delete=models.CASCADE, related_name='transactions', null=True, blank=True)
    bulk_order = models.ForeignKey('BulkOrder', on_delete=models.CASCADE, related_name='transactions', null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    booking_reference = models.CharField(max_length=255, null=True, blank=True)
    stripe_payment_intent_id = models.CharField(max_length=255, unique=True)
    stripe_refund_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default='eur')
    last_4_digits = models.CharField(max_length=4, null=True, blank=True)
    card_brand = models.CharField(max_length=20, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.transaction_type} - {self.amount} {self.currency} - {self.status}"


class RefundRecord(models.Model):
    """Refund attempt and dispute state for a booking."""

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('succeeded', 'Succeeded'),
        ('failed', 'Failed'),
        ('disputed', 'Disputed'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(BookedAppointment, on_delete=models.CASCADE, related_name='refunds')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    original_transaction = models.ForeignKey(PaymentTransaction, on_delete=models.CASCADE, related_name='refund_attempts')
    requested_amount = models.DecimalField(max_digits=10, decimal_places=2)
    stripe_refund_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    failure_reason = models.TextField(blank=True, null=True)
    admin_notes = models.TextField(blank=True, null=True)
    dispute_resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    dispute_resolved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Refund {self.id} - {self.booking.booking_reference} - {self.status}"


class PendingBooking(models.Model):
    """Holds booking JSON between checkout start and payment confirmation."""

    PAYMENT_STATUS_CHOICES = [
        ('pending', 'Pending Payment'),
        ('processing', 'Processing Payment'),
        ('succeeded', 'Payment Succeeded'),
        ('failed', 'Payment Failed'),
        ('expired', 'Expired'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking_reference = models.CharField(max_length=255, unique=True, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    booking_data = models.JSONField()
    detailer_booking_data = models.JSONField(null=True, blank=True)
    stripe_payment_intent_id = models.CharField(max_length=255, null=True, blank=True)
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='pending')
    expires_at = models.DateTimeField()
    slot_conflict_refunded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['booking_reference']),
            models.Index(fields=['stripe_payment_intent_id']),
            models.Index(fields=['payment_status', 'expires_at']),
        ]

    def __str__(self):
        return f"Pending: {self.booking_reference} - {self.payment_status}"

    def is_expired(self):
        """True when the checkout session passed ``expires_at`` without payment."""
        return timezone.now() > self.expires_at


class BulkOrder(models.Model):
    """Bulk booking order (fleet/partner): multiple vehicles, one date/window, pay now or invoice later."""
    PAYMENT_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('invoice_later', 'Invoice Later'),
        ('succeeded', 'Succeeded'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking_reference = models.CharField(max_length=255, unique=True, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    branch = models.ForeignKey('Branch', on_delete=models.SET_NULL, null=True, blank=True, related_name='bulk_orders')
    fleet = models.ForeignKey('Fleet', on_delete=models.SET_NULL, null=True, blank=True, related_name='bulk_orders')
    address = models.ForeignKey(Address, on_delete=models.SET_NULL, null=True, blank=True)
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='pending')
    stripe_payment_intent_id = models.CharField(max_length=255, null=True, blank=True)
    stripe_invoice_id = models.CharField(max_length=255, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_applied = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    number_of_vehicles = models.PositiveIntegerField(default=0)
    order_data = models.JSONField(default=dict)  # date, window, start_time, end_time, service_type, suggested_team_size, etc.
    assigned_detailers = models.JSONField(default=list, blank=True)  # list of {"id", "name", "rating", "phone", "image"} from job_acceptance
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # Client notifications (dedupe across multiple BookedAppointment rows per bulk order)
    client_confirmation_notifications_sent_at = models.DateTimeField(null=True, blank=True)
    service_reminder_push_sent_at = models.DateTimeField(null=True, blank=True)
    reminder_email_6h_sent_at = models.DateTimeField(null=True, blank=True)
    # App-owned Stripe invoice reminders (invoice.will_be_due / invoice.overdue automations)
    invoice_due_soon_email_sent_at = models.DateTimeField(null=True, blank=True)
    invoice_overdue_email_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['booking_reference']),
            models.Index(fields=['user', 'payment_status']),
            models.Index(fields=['branch']),
            models.Index(fields=['fleet']),
        ]

    def __str__(self):
        return f"BulkOrder {self.booking_reference} - {self.payment_status}"


