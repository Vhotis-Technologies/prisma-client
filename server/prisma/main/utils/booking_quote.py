"""
Server-side booking price quote and complimentary Quick Sparkle validation.

Mirrors client useBooking.calculateFinalPrice (VAT-inclusive line items, 23% VAT split,
4+ addons discount, SUV 15%, express €30, loyalty/promotion % on pre-VAT-inclusive subtotal).
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


def is_quick_sparkle_service_name(name: Optional[str]) -> bool:
    """
    True when the service title is the Prisma Quick Sparkle line.

    Normalises case and internal spacing, then matches if the canonical phrase
    appears (covers e.g. \"Prisma Quick Sparkle\", legacy \"The Quick Sparkle\").
    """
    if not name or not isinstance(name, str):
        return False
    normalized = " ".join(name.strip().lower().split())
    return "quick sparkle" in normalized

AmountBreakdown = Dict[str, float]


def money(d: Decimal) -> Decimal:
    return d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def float_money(d: Decimal) -> float:
    return float(money(d))


def line_total_inc_vat_to_parts(total_inc_vat: Decimal) -> Tuple[Decimal, Decimal, Decimal]:
    total_inc_vat = money(total_inc_vat)
    sub_ex = (total_inc_vat / (Decimal("1") + VAT_RATE)).quantize(Decimal("0.01"), ROUND_HALF_UP)
    vat_amt = money(total_inc_vat - sub_ex)
    return sub_ex, vat_amt, total_inc_vat


def _user_excluded_from_promotions(user) -> bool:
    from main.models import Partner

    if getattr(user, "is_fleet_owner", False) or getattr(user, "is_branch_admin", False):
        return True
    if user.is_fleet_admin_or_manager():
        return True
    if Partner.objects.filter(user=user).exists():
        return True
    return False


def _active_promotion_discount_pct(user) -> Decimal:
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
    return money(Decimal(str(service.get_price_for_user(user))))


def _addon_total_with_four_plus_rule(addons: Sequence) -> Decimal:
    """addons: iterable of AddOns with .price"""
    if not addons:
        return Decimal("0")
    prices = [money(Decimal(str(a.price))) for a in addons]
    if len(prices) >= 4:
        cheapest = min(prices)
        return money(sum(prices) - cheapest)
    return money(sum(prices))


def _partner_booking_discount_pct_setting() -> Decimal:
    raw = getattr(settings, "PARTNER_REFERRED_BOOKING_DISCOUNT_PERCENT", 35)
    try:
        return Decimal(str(int(raw)))
    except (TypeError, ValueError):
        return Decimal("35")


def _subscription_booking_discount_pct(user) -> Decimal:
    """Active B2C tier discount on the sticker stack (Lite/Pro 5%, Spectrum/Spectacular 7%)."""
    from main.models import B2CSubcription

    sub = (
        B2CSubcription.objects.filter(user=user, status__in=["active", "past_due"])
        .select_related("plan", "plan__tier")
        .order_by("-start_date")
        .first()
    )
    if not sub or not getattr(sub, "plan", None):
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
    """Internal full stack: sticker (VAT-inc), tier/promo/partner € off, then ex-VAT breakdown."""
    base = Decimal("0") if exclude_service_price else _service_unit_price(user, service)
    addon_total = _addon_total_with_four_plus_rule(addons)
    sub = money(base + addon_total)
    if exclude_service_price:
        suv = Decimal("0")
    else:
        suv = money(sub * Decimal("0.15")) if is_suv else Decimal("0")
    express_fee = Decimal("30") if is_express else Decimal("0")
    total_before_discount = money(sub + suv + express_fee)
    loyalty_pct = _loyalty_discount_pct(user)
    promo_pct = _active_promotion_discount_pct(user)
    subscription_pct = _subscription_booking_discount_pct(user)
    loyalty_amt = money(total_before_discount * loyalty_pct / Decimal("100"))
    promo_amt = money(total_before_discount * promo_pct / Decimal("100"))
    p_pct = partner_booking_discount_pct if partner_booking_discount_pct > 0 else Decimal("0")
    partner_amt = money(total_before_discount * p_pct / Decimal("100"))
    subscription_amt = money(total_before_discount * subscription_pct / Decimal("100"))
    total_inc = money(
        total_before_discount - loyalty_amt - promo_amt - partner_amt - subscription_amt
    )
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
    return {
        "subtotal": float_money(sub_ex),
        "vat": float_money(vat_amt),
        "total": float_money(total_inc),
    }


def get_partner_eligible(user) -> bool:
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
    if not user.is_b2c_user():
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
    from main.models import B2CSubcription

    return (
        B2CSubcription.objects.filter(user=user, status__in=["active", "past_due"])
        .select_related("plan", "plan__tier")
        .order_by("-start_date")
        .first()
    )


def _period_dates(sub) -> Tuple[timezone.datetime.date, timezone.datetime.date]:
    start = sub.start_date.date() if hasattr(sub.start_date, "date") else sub.start_date
    end = sub.end_date.date() if hasattr(sub.end_date, "date") else sub.end_date
    return start, end


def get_subscription_quick_sparkle_snapshot(user) -> Dict[str, Any]:
    sub = get_active_b2c_subscription(user)
    if not sub or not getattr(sub, "plan", None):
        return {
            "eligible_subscription": False,
            "remaining_subscription": 0,
            "max_subscription": 0,
            "period_start": None,
            "period_end": None,
            "period_label": "",
        }
    limits = sub.plan.get_limits()
    max_spark = int(limits.get("max_prisma_sparkles", 0))
    used = int(getattr(sub, "complimentary_sparkles_used", 0) or 0)
    remaining = max(0, max_spark - used)
    start_d, end_d = _period_dates(sub)
    return {
        "eligible_subscription": remaining > 0 and max_spark > 0,
        "remaining_subscription": remaining,
        "max_subscription": max_spark,
        "period_start": start_d.isoformat(),
        "period_end": end_d.isoformat(),
        "period_label": f"{start_d.isoformat()} – {end_d.isoformat()}",
    }


def eligible_complimentary_sources_list(qs: Dict[str, Any]) -> List[str]:
    """Which complimentary Quick Sparkle sources are currently available."""
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
    qs = build_quick_sparkle_entitlements(user, name)
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
) -> Dict[str, Any]:
    """If eligibility_only, answer \"can this user use a complimentary QS\" without a booked service name (e.g. check_free_wash)."""
    is_qs = eligibility_only or is_quick_sparkle_service_name(service_name)
    loyalty_snap = get_loyalty_quick_sparkle_snapshot(user)
    partner_ok = get_partner_eligible(user) if is_qs else False
    sub_snap = get_subscription_quick_sparkle_snapshot(user) if is_qs else {}
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
    qs = build_quick_sparkle_entitlements(user, service_name)
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

    raw_veh = booking_data.get("vehicle") or {}
    is_suv = bool(booking_data.get("booking_is_suv") or booking_data.get("is_suv"))
    if isinstance(raw_veh, dict):
        is_suv = is_suv or bool(raw_veh.get("car_is_suv") or raw_veh.get("is_suv"))
    is_express = booking_data.get("is_express_service", False)
    if isinstance(is_express, str):
        is_express = is_express.lower() == "true"
    return service, addons, is_suv, is_express


def _partner_booking_discount_pct_for_booking_data(user, booking_data: dict) -> Decimal:
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


def validate_booking_financials(user, booking_data: dict) -> Optional[str]:
    """
    Validate client totals vs server recomputation (±2c).
    Skips when winner_voucher_id is set (handled by validate_winner_voucher_for_payment).
    Returns error message or None if OK.
    """
    winner_vid = booking_data.get("winner_voucher_id")
    if winner_vid:
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

    # Optional: subtotal/vat check if both provided
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
