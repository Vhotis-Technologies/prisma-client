"""Helpers for classifying Stripe subscription invoices.

Stripe subscription metadata keeps the checkout ``billing_id`` for the life of
the subscription, so ``billing_id is None`` is not a valid renewal signal.
"""


def subscription_invoice_is_renewal(billing_reason, seed_billing_is_pending=False):
    """
    Return True when this invoice should create a new billing row and extend end_date.

    Args:
        billing_reason: Stripe Invoice.billing_reason (e.g. subscription_create,
            subscription_cycle). Empty/None falls back to seed billing status.
        seed_billing_is_pending: True when the metadata billing_id row is still pending
            (used only when billing_reason is missing).

    Returns:
        bool: True for cycle/update invoices and for a missing reason once the
            seed billing row is already paid.
    """
    reason = (billing_reason or "").strip()
    if reason:
        return reason != "subscription_create"
    return not seed_billing_is_pending
