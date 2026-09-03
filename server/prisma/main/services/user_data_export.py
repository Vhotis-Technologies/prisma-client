"""
GDPR subject-access export: collect personal/business data and render a PDF.

Used by support to preview, download, or email a customer's data package
for B2C users, fleets, and partners.
"""
from __future__ import annotations

import io
import re
from datetime import date, datetime
from decimal import Decimal
from xml.sax.saxutils import escape

from django.db.models import Q, Sum
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from main.models import (
    Address,
    B2CSubcription,
    B2CSubcriptionBilling,
    BookedAppointment,
    Branch,
    Fleet,
    FleetMember,
    FleetSubscription,
    FleetVehicle,
    LoyaltyProgram,
    Partner,
    PartnerBankAccount,
    PartnerPayoutRequest,
    PaymentTransaction,
    ReferralAttribution,
    RefundRecord,
    User,
    VehicleEvent,
    VehicleOwnership,
    VehicleTransfer,
)

_INVALID_EMAIL_SUFFIX = "@prisma.invalid"
ENTITY_TYPES = frozenset({"b2c", "fleet", "partner"})


def _fmt_dt(dt) -> str:
    if not dt:
        return "—"
    if hasattr(dt, "strftime"):
        return dt.strftime("%d %b %Y %H:%M")
    return str(dt)


def _fmt_date(d) -> str:
    if not d:
        return "—"
    if hasattr(d, "strftime"):
        return d.strftime("%d %b %Y")
    return str(d)


def _fmt_money(amount) -> str:
    if amount is None:
        return "—"
    try:
        return f"€{Decimal(str(amount)).quantize(Decimal('0.01'))}"
    except Exception:
        return str(amount)


def _safe(text) -> str:
    return escape(str(text or ""))


