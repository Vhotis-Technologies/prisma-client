"""
Branch spend calculation for fleet branch spending limits (leash enforcement).

Aggregates succeeded payments minus refunds for branch fleet members and bulk orders.
"""
from decimal import Decimal
from django.utils import timezone
from django.db.models import Sum, F
from django.db.models.functions import Coalesce

from main.models import Branch, FleetMember, PaymentTransaction, RefundRecord


def get_branch_spend_for_period(branch: Branch, period: str) -> Decimal:
    """
    Net branch spend for the given period: succeeded payments minus succeeded refunds.

    Only counts bookings whose user is a ``FleetMember`` of the branch, plus bulk
    payments attributed to ``bulk_order.branch``.

    Args:
        branch: ``Branch`` whose admins' spend is summed.
        period: ``'weekly'`` (rolling 7 days) or ``'monthly'`` (calendar month to now).

    Returns:
        Decimal: Net spend >= 0 (payments minus refunds, floored at zero).
    """
    admin_ids = list(
        FleetMember.objects.filter(branch=branch).values_list('user_id', flat=True)
    )
    if not admin_ids:
        return Decimal('0')

    now = timezone.now()
    if period == 'weekly':
        start = now - timezone.timedelta(days=7)
        end = now
    else:
        # monthly: first day 00:00:00 through now in project timezone
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now

    # Per-booking payments by branch fleet admins (exclude orphan transactions).
    payments_qs = PaymentTransaction.objects.filter(
        transaction_type='payment',
        status='succeeded',
        booking__user_id__in=admin_ids,
        booking__isnull=False,
        created_at__gte=start,
        created_at__lte=end,
    )
    payments_sum = payments_qs.aggregate(total=Sum('amount'))['total'] or Decimal('0')

    # Bulk fleet orders billed to this branch
    bulk_payments_qs = PaymentTransaction.objects.filter(
        transaction_type='payment',
        status='succeeded',
        bulk_order__isnull=False,
        bulk_order__branch=branch,
        created_at__gte=start,
        created_at__lte=end,
    )
    bulk_payments_sum = bulk_payments_qs.aggregate(total=Sum('amount'))['total'] or Decimal('0')
    payments_sum = payments_sum + bulk_payments_sum

    # Refunds: use processed_at when set, else created_at, for period window
    refunds_qs = (
        RefundRecord.objects.filter(
            booking__user_id__in=admin_ids,
            status='succeeded',
        )
        .annotate(effective_date=Coalesce(F('processed_at'), F('created_at')))
        .filter(
            effective_date__gte=start,
            effective_date__lte=end,
        )
    )
    refunds_sum = refunds_qs.aggregate(total=Sum('requested_amount'))['total'] or Decimal('0')

    net = payments_sum - refunds_sum
    return max(Decimal('0'), net)
