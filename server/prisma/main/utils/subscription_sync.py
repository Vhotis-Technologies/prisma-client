"""Pull live Stripe subscription status and period dates onto local rows."""
from __future__ import annotations

import logging
from datetime import datetime, timezone as dt_timezone

import stripe
from django.conf import settings

logger = logging.getLogger(__name__)

STRIPE_STATUS_TO_LOCAL = {
    "active": "active",
    "trialing": "trialing",
    "past_due": "past_due",
    "canceled": "cancelled",
    "unpaid": "expired",
    "incomplete": "pending",
    "incomplete_expired": "expired",
    "paused": "past_due",
}


def _as_dict(obj):
    if obj is None:
        return {}
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    if isinstance(obj, dict):
        return obj
    return {}


def _timestamp_to_dt(value):
    if not value:
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=dt_timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


def stripe_period_end(stripe_sub: dict):
    """Return current_period_end from the subscription or its first item."""
    ts = stripe_sub.get("current_period_end")
    if ts:
        return _timestamp_to_dt(ts)
    items = (stripe_sub.get("items") or {}).get("data") or []
    if items:
        return _timestamp_to_dt(items[0].get("current_period_end"))
    return None


def stripe_period_start(stripe_sub: dict):
    """Return current_period_start from the subscription or its first item."""
    ts = stripe_sub.get("current_period_start")
    if ts:
        return _timestamp_to_dt(ts)
    items = (stripe_sub.get("items") or {}).get("data") or []
    if items:
        return _timestamp_to_dt(items[0].get("current_period_start"))
    return None


def latest_paid_billing_at(subscription):
    """Latest paid billing_date on the local subscription, or None."""
    records = None
    for name in ("billing_records", "subscriptionbilling_set", "b2csubcriptionbilling_set"):
        records = getattr(subscription, name, None)
        if records is not None:
            break
    if records is None:
        return None
    paid = records.filter(status="paid").order_by("-billing_date").first()
    return paid.billing_date if paid else None


def sync_local_subscription_from_stripe(subscription) -> dict:
    """
    Retrieve the Stripe subscription and copy status / period / trial onto ``subscription``.

    Safe no-op when there is no Stripe id or Stripe is unreachable. Returns display
    flags so B2C (no ``trialing`` status) can still show a live trial.
    """
    result = {
        "is_trialing": getattr(subscription, "status", None) == "trialing",
        "synced": False,
    }
    stripe_id = getattr(subscription, "stripe_subscription_id", None)
    if not stripe_id:
        return result
    api_key = getattr(settings, "STRIPE_SECRET_KEY", None) or stripe.api_key
    if not api_key:
        return result
    try:
        stripe.api_key = api_key
        raw = stripe.Subscription.retrieve(stripe_id)
    except stripe.error.StripeError:
        logger.warning(
            "Stripe retrieve failed for subscription %s (%s)",
            getattr(subscription, "id", None),
            stripe_id,
            exc_info=True,
        )
        return result

    data = _as_dict(raw)
    stripe_status = data.get("status") or ""
    mapped = STRIPE_STATUS_TO_LOCAL.get(stripe_status)
    allowed = {choice[0] for choice in subscription._meta.get_field("status").choices}
    update_fields = []

    if mapped:
        local_status = mapped if mapped in allowed else ("pending" if mapped == "trialing" else None)
        if local_status and subscription.status != local_status:
            subscription.status = local_status
            update_fields.append("status")

    period_end = stripe_period_end(data) or _timestamp_to_dt(data.get("trial_end"))
    if period_end and subscription.end_date != period_end:
        subscription.end_date = period_end
        update_fields.append("end_date")

    if hasattr(subscription, "trial_end_date"):
        trial_end = _timestamp_to_dt(data.get("trial_end"))
        if trial_end and subscription.trial_end_date != trial_end:
            subscription.trial_end_date = trial_end
            update_fields.append("trial_end_date")
        if stripe_status == "trialing" and trial_end and subscription.end_date != trial_end:
            subscription.end_date = trial_end
            if "end_date" not in update_fields:
                update_fields.append("end_date")

    if hasattr(subscription, "auto_renew"):
        cancel_at_end = bool(data.get("cancel_at_period_end"))
        should_renew = not cancel_at_end and stripe_status not in ("canceled", "unpaid", "incomplete_expired")
        if subscription.auto_renew != should_renew:
            subscription.auto_renew = should_renew
            update_fields.append("auto_renew")

    if update_fields:
        if hasattr(subscription, "updated_at"):
            update_fields.append("updated_at")
        subscription.save(update_fields=update_fields)

    result["is_trialing"] = stripe_status == "trialing" or subscription.status == "trialing"
    result["synced"] = True
    return result
