"""
Map vehicle body style / SUV flags to B2C subscription vehicle categories.

Keep needle list aligned with client ``vehicleBodyStyle.ts``.
"""
from __future__ import annotations

from typing import Optional

from main.models.b2c import B2CSubcriptionPlan, B2CSubcriptionTier

SUV_MPV_NEEDLES = (
    "suv",
    "mpv",
    "sport utility",
    "people carrier",
    "multi-purpose",
    "4x4",
    "four wheel",
    "4 wheel",
    "crossover",
)

SEDAN = B2CSubcriptionTier.VEHICLE_CATEGORY_SEDAN
SUV_MPV = B2CSubcriptionTier.VEHICLE_CATEGORY_SUV_MPV


def body_style_requires_suv_mpv(body_style: Optional[str]) -> bool:
    """True when free-text body style matches SUV / MPV (or similar) needles."""
    if body_style is None or not isinstance(body_style, str):
        return False
    n = body_style.strip().lower()
    if not n:
        return False
    return any(kw in n for kw in SUV_MPV_NEEDLES)


def resolve_is_suv_mpv(
    *,
    is_suv: Optional[bool] = None,
    body_style: Optional[str] = None,
) -> bool:
    """
    Resolve SUV/MPV for pricing and subscription coverage.

    Explicit ``True`` wins. Otherwise body_style needles are checked. Explicit
    ``False`` still yields True when body_style indicates SUV/MPV (safer for
    mis-tagged clients).
    """
    if is_suv is True:
        return True
    if body_style_requires_suv_mpv(body_style):
        return True
    return bool(is_suv)


def booking_vehicle_category(*, is_suv: bool) -> str:
    """Subscription category implied by the booking vehicle."""
    return SUV_MPV if is_suv else SEDAN


def subscription_covers_booking(plan_vehicle_category: Optional[str], *, is_suv: bool) -> bool:
    """
    Whether a B2C plan's vehicle category covers this booking vehicle.

    - SUV/MPV plans cover all vehicles (including sedans).
    - Sedan plans cover sedans only (not SUV/MPV).
    Missing/unknown category is treated as SUV/MPV (legacy grandfathered plans).
    """
    category = plan_vehicle_category or SUV_MPV
    if category == SEDAN:
        return not is_suv
    return True


def plan_covers_booking(plan: Optional[B2CSubcriptionPlan], *, is_suv: bool) -> bool:
    """Convenience wrapper using a plan row."""
    if plan is None:
        return False
    return subscription_covers_booking(getattr(plan, "vehicle_category", None), is_suv=is_suv)
