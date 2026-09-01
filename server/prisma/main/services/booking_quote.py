"""
Server-side booking price quote and complimentary Quick Sparkle validation.

Mirrors client useBooking.calculateFinalPrice (VAT-inclusive line items, 23% VAT split,
4+ addons discount, SUV 20%, express €30, loyalty/promotion % on pre-VAT-inclusive subtotal).
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Sequence, Tuple

from django.conf import settings
from django.db import transaction
from django.utils import timezone

VAT_RATE = Decimal("0.23")
# Canonical product name in admin/marketing; detection uses case-insensitive substring (see is_quick_sparkle_service_name).
CANONICAL_QUICK_SPARKLE_LABEL = "Prisma Quick Sparkle"
COMPLIMENTARY_SOURCES = frozenset({"loyalty", "subscription", "partner"})

# Loyalty tier promotion thresholds based on completed (non Quick Sparkle) bookings.
# Keep in sync with main.signals.vehicle_signal.handle_booking_completion.
LOYALTY_TIER_THRESHOLDS: Dict[str, int] = {
    "bronze": 0,
    "silver": 10,
    "gold": 25,
    "platinum": 40,
}
LOYALTY_TIER_ORDER: Tuple[str, ...] = ("bronze", "silver", "gold", "platinum")


def is_quick_sparkle_service_name(name: Optional[str]) -> bool:
    """
    True when the service title is the Prisma Quick Sparkle line.

    Normalises case and internal spacing, then matches if the canonical phrase
    appears (covers e.g. \"Prisma Quick Sparkle\", legacy \"The Quick Sparkle\").

    Args:
        name: Service display name from client or DB.

    Returns:
        bool: Whether complimentary Quick Sparkle rules apply.
    """
    if not name or not isinstance(name, str):
        return False
    normalized = " ".join(name.strip().lower().split())
    return "quick sparkle" in normalized

AmountBreakdown = Dict[str, float]


def money(d: Decimal) -> Decimal:
    """
    Round a ``Decimal`` to two decimal places (half-up), for currency amounts.

    Args:
        d: Raw decimal value.

    Returns:
        Decimal: Quantised to 0.01.
    """
    return d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def float_money(d: Decimal) -> float:
    """
    Convert a currency ``Decimal`` to ``float`` for JSON API responses.

    Args:
        d: Amount to round and convert.

    Returns:
        float: Two-decimal float.
    """
    return float(money(d))


def line_total_inc_vat_to_parts(total_inc_vat: Decimal) -> Tuple[Decimal, Decimal, Decimal]:
    """
    Split a VAT-inclusive total into ex-VAT subtotal, VAT amount, and total (23% VAT).

    Args:
        total_inc_vat: VAT-inclusive line total.

    Returns:
        tuple: ``(sub_ex, vat_amt, total_inc_vat)`` each rounded to cents.
    """
    total_inc_vat = money(total_inc_vat)
    sub_ex = (total_inc_vat / (Decimal("1") + VAT_RATE)).quantize(Decimal("0.01"), ROUND_HALF_UP)
    vat_amt = money(total_inc_vat - sub_ex)
    return sub_ex, vat_amt, total_inc_vat


def _user_excluded_from_promotions(user) -> bool:
    """
    True when loyalty/promo/partner booking discounts must not apply.

    Anonymous quotes (``user is None``) and guest checkout are excluded so guest
    totals match authenticated B2C list prices without loyalty or vouchers.

    Args:
        user: Authenticated ``User``, guest ``User``, or ``None``.

    Returns:
        bool: Whether promotional pricing is disabled for this shopper.
    """
    if user is None or getattr(user, "is_guest", False):
        return True
    from main.models import Partner

    if getattr(user, "is_fleet_owner", False) or getattr(user, "is_branch_admin", False):
        return True
    if user.is_fleet_admin_or_manager():
        return True
    if Partner.objects.filter(user=user).exists():
        return True
    return False


def _active_promotion_discount_pct(user) -> Decimal:
    """
    Percentage off from the user's newest active ``Promotions`` row, if any.

    Args:
        user: Booking user.

    Returns:
        Decimal: Discount percent (0 when excluded or no valid promotion).
    """
    from main.models import Promotions

    if _user_excluded_from_promotions(user):
        return Decimal("0")
    today = timezone.now().date()
    prom = (
        Promotions.objects.filter(user=user, is_active=True, valid_until__gte=today)
        .order_by("-created_at")
        .first()
    )
    if not prom:
        return Decimal("0")
    return Decimal(str(prom.discount_percentage))


def _loyalty_discount_pct(user) -> Decimal:
    """
    Tier discount percent from ``LoyaltyProgram`` for B2C users.

    Args:
        user: Booking user.

    Returns:
        Decimal: Tier ``discount`` benefit percent, or 0.
    """
    if user is None or getattr(user, "is_guest", False):
        return Decimal("0")
    from main.models import LoyaltyProgram

    if getattr(user, "is_fleet_owner", False) or getattr(user, "is_branch_admin", False):
        return Decimal("0")
    try:
        lp = LoyaltyProgram.objects.get(user=user)
    except LoyaltyProgram.DoesNotExist:
        return Decimal("0")
    benefits = lp.get_tier_benefits()
    tier = lp.current_tier
    return Decimal(str(benefits.get("discount", 0)))


def _service_unit_price(user, service) -> Decimal:
    """
    VAT-inclusive unit price for a service for this user (tier/fleet pricing).

    Args:
        user: Booking user.
        service: ``ServiceType`` instance.

    Returns:
        Decimal: Rounded price from ``get_price_for_user``.
    """
    return money(Decimal(str(service.get_price_for_user(user))))


def _addon_total_with_four_plus_rule(addons: Sequence) -> Decimal:
    """
    Sum addon prices; when four or more addons, cheapest addon is free.

    Args:
        addons: Iterable of ``AddOns`` with ``.price``.

    Returns:
        Decimal: Total addon line (VAT-inclusive sticker logic).
    """
    if not addons:
        return Decimal("0")
    prices = [money(Decimal(str(a.price))) for a in addons]
    if len(prices) >= 4:
        cheapest = min(prices)
        return money(sum(prices) - cheapest)
    return money(sum(prices))


def _partner_booking_discount_pct_setting() -> Decimal:
    """
    Read partner referred-booking discount percent from Django settings.

    Returns:
        Decimal: Configured percent (default 35).
    """
    raw = getattr(settings, "PARTNER_REFERRED_BOOKING_DISCOUNT_PERCENT", 35)
    try:
        return Decimal(str(int(raw)))
    except (TypeError, ValueError):
        return Decimal("35")


def _subscription_booking_discount_pct(user, *, is_suv: bool = False) -> Decimal:
    """
    Active B2C subscription tier discount on the sticker stack (from tier.service_discount_percent).

    Sedan plans do not discount SUV/MPV bookings; SUV/MPV plans cover all vehicles.

    Args:
        user: Booking user.
        is_suv: Whether the booking vehicle is SUV/MPV.

    Returns:
        Decimal: Plan ``get_service_discount_percent`` or 0.
    """
    from main.models import B2CSubcription
    from main.utils.vehicle_category import plan_covers_booking

    if user is None or getattr(user, "is_guest", False):
        return Decimal("0")

    sub = (
        B2CSubcription.objects.filter(user=user, status__in=["active", "past_due"])
        .select_related("plan", "plan__tier")
        .order_by("-start_date")
        .first()
    )
    if not sub or not getattr(sub, "plan", None):
        return Decimal("0")
    if not plan_covers_booking(sub.plan, is_suv=is_suv):
        return Decimal("0")
    pct = sub.plan.get_service_discount_percent()
    try:
        return Decimal(str(int(pct)))
    except (TypeError, ValueError):
        return Decimal("0")


def compute_price_breakdown_parts(
    user,
    service,
    addons: Sequence,
    *,
    is_suv: bool,
    is_express: bool,
    exclude_service_price: bool,
    partner_booking_discount_pct: Decimal = Decimal("0"),
) -> Dict[str, Decimal]:
    """
    Internal full price stack: sticker (VAT-inc), discounts, then ex-VAT breakdown.

    Args:
        user, service, addons: Pricing inputs.
        is_suv, is_express: Surcharge flags.
        exclude_service_price: True for complimentary Quick Sparkle (addons only).
        partner_booking_discount_pct: Extra % when user opts into partner offer.

    Returns:
        dict: sub_ex, vat_amt, total_inc_vat, sticker and per-discount inc-VAT amounts.
    """
    base = Decimal("0") if exclude_service_price else _service_unit_price(user, service)
    addon_total = _addon_total_with_four_plus_rule(addons)
    sub = money(base + addon_total)
    if exclude_service_price:
        suv = Decimal("0")
    else:
        suv = money(sub * Decimal("0.20")) if is_suv else Decimal("0")
    express_fee = Decimal("30") if is_express else Decimal("0")
    total_before_discount = money(sub + suv + express_fee)
    loyalty_pct = _loyalty_discount_pct(user)
    promo_pct = _active_promotion_discount_pct(user)
    subscription_pct = _subscription_booking_discount_pct(user, is_suv=is_suv)
    loyalty_amt = money(total_before_discount * loyalty_pct / Decimal("100"))
    promo_amt = money(total_before_discount * promo_pct / Decimal("100"))
    p_pct = partner_booking_discount_pct if partner_booking_discount_pct > 0 else Decimal("0")
    partner_amt = money(total_before_discount * p_pct / Decimal("100"))
    subscription_amt = money(total_before_discount * subscription_pct / Decimal("100"))
    total_inc = money(
        total_before_discount - loyalty_amt - promo_amt - partner_amt - subscription_amt
    )
    # Back out ex-VAT line items from final VAT-inclusive total after %-off discounts.
    sub_ex, vat_amt, total_inc_vat = line_total_inc_vat_to_parts(total_inc)
    return {
        "sub_ex": sub_ex,
        "vat_amt": vat_amt,
        "total_inc_vat": total_inc_vat,
        "sticker_inc_vat": total_before_discount,
        "loyalty_discount_inc_vat": loyalty_amt,
        "promotion_discount_inc_vat": promo_amt,
        "partner_referral_discount_inc_vat": partner_amt,
        "subscription_discount_inc_vat": subscription_amt,
        "subscription_discount_pct": subscription_pct,
    }


def pricing_lines_meta(parts: Dict[str, Decimal]) -> Dict[str, float]:
    """
    Convert internal ``compute_price_breakdown_parts`` dict to float API metadata.

    Args:
        parts: Output from ``compute_price_breakdown_parts``.

    Returns:
        dict: Sticker and per-discount inc-VAT floats for client display.
    """
    sub_pct = parts.get("subscription_discount_pct", Decimal("0"))
    return {
        "sticker_total_inc_vat": float_money(parts["sticker_inc_vat"]),
        "loyalty_discount_inc_vat": float_money(parts["loyalty_discount_inc_vat"]),
        "promotion_discount_inc_vat": float_money(parts["promotion_discount_inc_vat"]),
        "partner_referral_discount_inc_vat": float_money(parts["partner_referral_discount_inc_vat"]),
        "subscription_discount_inc_vat": float_money(parts.get("subscription_discount_inc_vat", Decimal("0"))),
        "subscription_discount_percent": float(sub_pct),
    }


def compute_price_breakdown(
    user,
    service,
    addons: Sequence,
    *,
    is_suv: bool,
    is_express: bool,
    exclude_service_price: bool,
    partner_booking_discount_pct: Decimal = Decimal("0"),
) -> Tuple[Decimal, Decimal, Decimal]:
    """
    Returns (subtotal_ex_vat, vat_amount, total_inc_vat) matching client logic.
    """
    p = compute_price_breakdown_parts(
        user,
        service,
        addons,
        is_suv=is_suv,
        is_express=is_express,
        exclude_service_price=exclude_service_price,
        partner_booking_discount_pct=partner_booking_discount_pct,
    )
    return p["sub_ex"], p["vat_amt"], p["total_inc_vat"]


def breakdown_to_response(sub_ex: Decimal, vat_amt: Decimal, total_inc: Decimal) -> AmountBreakdown:
    """
    Map decimal breakdown to API ``AmountBreakdown`` floats.

    Args:
        sub_ex, vat_amt, total_inc: Ex-VAT, VAT, and inc-VAT totals.

    Returns:
        dict: Keys ``subtotal``, ``vat``, ``total``.
    """
    return {
        "subtotal": float_money(sub_ex),
        "vat": float_money(vat_amt),
        "total": float_money(total_inc),
    }


def get_partner_eligible(user) -> bool:
    """
    True when the user may use the one-time partner complimentary Quick Sparkle.

    Args:
        user: Referred user.

    Returns:
        bool: Attribution exists, wash unused, and not expired.
    """
    if user is None:
        return False
    from main.models import ReferralAttribution

    try:
        attr = ReferralAttribution.objects.get(referred_user=user, source="partner")
        if attr.partner_free_wash_used:
            return False
        if attr.expires_at is None or attr.expires_at > timezone.now():
            return True
    except ReferralAttribution.DoesNotExist:
        pass
    return False


def get_partner_referral_booking_offer(user) -> Optional[Dict[str, Any]]:
    """
    Percentage booking discount for users attributed to a partner (distinct from complimentary wash).

    Applies while ReferralAttribution is valid (expires_at null or future). Opt-in via booking payload
    ``apply_partner_booking_discount``.
    """
    from main.models import ReferralAttribution

    if _user_excluded_from_promotions(user):
        return None
    try:
        attr = ReferralAttribution.objects.get(referred_user=user, source="partner")
    except ReferralAttribution.DoesNotExist:
        return None
    now = timezone.now()
    if attr.expires_at is not None and attr.expires_at <= now:
        return None
    pct = _partner_booking_discount_pct_setting()
    return {
        "eligible": True,
        "percent": float(pct),
        "expires_at": attr.expires_at.isoformat() if attr.expires_at else None,
    }


def _loyalty_peek_quick_sparkle(loyalty) -> Tuple[bool, int, int, int]:
    """
    Read-only Platinum free Quick Sparkle window (does not mutate reset counters).
    Returns (eligible, remaining, monthly_limit, days_until_reset).
    """
    if loyalty.current_tier != "platinum":
        return False, 0, 0, 30
    if not loyalty.user.is_b2c_user():
        return False, 0, 0, 30
    limit = 1
    today = timezone.now().date()
    used = loyalty.free_quick_sparkle_used
    reset_date = loyalty.free_quick_sparkle_reset_date
    if reset_date and (today - reset_date).days >= 30:
        used = 0
    elif reset_date is None:
        used = 0

    eligible = used < limit
    remaining = max(0, limit - used)
    days_until_reset = 30
    if reset_date:
        next_reset = reset_date + timedelta(days=30)
        days_until_reset = max(0, (next_reset - today).days)
    return eligible, remaining, limit, days_until_reset


def get_loyalty_quick_sparkle_snapshot(user) -> Dict[str, Any]:
    """Read-only eligibility for Platinum monthly free wash."""
    from main.models import LoyaltyProgram

    out = {
        "eligible_loyalty": False,
        "remaining_loyalty": 0,
        "total_monthly_limit": 0,
        "resets_in_days": 30,
    }
    if user is None or not user.is_b2c_user():
        return out
    try:
        loyalty = LoyaltyProgram.objects.get(user=user)
        can_use, remaining, limit, days_until_reset = _loyalty_peek_quick_sparkle(loyalty)
        out.update(
            {
                "eligible_loyalty": can_use,
                "remaining_loyalty": int(remaining),
                "total_monthly_limit": int(limit),
                "resets_in_days": days_until_reset,
            }
        )
    except LoyaltyProgram.DoesNotExist:
        pass
    return out


def get_active_b2c_subscription(user):
    """
    Newest active or past_due B2C subscription for ``user``, with plan/tier loaded.

    Args:
        user: ``User`` instance.

    Returns:
        B2CSubcription | None: Active subscription row or None.
    """
    from main.models import B2CSubcription

    if user is None:
        return None

    return (
        B2CSubcription.objects.filter(user=user, status__in=["active", "past_due"])
        .select_related("plan", "plan__tier")
        .order_by("-start_date")
        .first()
    )


def get_loyalty_progress_snapshot(user) -> Dict[str, Any]:
    """
    Read-only snapshot of B2C loyalty progress: current tier, completed count,
    next tier + thresholds and benefits. Returns ``is_b2c: False`` for fleet
    owners / branch admins / partners so callers can hide loyalty UI.
    """
    from main.models import LoyaltyProgram

    empty = {
        "is_b2c": False,
        "current_tier": None,
        "completed_bookings": 0,
        "next_tier": None,
        "current_threshold": 0,
        "next_threshold": None,
        "washes_to_next": 0,
        "tier_thresholds": dict(LOYALTY_TIER_THRESHOLDS),
        "benefits": {"discount": 0, "free_service": []},
    }

    if not user or not user.is_b2c_user():
        return empty

    try:
        loyalty = LoyaltyProgram.objects.get(user=user)
    except LoyaltyProgram.DoesNotExist:
        # Don't write during a read snapshot; surface a Bronze/0 default. New
        # B2C accounts have a row created at signup (User.save), older rows
        # are backfilled lazily by the loyalty signal on first completed booking.
        return {
            **empty,
            "is_b2c": True,
            "current_tier": "bronze",
            "current_threshold": int(LOYALTY_TIER_THRESHOLDS["bronze"]),
            "next_tier": LOYALTY_TIER_ORDER[1],
            "next_threshold": int(LOYALTY_TIER_THRESHOLDS[LOYALTY_TIER_ORDER[1]]),
            "washes_to_next": int(LOYALTY_TIER_THRESHOLDS[LOYALTY_TIER_ORDER[1]]),
        }

    current_tier = (loyalty.current_tier or "bronze").lower()
    if current_tier not in LOYALTY_TIER_THRESHOLDS:
        current_tier = "bronze"

    completed = int(loyalty.completed_bookings or 0)
    current_threshold = int(LOYALTY_TIER_THRESHOLDS[current_tier])

    idx = LOYALTY_TIER_ORDER.index(current_tier)
    if idx < len(LOYALTY_TIER_ORDER) - 1:
        next_tier = LOYALTY_TIER_ORDER[idx + 1]
        next_threshold = int(LOYALTY_TIER_THRESHOLDS[next_tier])
        washes_to_next = max(0, next_threshold - completed)
    else:
        next_tier = None
        next_threshold = None
        washes_to_next = 0

    return {
        "is_b2c": True,
        "current_tier": current_tier,
        "completed_bookings": completed,
        "next_tier": next_tier,
        "current_threshold": current_threshold,
        "next_threshold": next_threshold,
        "washes_to_next": washes_to_next,
        "tier_thresholds": dict(LOYALTY_TIER_THRESHOLDS),
        "benefits": loyalty.get_tier_benefits(),
    }


def _period_dates(sub) -> Tuple[timezone.datetime.date, timezone.datetime.date]:
    """
    Normalise subscription billing period to date objects.

    Args:
        sub: ``B2CSubcription`` with ``start_date`` and ``end_date``.

    Returns:
        tuple: ``(start_date, end_date)`` as ``date``.
    """
    start = sub.start_date.date() if hasattr(sub.start_date, "date") else sub.start_date
    end = sub.end_date.date() if hasattr(sub.end_date, "date") else sub.end_date
    return start, end


def get_subscription_quick_sparkle_snapshot(user, *, is_suv: bool = False) -> Dict[str, Any]:
    """
    Read-only subscription complimentary Quick Sparkle allowance for the current period.

    Args:
        user: B2C user.
        is_suv: Booking vehicle is SUV/MPV — sedan plans are ineligible for those vehicles.

    Returns:
        dict: eligible_subscription, remaining/max counts, period_start/end/label, coverage flags.
    """
    from main.utils.vehicle_category import plan_covers_booking

    sub = get_active_b2c_subscription(user)
    if not sub or not getattr(sub, "plan", None):
        return {
            "eligible_subscription": False,
            "remaining_subscription": 0,
            "max_subscription": 0,
            "period_start": None,
            "period_end": None,
            "period_label": "",
            "plan_vehicle_category": None,
            "covers_vehicle": False,
        }
    limits = sub.plan.get_limits()
    max_spark = int(limits.get("max_prisma_sparkles", 0))
    used = int(getattr(sub, "complimentary_sparkles_used", 0) or 0)
    remaining = max(0, max_spark - used)
    start_d, end_d = _period_dates(sub)
    covers = plan_covers_booking(sub.plan, is_suv=is_suv)
    return {
        "eligible_subscription": remaining > 0 and max_spark > 0 and covers,
        "remaining_subscription": remaining,
        "max_subscription": max_spark,
        "period_start": start_d.isoformat(),
        "period_end": end_d.isoformat(),
        "period_label": f"{start_d.isoformat()} – {end_d.isoformat()}",
        "plan_vehicle_category": getattr(sub.plan, "vehicle_category", None),
        "covers_vehicle": covers,
    }


def eligible_complimentary_sources_list(qs: Dict[str, Any]) -> List[str]:
    """
    Which complimentary Quick Sparkle sources are currently available.

    Args:
        qs: Entitlements dict from ``build_quick_sparkle_entitlements``.

    Returns:
        list[str]: Subset of ``loyalty``, ``partner``, ``subscription``.
    """
    if not qs.get("is_quick_sparkle"):
        return []
    out: List[str] = []
    if qs.get("eligible_loyalty"):
        out.append("loyalty")
    if qs.get("eligible_partner"):
        out.append("partner")
    if qs.get("eligible_subscription"):
        out.append("subscription")
    return out


def _is_suv_from_booking_data(booking_data: dict) -> bool:
    """Infer SUV/MPV from booking_data flags and vehicle body_style."""
    from main.utils.vehicle_category import resolve_is_suv_mpv

    raw_veh = booking_data.get("vehicle") or {}
    body_style = None
    if isinstance(raw_veh, dict):
        body_style = raw_veh.get("body_style") or raw_veh.get("bodyStyle")

    explicit_suv = booking_data.get("booking_is_suv")
    if explicit_suv is None:
        explicit_suv = booking_data.get("is_suv")
    if explicit_suv is None and isinstance(raw_veh, dict):
        if raw_veh.get("car_is_suv") is not None:
            explicit_suv = raw_veh.get("car_is_suv")
        elif raw_veh.get("is_suv") is not None:
            explicit_suv = raw_veh.get("is_suv")

    return resolve_is_suv_mpv(
        is_suv=bool(explicit_suv) if explicit_suv is not None else None,
        body_style=body_style if isinstance(body_style, str) else None,
    )


def resolve_effective_complimentary_source(user, booking_data: dict) -> Optional[str]:
    """
    Effective source for pricing/validation: explicit choice if valid, else sole eligible source.
    """
    if not booking_data.get("applied_free_quick_sparkle"):
        return None
    raw_st = booking_data.get("service_type") or {}
    name = raw_st.get("name", "") if isinstance(raw_st, dict) else ""
    if not is_quick_sparkle_service_name(name):
        return None
    qs = build_quick_sparkle_entitlements(
        user, name, is_suv=_is_suv_from_booking_data(booking_data)
    )
    elig = eligible_complimentary_sources_list(qs)
    explicit = booking_data.get("complimentary_quick_sparkle_source")
    if explicit in COMPLIMENTARY_SOURCES:
        return explicit if explicit in elig else None
    if len(elig) == 1:
        return elig[0]
    return None


def build_quick_sparkle_entitlements(
    user,
    service_name: Optional[str] = None,
    *,
    eligibility_only: bool = False,
    is_suv: bool = False,
) -> Dict[str, Any]:
    """If eligibility_only, answer \"can this user use a complimentary QS\" without a booked service name (e.g. check_free_wash)."""
    is_qs = eligibility_only or is_quick_sparkle_service_name(service_name)
    loyalty_snap = get_loyalty_quick_sparkle_snapshot(user)
    partner_ok = get_partner_eligible(user) if is_qs else False
    sub_snap = get_subscription_quick_sparkle_snapshot(user, is_suv=is_suv) if is_qs else {}
    eligible_sub = bool(sub_snap.get("eligible_subscription"))

    eligible_loyalty = bool(is_qs and loyalty_snap.get("eligible_loyalty"))
    return {
        "is_quick_sparkle": is_qs,
        "eligible_loyalty": eligible_loyalty,
        "remaining_loyalty": loyalty_snap.get("remaining_loyalty", 0),
        "total_monthly_limit": loyalty_snap.get("total_monthly_limit", 0),
        "resets_in_days": loyalty_snap.get("resets_in_days", 30),
        "eligible_partner": bool(is_qs and partner_ok),
        "eligible_subscription": eligible_sub,
        "remaining_subscription": sub_snap.get("remaining_subscription", 0),
        "max_subscription": sub_snap.get("max_subscription", 0),
        "period_start": sub_snap.get("period_start"),
        "period_end": sub_snap.get("period_end"),
        "period_label": sub_snap.get("period_label", ""),
        "partner_free_wash": partner_ok,
        "plan_vehicle_category": sub_snap.get("plan_vehicle_category"),
        "covers_vehicle": sub_snap.get("covers_vehicle", True),
    }


def quote_booking_for_user(
    user,
    *,
    service,
    addons: Sequence,
    is_suv: bool,
    is_express: bool,
    apply_partner_booking_discount: bool = False,
) -> Dict[str, Any]:
    """Full quote payload for POST quote_booking."""
    service_name = service.name if service else None
    qs = build_quick_sparkle_entitlements(user, service_name, is_suv=is_suv)
    partner_offer = get_partner_referral_booking_offer(user)
    partner_pct = (
        _partner_booking_discount_pct_setting()
        if apply_partner_booking_discount and partner_offer
        else Decimal("0")
    )

    parts_full = compute_price_breakdown_parts(
        user,
        service,
        addons,
        is_suv=is_suv,
        is_express=is_express,
        exclude_service_price=False,
        partner_booking_discount_pct=partner_pct,
    )
    payable_full = breakdown_to_response(
        parts_full["sub_ex"], parts_full["vat_amt"], parts_full["total_inc_vat"]
    )
    pricing_lines_full = pricing_lines_meta(parts_full)

    complimentary_breakdowns: Dict[str, Optional[AmountBreakdown]] = {
        "loyalty": None,
        "partner": None,
        "subscription": None,
    }
    complimentary_lines: Dict[str, Optional[Dict[str, float]]] = {
        "loyalty": None,
        "partner": None,
        "subscription": None,
    }

    # Complimentary paths zero the service line but keep addons/SUV/express/partner %.
    if qs["is_quick_sparkle"]:
        for key in ("loyalty", "partner", "subscription"):
            eligible_key = f"eligible_{key}" if key != "partner" else "eligible_partner"
            if not qs.get(eligible_key):
                continue
            if key == "partner" and not qs.get("eligible_partner"):
                continue
            pc = compute_price_breakdown_parts(
                user,
                service,
                addons,
                is_suv=is_suv,
                is_express=is_express,
                exclude_service_price=True,
                partner_booking_discount_pct=partner_pct,
            )
            complimentary_breakdowns[key] = breakdown_to_response(
                pc["sub_ex"], pc["vat_amt"], pc["total_inc_vat"]
            )
            complimentary_lines[key] = pricing_lines_meta(pc)

    issued_at = timezone.now().isoformat()
    covers = bool(qs.get("covers_vehicle", True))
    plan_cat = qs.get("plan_vehicle_category")
    mismatch_message = None
    if plan_cat == "sedan" and is_suv and not covers:
        mismatch_message = (
            "Your Sedan subscription does not cover SUV/MPV vehicles. "
            "Cancel your current plan in Settings → Subscription, then subscribe to SUV/MPV "
            "to get subscriber discounts and complimentary washes on this vehicle."
        )
    return {
        "issued_at": issued_at,
        "quick_sparkle": qs,
        "payable_full": payable_full,
        "payable_if_complimentary": {
            "loyalty": complimentary_breakdowns["loyalty"],
            "partner": complimentary_breakdowns["partner"],
            "subscription": complimentary_breakdowns["subscription"],
        },
        "pricing_lines_full": pricing_lines_full,
        "pricing_lines_if_complimentary": {
            "loyalty": complimentary_lines["loyalty"],
            "partner": complimentary_lines["partner"],
            "subscription": complimentary_lines["subscription"],
        },
        "partner_booking_offer": partner_offer,
        "vat_rate_percent": float(VAT_RATE * 100),
        "subscription_coverage": {
            "plan_vehicle_category": plan_cat,
            "covers_vehicle": covers,
            "message": mismatch_message,
        },
    }


def _parse_booking_data_service_addons(
    booking_data: dict, user
) -> Tuple[Any, List, bool, bool]:
    """Resolve service instance, addons list, is_suv, is_express from client booking_data dict."""
    from main.models import AddOns, ServiceType

    raw_st = booking_data.get("service_type") or {}
    if isinstance(raw_st, dict):
        sid = raw_st.get("id")
    else:
        sid = getattr(raw_st, "id", None)
    service = ServiceType.objects.get(id=sid) if sid else None
    if not service:
        raise ValueError("Invalid service_type in booking_data")

    addon_ids = []
    for addon in booking_data.get("addons") or []:
        if isinstance(addon, dict):
            aid = addon.get("id")
            if aid is not None:
                addon_ids.append(aid)
        else:
            addon_ids.append(addon)
    addons = list(AddOns.objects.filter(id__in=addon_ids))

    is_suv = _is_suv_from_booking_data(booking_data)
    is_express = booking_data.get("is_express_service", False)
    if isinstance(is_express, str):
        is_express = is_express.lower() == "true"
    return service, addons, is_suv, is_express


def _partner_booking_discount_pct_for_booking_data(user, booking_data: dict) -> Decimal:
    """
    Partner referral booking discount percent when client opted in and offer is valid.

    Args:
        user: Booking user.
        booking_data: Client payload with ``apply_partner_booking_discount``.

    Returns:
        Decimal: Offer percent or 0.
    """
    if not booking_data.get("apply_partner_booking_discount"):
        return Decimal("0")
    offer = get_partner_referral_booking_offer(user)
    if not offer:
        return Decimal("0")
    return Decimal(str(offer["percent"]))


def expected_breakdown_from_booking_data(user, booking_data: dict) -> AmountBreakdown:
    """Recompute server-expected VAT breakdown for payment validation."""
    service, addons, is_suv, is_express = _parse_booking_data_service_addons(booking_data, user)
    applied_free = bool(booking_data.get("applied_free_quick_sparkle"))
    service_name = service.name
    exclude = False
    if applied_free and is_quick_sparkle_service_name(service_name):
        eff = resolve_effective_complimentary_source(user, booking_data)
        if eff:
            qs = build_quick_sparkle_entitlements(user, service_name)
            key = "eligible_partner" if eff == "partner" else f"eligible_{eff}"
            if qs.get(key):
                exclude = True
    sub_ex, vat_amt, total_inc = compute_price_breakdown(
        user,
        service,
        addons,
        is_suv=is_suv,
        is_express=is_express,
        exclude_service_price=exclude,
        partner_booking_discount_pct=_partner_booking_discount_pct_for_booking_data(
            user, booking_data
        ),
    )
    return breakdown_to_response(sub_ex, vat_amt, total_inc)


# Keep in sync with client useBulkBooking (BULK_DISCOUNT_THRESHOLD / BULK_DISCOUNT_PERCENT / MIN_BULK_VEHICLES).
BULK_DISCOUNT_THRESHOLD = 10
BULK_DISCOUNT_PERCENT = 10
MIN_BULK_VEHICLES = 2


def _addon_sum_per_vehicle(addons: Sequence) -> Decimal:
    """Per-vehicle addon total for bulk bookings (no 4+ addon rule)."""
    if not addons:
        return Decimal("0")
    return money(sum(money(Decimal(str(a.price))) for a in addons))


def _compute_bulk_total(
    *,
    unit_price: Decimal,
    addon_per_vehicle: Decimal,
    vehicle_count: int,
    paid_washes: int,
    is_suv: bool,
) -> Decimal:
    """Bulk total: paid washes + add-ons for every vehicle, then bulk % and SUV."""
    wash = money(unit_price * max(0, int(paid_washes)))
    addons = money(addon_per_vehicle * max(0, int(vehicle_count)))
    combined = money(wash + addons)
    discount_percent = (
        BULK_DISCOUNT_PERCENT if vehicle_count > BULK_DISCOUNT_THRESHOLD else 0
    )
    discount_amount = money(combined * Decimal(str(discount_percent)) / Decimal("100"))
    after_discount = money(max(Decimal("0"), combined - discount_amount))
    suv_surcharge = money(after_discount * Decimal("0.20")) if is_suv else Decimal("0")
    return money(after_discount + suv_surcharge)


def expected_bulk_total_from_booking_data(user, booking_data: dict) -> Decimal:
    """
    Recompute bulk order total (fleet/partner bulk flow).
    Mirrors client useBulkBooking: N × service + N × addons, bulk % off, then 20% SUV.
    """
    service, addons, is_suv, _is_express = _parse_booking_data_service_addons(
        booking_data, user
    )
    try:
        number_of_vehicles = int(booking_data.get("number_of_vehicles", 0))
    except (TypeError, ValueError):
        number_of_vehicles = 0
    if number_of_vehicles < MIN_BULK_VEHICLES:
        raise ValueError("Bulk bookings require at least 2 vehicles")

    unit_price = _service_unit_price(user, service)
    addon_per_vehicle = _addon_sum_per_vehicle(addons)
    return _compute_bulk_total(
        unit_price=unit_price,
        addon_per_vehicle=addon_per_vehicle,
        vehicle_count=number_of_vehicles,
        paid_washes=number_of_vehicles,
        is_suv=is_suv,
    )


def _bulk_service_is_quick_sparkle(booking_data: dict) -> bool:
    raw = booking_data.get("service_type") or booking_data.get("service") or {}
    if isinstance(raw, dict):
        name = raw.get("name", "")
    else:
        name = booking_data.get("service_name") or ""
    return is_quick_sparkle_service_name(str(name) if name else "")


def resolve_fleet_bulk_complimentary(user, booking_data: dict):
    """
    How many complimentary vehicles to apply if the client opted in.

    Returns ``(applied, error, availability)``. Does not consume quota.
    """
    if not booking_data.get("use_complimentary_sparkle"):
        return 0, None, None
    if not _bulk_service_is_quick_sparkle(booking_data):
        return 0, "Complimentary sparkles only apply to Quick Sparkle.", None

    from main.models import Fleet

    fleet = Fleet.for_user(user)
    if not fleet:
        return 0, "Fleet not found for complimentary sparkle usage.", None

    availability = fleet.get_complimentary_sparkle_availability()
    if not availability.get("has_subscription") or not availability.get("available"):
        return 0, "Complimentary sparkles require an active fleet subscription.", None

    remaining = int(availability.get("remaining") or 0)
    if remaining < 1:
        used = availability.get("used") or 0
        quota = availability.get("quota") or 0
        return 0, f"No complimentary sparkles remaining. Used {used} of {quota} this period.", None

    try:
        vehicle_count = int(booking_data.get("number_of_vehicles", 0) or 0)
    except (TypeError, ValueError):
        vehicle_count = 0
    applied = min(remaining, max(0, vehicle_count))
    return applied, None, availability


def complimentary_credit_for_bulk(gross_total: Decimal, payable: Decimal) -> Decimal:
    """Wash-only credit: gross minus payable (addons always remain on the bill)."""
    return money(max(Decimal("0"), gross_total - payable))


def expected_bulk_payable_from_booking_data(user, booking_data: dict) -> Tuple[Decimal, int]:
    """Payable after opted-in complimentary washes. Add-ons are always charged.

    Complimentary sparkles zero the Quick Sparkle wash for N vehicles only.
    Add-ons stay due for every vehicle, even when washes are fully covered.
    """
    applied, err, _availability = resolve_fleet_bulk_complimentary(user, booking_data)
    if err:
        raise ValueError(err)
    if applied < 1:
        return expected_bulk_total_from_booking_data(user, booking_data), 0

    service, addons, is_suv, _is_express = _parse_booking_data_service_addons(
        booking_data, user
    )
    try:
        vehicle_count = int(booking_data.get("number_of_vehicles", 0) or 0)
    except (TypeError, ValueError):
        vehicle_count = 0
    if vehicle_count < MIN_BULK_VEHICLES:
        raise ValueError("Bulk bookings require at least 2 vehicles")

    paid_washes = max(0, vehicle_count - applied)
    payable = _compute_bulk_total(
        unit_price=_service_unit_price(user, service),
        addon_per_vehicle=_addon_sum_per_vehicle(addons),
        vehicle_count=vehicle_count,
        paid_washes=paid_washes,
        is_suv=is_suv,
    )
    return payable, applied


def stamp_bulk_complimentary_on_booking_data(booking_data: dict, applied: int, credit: Decimal) -> None:
    booking_data["complimentary_vehicles_applied"] = int(applied or 0)
    booking_data["complimentary_credit"] = float(money(credit))


def record_bulk_complimentary_usage(user, booking_data: dict, bulk_order) -> int:
    """Consume complimentary vehicles for a confirmed bulk order. Idempotent per order."""
    applied = int(booking_data.get("complimentary_vehicles_applied") or 0)
    if applied < 1 or not booking_data.get("use_complimentary_sparkle"):
        return 0
    from main.models import Fleet, FleetComplimentaryBooking

    if FleetComplimentaryBooking.objects.filter(bulk_order=bulk_order).exists():
        return applied
    fleet = getattr(bulk_order, "fleet", None) or Fleet.for_user(user)
    if not fleet:
        return 0
    return fleet.record_complimentary_usage(
        vehicles_applied=applied,
        user=user,
        branch=getattr(bulk_order, "branch", None),
        bulk_order=bulk_order,
        period_start=fleet.get_complimentary_sparkle_period_start(),
    )


def apply_server_pre_voucher_total(user, booking_data: dict) -> Decimal:
    """
    Overwrite client ``pre_voucher_total_amount`` with the server quote.

    Charge and stored appointment totals must use this value, not the payload.
    """
    try:
        if isinstance(booking_data, dict) and booking_data.get("is_bulk") is True:
            pre_total = expected_bulk_total_from_booking_data(user, booking_data)
        else:
            expected = expected_breakdown_from_booking_data(user, booking_data)
            pre_total = money(Decimal(str(expected["total"])))
            booking_data["subtotal_amount"] = expected["subtotal"]
            booking_data["vat_amount"] = expected["vat"]
    except Exception as exc:
        raise ValueError("Could not validate booking price. Refresh and try again.") from exc
    booking_data["pre_voucher_total_amount"] = float(pre_total)
    return pre_total


def _booking_uses_voucher(booking_data: dict) -> bool:
    return bool(
        booking_data.get("winner_voucher_id") or booking_data.get("gift_voucher_id")
    )


def validate_bulk_booking_financials(user, booking_data: dict) -> Optional[str]:
    """
    Validate bulk booking total_amount vs server recomputation (±2c).

    When the client opts into fleet complimentary sparkles, ``total_amount`` is
    the payable balance after wash-only credit. Add-ons remain billed in full.
    """
    if _booking_uses_voucher(booking_data):
        return None
    try:
        srv_total, applied = expected_bulk_payable_from_booking_data(user, booking_data)
    except ValueError as exc:
        return str(exc)
    except Exception as exc:
        return f"Could not validate pricing: {exc}"

    ta = booking_data.get("total_amount")
    try:
        client_total = money(Decimal(str(ta))) if ta is not None else Decimal("0")
    except Exception:
        return "Invalid total_amount"

    # Allow 2 cent tolerance for float rounding between client and server.
    if abs(client_total - srv_total) > Decimal("0.02"):
        return "Booking total does not match server quote. Please refresh and try again."

    gross = expected_bulk_total_from_booking_data(user, booking_data)
    credit = complimentary_credit_for_bulk(gross, srv_total)
    stamp_bulk_complimentary_on_booking_data(booking_data, applied, credit)
    return None


def validate_booking_financials(user, booking_data: dict) -> Optional[str]:
    """
    Validate client totals vs server recomputation (±2c).
    Skips voucher checkouts (due vs quote is enforced by voucher payment validators).
    Routes bulk bookings to validate_bulk_booking_financials.
    Returns error message or None if OK.
    """
    if isinstance(booking_data, dict) and booking_data.get("is_bulk") is True:
        return validate_bulk_booking_financials(user, booking_data)

    if _booking_uses_voucher(booking_data):
        return None
    try:
        expected = expected_breakdown_from_booking_data(user, booking_data)
    except Exception as exc:
        return f"Could not validate pricing: {exc}"

    ta = booking_data.get("total_amount")
    try:
        client_total = money(Decimal(str(ta))) if ta is not None else Decimal("0")
    except Exception:
        return "Invalid total_amount"

    srv_total = money(Decimal(str(expected["total"])))
    if abs(client_total - srv_total) > Decimal("0.02"):
        return "Booking total does not match server quote. Please refresh and try again."

    return None


def validate_complimentary_choice(user, booking_data: dict) -> Optional[str]:
    """Ensure applied free wash has a consumable source."""
    applied = bool(booking_data.get("applied_free_quick_sparkle"))
    if not applied:
        return None
    raw_st = booking_data.get("service_type") or {}
    name = raw_st.get("name", "") if isinstance(raw_st, dict) else ""
    if not is_quick_sparkle_service_name(name):
        return f"Complimentary wash only applies to {CANONICAL_QUICK_SPARKLE_LABEL} (and titles containing \"Quick Sparkle\")."

    qs = build_quick_sparkle_entitlements(user, name)
    elig = eligible_complimentary_sources_list(qs)
    if not elig:
        return "No complimentary Quick Sparkle is available for this booking."

    source = booking_data.get("complimentary_quick_sparkle_source")
    if len(elig) >= 2:
        if source not in COMPLIMENTARY_SOURCES:
            return "Select how to apply your complimentary Quick Sparkle."
        if source not in elig:
            return "Selected complimentary Quick Sparkle source is not available."
        return None

    # Single eligible path: explicit source must match if provided
    if source in COMPLIMENTARY_SOURCES and source not in elig:
        return "Selected complimentary Quick Sparkle source is not available."
    return None


def consume_complimentary_quick_sparkle(user, booking_data: dict) -> Tuple[bool, str]:
    """
    Consume one complimentary Quick Sparkle for the claimed source (or legacy loyalty→partner).
    Returns (success, consumed_source_or_error_code).
    Subscription uses DB ledger ``complimentary_sparkles_used`` on ``B2CSubcription``.
    """
    from main.models import B2CSubcription, LoyaltyProgram, ReferralAttribution

    applied = bool(booking_data.get("applied_free_quick_sparkle"))
    if not applied:
        return True, ""

    raw_st = booking_data.get("service_type") or {}
    name = raw_st.get("name", "") if isinstance(raw_st, dict) else ""
    if not is_quick_sparkle_service_name(name):
        return False, "wrong_service"

    source = booking_data.get("complimentary_quick_sparkle_source") or resolve_effective_complimentary_source(
        user, booking_data
    )
    if source == "subscription":
        with transaction.atomic():
            sub = get_active_b2c_subscription(user)
            if not sub:
                return False, "no_subscription"
            sub = B2CSubcription.objects.select_for_update().select_related("plan", "plan__tier").get(
                pk=sub.pk
            )
            limits = sub.plan.get_limits()
            max_spark = int(limits.get("max_prisma_sparkles", 0))
            used = int(sub.complimentary_sparkles_used or 0)
            if max_spark <= 0 or used >= max_spark:
                return False, "subscription_cap"
            sub.complimentary_sparkles_used = used + 1
            sub.save(update_fields=["complimentary_sparkles_used"])
        return True, "subscription"

    if source == "loyalty":
        try:
            loyalty = LoyaltyProgram.objects.get(user=user)
            if loyalty.can_use_free_quick_sparkle():
                loyalty.use_free_quick_sparkle()
                return True, "loyalty"
        except LoyaltyProgram.DoesNotExist:
            pass
        return False, "loyalty_unavailable"

    if source == "partner":
        try:
            attr = ReferralAttribution.objects.get(referred_user=user, source="partner")
            if not attr.partner_free_wash_used and (
                attr.expires_at is None or attr.expires_at > timezone.now()
            ):
                attr.partner_free_wash_used = True
                attr.save()
                return True, "partner"
        except ReferralAttribution.DoesNotExist:
            pass
        return False, "partner_unavailable"

    # Legacy: loyalty first, then partner
    try:
        loyalty = LoyaltyProgram.objects.get(user=user)
        if loyalty.can_use_free_quick_sparkle():
            loyalty.use_free_quick_sparkle()
            return True, "loyalty"
    except LoyaltyProgram.DoesNotExist:
        pass

    try:
        attr = ReferralAttribution.objects.get(referred_user=user, source="partner")
        if not attr.partner_free_wash_used and (
            attr.expires_at is None or attr.expires_at > timezone.now()
        ):
            attr.partner_free_wash_used = True
            attr.save()
            return True, "partner"
    except ReferralAttribution.DoesNotExist:
        pass

    sub = get_active_b2c_subscription(user)
    if sub:
        with transaction.atomic():
            sub = B2CSubcription.objects.select_for_update().select_related("plan", "plan__tier").get(
                pk=sub.pk
            )
            limits = sub.plan.get_limits()
            max_spark = int(limits.get("max_prisma_sparkles", 0))
            used = int(sub.complimentary_sparkles_used or 0)
            if max_spark > 0 and used < max_spark:
                sub.complimentary_sparkles_used = used + 1
                sub.save(update_fields=["complimentary_sparkles_used"])
                return True, "subscription"

    return False, "no_legacy_source"
