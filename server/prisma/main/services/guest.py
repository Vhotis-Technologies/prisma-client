"""
Guest checkout identity: shadow users, hashed results tokens, plate-ownership policy.

Guests are ``User`` rows with ``is_guest=True`` and an unusable password. They reuse
the existing booking / address / vehicle FKs. Results access uses a time-limited
token (SHA-256 hash stored; raw token emailed once).
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta
from typing import Optional

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.utils import timezone

from main.models import Address, EventDataManagement, GuestAccessToken, User, Vehicle, VehicleOwnership

# These simple checks are in place to ensure that the vehicles are not just randomly booked, but
# properly handled and booked where neccessary

PLATE_AVAILABLE = "available"
PLATE_OWNED_BY_THIS_GUEST = "owned_by_this_guest"
PLATE_OWNED_BY_REGISTERED = "owned_by_registered"
PLATE_OWNED_BY_OTHER_GUEST = "owned_by_other_guest"

PLATE_BLOCK_MESSAGES = {
    PLATE_OWNED_BY_REGISTERED: (
        "This vehicle is already on a Prisma account. Sign in to book, "
        "or ask the owner to transfer it to you."
    ),
    PLATE_OWNED_BY_OTHER_GUEST: (
        "This vehicle was recently booked by another guest. "
        "Use the email from that booking, or create an account."
    ),
}


class GuestEmailInUse(Exception):
    """Raised when a guest checkout email already belongs to a registered account."""

    code = "email_registered"

    def __init__(self, email: str):
        """
        Args:
            email: Address that already has a non-guest account.
        """
        self.email = email
        super().__init__(
            "An account already exists for this email. Sign in to book."
        )


class GuestPlateBlocked(Exception):
    """Raised when a registration cannot be used for guest checkout."""

    code = "plate_blocked"

    def __init__(self, message: str, status: str = PLATE_OWNED_BY_REGISTERED):
        """
        Args:
            message: Client-facing reason the plate is blocked.
            status: ``PLATE_*`` code (registered vs other guest).
        """
        self.status = status
        super().__init__(message)


class GuestAlreadyRegistered(Exception):
    """Raised when a claim token belongs to a user who already has a password."""

    code = "already_registered"

    def __init__(self):
        super().__init__("This booking is already on a Prisma account. Sign in instead.")


class GuestPasswordInvalid(Exception):
    """Raised when the claim password does not meet strength rules."""

    code = "validation"


def hash_guest_token(raw_token: str) -> str:
    """
    SHA-256 hex digest of the raw guest access token.

    Only the hash is stored. The raw value is emailed and never persisted.

    Args:
        raw_token: Secret from the results URL.

    Returns:
        str: 64-character hex digest.
    """
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def guest_access_token_expiry_days() -> int:
    """
    Guest results-link lifetime in days.

    Returns:
        int: Days from ``GUEST_ACCESS_TOKEN_EXPIRY_DAYS`` (default 14).
    """
    return int(getattr(settings, "GUEST_ACCESS_TOKEN_EXPIRY_DAYS", 14))


def canonical_guest_country(value: Optional[str]) -> str:
    """
    Normalize country input for Ireland-first guest checkout.

    Args:
        value: Free-text country (``IE``, ``Ireland``, empty, etc.).

    Returns:
        str: ``Ireland`` for IE/empty variants; otherwise the trimmed input.
    """
    v = (value or "").strip()
    if not v:
        return "Ireland"
    low = v.lower()
    if low in ("ie", "ireland", "irl"):
        return "Ireland"
    return v


def sanitize_guest_phone(phone: str) -> str:
    """
    Keep an optional leading plus and digits, capped at ``User.phone`` max_length.

    Args:
        phone: Raw phone from the checkout form.

    Returns:
        str: Compact number, at most 15 characters.
    """
    raw = (phone or "").strip()
    if not raw:
        return ""
    plus = raw.startswith("+")
    digits = "".join(ch for ch in raw if ch.isdigit())
    cleaned = f"+{digits}" if plus else digits
    return cleaned[:15]


def canonical_guest_registration(value: str) -> str:
    """
    Uppercase registration with spaces stripped.

    Args:
        value: Plate as typed by the guest.

    Returns:
        str: Canonical registration, or empty if none.
    """
    return (value or "").strip().upper().replace(" ", "")


def get_or_create_guest_user(*, name: str, email: str, phone: str = "") -> User:
    """
    Return an existing guest user for ``email``, or create one.

    Reuses the same shadow ``User`` on repeat guest checkouts so the vehicle
    and Stripe customer stay attached. Registered (password) accounts are rejected.

    Args:
        name: Display name collected at checkout.
        email: Contact email (unique key).
        phone: Optional phone; sanitised to ``User.phone`` length.

    Returns:
        User: Row with ``is_guest=True`` and an unusable password.

    Raises:
        GuestEmailInUse: email belongs to a registered (non-guest) account.
        ValueError: name or email missing.
    """
    cleaned_email = (email or "").strip().lower()
    cleaned_name = (name or "").strip()
    cleaned_phone = sanitize_guest_phone(phone)
    if not cleaned_email:
        raise ValueError("Email is required")
    if not cleaned_name:
        raise ValueError("Name is required")

    existing = User.objects.filter(email__iexact=cleaned_email).first()
    if existing:
        if not existing.is_guest:
            raise GuestEmailInUse(existing.email)
        updates = []
        if cleaned_name and existing.name != cleaned_name:
            existing.name = cleaned_name
            updates.append("name")
        if cleaned_phone and existing.phone != cleaned_phone:
            existing.phone = cleaned_phone
            updates.append("phone")
        if updates:
            existing.save(update_fields=updates)
        return existing

    return User.objects.create_user(
        email=cleaned_email,
        password=None,
        name=cleaned_name,
        phone=cleaned_phone,
        is_guest=True,
        has_signup_promotions=False,
        allow_marketing_emails=False,
    )


def guest_vehicle_ownership_status(
    registration_number: str,
    country: Optional[str] = None,
    guest_user: Optional[User] = None,
) -> dict:
    """
    Classify whether a plate can be used for guest checkout.

    Lookup (no email yet) treats another guest's plate as bookable so the same
    person can continue with the matching email at pay. Registered owners are blocked.

    Args:
        registration_number: Vehicle plate.
        country: Country for the unique (reg, country) key; defaults to Ireland.
        guest_user: When set, ``owned_by_this_guest`` if this user already owns the plate.

    Returns:
        dict: ``status`` (one of the ``PLATE_*`` constants), ``vehicle``, ``owner``,
        ``message``.
    """
    reg = canonical_guest_registration(registration_number)
    canon_country = canonical_guest_country(country)
    empty = {
        "status": PLATE_AVAILABLE,
        "vehicle": None,
        "owner": None,
        "message": None,
    }
    if not reg:
        return empty

    try:
        vehicle = Vehicle.objects.get(
            registration_number=reg,
            country=canon_country,
        )
    except Vehicle.DoesNotExist:
        return empty

    ownership = vehicle.get_active_ownership()
    if ownership is None:
        return {
            "status": PLATE_AVAILABLE,
            "vehicle": vehicle,
            "owner": None,
            "message": None,
        }

    owner = ownership.owner
    if guest_user is not None and owner.id == guest_user.id:
        return {
            "status": PLATE_OWNED_BY_THIS_GUEST,
            "vehicle": vehicle,
            "owner": owner,
            "message": None,
        }
    if owner.is_guest:
        return {
            "status": PLATE_OWNED_BY_OTHER_GUEST,
            "vehicle": vehicle,
            "owner": owner,
            "message": PLATE_BLOCK_MESSAGES[PLATE_OWNED_BY_OTHER_GUEST],
        }
    return {
        "status": PLATE_OWNED_BY_REGISTERED,
        "vehicle": vehicle,
        "owner": owner,
        "message": PLATE_BLOCK_MESSAGES[PLATE_OWNED_BY_REGISTERED],
    }


def guest_may_book_vehicle(
    registration_number: str,
    country: Optional[str] = None,
    guest_user: Optional[User] = None,
) -> tuple[bool, dict]:
    """
    Whether guest checkout may attach this plate at payment time.

    ``owned_by_other_guest`` is not allowed here: the caller must already be the
    same guest user (email match) so status becomes ``owned_by_this_guest``.

    Args:
        registration_number: Vehicle plate.
        country: Country for the unique (reg, country) key.
        guest_user: Guest being checked out (required for reuse of their plate).

    Returns:
        tuple: ``(allowed, status_dict)`` from ``guest_vehicle_ownership_status``.
    """
    info = guest_vehicle_ownership_status(
        registration_number,
        country=country,
        guest_user=guest_user,
    )
    allowed = info["status"] in (PLATE_AVAILABLE, PLATE_OWNED_BY_THIS_GUEST)
    return allowed, info


def issue_guest_access_token(booking, *, replace_existing: bool = True) -> tuple[GuestAccessToken, str]:
    """
    Create a hashed guest results token. Raw token is returned for email only.

    Confirmation email uses the default (revokes prior tokens so only the emailed
    link works). Photos-ready email uses ``replace_existing=False`` so the
    confirmation link stays valid.

    Args:
        booking: ``BookedAppointment`` to attach the token to.
        replace_existing: When True, revoke other live tokens for this booking.

    Returns:
        tuple: ``(token_row, raw_token)``. Never persist ``raw_token``.
    """
    now = timezone.now()
    with transaction.atomic():
        if replace_existing:
            GuestAccessToken.objects.filter(
                booking=booking,
                revoked_at__isnull=True,
            ).update(revoked_at=now)

        raw_token = secrets.token_urlsafe(32)
        token = GuestAccessToken.objects.create(
            booking=booking,
            user=booking.user,
            token_hash=hash_guest_token(raw_token),
            expires_at=now + timedelta(days=guest_access_token_expiry_days()),
        )
    return token, raw_token


def build_guest_results_url(raw_token: str) -> str:
    """
    Absolute SPA URL for the guest results page.

    Args:
        raw_token: Secret from ``issue_guest_access_token`` (not the stored hash).

    Returns:
        str: ``{CLIENT_WEB_BASE_URL}/guest/b/{token}``.
    """
    from main.utils.legal_urls import guest_results_url

    return guest_results_url(raw_token)


def build_guest_claim_url(raw_token: str) -> str:
    """
    Absolute SPA URL to set a password on this guest user.

    Args:
        raw_token: Same secret as the results link.

    Returns:
        str: ``{CLIENT_WEB_BASE_URL}/guest/claim/{token}``.
    """
    from main.utils.legal_urls import guest_claim_url

    return guest_claim_url(raw_token)


def get_valid_guest_access_token(raw_token: str, *, touch: bool = True) -> Optional[GuestAccessToken]:
    """
    Return a live (unrevoked, unexpired) token row for ``raw_token``, else None.

    Args:
        raw_token: Secret from the results URL query or path.
        touch: When True, update ``last_used_at``. Image proxy passes False so a
            gallery load does not write the database once per photo.

    Returns:
        GuestAccessToken or None.
    """
    if not raw_token:
        return None
    try:
        token = GuestAccessToken.objects.select_related(
            "booking",
            "booking__user",
            "booking__vehicle",
            "booking__address",
            "booking__service_type",
            "booking__valet_type",
            "booking__detailer",
            "user",
        ).get(token_hash=hash_guest_token(raw_token.strip()))
    except GuestAccessToken.DoesNotExist:
        return None
    if not token.is_valid():
        return None
    if touch:
        token.last_used_at = timezone.now()
        token.save(update_fields=["last_used_at"])
    return token


def _booking_health_check(booking) -> Optional[EventDataManagement]:
    """
    Return the health-check row for ``booking``, or None if none was recorded.

    Reverse OneToOne raises ``ObjectDoesNotExist`` when the related row is missing.

    Args:
        booking: ``BookedAppointment``.

    Returns:
        EventDataManagement or None.
    """
    try:
        return booking.eventdatamanagement
    except ObjectDoesNotExist:
        return None


def _guest_photo_items(images, image_type: str, segment: str) -> list[dict]:
    """
    Public photo metadata for one before/after × interior/exterior bucket.

    Image bytes are not inlined: the SPA builds proxy URLs with the raw token.

    Args:
        images: Ordered ``BookedAppointmentImage`` rows for the booking.
        image_type: ``before`` or ``after``.
        segment: ``interior`` or ``exterior`` (missing segment treated as exterior).

    Returns:
        list[dict]: ``id`` and ISO ``created_at`` only.
    """
    return [
        {
            "id": str(img.id),
            "created_at": img.created_at.isoformat() if img.created_at else "",
        }
        for img in images
        if img.image_type == image_type and (img.segment or "exterior") == segment
    ]


def _booking_vehicle_line(booking) -> str:
    """
    Human-readable vehicle label for guest emails and claim preview.

    Args:
        booking: ``BookedAppointment``.

    Returns:
        str: ``Year Make Model · PLATE``, or ``Vehicle`` if none attached.
    """
    vehicle = getattr(booking, "vehicle", None)
    if vehicle is None:
        return "Vehicle"
    line = " ".join(
        str(part)
        for part in (vehicle.year, vehicle.make, vehicle.model)
        if part
    ).strip() or "Vehicle"
    plate = vehicle.registration_number
    if plate:
        return f"{line} · {plate}"
    return line


def serialize_guest_results(token: GuestAccessToken) -> dict:
    """
    Public payload for the guest results page: status, photos, health check.

    Args:
        token: Valid ``GuestAccessToken`` (already checked by the view).

    Returns:
        dict: Booking summary plus photo buckets and optional health-check notes.
            No image URLs — the client appends the raw token to the proxy path.
    """
    booking = token.booking
    address = booking.address
    images = list(booking.job_images.all().order_by("created_at"))
    photo_count = len(images)

    health_row = _booking_health_check(booking)
    health = serialize_guest_health_check(health_row) if health_row is not None else None

    detailer_name = ""
    if booking.detailer and booking.detailer.name:
        detailer_name = booking.detailer.name
    elif isinstance(booking.assigned_detailers, list) and booking.assigned_detailers:
        detailer_name = (booking.assigned_detailers[0] or {}).get("name") or ""

    vehicle_line = _booking_vehicle_line(booking)
    address_line = ""
    if address is not None:
        address_line = ", ".join(
            part for part in (address.address, address.city, address.post_code) if part
        )

    start = booking.start_time
    start_clock = start.strftime("%H:%M") if start else ""

    return {
        "booking_reference": booking.booking_reference,
        "status": booking.status,
        "appointment_date": booking.appointment_date.isoformat() if booking.appointment_date else "",
        "start_time": start_clock,
        "service_name": booking.service_type.name if booking.service_type else "",
        "valet_name": booking.valet_type.name if booking.valet_type else "",
        "vehicle_line": vehicle_line,
        "address_line": address_line,
        "detailer_name": detailer_name,
        "photos_ready": photo_count > 0,
        "photo_count": photo_count,
        "photos": {
            "before_interior": _guest_photo_items(images, "before", "interior"),
            "before_exterior": _guest_photo_items(images, "before", "exterior"),
            "after_interior": _guest_photo_items(images, "after", "interior"),
            "after_exterior": _guest_photo_items(images, "after", "exterior"),
        },
        "health_check_ready": health is not None,
        "health_check": health,
        "link_expires_at": token.expires_at.isoformat() if token.expires_at else None,
        "cancelled": booking.status == "cancelled",
        "can_claim": bool(token.user.is_guest),
    }


_HEALTH_CHECK_FIELDS = (
    ("tire_tread_depth", "Tyre tread depth"),
    ("tire_condition", "Tyre condition"),
    ("wiper_status", "Wipers"),
    ("oil_level", "Oil"),
    ("coolant_level", "Coolant"),
    ("brake_fluid_level", "Brake fluid"),
    ("battery_condition", "Battery"),
    ("headlights_status", "Headlights"),
    ("taillights_status", "Tail lights"),
    ("indicators_status", "Indicators"),
    ("vehicle_condition_notes", "Notes"),
    ("damage_report", "Damage report"),
)


def serialize_guest_health_check(row) -> dict:
    """
    Public health-check notes: labels and display values, no internal ids.

    Empty fields are omitted. Choice fields use Django ``get_<field>_display``.

    Args:
        row: ``EventDataManagement`` for the booking.

    Returns:
        dict: ``items`` (``label`` / ``value``) and ISO ``inspected_at``.
    """
    items = []
    for attr, label in _HEALTH_CHECK_FIELDS:
        value = getattr(row, attr, None)
        if value in (None, ""):
            continue
        display_fn = getattr(row, f"get_{attr}_display", None)
        display = display_fn() if callable(display_fn) else value
        items.append({"label": label, "value": str(display)})
    inspected = getattr(row, "inspected_at", None)
    return {
        "items": items,
        "inspected_at": inspected.isoformat() if inspected else None,
    }


def maybe_notify_guest_results_ready(booking) -> None:
    """
    Email the guest once when job photos or a health check exist.

    Issues a second live token (does not revoke the confirmation-email token).
    ``cache.add`` with a 40-day TTL makes the send idempotent across Redis retries.

    Args:
        booking: ``BookedAppointment`` after ``job_completed`` image/health-check sync.
    """
    user = getattr(booking, "user", None)
    if user is None or not getattr(user, "is_guest", False):
        return
    if not getattr(user, "allow_email_notifications", True):
        return
    has_photos = booking.job_images.exists()
    has_health = _booking_health_check(booking) is not None
    if not has_photos and not has_health:
        return

    from django.core.cache import cache

    key = f"guest_photos_ready_email:{booking.id}"
    if not cache.add(key, 1, timeout=60 * 60 * 24 * 40):
        return

    _row, raw_token = issue_guest_access_token(booking, replace_existing=False)
    from main.tasks.emails.booking import send_guest_photos_ready_email

    send_guest_photos_ready_email.delay(
        user.email,
        user.name or "there",
        booking.booking_reference,
        build_guest_results_url(raw_token),
        guest_access_token_expiry_days(),
        build_guest_claim_url(raw_token),
    )


def revoke_guest_access_token(token: GuestAccessToken) -> None:
    """
    Mark a token revoked so the results link stops working.

    Args:
        token: Row to revoke. No-op if already revoked.
    """
    if token.revoked_at is not None:
        return
    token.revoked_at = timezone.now()
    token.save(update_fields=["revoked_at"])


def guest_booking_support_fields(booking) -> dict:
    """
    Support-desk metadata for guest checkout on a booking.

    Returns:
        dict: ``is_guest``, ``client_user_id``, ``can_claim``, optional ``guest_access``.
    """
    user = getattr(booking, "user", None)
    is_guest = bool(user and getattr(user, "is_guest", False))
    if not is_guest:
        return {
            "is_guest": False,
            "client_user_id": str(user.id) if user else "",
            "can_claim": False,
            "guest_access": None,
        }
    token = (
        GuestAccessToken.objects.filter(booking=booking)
        .order_by("-created_at")
        .first()
    )
    if token:
        if token.is_revoked():
            access_status = "revoked"
        elif token.is_expired():
            access_status = "expired"
        else:
            access_status = "active"
        guest_access = {
            "status": access_status,
            "expires_at": token.expires_at.isoformat() if token.expires_at else None,
            "last_used_at": token.last_used_at.isoformat() if token.last_used_at else None,
        }
    else:
        guest_access = {"status": "none", "expires_at": None, "last_used_at": None}
    return {
        "is_guest": True,
        "client_user_id": str(user.id),
        "can_claim": True,
        "guest_access": guest_access,
    }


def _detailer_name_for_booking(booking) -> str:
    """Best-effort detailer display name for guest confirmation emails."""
    if getattr(booking, "detailer", None) and getattr(booking.detailer, "name", None):
        return booking.detailer.name
    assigned = getattr(booking, "assigned_detailers", None)
    if isinstance(assigned, list) and assigned:
        return (assigned[0] or {}).get("name") or ""
    return ""


def support_resend_guest_portal_email(booking) -> str:
    """
    Staff-triggered resend of the guest results / confirmation email.

    Rotates the guest access token (invalidates prior links) and queues the
  appropriate template.

    Args:
        booking: ``BookedAppointment`` with ``user.is_guest=True``.

    Returns:
        str: ``confirmation`` or ``photos_ready``.

    Raises:
        ValueError: Not a guest booking or email notifications disabled.
    """
    user = getattr(booking, "user", None)
    if user is None or not getattr(user, "is_guest", False):
        raise ValueError("This booking is not for an unclaimed guest account.")
    if not getattr(user, "allow_email_notifications", True):
        raise ValueError("This guest has email notifications disabled.")

    _row, raw_token = issue_guest_access_token(booking, replace_existing=True)
    results_url = build_guest_results_url(raw_token)
    claim_url = build_guest_claim_url(raw_token)
    days = guest_access_token_expiry_days()

    has_photos = booking.job_images.exists()
    has_health = _booking_health_check(booking) is not None
    vehicle = getattr(booking, "vehicle", None)
    vmake = getattr(vehicle, "make", None) or "Vehicle"
    vmodel = getattr(vehicle, "model", None) or "—"
    detailer_name = _detailer_name_for_booking(booking)

    if has_photos or has_health:
        from main.tasks.emails.booking import send_guest_photos_ready_email

        send_guest_photos_ready_email.delay(
            user.email,
            user.name or "there",
            booking.booking_reference,
            results_url,
            days,
            claim_url,
        )
        return "photos_ready"

    from main.tasks.emails.booking import send_booking_confirmation_email

    send_booking_confirmation_email.delay(
        user.email,
        user.name,
        booking.booking_reference,
        vmake,
        vmodel,
        booking.appointment_date,
        booking.start_time,
        booking.service_type.name if booking.service_type else "",
        booking.valet_type.name if booking.valet_type else "",
        booking.total_amount,
        detailer_name,
        guest_results_url=results_url,
        guest_results_expires_days=days,
        guest_claim_url=claim_url,
    )
    return "confirmation"


def validate_guest_password(password: str) -> None:
    """
    Enforce the same strength rules as password reset.

    Args:
        password: Candidate password.

    Raises:
        GuestPasswordInvalid: too short or missing upper/lowercase.
    """
    if not password or len(password) < 8:
        raise GuestPasswordInvalid("Password must be at least 8 characters long")
    if not any(c.islower() for c in password):
        raise GuestPasswordInvalid("Password must contain at least one lowercase letter")
    if not any(c.isupper() for c in password):
        raise GuestPasswordInvalid("Password must contain at least one uppercase letter")


def serialize_guest_claim_preview(token: GuestAccessToken) -> dict:
    """
    Public claim-form payload: email, booking, and whether a password already exists.

    Args:
        token: Valid ``GuestAccessToken``.

    Returns:
        dict: Prefill for ``/guest/claim/:token``. ``already_registered`` is true
        after a successful claim so the form can send them to sign-in.
    """
    user = token.user
    booking = token.booking
    return {
        "email": user.email,
        "name": user.name or "",
        "already_registered": not bool(user.is_guest),
        "booking_reference": booking.booking_reference,
        "vehicle_line": _booking_vehicle_line(booking),
        "link_expires_at": token.expires_at.isoformat() if token.expires_at else None,
    }


def _ensure_claimed_member_benefits(user: User) -> None:
    """
    Create loyalty and welcome-bonus rows skipped while ``is_guest`` was True.

    Same User pk is kept, so garage ownership and bookings are already attached.
    Past guest jobs are not backfilled into loyalty (they paid list price).
    """
    from datetime import datetime

    from main.models import LoyaltyProgram, Promotions

    if user.is_b2c_user() and not LoyaltyProgram.objects.filter(user=user).exists():
        LoyaltyProgram.objects.create(user=user)
    if user.has_signup_promotions and not Promotions.objects.filter(
        user=user, title="Welcome Bonus"
    ).exists():
        valid_until = (datetime.now() + timedelta(days=30)).date()
        Promotions.objects.create(
            user=user,
            title="Welcome Bonus",
            description="Get 10% off your first service!",
            discount_percentage=10,
            valid_until=valid_until,
            is_active=True,
            terms_conditions=(
                f"Valid for 30 days from {datetime.now().strftime('%Y-%m-%d')}. "
                "New customers only. Cannot be combined with other offers."
            ),
        )


def claim_guest_account(
    token: GuestAccessToken,
    password: str,
    *,
    allow_marketing: bool = False,
) -> User:
    """
    Convert the shadow guest ``User`` into a registered account on the same row.

    Sets a usable password and ``is_guest=False``. Bookings, addresses, vehicles,
    and Stripe customer id stay on this user, so garage and history appear after login.

    Does not revoke results tokens: the emailed photos link still works until expiry.
    Refuses if the user is already registered so this cannot reset a member password.

    Args:
        token: Valid guest access token proving ownership of the shadow user.
        password: New password (validated).
        allow_marketing: When True, opt in to marketing emails.

    Returns:
        User: The same row, now a B2C member.

    Raises:
        GuestAlreadyRegistered: ``is_guest`` is already False.
        GuestPasswordInvalid: password fails strength rules.
    """
    user = token.user
    if not user.is_guest:
        raise GuestAlreadyRegistered()
    validate_guest_password(password)

    with transaction.atomic():
        user.set_password(password)
        user.is_guest = False
        user.has_signup_promotions = True
        if allow_marketing:
            user.allow_marketing_emails = True
        if not user.referral_code:
            from main.models import Partner

            while True:
                code = user.create_referral_code()
                if (
                    not User.objects.filter(referral_code=code).exists()
                    and not Partner.objects.filter(referral_code=code).exists()
                ):
                    user.referral_code = code
                    break
        user.save()
        _ensure_claimed_member_benefits(user)
    return user


def sanitize_guest_booking_data(booking_data: dict) -> dict:
    """
    Strip loyalty, complimentary, and bulk flags from guest checkout.

    Winner and gift vouchers are allowed when the guest email matches the
    voucher recipient. Loyalty, partner promos, complimentary washes, and bulk
    booking remain blocked.

    Args:
        booking_data: Checkout payload from the SPA (copied, not mutated).

    Returns:
        dict: Sanitised copy safe to persist on ``PendingBooking``.
    """
    data = dict(booking_data or {})
    data["applied_free_quick_sparkle"] = False
    data["apply_partner_booking_discount"] = False
    data["is_bulk"] = False
    data.pop("complimentary_quick_sparkle_source", None)
    return data


def persist_guest_address(user: User, payload: dict) -> Address:
    """
    Create a one-off service address for a guest checkout.

    Args:
        user: Guest ``User`` (``is_guest=True``).
        payload: Street, city, optional postcode/country/lat/lng from Places.

    Returns:
        Address: New row owned by ``user``.

    Raises:
        ValueError: Street or city missing.
    """
    street = (payload.get("address") or "").strip()
    city = (payload.get("city") or "").strip()
    country = canonical_guest_country(payload.get("country"))
    if not street or not city:
        raise ValueError("Street and city are required.")
    lat = payload.get("latitude")
    lng = payload.get("longitude")
    return Address.objects.create(
        user=user,
        address=street[:255],
        post_code=(payload.get("post_code") or payload.get("postcode") or "").strip()[:10],
        city=city[:100],
        country=country[:100],
        latitude=lat if lat not in (None, "") else None,
        longitude=lng if lng not in (None, "") else None,
    )


def _attach_provider_image_from_lookup(vehicle: Vehicle, blob: dict) -> None:
    """
    Persist RegCheck preview image on ``vehicle`` when the file field is empty.

    Mirrors ``GarageView.add_vehicle`` so guest checkout garage rows show photos after claim.
    """
    if vehicle.image:
        return
    provider_url = blob.get("provider_image_url")
    if not provider_url:
        return
    from django.core.files.base import ContentFile

    from main.services.regcheck_ireland import RegcheckIrelandError, download_provider_image

    reg = blob.get("registration_number") or vehicle.registration_number or "vehicle"
    try:
        raw, ctype = download_provider_image(provider_url)
        ext = "jpg"
        if "png" in (ctype or "").lower():
            ext = "png"
        fname = f"{str(reg).replace('/', '_')}.{ext}"
        vehicle.image.save(fname, ContentFile(raw), save=True)
    except RegcheckIrelandError:
        pass


def persist_guest_vehicle(user: User, lookup_token: str) -> Vehicle:
    """
    Create or reuse a vehicle from a live Ireland lookup token and attach guest ownership.

    Args:
        user: Guest being checked out (must match plate policy).
        lookup_token: Cache key from ``lookup_vehicle`` (TTL-limited).

    Returns:
        Vehicle: Existing or newly created row, with this guest as owner when needed.

    Raises:
        ValueError: lookup expired, missing, or incomplete.
        GuestPlateBlocked: plate belongs to a registered account or another guest.
    """
    from django.core.cache import cache

    from main.views.garage import lookup_cache_key

    token = (lookup_token or "").strip()
    if not token:
        raise ValueError("Vehicle lookup is required.")
    blob = cache.get(lookup_cache_key(token))
    if not blob:
        raise ValueError("Vehicle lookup expired. Look up the registration again.")

    reg = canonical_guest_registration(blob.get("registration_number") or "")
    country = canonical_guest_country(blob.get("country"))
    allowed, info = guest_may_book_vehicle(reg, country, guest_user=user)
    if not allowed:
        raise GuestPlateBlocked(
            info.get("message") or "This vehicle cannot be booked as a guest.",
            status=info.get("status") or PLATE_OWNED_BY_REGISTERED,
        )

    vehicle = info.get("vehicle")
    if vehicle is None:
        year_raw = blob.get("year") or 0
        try:
            year_int = int(year_raw)
        except (TypeError, ValueError):
            year_int = 0
        vehicle = Vehicle(
            registration_number=reg,
            country=country,
            make=(blob.get("make") or "Unknown")[:100],
            model=(blob.get("model") or "Unknown")[:100],
            year=year_int,
            color=(blob.get("color") or "Unknown").strip()[:100] or "Unknown",
            body_style=(blob.get("body_style") or "")[:100] or None,
            owner_count=0,
        )
        vehicle.save()

    if info.get("status") != PLATE_OWNED_BY_THIS_GUEST:
        VehicleOwnership.objects.create(
            vehicle=vehicle,
            owner=user,
            ownership_type="private",
            start_date=timezone.now().date(),
        )
        vehicle.owner_count = (vehicle.owner_count or 0) + 1
        vehicle.save(update_fields=["owner_count", "updated_at"])
    _attach_provider_image_from_lookup(vehicle, blob)
    return vehicle
