"""
Aggregated KPIs for the support mobile app home screen.

**Auth:** ``SupportPermissionAccess`` (internal key from support server).

**Contract:** ``get_dashboard_data`` accepts ``timeframe`` (daily | 30days | quarterly | yearly),
computes windowed totals for the current period and the prior period of the same length,
and returns card-friendly metrics (values + percent change). Data is read from live models
(Users, BookedAppointment, PaymentTransaction, FleetSubscription, Partner, etc.).
"""
import logging
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from datetime import timedelta

from rest_framework.permissions import BasePermission
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from main.models import (
    User,
    BookedAppointment,
    PaymentTransaction,
    FleetSubscription,
    Fleet,
    Partner
)
from main.utils.has_support_permission import has_support_permission
from main.views.support.support_permission_access import SupportPermissionAccess

logger = logging.getLogger(__name__)

# Map query param ``timeframe`` → rolling window length in days (for “last N days” + prior N days).
TIMEFRAME_WINDOW_DAYS = {
    'daily': 1,
    '30days': 30,
    'quarterly': 90,
    'yearly': 365,
}


class SupportDashboardView(APIView):
    """
    Single GET action: ``get_dashboard_data`` → :meth:`_get_dashboard_data`.
    """

    permission_classes = [SupportPermissionAccess]
    action_handler = {
        'get_dashboard_data': '_get_dashboard_data',
    }

    def get(self, request, *args, **kwargs):
        """
        Route URL ``action`` to :attr:`action_handler` (currently ``get_dashboard_data`` only).

        Returns:
            DRF ``Response`` from the handler, or 400 for unknown actions.
        """
        action = kwargs.get('action')
        if action not in self.action_handler:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handler[action])
        return handler(request)

    def _get_dashboard_data(self, request):
        """
        Compute KPI cards for the support home screen.

        Query params:
            timeframe: ``daily`` | ``30days`` | ``quarterly`` | ``yearly``.

        Returns:
            ``{'data': {'metrics': [...], 'meta': {...}}}`` with value and percent-change strings.
        """
        raw = (request.query_params.get('timeframe') or 'daily').strip().lower()
        if raw not in TIMEFRAME_WINDOW_DAYS:
            return Response(
                {
                    'error': 'Invalid timeframe',
                    'detail': f'Use one of: {", ".join(TIMEFRAME_WINDOW_DAYS)}',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        window_days = TIMEFRAME_WINDOW_DAYS[raw]
        logger.info(
            'Support dashboard: computing metrics timeframe=%s window_days=%s',
            raw,
            window_days,
        )
        metrics = self._build_dashboard_metrics(window_days)
        return Response({
            'data': {
                'metrics': metrics,
                'meta': {
                    'timeframe': raw,
                    'window_days': window_days,
                },
            },
        })

    @staticmethod
    def _pct_change(current: float, previous: float) -> tuple[float, str, bool]:
        """
        Percent change vs prior period for dashboard cards.

        Args:
            current: Metric total in the current window.
            previous: Metric total in the immediately preceding window of equal length.

        Returns:
            Tuple ``(raw_pct, formatted_string, is_increase)``; treats zero previous as 100%% if
            current > 0.
        """
        if previous <= 0:
            pct = 100.0 if current > 0 else 0.0
        else:
            pct = ((current - previous) / previous) * 100.0
        is_increase = pct >= 0
        sign = '+' if pct >= 0 else ''
        return pct, f'{sign}{pct:.2f}%', is_increase

    @staticmethod
    def _client_users_qs():
        """End-customer accounts only (exclude Django staff/superuser rows)."""
        return User.objects.filter(is_staff=False, is_superuser=False)

    def _build_dashboard_metrics(self, window_days: int):
        """In-window totals vs the prior period of the same length (for value + % change)."""
        now = timezone.now()
        current_start = now - timedelta(days=window_days)
        prev_start = current_start - timedelta(days=window_days)

        clients_curr = self._client_users_qs().filter(
            created_at__gte=current_start,
            created_at__lte=now,
        ).count()
        clients_prev = self._client_users_qs().filter(
            created_at__gte=prev_start,
            created_at__lt=current_start,
        ).count()

        bookings_curr = BookedAppointment.objects.filter(
            created_at__gte=current_start,
            created_at__lte=now,
        ).count()
        bookings_prev = BookedAppointment.objects.filter(
            created_at__gte=prev_start,
            created_at__lt=current_start,
        ).count()

        # Subscriptions whose billing/start date falls in each window
        subs_curr = FleetSubscription.objects.filter(
            start_date__gte=current_start,
            start_date__lte=now,
        ).count()
        subs_prev = FleetSubscription.objects.filter(
            start_date__gte=prev_start,
            start_date__lt=current_start,
        ).count()

        revenue_types = [
            'payment',
            'fleet_subscription',
            'b2c_subscription',
            'tip',
            'reschedule_fee',
            'vin_lookup',
        ]
        rev_curr = PaymentTransaction.objects.filter(
            status='succeeded',
            transaction_type__in=revenue_types,
            created_at__gte=current_start,
            created_at__lte=now,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        rev_prev = PaymentTransaction.objects.filter(
            status='succeeded',
            transaction_type__in=revenue_types,
            created_at__gte=prev_start,
            created_at__lt=current_start,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        fleets_curr = Fleet.objects.filter(
            created_at__gte=current_start,
            created_at__lte=now,
        ).count()
        fleets_prev = Fleet.objects.filter(
            created_at__gte=prev_start,
            created_at__lt=current_start,
        ).count()

        partners_curr = Partner.objects.filter(
            created_at__gte=current_start,
            created_at__lte=now,
        ).count()
        partners_prev = Partner.objects.filter(
            created_at__gte=prev_start,
            created_at__lt=current_start,
        ).count()

        rev_curr_f, rev_prev_f = float(rev_curr), float(rev_prev)

        rows = [
            ('Clients', clients_curr, clients_prev),
            ('Bookings', bookings_curr, bookings_prev),
            ('Subscriptions', subs_curr, subs_prev),
            ('Revenue', rev_curr_f, rev_prev_f),
            ('Fleets', fleets_curr, fleets_prev),
            ('Partners', partners_curr, partners_prev),
        ]

        metrics = []
        for label, curr_v, prev_v in rows:
            _, diff_str, is_up = self._pct_change(float(curr_v), float(prev_v))
            if label == 'Revenue':
                display_value = round(float(curr_v), 2)
            else:
                display_value = int(round(float(curr_v)))

            metrics.append({
                'label': label,
                'value': display_value,
                'difference': diff_str,
                'isIncrease': is_up,
                'icon': 'trending-up' if is_up else 'trending-down',
            })

        return metrics
