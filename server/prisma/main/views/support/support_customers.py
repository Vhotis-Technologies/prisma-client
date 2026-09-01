"""
B2C, fleet, and partner customer data for the support app.

**Auth:** internal support key (see :mod:`main.views.support.support_permission_access`).

**GET actions** (see ``get_action_handler``): segmented list, B2C/fleet/partner/branch/referral
detail payloads shaped for the React Native screens.

**PATCH actions**: fleet and B2C subscription lifecycle (terminate/renew), remove vehicle/branch,
``vehicle_transfer`` (approve/reject, same rules as web flow), with Stripe or model updates
as implemented per handler.

Responses use stable display dates (``%d %b %Y``) and structured nested entities (vehicles,
addresses, loyalty, etc.).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from decimal import Decimal

import stripe
from django.conf import settings
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from main.models import (
    Address,
    B2CSubcription,
    BookedAppointment,
    Branch,
    Fleet,
    FleetMember,
    FleetSubscription,
    FleetVehicle,
    LoyaltyProgram,
    Partner,
    PartnerBankAccount,
    PartnerMetricsCache,
    PartnerPayoutRequest,
    ReferralAttribution,
    User,
    Vehicle,
    VehicleEvent,
    VehicleOwnership,
    VehicleTransfer,
)
from main.utils.media_helper import get_full_media_url
from main.services.vehicle_transfer_actions import (
    apply_vehicle_transfer_approval,
    apply_vehicle_transfer_rejection,
)
from main.services.booking_quote import (
    get_loyalty_progress_snapshot,
    get_subscription_quick_sparkle_snapshot,
)
from main.utils.support_audit import get_support_actor_email
from main.views.support.support_permission_access import SupportPermissionAccess

logger = logging.getLogger(__name__)

stripe.api_key = getattr(settings, "STRIPE_SECRET_KEY", "") or ""


def _fmt_display_date(d) -> str:
    """Format a date as %d %b %Y for support UI labels; empty string if falsy."""
    if not d:
        return ""
    if hasattr(d, "strftime"):
        return d.strftime("%d %b %Y")
    return str(d)


def _iso(dt) -> str:
    """ISO-8601 string for datetimes; empty string if falsy."""
    if not dt:
        return ""
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


def _float_or_0(v) -> float:
    """Coerce numeric values to float for JSON; return 0.0 on failure."""
    if v is None:
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _vehicle_media_url(vehicle: Vehicle) -> str:
    """Match garage: ImageField.url + get_full_media_url for absolute /client/... URLs."""
    if not vehicle.image:
        return ""
    try:
        raw_url = vehicle.image.url
        if not raw_url:
            return ""
        full = get_full_media_url(raw_url)
        return full if full else ""
    except Exception:
        return ""


def _vehicle_status_for_support(vehicle: Vehicle) -> str:
    """Map to TS Vehicle.status: active | maintenance | inactive."""
    return "active"


def _serialize_vehicle(vehicle: Vehicle, last_service: str | None = None) -> dict:
    """Minimal vehicle card for support lists (make, reg, image, status)."""
    return {
        "id": str(vehicle.id),
        "make": vehicle.make or "",
        "model": vehicle.model or "",
        "year": int(vehicle.year or 0),
        "registration_number": vehicle.registration_number or "",
        "color": vehicle.color or "",
        "image_url": _vehicle_media_url(vehicle),
        "status": _vehicle_status_for_support(vehicle),
        "last_service_date": last_service or "",
    }


def _ownership_timeline_for_support(vehicle: Vehicle) -> list[dict]:
    """Ownership history rows for a vehicle (newest first)."""
    rows = []
    for vo in (
        VehicleOwnership.objects.filter(vehicle=vehicle)
        .select_related("owner")
        .order_by("-start_date", "-created_at")
    ):
        u = vo.owner
        rows.append(
            {
                "id": str(vo.id),
                "owner_id": str(vo.owner_id),
                "owner_name": (u.name if u else "") or "",
                "owner_email": (u.email if u else "") or "",
                "ownership_type": vo.ownership_type or "private",
                "start_date": _fmt_display_date(vo.start_date),
                "end_date": _fmt_display_date(vo.end_date) if vo.end_date else "",
                "is_current": vo.end_date is None,
                "created_at": _iso(vo.created_at),
            }
        )
    return rows


def _vehicle_transfers_for_support(vehicle: Vehicle, limit: int = 25) -> list[dict]:
    """Pending/historical transfer requests with approve/reject flags."""
    out = []
    for t in (
        VehicleTransfer.objects.filter(vehicle=vehicle)
        .select_related("from_owner", "to_owner")
        .order_by("-requested_at")[:limit]
    ):
        can_approve = t.status == "pending" and not t.is_expired()
        out.append(
            {
                "id": str(t.id),
                "status": t.status,
                "from_owner_id": str(t.from_owner_id),
                "from_owner_name": (t.from_owner.name if t.from_owner else "") or "",
                "from_owner_email": (t.from_owner.email if t.from_owner else "") or "",
                "to_owner_id": str(t.to_owner_id),
                "to_owner_name": (t.to_owner.name if t.to_owner else "") or "",
                "to_owner_email": (t.to_owner.email if t.to_owner else "") or "",
                "requested_at": _iso(t.requested_at),
                "responded_at": _iso(t.responded_at),
                "expires_at": _iso(t.expires_at),
                "can_approve": can_approve,
                "can_reject": can_approve,
            }
        )
    return out


def _fleet_links_for_support(vehicle: Vehicle) -> list[dict]:
    """Fleet/branch associations for a vehicle."""
    links = []
    for fv in FleetVehicle.objects.filter(vehicle=vehicle).select_related("fleet", "branch"):
        links.append(
            {
                "fleet_vehicle_id": str(fv.id),
                "fleet_id": str(fv.fleet_id),
                "fleet_name": (fv.fleet.name if fv.fleet else "") or "",
                "branch_id": str(fv.branch_id) if fv.branch_id else "",
                "branch_name": (fv.branch.name if fv.branch else "") or "",
            }
        )
    return links


def _current_owner_for_support(vehicle: Vehicle) -> dict | None:
    """Active owner summary from Vehicle.get_active_ownership."""
    ao = vehicle.get_active_ownership()
    if not ao:
        return None
    u = ao.owner
    if not u:
        return None
    return {
        "ownership_id": str(ao.id),
        "user_id": str(u.id),
        "name": u.name or "",
        "email": u.email or "",
        "ownership_type": ao.ownership_type or "private",
        "start_date": _fmt_display_date(ao.start_date),
    }


def _vehicle_stats_payload_for_support(vehicle: Vehicle) -> dict:
    """
    Same shape as garage ``get_vehicle_stats`` for React Native (stats + latest_inspection).
    Support staff may view any vehicle by id (no ownership check).
    """
    wash_events = VehicleEvent.objects.filter(vehicle=vehicle, event_type="wash").order_by("-event_date")
    total_washes = wash_events.count()

    bookings = BookedAppointment.objects.filter(vehicle=vehicle, status="completed")
    total_amount = 0.0
    for booking in bookings:
        try:
            total_amount += float(booking.total_amount)
        except (TypeError, ValueError):
            pass

    last_cleaned = None
    last_wash_event = wash_events.first()
    if last_wash_event and last_wash_event.event_date:
        last_cleaned = last_wash_event.event_date.date().isoformat()

    next_recommended_service = None
    if last_cleaned:
        last_cleaned_date = datetime.fromisoformat(last_cleaned.replace("Z", "+00:00"))
        next_recommended_service = (last_cleaned_date + timedelta(days=14)).isoformat()
    else:
        next_recommended_service = (datetime.now() + timedelta(days=14)).isoformat()

    image_url = None
    if vehicle.image:
        try:
            raw_url = vehicle.image.url
            if raw_url:
                image_url = get_full_media_url(raw_url)
        except Exception:
            image_url = None

    latest_inspection = None
    try:
        latest_booking = bookings.order_by("-appointment_date").first()
        if latest_booking and hasattr(latest_booking, "eventdatamanagement"):
            from main.serializer import EventDataManagementSerializer

            inspection_data = latest_booking.eventdatamanagement
            inspection_serializer = EventDataManagementSerializer(inspection_data)
            latest_inspection = inspection_serializer.data
            latest_inspection["booking_reference"] = latest_booking.booking_reference
            if latest_booking.appointment_date:
                latest_inspection["appointment_date"] = latest_booking.appointment_date.isoformat()
    except Exception:
        latest_inspection = None

    return {
        "vehicle": {
            "id": str(vehicle.id),
            "make": vehicle.make,
            "model": vehicle.model,
            "year": vehicle.year,
            "color": vehicle.color,
            "registration_number": vehicle.registration_number,
            "licence": vehicle.registration_number,
            "country": vehicle.country,
            "image": image_url,
            "owner_count": int(vehicle.owner_count or 0),
        },
        "total_bookings": total_washes,
        "total_amount": float(total_amount),
        "last_cleaned": last_cleaned,
        "next_recommended_service": next_recommended_service,
        "latest_inspection": latest_inspection,
        "ownership_timeline": _ownership_timeline_for_support(vehicle),
        "vehicle_transfers": _vehicle_transfers_for_support(vehicle),
        "fleet_links": _fleet_links_for_support(vehicle),
        "current_owner": _current_owner_for_support(vehicle),
    }


def _user_primary_address(user: User) -> Address | None:
    """First saved address for a user, if any."""
    return Address.objects.filter(user=user).first()


def _support_subscription_status(db_status: str) -> str:
    """Map DB subscription status to the support desk pill (do not paint pending/trial as Active)."""
    if db_status in ("cancelled",):
        return "terminated"
    if db_status in ("expired", "trialing", "pending", "past_due", "active"):
        return db_status
    return db_status or "expired"


def _latest_b2c_subscription(user: User) -> B2CSubcription | None:
    """Most recent B2C subscription row for a user (by start_date)."""
    # B2CSubcription has no created_at; start_date is the best proxy for "most recent" row.
    return (
        B2CSubcription.objects.filter(user=user)
        .select_related("plan", "plan__tier")
        .order_by("-start_date", "-id")
        .first()
    )


def _serialize_b2c_subscription(sub: B2CSubcription | None, *, sync_from_stripe: bool = False) -> dict:
    """Support payload shape matches :func:`_serialize_fleet_subscription` (no consumer trials in model)."""
    if not sub:
        return {
            "subtype": "No plan",
            "billing_type": "monthly",
            "started_at": "",
            "ends_at": "",
            "is_trial": False,
            "status": "expired",
        }
    plan = sub.plan
    tier = plan.tier if plan else None
    subtype = (tier.name if tier else "") or "Plan"
    billing = (plan.billing_cycle if plan else "monthly") or "monthly"
    if billing not in ("monthly", "yearly"):
        billing = "monthly"
    from main.utils.subscription_sync import latest_paid_billing_at, sync_local_subscription_from_stripe

    stripe_snap = sync_local_subscription_from_stripe(sub) if sync_from_stripe else {}
    last_paid = latest_paid_billing_at(sub)
    out_status = _support_subscription_status(sub.status)
    terminated_at = _iso(sub.cancellation_date) if sub.cancellation_date else None
    is_trial = bool(stripe_snap.get("is_trialing")) if stripe_snap else False
    return {
        "subtype": subtype,
        "billing_type": billing,
        "started_at": _iso(sub.start_date),
        "ends_at": _iso(sub.end_date),
        "is_trial": is_trial,
        "trial_ends_at": None,
        "last_paid_at": _iso(last_paid) if last_paid else None,
        "status": out_status,
        "terminated_at": terminated_at if out_status == "terminated" else None,
    }


def _serialize_fleet_subscription(
    sub: FleetSubscription | None,
    *,
    sync_from_stripe: bool = False,
) -> dict:
    """Fleet subscription block for support customer payloads."""
    if not sub:
        return {
            "subtype": "No plan",
            "billing_type": "monthly",
            "started_at": "",
            "ends_at": "",
            "is_trial": False,
            "status": "expired",
        }
    plan = sub.plan
    tier = plan.tier if plan else None
    subtype = (tier.name if tier else "") or (plan.name if plan else "Plan")
    billing = (plan.billing_cycle if plan else "monthly") or "monthly"
    if billing not in ("monthly", "yearly"):
        billing = "monthly"
    from main.utils.subscription_sync import latest_paid_billing_at, sync_local_subscription_from_stripe

    stripe_snap = sync_local_subscription_from_stripe(sub) if sync_from_stripe else {}
    last_paid = latest_paid_billing_at(sub)
    is_trial = bool(stripe_snap.get("is_trialing") or sub.status == "trialing")
    trial_ends = _iso(sub.trial_end_date) if sub.trial_end_date else None
    out_status = _support_subscription_status(sub.status)
    terminated_at = _iso(sub.cancellation_date) if sub.cancellation_date else None
    return {
        "subtype": subtype,
        "billing_type": billing,
        "started_at": _iso(sub.start_date),
        "ends_at": _iso(sub.end_date),
        "is_trial": is_trial,
        "trial_ends_at": trial_ends,
        "last_paid_at": _iso(last_paid) if last_paid else None,
        "status": out_status,
        "terminated_at": terminated_at if out_status == "terminated" else None,
    }


def _b2c_user_query():
    """End-user accounts: not linked as partner, not fleet/branch ops, not staff."""
    partner_user_ids = Partner.objects.values_list("user_id", flat=True)
    return (
        User.objects.exclude(id__in=partner_user_ids)
        .filter(is_fleet_owner=False, is_branch_admin=False, is_staff=False)
        .order_by("-created_at")[:400]
    )


def _guest_user_query():
    """Unclaimed guest checkout accounts (shadow users with ``is_guest=True``)."""
    partner_user_ids = Partner.objects.values_list("user_id", flat=True)
    return (
        User.objects.exclude(id__in=partner_user_ids)
        .filter(
            is_guest=True,
            is_fleet_owner=False,
            is_branch_admin=False,
            is_staff=False,
        )
        .order_by("-created_at")[:400]
    )


def _b2c_account_fields(user: User) -> dict:
    """Guest vs member flags for support customer payloads."""
    is_guest = bool(getattr(user, "is_guest", False))
    return {
        "is_guest": is_guest,
        "account_status": "guest" if is_guest else "member",
        "can_claim": is_guest,
    }


def _b2c_booking_stats(user: User) -> tuple[int, Decimal, int, int, str | None]:
    """Return (total, spend, completed, cancelled, last_booking_date) for a B2C user."""
    qs = BookedAppointment.objects.filter(user=user)
    total = qs.count()
    spend = (
        qs.exclude(status="cancelled").aggregate(s=Sum("total_amount"))["s"] or Decimal("0")
    )
    completed = qs.filter(status="completed").count()
    cancelled = qs.filter(status="cancelled").count()
    last = qs.order_by("-appointment_date").values_list("appointment_date", flat=True).first()
    last_s = _fmt_display_date(last) if last else None
    return total, spend, completed, cancelled, last_s


def _serialize_b2c_list_item(user: User) -> dict:
    """B2C row in segmented customer list."""
    loyalty = LoyaltyProgram.objects.filter(user=user).first()
    raw_tier = (loyalty.current_tier or "bronze") if loyalty else ""
    tier = raw_tier.title() if raw_tier else "Bronze"
    total_bookings, total_spend, _, _, _ = _b2c_booking_stats(user)
    b2c_sub = _latest_b2c_subscription(user)
    return {
        "id": str(user.id),
        "type": "b2c",
        "name": user.name or "",
        "contact": {
            "email": user.email or "",
            "phone": user.phone or "",
        },
        **_b2c_account_fields(user),
        "loyalty_tier": tier,
        "total_spend": _float_or_0(total_spend),
        "total_bookings": total_bookings,
        "subscription": _serialize_b2c_subscription(b2c_sub),
    }


def _last_service_dates_for_user(user: User) -> dict[str, str]:
    """Best-effort last completed appointment date per vehicle id for this user."""
    out: dict[str, str] = {}
    rows = (
        BookedAppointment.objects.filter(user=user, status="completed", vehicle__isnull=False)
        .order_by("-appointment_date")
        .values("vehicle_id", "appointment_date")
    )
    for row in rows:
        vid = str(row["vehicle_id"])
        if vid not in out:
            out[vid] = _fmt_display_date(row["appointment_date"])
    return out


def _vehicles_for_user(user: User) -> list[dict]:
    """Active VehicleOwnership rows for support serialization (B2C, partner account, etc.)."""
    vehicles_out = []
    last_map = _last_service_dates_for_user(user)
    for vo in (
        VehicleOwnership.objects.filter(owner=user, end_date__isnull=True)
        .select_related("vehicle")
        .order_by("-start_date")
    ):
        v = vo.vehicle
        if v:
            vid = str(v.id)
            vehicles_out.append(_serialize_vehicle(v, last_map.get(vid)))
    return vehicles_out


def _serialize_b2c_detail(user: User) -> dict:
    """Full B2C customer detail including vehicles, loyalty, subscription perks."""
    base = _serialize_b2c_list_item(user)
    addr = _user_primary_address(user)
    total_bookings, total_spend, completed, cancelled, last_booking = _b2c_booking_stats(user)
    avg = (
        _float_or_0(total_spend) / completed if completed else 0.0
    )
    vehicles_out = _vehicles_for_user(user)
    b2c_sub = _latest_b2c_subscription(user)
    return {
        **base,
        "subscription": _serialize_b2c_subscription(b2c_sub, sync_from_stripe=True),
        "address": {
            "address": addr.address if addr else "",
            "city": addr.city if addr else "",
            "postcode": addr.post_code if addr else "",
            "country": addr.country if addr else "",
            "latitude": float(addr.latitude) if addr and addr.latitude is not None else 0.0,
            "longitude": float(addr.longitude) if addr and addr.longitude is not None else 0.0,
        },
        "no_of_vehicles": len(vehicles_out),
        "vehicles": vehicles_out,
        "last_booking_date": last_booking or "",
        "average_booking_value": round(avg, 2),
        "completed_bookings": completed,
        "cancelled_bookings": cancelled,
        "preferred_services": [],
        "notes": "",
        "loyalty": get_loyalty_progress_snapshot(user),
        "subscription_complimentary": get_subscription_quick_sparkle_snapshot(user),
    }


def _fleet_booking_aggregate(fleet: Fleet) -> tuple[int, Decimal]:
    """Booking count and spend across fleet vehicles and bulk orders."""
    v_ids = list(FleetVehicle.objects.filter(fleet=fleet).values_list("vehicle_id", flat=True))
    qs = BookedAppointment.objects.filter(
        Q(bulk_order__fleet=fleet) | Q(vehicle_id__in=v_ids)
    ).distinct()
    total = qs.count()
    spend = (
        qs.exclude(status="cancelled").aggregate(s=Sum("total_amount"))["s"] or Decimal("0")
    )
    return total, spend


def _serialize_fleet_list_item(fleet: Fleet) -> dict:
    """Fleet row in segmented customer list."""
    sub = (
        FleetSubscription.objects.filter(fleet=fleet)
        .select_related("plan", "plan__tier")
        .order_by("-created_at")
        .first()
    )
    branches = fleet.branches.count()
    admins = FleetMember.objects.filter(fleet=fleet, role="admin").count()
    vehicles = FleetVehicle.objects.filter(fleet=fleet).count()
    owner = fleet.owner
    return {
        "id": str(fleet.id),
        "type": "fleet",
        "name": fleet.name or "",
        "contact": {
            "email": owner.email if owner else "",
            "phone": (owner.phone if owner else "") or "",
        },
        "fleet_owner": owner.name if owner else "",
        "no_of_branches": branches,
        "no_of_admins": admins,
        "total_vehicles": vehicles,
        "subscription": _serialize_fleet_subscription(sub),
    }


def _branch_counts(branch: Branch) -> tuple[int, int, int]:
    """Return (vehicles, bookings, admins) counts for a branch."""
    vehicle_count = FleetVehicle.objects.filter(branch=branch).count()
    v_ids = FleetVehicle.objects.filter(branch=branch).values_list("vehicle_id", flat=True)
    booking_count = BookedAppointment.objects.filter(vehicle_id__in=v_ids).count()
    admin_count = FleetMember.objects.filter(branch=branch, role="admin").count()
    return vehicle_count, booking_count, admin_count


def _serialize_branch_summary(branch: Branch) -> dict:
    """Branch summary card for fleet detail screen."""
    vc, bc, ac = _branch_counts(branch)
    return {
        "id": str(branch.id),
        "name": branch.name or "",
        "city": branch.city or "",
        "vehicle_count": vc,
        "booking_count": bc,
        "admin_count": ac,
    }


def _serialize_fleet_detail(fleet: Fleet) -> dict:
    """Full fleet customer detail with branches and admins."""
    base = _serialize_fleet_list_item(fleet)
    total_bookings, total_spend = _fleet_booking_aggregate(fleet)
    owner = fleet.owner
    sub = (
        FleetSubscription.objects.filter(fleet=fleet)
        .select_related("plan", "plan__tier")
        .order_by("-created_at")
        .first()
    )
    branches = [_serialize_branch_summary(b) for b in fleet.branches.all().order_by("name")]
    admins = []
    for m in (
        FleetMember.objects.filter(fleet=fleet, role="admin")
        .select_related("user", "branch")
        .order_by("user__last_name")
    ):
        u = m.user
        admins.append(
            {
                "id": str(u.id),
                "name": u.name or "",
                "email": u.email or "",
                "phone": u.phone or "",
                "branch_name": m.branch.name if m.branch else "",
            }
        )
    return {
        **base,
        "subscription": _serialize_fleet_subscription(sub, sync_from_stripe=True),
        "total_spend": _float_or_0(total_spend),
        "total_bookings": total_bookings,
        "referral_code": (owner.referral_code if owner else "") or "",
        "branches": branches,
        "admins": admins,
    }


def _partner_metrics_cache(partner: Partner) -> PartnerMetricsCache | None:
    """Fetch cached partner metrics row if present."""
    return PartnerMetricsCache.objects.filter(partner=partner).first()


def _serialize_partner_list_item(partner: Partner) -> dict:
    """Partner row in segmented customer list."""
    u = partner.user
    referred = ReferralAttribution.objects.filter(partner=partner).count()
    cache = _partner_metrics_cache(partner)
    total_ref = max(referred, cache.total_referred_users if cache else 0)
    if cache:
        total_ref = cache.total_referred_users or referred
    return {
        "id": str(partner.id),
        "type": "partner",
        "name": u.name if u else partner.business_name,
        "contact": {
            "email": u.email if u else "",
            "phone": (u.phone if u else "") or "",
        },
        "business_name": partner.business_name or "",
        "referral_code": partner.referral_code or "",
        "total_referred": int(total_ref),
    }


def _partner_referred_metrics(partner: Partner) -> dict:
    """Aggregate referral/booking/revenue stats for partner detail."""
    attrs = ReferralAttribution.objects.filter(partner=partner).select_related("referred_user")
    total = attrs.count()
    active = attrs.filter(referred_user__is_active=True).count()
    churned = max(0, total - active)
    cache = _partner_metrics_cache(partner)
    conversion = 0.0
    if total > 0:
        conversion = round(active / total, 4)
    rev_total = _float_or_0(cache.total_revenue_from_referrals if cache else 0)
    commission_total = _float_or_0(cache.total_commission_earned if cache else 0)
    commission_pending = _float_or_0(cache.pending_commission if cache else 0)
    vehicles_reg = (
        VehicleOwnership.objects.filter(
            owner_id__in=attrs.values_list("referred_user_id", flat=True),
            end_date__isnull=True,
        )
        .values("vehicle")
        .distinct()
        .count()
    )
    bookings_qs = BookedAppointment.objects.filter(
        user_id__in=attrs.values_list("referred_user_id", flat=True)
    )
    total_bookings = bookings_qs.count()
    completed = bookings_qs.filter(status="completed").count()
    cancelled = bookings_qs.filter(status="cancelled").count()
    u = partner.user
    last_booking = (
        bookings_qs.order_by("-appointment_date")
        .values_list("appointment_date", flat=True)
        .first()
    )
    return {
        "total_referred": total,
        "active_referred": active,
        "churned_referred": churned,
        "conversion_rate": conversion,
        "vehicles_registered": vehicles_reg,
        "total_bookings": total_bookings,
        "completed_bookings": completed,
        "cancelled_bookings": cancelled,
        "revenue_total": rev_total,
        "revenue_this_month": 0.0,
        "commission_total_earned": commission_total,
        "commission_pending": commission_pending,
        "commission_paid": 0.0,
        "total_spend": rev_total,
        "last_booking_date": _fmt_display_date(last_booking) if last_booking else "",
        "contact": {
            "email": u.email if u else "",
            "phone": (u.phone if u else "") or "",
        },
    }


def _mask_iban(value: str | None) -> str:
    """Mask IBAN for display: show only last 4 chars."""
    if not value or len(value) < 4:
        return value or ""
    clean = (value or "").replace(" ", "")
    return "****" + clean[-4:]


def _serialize_bank_account_summary(partner: Partner) -> dict:
    """Return masked bank account info for support display."""
    try:
        bank = partner.bank_account
        return {
            "has_bank_account": True,
            "account_holder_name": bank.account_holder_name or "",
            "iban_masked": _mask_iban(bank.iban),
        }
    except PartnerBankAccount.DoesNotExist:
        return {"has_bank_account": False}


def _serialize_payout_request(pr: PartnerPayoutRequest) -> dict:
    """Serialize a payout request for support display."""
    return {
        "id": str(pr.id),
        "amount_requested": float(pr.amount_requested),
        "status": pr.status,
        "requested_at": _iso(pr.requested_at),
        "requested_at_display": _fmt_display_date(pr.requested_at),
        "paid_at": _iso(pr.paid_at),
        "paid_at_display": _fmt_display_date(pr.paid_at),
        "admin_notes": pr.admin_notes or "",
    }


def _serialize_partner_detail(partner: Partner) -> dict:
    """Full partner detail including payouts and referred metrics."""
    base = _serialize_partner_list_item(partner)
    m = _partner_referred_metrics(partner)
    u = partner.user
    addr = _user_primary_address(u) if u else None
    partner_vehicles = _vehicles_for_user(u) if u else []

    payout_requests = PartnerPayoutRequest.objects.filter(partner=partner).order_by("-requested_at")[:20]
    open_payout_total = sum(
        float(pr.amount_requested)
        for pr in payout_requests
        if pr.status in ("pending", "processing")
    )

    return {
        **base,
        "user_id": str(u.id) if u else "",
        "vehicles": partner_vehicles,
        "address": {
            "address": partner.business_address or (addr.address if addr else ""),
            "city": partner.business_city or (addr.city if addr else ""),
            "postcode": partner.business_postcode or (addr.post_code if addr else ""),
            "country": partner.business_country or (addr.country if addr else ""),
            "latitude": _float_or_0(partner.business_latitude or (addr.latitude if addr else 0)),
            "longitude": _float_or_0(partner.business_longitude or (addr.longitude if addr else 0)),
        },
        "total_spend": m["total_spend"],
        "last_booking_date": m["last_booking_date"],
        "active_referred": m["active_referred"],
        "churned_referred": m["churned_referred"],
        "conversion_rate": m["conversion_rate"],
        "vehicles_registered": m["vehicles_registered"],
        "total_bookings": m["total_bookings"],
        "completed_bookings": m["completed_bookings"],
        "cancelled_bookings": m["cancelled_bookings"],
        "revenue_total": m["revenue_total"],
        "revenue_this_month": m["revenue_this_month"],
        "commission_total_earned": m["commission_total_earned"],
        "commission_pending": m["commission_pending"],
        "commission_paid": m["commission_paid"],
        "bank_account_summary": _serialize_bank_account_summary(partner),
        "payout_requests": [_serialize_payout_request(pr) for pr in payout_requests],
        "open_payout_total": open_payout_total,
    }


def _serialize_referred_user_detail(attr: ReferralAttribution) -> dict:
    """B2C detail shape for one referred user under a partner."""
    user = attr.referred_user
    detail = _serialize_b2c_detail(user)
    detail["partner_id"] = str(attr.partner_id)
    detail["joined_at"] = _iso(attr.attributed_at)
    detail["last_active_date"] = _fmt_display_date(timezone.now().date())
    if user.is_active:
        detail["referred_status"] = "active"
    else:
        detail["referred_status"] = "churned"
    return detail


def _serialize_fleet_branch_detail(fleet: Fleet, branch: Branch) -> dict | None:
    """Branch drill-down payload for support fleet UI."""
    if branch.fleet_id != fleet.id:
        return None
    summary = _serialize_branch_summary(branch)
    vc, bc, ac = _branch_counts(branch)
    admin = FleetMember.objects.filter(branch=branch, role="admin").select_related("user").first()
    mgr_name = admin.user.name if admin and admin.user else ""
    mgr_email = admin.user.email if admin and admin.user else ""
    mgr_phone = (admin.user.phone if admin and admin.user else "") or ""
    v_ids = FleetVehicle.objects.filter(branch=branch).values_list("vehicle_id", flat=True)
    spend_m = (
        BookedAppointment.objects.filter(vehicle_id__in=v_ids)
        .exclude(status="cancelled")
        .aggregate(s=Sum("total_amount"))["s"]
        or Decimal("0")
    )
    booking_den = bc if bc else 1
    completed = BookedAppointment.objects.filter(
        vehicle_id__in=v_ids, status="completed"
    ).count()
    completion_rate = round(completed / booking_den, 4)
    vehicles = []
    for fv in FleetVehicle.objects.filter(branch=branch).select_related("vehicle"):
        if fv.vehicle:
            vehicles.append(_serialize_vehicle(fv.vehicle, ""))
    lat = float(branch.latitude) if branch.latitude is not None else 0.0
    lon = float(branch.longitude) if branch.longitude is not None else 0.0
    limit = branch.spend_limit or Decimal("0")
    return {
        **summary,
        "fleet_id": str(fleet.id),
        "manager_name": mgr_name,
        "manager_email": mgr_email,
        "manager_phone": mgr_phone,
        "address": {
            "address": branch.address or "",
            "city": branch.city or "",
            "postcode": branch.postcode or "",
            "country": branch.country or "",
            "latitude": lat,
            "longitude": lon,
        },
        "spend_limit": _float_or_0(limit),
        "spent_this_month": _float_or_0(spend_m),
        "average_booking_value": _float_or_0(spend_m) / booking_den if bc else 0.0,
        "completion_rate": completion_rate,
        "vehicles": vehicles,
    }


class SupportCustomersView(APIView):
    """
    Action-routed GET/PATCH API; each ``action`` URL segment maps to a private ``_get_*`` / ``_patch_*`` method.
    """

    permission_classes = [SupportPermissionAccess]

    get_action_handler = {
        "get_customers_list": "_get_customers_list",
        "get_b2c_detail": "_get_b2c_detail",
        "get_fleet_detail": "_get_fleet_detail",
        "get_partner_detail": "_get_partner_detail",
        "get_fleet_branch_detail": "_get_fleet_branch_detail",
        "get_partner_referred_users": "_get_partner_referred_users",
        "get_vehicle_detail": "_get_vehicle_detail",
    }
    patch_action_handler = {
        "terminate_fleet_subscription": "_patch_terminate_fleet_subscription",
        "renew_fleet_subscription": "_patch_renew_fleet_subscription",
        "terminate_b2c_subscription": "_patch_terminate_b2c_subscription",
        "renew_b2c_subscription": "_patch_renew_b2c_subscription",
        "remove_vehicle": "_patch_remove_vehicle",
        "remove_branch": "_patch_remove_branch",
        "vehicle_transfer": "_patch_vehicle_transfer",
    }
    post_action_handler = {
        "delete_user_account": "_post_delete_user_account",
    }

    def get(self, request, *args, **kwargs):
        """Dispatch GET by URL action name to the matching _get_* handler."""
        action = kwargs.get("action")
        if action not in self.get_action_handler:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.get_action_handler[action])
        return handler(request, **kwargs)

    def patch(self, request, *args, **kwargs):
        """Dispatch PATCH by URL action name to the matching _patch_* handler."""
        action = kwargs.get("action")
        if action not in self.patch_action_handler:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.patch_action_handler[action])
        return handler(request, **kwargs)

    def post(self, request, *args, **kwargs):
        """Dispatch POST by URL action name to the matching _post_* handler."""
        action = kwargs.get("action")
        if action not in self.post_action_handler:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.post_action_handler[action])
        return handler(request, **kwargs)

    def _get_customers_list(self, request, **kwargs):
        """List customers for segment b2c, fleet, or partner (query param segment)."""
        segment = (request.query_params.get("segment") or "b2c").strip().lower()
        if segment == "b2c":
            qs_list = list(_b2c_user_query())
            customers = [_serialize_b2c_list_item(u) for u in qs_list]
        elif segment == "guests":
            qs_list = list(_guest_user_query())
            customers = [_serialize_b2c_list_item(u) for u in qs_list]
        elif segment in ("fleets", "fleet"):
            fleets = Fleet.objects.select_related("owner").order_by("-created_at")[:300]
            customers = [_serialize_fleet_list_item(f) for f in fleets]
        elif segment in ("partners", "partner"):
            partners = Partner.objects.select_related("user").order_by("-created_at")[:200]
            customers = [_serialize_partner_list_item(p) for p in partners]
        else:
            return Response({"error": "Invalid segment"}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"data": {"customers": customers}}, status=status.HTTP_200_OK)

    def _get_b2c_detail(self, request, **kwargs):
        """B2C customer detail by customer_id query param."""
        cid = request.query_params.get("customer_id")
        if not cid:
            return Response({"error": "customer_id required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(pk=cid)
        except User.DoesNotExist:
            return Response({"error": "Customer not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"data": {"customer": _serialize_b2c_detail(user)}})

    def _get_fleet_detail(self, request, **kwargs):
        """Fleet customer detail by customer_id (fleet pk)."""
        cid = request.query_params.get("customer_id")
        if not cid:
            return Response({"error": "customer_id required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            fleet = Fleet.objects.select_related("owner").get(pk=cid)
        except Fleet.DoesNotExist:
            return Response({"error": "Fleet not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"data": {"customer": _serialize_fleet_detail(fleet)}})

    def _get_partner_detail(self, request, **kwargs):
        """Partner customer detail by customer_id (partner pk)."""
        cid = request.query_params.get("customer_id")
        if not cid:
            return Response({"error": "customer_id required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            partner = Partner.objects.select_related("user").get(pk=cid)
        except Partner.DoesNotExist:
            return Response({"error": "Partner not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"data": {"customer": _serialize_partner_detail(partner)}})

    def _get_fleet_branch_detail(self, request, **kwargs):
        """Branch drill-down; requires fleet_id and branch_id."""
        fleet_id = request.query_params.get("fleet_id")
        branch_id = request.query_params.get("branch_id")
        if not fleet_id or not branch_id:
            return Response(
                {"error": "fleet_id and branch_id required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            fleet = Fleet.objects.get(pk=fleet_id)
            branch = Branch.objects.get(pk=branch_id, fleet=fleet)
        except (Fleet.DoesNotExist, Branch.DoesNotExist):
            return Response({"error": "Branch not found"}, status=status.HTTP_404_NOT_FOUND)
        payload = _serialize_fleet_branch_detail(fleet, branch)
        if payload is None:
            return Response({"error": "Branch not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"data": {"branch": payload}})

    def _get_vehicle_detail(self, request, **kwargs):
        """Garage-style vehicle stats for support (no ownership check)."""
        vid = (request.query_params.get("vehicle_id") or "").strip()
        if not vid:
            return Response({"error": "vehicle_id required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            vehicle = Vehicle.objects.get(pk=vid)
        except Vehicle.DoesNotExist:
            return Response({"error": "Vehicle not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"data": _vehicle_stats_payload_for_support(vehicle)}, status=status.HTTP_200_OK)

    def _get_partner_referred_users(self, request, **kwargs):
        """List referred B2C users for a partner_id."""
        partner_id = request.query_params.get("partner_id")
        if not partner_id:
            return Response({"error": "partner_id required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            partner = Partner.objects.get(pk=partner_id)
        except Partner.DoesNotExist:
            return Response({"error": "Partner not found"}, status=status.HTTP_404_NOT_FOUND)
        users = [
            _serialize_referred_user_detail(a)
            for a in ReferralAttribution.objects.filter(partner=partner).select_related(
                "referred_user"
            )
        ]
        return Response({"data": {"users": users}}, status=status.HTTP_200_OK)

    def _patch_terminate_fleet_subscription(self, request, **kwargs):
        """Cancel active fleet sub in DB and Stripe if configured."""
        fleet_id = request.data.get("fleet_id")
        reason = (request.data.get("reason") or "Support termination").strip()
        if not fleet_id:
            return Response({"error": "fleet_id required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            fleet = Fleet.objects.get(pk=fleet_id)
        except Fleet.DoesNotExist:
            return Response({"error": "Fleet not found"}, status=status.HTTP_404_NOT_FOUND)
        sub = (
            FleetSubscription.objects.filter(
                fleet=fleet, status__in=["active", "trialing", "past_due"]
            )
            .order_by("-created_at")
            .first()
        )
        if not sub:
            return Response({"error": "No active subscription"}, status=status.HTTP_400_BAD_REQUEST)
        if sub.stripe_subscription_id and stripe.api_key:
            try:
                stripe.Subscription.delete(sub.stripe_subscription_id)
            except Exception as exc:
                logger.warning("Stripe subscription delete failed: %s", exc)
        sub.status = "cancelled"
        sub.cancellation_date = timezone.now()
        sub.cancellation_reason = reason[:500]
        sub.auto_renew = False
        sub.save()
        return Response(
            {"data": {"message": "Subscription terminated", "customer": _serialize_fleet_detail(fleet)}},
            status=status.HTTP_200_OK,
        )

    def _patch_renew_fleet_subscription(self, request, **kwargs):
        """Reactivate fleet subscription with a new local period window."""
        fleet_id = request.data.get("fleet_id")
        if not fleet_id:
            return Response({"error": "fleet_id required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            fleet = Fleet.objects.get(pk=fleet_id)
        except Fleet.DoesNotExist:
            return Response({"error": "Fleet not found"}, status=status.HTTP_404_NOT_FOUND)
        sub = (
            FleetSubscription.objects.filter(fleet=fleet).select_related("plan").order_by("-created_at").first()
        )
        if not sub or not sub.plan:
            return Response({"error": "No subscription record"}, status=status.HTTP_400_BAD_REQUEST)
        now = timezone.now()
        cycle_months = 12 if sub.plan.billing_cycle == "yearly" else 1
        sub.status = "active"
        sub.cancellation_date = None
        sub.cancellation_reason = None
        sub.auto_renew = True
        sub.start_date = now
        sub.end_date = now + timedelta(days=30 * cycle_months)
        sub.save(
            update_fields=[
                "status",
                "cancellation_date",
                "cancellation_reason",
                "auto_renew",
                "start_date",
                "end_date",
                "updated_at",
            ]
        )
        return Response(
            {"data": {"message": "Subscription renewed", "customer": _serialize_fleet_detail(fleet)}},
            status=status.HTTP_200_OK,
        )

    def _patch_terminate_b2c_subscription(self, request, **kwargs):
        """Cancel active B2C sub in DB and Stripe if configured."""
        uid = request.data.get("user_id")
        reason = (request.data.get("reason") or "Support termination").strip()
        if not uid:
            return Response({"error": "user_id required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(pk=uid)
        except User.DoesNotExist:
            return Response({"error": "Customer not found"}, status=status.HTTP_404_NOT_FOUND)
        sub = (
            B2CSubcription.objects.filter(user=user, status__in=["active", "pending", "past_due"])
            .order_by("-start_date", "-id")
            .first()
        )
        if not sub:
            return Response({"error": "No active subscription"}, status=status.HTTP_400_BAD_REQUEST)
        if sub.stripe_subscription_id and stripe.api_key:
            try:
                stripe.Subscription.delete(sub.stripe_subscription_id)
            except Exception as exc:
                logger.warning("Stripe B2C subscription delete failed: %s", exc)
        sub.status = "cancelled"
        sub.cancellation_date = timezone.now()
        sub.cancellation_reason = reason[:500]
        sub.auto_renew = False
        sub.save()
        return Response(
            {
                "data": {
                    "message": "Subscription terminated",
                    "customer": _serialize_b2c_detail(user),
                }
            },
            status=status.HTTP_200_OK,
        )

    def _patch_renew_b2c_subscription(self, request, **kwargs):
        """Reactivate B2C subscription with a new local period window."""
        uid = request.data.get("user_id")
        if not uid:
            return Response({"error": "user_id required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(pk=uid)
        except User.DoesNotExist:
            return Response({"error": "Customer not found"}, status=status.HTTP_404_NOT_FOUND)
        sub = (
            B2CSubcription.objects.filter(user=user)
            .select_related("plan")
            .order_by("-start_date", "-id")
            .first()
        )
        if not sub or not sub.plan:
            return Response({"error": "No subscription record"}, status=status.HTTP_400_BAD_REQUEST)
        now = timezone.now()
        cycle_months = 12 if sub.plan.billing_cycle == "yearly" else 1
        sub.status = "active"
        sub.cancellation_date = None
        sub.cancellation_reason = None
        sub.auto_renew = True
        sub.start_date = now
        sub.end_date = now + timedelta(days=30 * cycle_months)
        sub.save(
            update_fields=[
                "status",
                "cancellation_date",
                "cancellation_reason",
                "auto_renew",
                "start_date",
                "end_date",
            ]
        )
        return Response(
            {"data": {"message": "Subscription renewed", "customer": _serialize_b2c_detail(user)}},
            status=status.HTTP_200_OK,
        )

    def _patch_vehicle_transfer(self, request, **kwargs):
        """Approve or reject a pending vehicle transfer (support override)."""
        transfer_id = request.data.get("transfer_id")
        vehicle_id = (request.data.get("vehicle_id") or "").strip()
        action = (request.data.get("action") or "").strip().lower()
        if not transfer_id:
            return Response({"error": "transfer_id required"}, status=status.HTTP_400_BAD_REQUEST)
        if not vehicle_id:
            return Response({"error": "vehicle_id required"}, status=status.HTTP_400_BAD_REQUEST)
        if action not in ("approve", "reject"):
            return Response(
                {"error": "action must be approve or reject"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            transfer = VehicleTransfer.objects.select_related(
                "vehicle", "from_owner", "to_owner"
            ).get(pk=transfer_id)
        except VehicleTransfer.DoesNotExist:
            return Response({"error": "Transfer not found"}, status=status.HTTP_404_NOT_FOUND)
        if str(transfer.vehicle_id) != str(vehicle_id):
            return Response(
                {"error": "Transfer does not belong to this vehicle"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if action == "approve":
            err = apply_vehicle_transfer_approval(transfer)
        else:
            err = apply_vehicle_transfer_rejection(transfer)
        if err:
            logger.info(
                "support vehicle_transfer %s failed transfer_id=%s vehicle_id=%s detail=%s",
                action,
                transfer_id,
                vehicle_id,
                err,
            )
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)
        logger.info(
            "support vehicle_transfer %s ok transfer_id=%s vehicle_id=%s",
            action,
            transfer_id,
            vehicle_id,
        )
        vehicle = Vehicle.objects.get(pk=vehicle_id)
        message = "Transfer approved" if action == "approve" else "Transfer rejected"
        return Response(
            {
                "data": {
                    "message": message,
                    "vehicle": _vehicle_stats_payload_for_support(vehicle),
                }
            },
            status=status.HTTP_200_OK,
        )

    def _patch_remove_vehicle(self, request, **kwargs):
        """Remove vehicle from fleet or end user ownership."""
        vehicle_id = request.data.get("vehicle_id")
        fleet_id = request.data.get("fleet_id")
        user_id = request.data.get("user_id")
        if not vehicle_id:
            return Response({"error": "vehicle_id required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            vehicle = Vehicle.objects.get(pk=vehicle_id)
        except Vehicle.DoesNotExist:
            return Response({"error": "Vehicle not found"}, status=status.HTTP_404_NOT_FOUND)
        if fleet_id:
            deleted, _ = FleetVehicle.objects.filter(fleet_id=fleet_id, vehicle=vehicle).delete()
            if not deleted:
                return Response({"error": "Vehicle not in fleet"}, status=status.HTTP_400_BAD_REQUEST)
            return Response({"data": {"message": "Vehicle removed from fleet"}}, status=status.HTTP_200_OK)
        if user_id:
            today = timezone.now().date()
            updated = VehicleOwnership.objects.filter(
                owner_id=user_id, vehicle=vehicle, end_date__isnull=True
            ).update(end_date=today)
            if not updated:
                return Response({"error": "Ownership not found"}, status=status.HTTP_400_BAD_REQUEST)
            return Response({"data": {"message": "Vehicle removed from user"}}, status=status.HTTP_200_OK)
        return Response(
            {"error": "fleet_id or user_id required for remove_vehicle"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    def _patch_remove_branch(self, request, **kwargs):
        """Delete empty branch (must have zero fleet vehicles)."""
        fleet_id = request.data.get("fleet_id")
        branch_id = request.data.get("branch_id")
        if not fleet_id or not branch_id:
            return Response(
                {"error": "fleet_id and branch_id required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            fleet = Fleet.objects.get(pk=fleet_id)
            branch = Branch.objects.get(pk=branch_id, fleet=fleet)
        except (Fleet.DoesNotExist, Branch.DoesNotExist):
            return Response({"error": "Branch not found"}, status=status.HTTP_404_NOT_FOUND)
        vehicle_count = FleetVehicle.objects.filter(branch=branch).count()
        if vehicle_count > 0:
            return Response(
                {
                    "error": f"Cannot delete branch with {vehicle_count} vehicle(s). Remove vehicles first."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        branch.delete()
        return Response({"data": {"message": "Branch removed"}}, status=status.HTTP_200_OK)

    def _post_delete_user_account(self, request, **kwargs):
        """
        Deactivate a customer account (GDPR-style erasure). Does not hard-delete rows with
        financial history; anonymizes PII and blocks login.
        """
        user_id = (request.data.get("user_id") or "").strip()
        reason = (request.data.get("reason") or "Support account deletion").strip()[:500]
        if not user_id:
            return Response({"error": "user_id required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

        if user.is_staff or user.is_superuser:
            return Response(
                {"error": "Staff accounts cannot be deleted via support"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if Partner.objects.filter(user=user).exists():
            return Response(
                {"error": "Partner accounts must be deactivated via partner tooling"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not user.is_active:
            return Response(
                {"data": {"message": "Account already deactivated", "user_id": str(user.id)}},
                status=status.HTTP_200_OK,
            )

        actor = get_support_actor_email(request) or "support"
        original_email = user.email
        user.is_active = False
        user.email = f"deleted+{user.id}@prisma.invalid"
        if hasattr(user, "phone") and user.phone:
            user.phone = f"deleted-{user.id}"
        user.save(update_fields=["is_active", "email", "phone"])

        open_bookings = BookedAppointment.objects.filter(
            user=user, status__in=["pending", "confirmed", "in_progress", "scheduled"]
        ).count()
        if open_bookings:
            logger.warning(
                "Deleted user %s had %s open bookings; account deactivated anyway by %s",
                user_id,
                open_bookings,
                actor,
            )

        logger.info(
            "Support deleted user account id=%s former_email=%s by=%s reason=%s",
            user_id,
            original_email,
            actor,
            reason,
        )
        return Response(
            {
                "data": {
                    "message": "Account deactivated",
                    "user_id": str(user.id),
                    "deleted_by": actor,
                }
            },
            status=status.HTTP_200_OK,
        )