def _json_value(value):
    """Convert dates/decimals for JSON API responses."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return format(value.quantize(Decimal("0.01")), "f")
    if isinstance(value, dict):
        return {k: _json_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_value(v) for v in value]
    return value


def is_mailable_email(email: str) -> bool:
    """True when ``email`` looks like a deliverable address."""
    email = (email or "").strip()
    if not email or email.endswith(_INVALID_EMAIL_SUFFIX):
        return False
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email))


def export_recipient_email(user: User | None, override: str | None = None) -> str:
    """
    Resolve the mailable address for a data-export email.

    Raises:
        ValueError: No override and the account has no valid email.
    """
    override = (override or "").strip()
    if override:
        return override
    email = ((user.email if user else "") or "").strip()
    if not email or email.endswith(_INVALID_EMAIL_SUFFIX):
        raise ValueError(
            "Customer has no mailable email on file. Provide recipient_email."
        )
    return email


def export_pdf_filename(entity_type: str, entity_id: str) -> str:
    """Safe attachment filename for the export PDF."""
    short_id = str(entity_id).split("-")[0]
    return f"prisma_data_export_{entity_type}_{short_id}.pdf"


def _profile_block(user: User) -> dict:
    referred_by = None
    if user.referred_by_id:
        rb = User.objects.filter(pk=user.referred_by_id).values("name", "email").first()
        if rb:
            referred_by = {"name": rb["name"], "email": rb["email"]}
    return {
        "user_id": str(user.id),
        "name": user.name,
        "email": user.email,
        "phone": user.phone or "—",
        "account_status": "inactive" if not user.is_active else "active",
        "is_guest": bool(getattr(user, "is_guest", False)),
        "referral_code": user.referral_code or "—",
        "referred_by": referred_by,
        "allow_marketing_emails": user.allow_marketing_emails,
        "allow_email_notifications": user.allow_email_notifications,
        "allow_push_notifications": user.allow_push_notifications,
        "stripe_customer_id": user.stripe_customer_id or "—",
        "created_at": user.created_at,
        "updated_at": user.updated_at,
    }


def _addresses_for(user: User) -> list[dict]:
    return [
        {
            "address": a.address,
            "city": a.city,
            "post_code": a.post_code,
            "country": a.country,
        }
        for a in Address.objects.filter(user=user).order_by("-id")
    ]


def _vehicles_for_owner(user: User) -> list[dict]:
    vehicles = []
    for vo in (
        VehicleOwnership.objects.filter(owner=user)
        .select_related("vehicle")
        .order_by("-start_date")
    ):
        v = vo.vehicle
        if not v:
            continue
        vehicles.append(
            {
                "registration": v.registration_number,
                "country": v.country,
                "make": v.make,
                "model": v.model,
                "year": v.year,
                "color": v.color,
                "ownership_type": vo.ownership_type,
                "start_date": vo.start_date,
                "end_date": vo.end_date,
            }
        )
    return vehicles


def _bookings_for_user(user: User) -> list[dict]:
    bookings = []
    for b in (
        BookedAppointment.objects.filter(user=user)
        .select_related("service_type", "valet_type", "address", "vehicle")
        .order_by("-appointment_date")
    ):
        addr = b.address
        vehicle = b.vehicle
        bookings.append(
            {
                "reference": b.booking_reference,
                "status": b.status,
                "appointment_date": b.appointment_date,
                "service": getattr(b.service_type, "name", "") or "",
                "valet": getattr(b.valet_type, "name", "") or "",
                "vehicle": (
                    f"{vehicle.registration_number} ({vehicle.make} {vehicle.model})"
                    if vehicle
                    else "—"
                ),
                "address": (
                    f"{addr.address}, {addr.city} {addr.post_code or ''}".strip()
                    if addr
                    else "—"
                ),
                "total": b.total_amount,
                "review_rating": b.review_rating,
                "review_comment": b.review_comment,
                "created_at": b.created_at,
            }
        )
    return bookings


def _payments_for_user(user: User) -> list[dict]:
    return [
        {
            "date": p.created_at,
            "type": p.transaction_type,
            "amount": p.amount,
            "currency": p.currency,
            "status": p.status,
            "reference": p.booking_reference or "—",
            "card": (
                f"{p.card_brand or ''} •••• {p.last_4_digits}".strip()
                if p.last_4_digits
                else "—"
            ),
        }
        for p in PaymentTransaction.objects.filter(user=user).order_by("-created_at")
    ]


def _refunds_for_user(user: User) -> list[dict]:
    return [
        {
            "date": r.created_at,
            "reference": r.booking.booking_reference if r.booking_id else "—",
            "amount": r.requested_amount,
            "status": r.status,
        }
        for r in RefundRecord.objects.filter(user=user)
        .select_related("booking")
        .order_by("-created_at")
    ]


def collect_b2c_data_export(user: User) -> dict:
    """Gather personal data held about a B2C/guest ``user``."""
    referrals = list(
        User.objects.filter(referred_by=user)
        .order_by("-created_at")
        .values("name", "email", "created_at")[:50]
    )

    loyalty = LoyaltyProgram.objects.filter(user=user).first()
    loyalty_row = None
    if loyalty:
        loyalty_row = {
            "tier": loyalty.current_tier,
            "completed_bookings": loyalty.completed_bookings,
            "last_booking_date": loyalty.last_booking_date,
            "updated_at": loyalty.updated_at,
        }

    subscription = (
        B2CSubcription.objects.filter(user=user)
        .select_related("plan", "plan__tier")
        .order_by("-start_date")
        .first()
    )
    subscription_row = None
    billing_rows: list[dict] = []
    if subscription:
        plan = subscription.plan
        tier = getattr(plan, "tier", None) if plan else None
        subscription_row = {
            "tier": getattr(tier, "name", "") or "—",
            "status": subscription.status,
            "billing_cycle": getattr(plan, "billing_cycle", "") or "—",
            "start_date": subscription.start_date,
            "end_date": subscription.end_date,
            "cancellation_date": subscription.cancellation_date,
        }
        billing_rows = [
            {
                "date": row.billing_date,
                "amount": row.amount,
                "status": row.status,
                "transaction_id": row.transaction_id or "—",
            }
            for row in B2CSubcriptionBilling.objects.filter(subscription=subscription).order_by(
                "-billing_date"
            )[:24]
        ]

    transfers = []
    for t in (
        VehicleTransfer.objects.filter(from_owner=user)
        | VehicleTransfer.objects.filter(to_owner=user)
    ).select_related("vehicle").order_by("-requested_at")[:30]:
        direction = "outgoing" if t.from_owner_id == user.id else "incoming"
        transfers.append(
            {
                "direction": direction,
                "vehicle": getattr(t.vehicle, "registration_number", "—"),
                "status": t.status,
                "requested_at": t.requested_at,
                "responded_at": t.responded_at,
            }
        )

    owned_vehicle_ids = list(
        VehicleOwnership.objects.filter(owner=user).values_list("vehicle_id", flat=True)
    )
    events = [
        {
            "date": e.event_date,
            "type": e.event_type,
            "vehicle_id": str(e.vehicle_id) if e.vehicle_id else "—",
            "summary": str(e.metadata or "")[:200],
        }
        for e in VehicleEvent.objects.filter(
            Q(performed_by=user) | Q(vehicle_id__in=owned_vehicle_ids)
        ).order_by("-event_date")[:40]
    ]

    return {
        "entity_type": "b2c",
        "entity_id": str(user.id),
        "generated_at": timezone.now(),
        "title": f"B2C customer — {user.name}",
        "recipient_hint": user.email,
        "profile": _profile_block(user),
        "referrals": referrals,
        "addresses": _addresses_for(user),
        "vehicles": _vehicles_for_owner(user),
        "bookings": _bookings_for_user(user),
        "payments": _payments_for_user(user),
        "refunds": _refunds_for_user(user),
        "loyalty": loyalty_row,
        "subscription": subscription_row,
        "subscription_billing": billing_rows,
        "vehicle_transfers": transfers,
        "vehicle_events": events,
        "fleet": None,
        "partner": None,
    }


def collect_fleet_data_export(fleet: Fleet) -> dict:
    """Gather data held about a fleet account (owner + org + bookings)."""
    owner = fleet.owner
    branches = [
        {
            "name": b.name,
            "city": b.city or "—",
            "address": b.address or "—",
            "post_code": b.postcode or "—",
            "country": b.country or "—",
        }
        for b in Branch.objects.filter(fleet=fleet).order_by("name")
    ]
    admins = [
        {
            "name": m.user.name if m.user else "—",
            "email": m.user.email if m.user else "—",
            "phone": (m.user.phone if m.user else "") or "—",
            "branch": m.branch.name if m.branch else "—",
            "role": m.role,
        }
        for m in FleetMember.objects.filter(fleet=fleet)
        .select_related("user", "branch")
        .order_by("user__name")
    ]
    vehicles = []
    for fv in FleetVehicle.objects.filter(fleet=fleet).select_related("vehicle", "branch"):
        v = fv.vehicle
        if not v:
            continue
        vehicles.append(
            {
                "registration": v.registration_number,
                "country": v.country,
                "make": v.make,
                "model": v.model,
                "year": v.year,
                "color": v.color,
                "branch": fv.branch.name if fv.branch else "—",
                "ownership_type": "fleet",
                "start_date": None,
                "end_date": None,
            }
        )

    v_ids = list(FleetVehicle.objects.filter(fleet=fleet).values_list("vehicle_id", flat=True))
    booking_qs = BookedAppointment.objects.filter(
        Q(bulk_order__fleet=fleet) | Q(vehicle_id__in=v_ids)
    ).distinct()
    bookings = []
    for b in booking_qs.select_related("service_type", "valet_type", "address", "vehicle", "user").order_by(
        "-appointment_date"
    )[:200]:
        vehicle = b.vehicle
        bookings.append(
            {
                "reference": b.booking_reference,
                "status": b.status,
                "appointment_date": b.appointment_date,
                "service": getattr(b.service_type, "name", "") or "",
                "valet": getattr(b.valet_type, "name", "") or "",
                "vehicle": (
                    f"{vehicle.registration_number} ({vehicle.make} {vehicle.model})"
                    if vehicle
                    else "—"
                ),
                "address": "—",
                "total": b.total_amount,
                "booked_by": b.user.email if b.user else "—",
                "created_at": b.created_at,
            }
        )

    owner_payments = _payments_for_user(owner) if owner else []
    sub = (
        FleetSubscription.objects.filter(fleet=fleet)
        .select_related("plan", "plan__tier")
        .order_by("-created_at")
        .first()
    )
    subscription_row = None
    if sub:
        plan = sub.plan
        tier = getattr(plan, "tier", None) if plan else None
        subscription_row = {
            "tier": getattr(tier, "name", "") or "—",
            "status": sub.status,
            "billing_cycle": getattr(plan, "billing_cycle", "") or "—",
            "start_date": sub.start_date,
            "end_date": sub.end_date,
            "cancellation_date": getattr(sub, "cancellation_date", None),
        }

    spend = (
        booking_qs.exclude(status="cancelled").aggregate(s=Sum("total_amount"))["s"]
        or Decimal("0")
    )

    return {
        "entity_type": "fleet",
        "entity_id": str(fleet.id),
        "generated_at": timezone.now(),
        "title": f"Fleet — {fleet.name}",
        "recipient_hint": owner.email if owner else "",
        "profile": _profile_block(owner) if owner else None,
        "fleet": {
            "fleet_id": str(fleet.id),
            "name": fleet.name,
            "owner_name": owner.name if owner else "—",
            "owner_email": owner.email if owner else "—",
            "total_bookings": booking_qs.count(),
            "total_spend": spend,
            "branches": branches,
            "admins": admins,
        },
        "addresses": _addresses_for(owner) if owner else [],
        "vehicles": vehicles,
        "bookings": bookings,
        "payments": owner_payments,
        "refunds": _refunds_for_user(owner) if owner else [],
        "loyalty": None,
        "subscription": subscription_row,
        "subscription_billing": [],
        "vehicle_transfers": [],
        "vehicle_events": [],
        "referrals": [],
        "partner": None,
    }


def collect_partner_data_export(partner: Partner) -> dict:
    """Gather data held about a partner account."""
    user = partner.user
    attrs = ReferralAttribution.objects.filter(partner=partner).select_related("referred_user")
    referrals = [
        {
            "name": a.referred_user.name if a.referred_user else "—",
            "email": a.referred_user.email if a.referred_user else "—",
            "created_at": a.attributed_at,
        }
        for a in attrs.order_by("-attributed_at")[:100]
    ]

    bank = None
    try:
        ba = partner.bank_account
        iban = (ba.iban or "").replace(" ", "")
        bank = {
            "account_holder_name": ba.account_holder_name or "—",
            "iban_masked": ("****" + iban[-4:]) if len(iban) >= 4 else "—",
        }
    except PartnerBankAccount.DoesNotExist:
        bank = None

    payouts = [
        {
            "date": pr.created_at,
            "amount": pr.amount_requested,
            "status": pr.status,
            "reference": str(pr.id).split("-")[0],
        }
        for pr in PartnerPayoutRequest.objects.filter(partner=partner).order_by("-created_at")[:50]
    ]

    return {
        "entity_type": "partner",
        "entity_id": str(partner.id),
        "generated_at": timezone.now(),
        "title": f"Partner — {partner.business_name or (user.name if user else 'Partner')}",
        "recipient_hint": user.email if user else "",
        "profile": _profile_block(user) if user else None,
        "partner": {
            "partner_id": str(partner.id),
            "business_name": partner.business_name or "—",
            "referral_code": partner.referral_code or "—",
            "total_referred": attrs.count(),
            "bank_account": bank,
            "payout_requests": payouts,
        },
        "addresses": _addresses_for(user) if user else [],
        "vehicles": _vehicles_for_owner(user) if user else [],
        "bookings": _bookings_for_user(user) if user else [],
        "payments": _payments_for_user(user) if user else [],
        "refunds": _refunds_for_user(user) if user else [],
        "loyalty": None,
        "subscription": None,
        "subscription_billing": [],
        "vehicle_transfers": [],
        "vehicle_events": [],
        "referrals": referrals,
        "fleet": None,
    }


def resolve_export_entity(entity_type: str, entity_id: str):
    """
    Load the export entity.

    Returns:
        tuple: ``(entity_type, model_instance, recipient_user)``

    Raises:
        ValueError: Invalid type or missing id.
        LookupError: Entity not found.
    """
    entity_type = (entity_type or "").strip().lower()
    entity_id = (entity_id or "").strip()
    if entity_type not in ENTITY_TYPES:
        raise ValueError("entity_type must be b2c, fleet, or partner")
    if not entity_id:
        raise ValueError("entity_id required")

    if entity_type == "b2c":
        try:
            user = User.objects.get(pk=entity_id)
        except User.DoesNotExist as exc:
            raise LookupError("Customer not found") from exc
        if user.is_staff or user.is_superuser:
            raise ValueError("Staff accounts cannot be exported via support")
        return entity_type, user, user

    if entity_type == "fleet":
        try:
            fleet = Fleet.objects.select_related("owner").get(pk=entity_id)
        except Fleet.DoesNotExist as exc:
            raise LookupError("Fleet not found") from exc
        return entity_type, fleet, fleet.owner

    try:
        partner = Partner.objects.select_related("user").get(pk=entity_id)
    except Partner.DoesNotExist as exc:
        raise LookupError("Partner not found") from exc
    return entity_type, partner, partner.user


def collect_entity_data_export(entity_type: str, entity) -> dict:
    """Dispatch collection for a resolved entity instance."""
    if entity_type == "b2c":
        return collect_b2c_data_export(entity)
    if entity_type == "fleet":
        return collect_fleet_data_export(entity)
    return collect_partner_data_export(entity)


def serialize_export_for_api(data: dict) -> dict:
    """JSON-safe copy of an export payload for support preview UI."""
    return _json_value(data)


# Backwards-compatible alias used by older call sites.
collect_user_data_export = collect_b2c_data_export


def build_user_data_pdf(user: User | None = None, export_data: dict | None = None, **_kwargs) -> bytes:
    """
    Render a subject-access PDF.

    Prefer ``export_data`` from ``collect_*``. If only ``user`` is passed, collects B2C data.
    """
    data = export_data
    if data is None:
        if user is None:
            raise ValueError("user or export_data required")
        data = collect_b2c_data_export(user)
    return build_export_pdf(data)


def build_export_pdf(data: dict) -> bytes:
    """Render export ``data`` to an unencrypted PDF."""
    profile = data.get("profile") or {}
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, title=data.get("title") or "Personal Data Export")
    styles = getSampleStyleSheet()
    story: list = []

    story.append(Paragraph("Prisma Car Care — Personal Data Export", styles["Title"]))
    story.append(
        Paragraph(
            "This document contains personal data we hold about you, provided under your "
            "right of access (GDPR Article 15). Financial records may be retained separately "
            "for legal and tax purposes.",
            styles["Normal"],
        )
    )
    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            f"Generated: {_safe(_fmt_dt(data.get('generated_at')))} · "
            f"{_safe(data.get('title') or '')} · "
            f"ID: {_safe(data.get('entity_id') or profile.get('user_id') or '—')}",
            styles["Italic"],
        )
    )
    story.append(Spacer(1, 16))

    def section(title: str, rows: list[list[str]], headers: list[str] | None = None):
        story.append(Paragraph(title, styles["Heading2"]))
        if not rows:
            story.append(Paragraph("No records.", styles["Normal"]))
            story.append(Spacer(1, 12))
            return
        table_data = [headers] + rows if headers else rows
        table = Table(table_data, hAlign="LEFT", repeatRows=1 if headers else 0)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E5E7EB")),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        story.append(table)
        story.append(Spacer(1, 12))

    if profile:
        section(
            "Account profile",
            [
                ["Field", "Value"],
                ["Name", _safe(profile.get("name"))],
                ["Email", _safe(profile.get("email"))],
                ["Phone", _safe(profile.get("phone"))],
                ["Account status", _safe(profile.get("account_status"))],
                ["Guest checkout", "Yes" if profile.get("is_guest") else "No"],
                ["Referral code", _safe(profile.get("referral_code"))],
                ["Stripe customer ID", _safe(profile.get("stripe_customer_id"))],
                ["Account created", _safe(_fmt_dt(profile.get("created_at")))],
            ],
        )

    if data.get("fleet"):
        fl = data["fleet"]
        section(
            "Fleet organisation",
            [
                ["Field", "Value"],
                ["Fleet name", _safe(fl.get("name"))],
                ["Owner", _safe(fl.get("owner_name"))],
                ["Owner email", _safe(fl.get("owner_email"))],
                ["Total bookings", _safe(fl.get("total_bookings"))],
                ["Total spend", _safe(_fmt_money(fl.get("total_spend")))],
            ],
        )
        section(
            "Branches",
            [
                [_safe(b.get("name")), _safe(b.get("city")), _safe(b.get("address")), _safe(b.get("post_code"))]
                for b in fl.get("branches") or []
            ],
            ["Name", "City", "Address", "Postcode"],
        )
        section(
            "Admins",
            [
                [_safe(a.get("name")), _safe(a.get("email")), _safe(a.get("phone")), _safe(a.get("branch"))]
                for a in fl.get("admins") or []
            ],
            ["Name", "Email", "Phone", "Branch"],
        )

    if data.get("partner"):
        pr = data["partner"]
        section(
            "Partner organisation",
            [
                ["Field", "Value"],
                ["Business name", _safe(pr.get("business_name"))],
                ["Referral code", _safe(pr.get("referral_code"))],
                ["Total referred", _safe(pr.get("total_referred"))],
            ],
        )
        bank = pr.get("bank_account")
        if bank:
            section(
                "Bank account",
                [
                    ["Account holder", _safe(bank.get("account_holder_name"))],
                    ["IBAN (masked)", _safe(bank.get("iban_masked"))],
                ],
            )
        section(
            "Payout requests",
            [
                [
                    _safe(_fmt_dt(p.get("date"))),
                    _safe(_fmt_money(p.get("amount"))),
                    _safe(p.get("status")),
                    _safe(p.get("reference")),
                ]
                for p in pr.get("payout_requests") or []
            ],
            ["Date", "Amount", "Status", "Reference"],
        )

    section(
        "Saved addresses",
        [
            [
                _safe(a.get("address")),
                _safe(a.get("city")),
                _safe(a.get("post_code")),
                _safe(a.get("country")),
            ]
            for a in data.get("addresses") or []
        ],
        ["Street", "City", "Postcode", "Country"],
    )

    section(
        "Vehicles",
        [
            [
                _safe(v.get("registration")),
                _safe(v.get("country")),
                _safe(f"{v.get('make')} {v.get('model')} ({v.get('year')})"),
                _safe(v.get("color")),
                _safe(v.get("branch") or v.get("ownership_type")),
            ]
            for v in data.get("vehicles") or []
        ],
        ["Reg", "Country", "Vehicle", "Colour", "Branch/Type"],
    )

    section(
        "Bookings",
        [
            [
                _safe(b.get("reference")),
                _safe(b.get("status")),
                _safe(_fmt_date(b.get("appointment_date"))),
                _safe(b.get("service")),
                _safe(b.get("vehicle")),
                _safe(_fmt_money(b.get("total"))),
            ]
            for b in data.get("bookings") or []
        ],
        ["Reference", "Status", "Date", "Service", "Vehicle", "Total"],
    )

    section(
        "Payment transactions",
        [
            [
                _safe(_fmt_dt(p.get("date"))),
                _safe(p.get("type")),
                _safe(_fmt_money(p.get("amount"))),
                _safe(p.get("status")),
                _safe(p.get("reference")),
            ]
            for p in data.get("payments") or []
        ],
        ["Date", "Type", "Amount", "Status", "Booking ref"],
    )

    if data.get("refunds"):
        section(
            "Refunds",
            [
                [
                    _safe(_fmt_dt(r.get("date"))),
                    _safe(r.get("reference")),
                    _safe(_fmt_money(r.get("amount"))),
                    _safe(r.get("status")),
                ]
                for r in data.get("refunds") or []
            ],
            ["Date", "Booking ref", "Amount", "Status"],
        )

    if data.get("loyalty"):
        ly = data["loyalty"]
        section(
            "Loyalty programme",
            [
                ["Tier", _safe(ly.get("tier"))],
                ["Completed bookings", _safe(ly.get("completed_bookings"))],
                ["Last booking", _safe(_fmt_date(ly.get("last_booking_date")))],
            ],
        )

    if data.get("subscription"):
        sub = data["subscription"]
        section(
            "Subscription",
            [
                ["Plan", _safe(sub.get("tier"))],
                ["Status", _safe(sub.get("status"))],
                ["Billing cycle", _safe(sub.get("billing_cycle"))],
                ["Start", _safe(_fmt_dt(sub.get("start_date")))],
                ["End", _safe(_fmt_dt(sub.get("end_date")))],
            ],
        )

    if data.get("referrals"):
        section(
            "Referrals",
            [
                [_safe(r.get("name")), _safe(r.get("email")), _safe(_fmt_dt(r.get("created_at")))]
                for r in data.get("referrals") or []
            ],
            ["Name", "Email", "Date"],
        )

    story.append(
        Paragraph(
            "If anything in this export is incorrect or you have questions, contact "
            "<link href='mailto:support@prismavalet.com'>support@prismavalet.com</link>.",
            styles["Normal"],
        )
    )

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
