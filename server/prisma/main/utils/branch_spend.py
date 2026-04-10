"""
Branch spend calculation for leash enforcement.
"""
from decimal import Decimal
from django.utils import timezone
from django.db.models import Sum, F
from django.db.models.functions import Coalesce

from main.models import Branch, FleetMember, PaymentTransaction, RefundRecord


def get_branch_spend_for_period(branch: Branch, period: str) -> Decimal:
    """
    Net branch spend for the given period: succeeded payments minus succeeded refunds.
    Only counts bookings whose user is a FleetMember of the branch.

    - weekly: rolling last 7 days from now.
    - monthly: current calendar month (start to end) in project timezone.

    Returns Decimal (>= 0).
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
        # monthly: first day 00:00:00 to end of today (or last day of month)
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now

    # Payments: type=payment, status=succeeded, booking.user in branch admins, in period.
    # Exclude transactions without booking (can't attribute to branch).
    payments_qs = PaymentTransaction.objects.filter(
        transaction_type='payment',
        status='succeeded',
        booking__user_id__in=admin_ids,
        booking__isnull=False,
        created_at__gte=start,
        created_at__lte=end,
    )
    payments_sum = payments_qs.aggregate(total=Sum('amount'))['total'] or Decimal('0')

    # Bulk order payments attributed to this branch (bulk_order.branch == branch)
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

    # Refunds: status=succeeded, booking.user in branch admins. Use processed_at or created_at for period.
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
