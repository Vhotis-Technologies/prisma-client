"""
Partner API: partner onboarding, bank account, payout requests, commission earnings/payouts, referral attributions.

Helper functions _mask_sort_code, _mask_iban for masking sensitive data in responses.
"""
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from django.db.models import Sum
from datetime import datetime, timedelta
from decimal import Decimal

from main.models import Partner, PartnerBankAccount, PartnerPayoutRequest, ReferralAttribution, CommissionEarning, CommissionPayout, BookedAppointment, Vehicle, VehicleOwnership, BulkOrder


def _mask_sort_code(value):
    """Mask UK sort code for display: show only last 2 digits, rest as **-**-**."""
    if not value or len(value) < 2:
        return '**-**-**'
    clean = value.replace('-', '')[:6]
    if len(clean) < 2:
        return '**-**-**'
    return '**-**-' + clean[-2:]


def _mask_iban(value):
    """Mask IBAN for display: show only last 4 chars, prefix ****."""
    if not value or len(value) < 4:
        return value
    clean = (value or '').replace(' ', '')
    return '****' + clean[-4:]


class PartnerView(APIView):
    """
    Dealership partner API: dashboard metrics, invoices, bank details, payout requests.

    Requires an active ``Partner`` profile on the user. Action-routed via
    ``partner/<action>/``. Sensitive bank fields are masked in responses.
    """

    permission_classes = [IsAuthenticated]

    action_handlers = {
        'get_dashboard': 'get_dashboard',
        'get_invoices': 'get_invoices',
        'get_payout_details': 'get_payout_details',
        'get_payout_history': 'get_payout_history',
        'update_payout_details': 'update_payout_details',
        'create_payout_request': 'create_payout_request',
    }

    def get(self, request, *args, **kwargs):
        """Route GET by action (e.g. get_dashboard, get_payout_details, get_payout_history). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)

    def patch(self, request, *args, **kwargs):
        """Route PATCH by action (e.g. update_payout_details). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)

    def post(self, request, *args, **kwargs):
        """Route POST by action (e.g. create_payout_request). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)

    def _get_partner(self, request):
        """Return the authenticated user's active Partner profile, or None if not partner or inactive."""
        if not hasattr(request.user, 'partner_profile') or request.user.partner_profile is None:
            return None
        partner = request.user.partner_profile
        if not partner.is_active:
            return None
        return partner

    def get_dashboard(self, request):
        """Get partner dashboard with referral metrics, activity, and commission."""
        partner = self._get_partner(request)
        if not partner:
            return Response({'error': 'Partner profile not found or inactive'}, status=status.HTTP_403_FORBIDDEN)

        # Time windows for active (90d) vs churned (180d) referred users
        now = timezone.now()
        ninety_days_ago = now - timedelta(days=90)
        one_eighty_days_ago = now - timedelta(days=180)
        this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_month_end = this_month_start - timedelta(days=1)
        last_month_start = last_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        attributed_user_ids = list(
            ReferralAttribution.objects.filter(partner=partner).values_list('referred_user_id', flat=True)
        )

        if not attributed_user_ids:
            return Response({
                'partner': {
                    'id': str(partner.id),
                    'business_name': partner.business_name,
                    'referral_code': partner.referral_code,
                },
                'referral_metrics': {
                    'total_referred': 0,
                    'active': 0,
                    'inactive': 0,
                    'churned': 0,
                    'conversion_rate': 0,
                    'vehicles_registered': 0,
                },
                'activity_metrics': {
                    'total_bookings': 0,
                    'completed': 0,
                    'cancelled': 0,
                    'revenue_total': 0,
                    'revenue_this_month': 0,
                    'revenue_last_month': 0,
                },
                'commission': {
                    'total_earned': 0,
                    'pending': 0,
                    'paid': 0,
                    'monthly_breakdown': [],
                    'commission_rate': float(partner.commission_rate),
                },
                'vehicle_insights': {
                    'total_vehicles': 0,
                    'no_booking_activity': 0,
                },
            }, status=status.HTTP_200_OK)

        # Referral metrics
        total_referred = len(attributed_user_ids)
        active_users = set(
            BookedAppointment.objects.filter(
                user_id__in=attributed_user_ids,
                status='completed',
                appointment_date__gte=ninety_days_ago.date(),
            ).values_list('user_id', flat=True).distinct()
        )
        active_count = len(active_users)
        churned_users = set(
            u_id for u_id in attributed_user_ids
            if not BookedAppointment.objects.filter(
                user_id=u_id,
                status='completed',
                appointment_date__gte=one_eighty_days_ago.date(),
            ).exists()
        )
        churned_count = len(churned_users)
        inactive_count = total_referred - active_count - churned_count
        conversion_rate = (active_count / total_referred) if total_referred > 0 else 0

        vehicles_registered = Vehicle.objects.filter(
            ownerships__owner_id__in=attributed_user_ids,
            ownerships__end_date__isnull=True,
        ).distinct().count()

        # Activity metrics
        attributed_bookings = BookedAppointment.objects.filter(user_id__in=attributed_user_ids)
        total_bookings = attributed_bookings.count()
        completed_bookings = attributed_bookings.filter(status='completed')
        completed_count = completed_bookings.count()
        cancelled_count = attributed_bookings.filter(status='cancelled').count()

        revenue_total = completed_bookings.aggregate(s=Sum('total_amount'))['s'] or Decimal('0')
        revenue_this_month = completed_bookings.filter(
            appointment_date__gte=this_month_start.date()
        ).aggregate(s=Sum('total_amount'))['s'] or Decimal('0')
        revenue_last_month = completed_bookings.filter(
            appointment_date__gte=last_month_start.date(),
            appointment_date__lte=last_month_end.date(),
        ).aggregate(s=Sum('total_amount'))['s'] or Decimal('0')

        # Commission
        earnings = CommissionEarning.objects.filter(partner=partner)
        total_earned = earnings.filter(status__in=['approved', 'paid']).aggregate(s=Sum('commission_amount'))['s'] or Decimal('0')
        pending = earnings.filter(status='pending').aggregate(s=Sum('commission_amount'))['s'] or Decimal('0')
        paid = earnings.filter(status='paid').aggregate(s=Sum('commission_amount'))['s'] or Decimal('0')

        from collections import defaultdict
        by_month = defaultdict(Decimal)
        for e in earnings.filter(status__in=['approved', 'paid', 'pending']):
            key = e.created_at.strftime('%Y-%m')
            by_month[key] += e.commission_amount
        monthly_breakdown = [{'month': k, 'total': float(v)} for k, v in sorted(by_month.items(), reverse=True)[:12]]

        # Vehicle insights
        referred_vehicles = Vehicle.objects.filter(
            ownerships__owner_id__in=attributed_user_ids,
            ownerships__end_date__isnull=True,
        ).distinct()
        total_vehicles = referred_vehicles.count()
        vehicles_with_booking = set(
            BookedAppointment.objects.filter(status='completed').values_list('vehicle_id', flat=True).distinct()
        )
        no_booking_activity = referred_vehicles.exclude(id__in=vehicles_with_booking).count()

        return Response({
            'partner': {
                'id': str(partner.id),
                'business_name': partner.business_name,
                'referral_code': partner.referral_code,
            },
            'referral_metrics': {
                'total_referred': total_referred,
                'active': active_count,
                'inactive': inactive_count,
                'churned': churned_count,
                'conversion_rate': round(conversion_rate, 2),
                'vehicles_registered': vehicles_registered,
            },
            'activity_metrics': {
                'total_bookings': total_bookings,
                'completed': completed_count,
                'cancelled': cancelled_count,
                'revenue_total': float(revenue_total),
                'revenue_this_month': float(revenue_this_month),
                'revenue_last_month': float(revenue_last_month),
            },
            'commission': {
                'total_earned': float(total_earned),
                'pending': float(pending),
                'paid': float(paid),
                'monthly_breakdown': monthly_breakdown,
                'commission_rate': float(partner.commission_rate),
            },
            'vehicle_insights': {
                'total_vehicles': total_vehicles,
                'no_booking_activity': no_booking_activity,
            },
        }, status=status.HTTP_200_OK)

    def get_payout_details(self, request):
        """Return masked bank account details and pending commission (manual payouts)."""
        partner = self._get_partner(request)
        if not partner:
            return Response({'error': 'Partner profile not found or inactive'}, status=status.HTTP_403_FORBIDDEN)

        pending_commission = CommissionEarning.objects.filter(
            partner=partner, status='pending'
        ).aggregate(s=Sum('commission_amount'))['s'] or Decimal('0')

        bank_account = None
        try:
            bank = partner.bank_account
            bank_account = {
                'account_holder_name': bank.account_holder_name,
                'iban_masked': _mask_iban(bank.iban) if bank.iban else None,
                'has_bank_account': True,
            }
            if bank.sort_code:
                bank_account['sort_code_masked'] = _mask_sort_code(bank.sort_code)
            if bank.account_number:
                account_last4 = bank.account_number[-4:] if len(bank.account_number) >= 4 else '****'
                bank_account['account_number_last4'] = '****' + account_last4
        except PartnerBankAccount.DoesNotExist:
            bank_account = {'has_bank_account': False}

        return Response({
            'pending_commission': float(pending_commission),
            'bank_account': bank_account,
        }, status=status.HTTP_200_OK)

    def get_invoices(self, request):
        """Get invoice list for a dealership partner (their own bulk pay-later orders)."""
        partner = self._get_partner(request)
        if not partner and not getattr(request.user, 'is_dealership', False):
            return Response(
                {'error': 'Partner profile not found or inactive'},
                status=status.HTTP_403_FORBIDDEN,
            )

        from main.utils.bulk_invoice import serialize_bulk_order_invoice_list

        invoices_qs = (
            BulkOrder.objects.filter(
                user=request.user,
                payment_status__in=['invoice_later', 'succeeded', 'paid', 'failed', 'cancelled'],
            )
            .select_related('user', 'branch')
            .order_by('-created_at')
        )

        return Response(
            {'invoices': serialize_bulk_order_invoice_list(invoices_qs)},
            status=status.HTTP_200_OK,
        )

    def update_payout_details(self, request):
        """Create/update partner bank account for manual commission payouts. Returns masked values."""
        partner = self._get_partner(request)
        if not partner:
            return Response({'error': 'Partner profile not found or inactive'}, status=status.HTTP_403_FORBIDDEN)

        data = request.data if hasattr(request.data, 'get') else {}

        account_holder = data.get('account_holder_name')
        iban = data.get('iban')
        if account_holder is not None and iban is not None:
            account_holder = (account_holder or '').strip()
            iban_clean = (iban or '').strip().replace(' ', '')
            if not account_holder:
                return Response({'error': 'Account holder name is required.'}, status=status.HTTP_400_BAD_REQUEST)
            if not iban_clean:
                return Response({'error': 'IBAN is required.'}, status=status.HTTP_400_BAD_REQUEST)
            bank, created = PartnerBankAccount.objects.get_or_create(
                partner=partner,
                defaults={
                    'account_holder_name': account_holder,
                    'sort_code': '',
                    'account_number': '',
                    'iban': iban_clean,
                },
            )
            if not created:
                bank.account_holder_name = account_holder
                bank.iban = iban_clean
                bank.save(update_fields=['account_holder_name', 'iban', 'updated_at'])

        return self.get_payout_details(request)

    def get_payout_history(self, request):
        """Return list of partner payout requests (id, amount, status, requested_at, paid_at)."""
        partner = self._get_partner(request)
        if not partner:
            return Response({'error': 'Partner profile not found or inactive'}, status=status.HTTP_403_FORBIDDEN)

        requests_qs = PartnerPayoutRequest.objects.filter(partner=partner).order_by('-requested_at')
        payout_requests = [
            {
                'id': str(req.id),
                'amount_requested': float(req.amount_requested),
                'status': req.status,
                'requested_at': req.requested_at.isoformat() if req.requested_at else None,
                'paid_at': req.paid_at.isoformat() if req.paid_at else None,
            }
            for req in requests_qs
        ]
        return Response({'payout_requests': payout_requests}, status=status.HTTP_200_OK)


    def create_payout_request(self, request):
        """Partner requests a payout; support will process within 24 hours."""
        partner = self._get_partner(request)
        if not partner:
            return Response({'error': 'Partner profile not found or inactive'}, status=status.HTTP_403_FORBIDDEN)

        # Check for existing pending/processing payout request
        existing_request = PartnerPayoutRequest.objects.filter(
            partner=partner, status__in=['pending', 'processing']
        ).exists()
        if existing_request:
            return Response(
                {'error': 'You already have a pending payout request. Please wait for it to be processed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Sum approved earnings (not yet paid out)
        approved_balance = CommissionEarning.objects.filter(
            partner=partner, status='approved'
        ).aggregate(s=Sum('commission_amount'))['s'] or Decimal('0')

        if approved_balance <= 0:
            return Response(
                {'error': 'No approved commission to request. Your balance is zero.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Side effect: support team processes pending payout requests manually
        PartnerPayoutRequest.objects.create(
            partner=partner,
            amount_requested=approved_balance,
            status='pending',
        )
        return Response({
            'message': 'Your payment request has been submitted. You will be paid within 24 hours.',
            'amount_requested': float(approved_balance),
        }, status=status.HTTP_201_CREATED)
