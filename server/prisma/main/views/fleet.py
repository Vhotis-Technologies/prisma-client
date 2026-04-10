"""
Fleet API: branches CRUD, branch admins, fleet dashboard, branch vehicles/spend, vehicle bookings.

Actions: create_branch, get_branches, create_branch_admin, get_fleet_dashboard, get_branch_vehicles,
get_branch_spend, update_branch, delete_branch, get_vehicle_bookings, get_branch_admins, etc.
Uses branch_spend and fleet_analytics utils. Can publish booking_cancelled and send branch admin credentials email.
"""
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from main.models import Fleet, Branch, FleetMember, FleetVehicle, Vehicle, VehicleOwnership, BookedAppointment, User, BulkOrder, PaymentTransaction, RefundRecord
from main.utils.branch_spend import get_branch_spend_for_period
from main.utils.fleet_analytics import (
    get_branch_performance, get_spend_trends, get_vehicle_health_scores,
    get_booking_activity, get_common_issues
)
from django.db.models import Count, Q
from django.utils import timezone
from datetime import datetime, timedelta
from decimal import Decimal
import stripe
from django.conf import settings
import logging

from main.tasks import publish_booking_cancelled, send_branch_admin_credentials_email


def bulk_order_job_start_dt(bulk_order):
    """Timezone-aware job start from BulkOrder.order_data (date + start_time). Same as former FleetView._bulk_order_job_start_dt."""
    order_data = getattr(bulk_order, "order_data", None) or {}
    date_str = order_data.get("date") or order_data.get("appointment_date", "")
    if isinstance(date_str, str) and len(date_str) >= 10:
        date_str = date_str[:10]
    try:
        appointment_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None
    start_time_str = order_data.get("start_time") or order_data.get("best_start_time", "06:00")
    start_time = datetime.strptime("06:00:00", "%H:%M:%S").time()
    if isinstance(start_time_str, str):
        if len(start_time_str) == 5:
            start_time_str = start_time_str + ":00"
        for fmt in ("%H:%M:%S", "%H:%M"):
            try:
                start_time = datetime.strptime(start_time_str.split(".")[0], fmt).time()
                break
            except ValueError:
                continue
    dt = timezone.make_aware(datetime.combine(appointment_date, start_time))
    return dt


def perform_bulk_order_cancellation(bulk_order):
    """
    Cancel bulk order: 12h check, cancel all BookedAppointment rows, publish booking_cancelled,
    set payment_status cancelled, refund succeeded bulk payment if any.
    Used by FleetView (after auth) and support tooling (internal key).
    """
    log = logging.getLogger("main.views.fleet")
    if bulk_order.payment_status == "cancelled":
        return Response({"error": "Bulk order is already cancelled"}, status=status.HTTP_400_BAD_REQUEST)
    job_start = bulk_order_job_start_dt(bulk_order)
    if not job_start:
        return Response({"error": "Could not determine appointment start time"}, status=status.HTTP_400_BAD_REQUEST)
    now = timezone.now()
    if (job_start - now).total_seconds() < 12 * 3600:
        return Response(
            {"error": "Cannot cancel within 12 hours of appointment"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    appointments = BookedAppointment.objects.filter(bulk_order=bulk_order)
    for apt in appointments:
        apt.status = "cancelled"
        apt.save()
        try:
            publish_booking_cancelled.delay(apt.booking_reference)
        except Exception as e:
            log.warning("Failed to publish booking_cancelled for %s: %s", apt.booking_reference, e)
    bulk_order.payment_status = "cancelled"
    bulk_order.save()
    refund_amount = None
    original_txn = PaymentTransaction.objects.filter(
        bulk_order=bulk_order,
        transaction_type="payment",
        status="succeeded",
    ).first()
    if original_txn and float(original_txn.amount) > 0:
        try:
            stripe.api_key = getattr(settings, "STRIPE_SECRET_KEY", None)
            if stripe.api_key:
                refund_amount = float(original_txn.amount)
                refund_cents = int(round(refund_amount * 100))
                refund = stripe.Refund.create(
                    payment_intent=original_txn.stripe_payment_intent_id,
                    amount=refund_cents,
                    reason="requested_by_customer",
                    metadata={
                        "bulk_order_reference": bulk_order.booking_reference,
                        "refund_reason": "Bulk order cancelled",
                    },
                )
                first_apt = appointments.first()
                if first_apt:
                    RefundRecord.objects.create(
                        booking=first_apt,
                        user=bulk_order.user,
                        original_transaction=original_txn,
                        requested_amount=refund_amount,
                        status="succeeded",
                        stripe_refund_id=refund.id,
                        processed_at=timezone.now(),
                    )
                PaymentTransaction.objects.create(
                    booking=None,
                    bulk_order=bulk_order,
                    user=bulk_order.user,
                    stripe_payment_intent_id=refund.id,
                    stripe_refund_id=refund.id,
                    transaction_type="refund",
                    amount=refund_amount,
                    currency=original_txn.currency or "eur",
                    status="succeeded",
                )
        except stripe.error.StripeError as e:
            log.error("Stripe refund failed for bulk order %s: %s", bulk_order.booking_reference, e)
            return Response(
                {
                    "error": "Order and appointments cancelled but refund failed. Please contact support.",
                    "refund_error": str(e),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
    return Response(
        {
            "message": (
                "Order cancelled. Full refund will be processed." if refund_amount else "Order cancelled."
            ),
            "refund_amount": refund_amount,
        },
        status=status.HTTP_200_OK,
    )


def perform_bulk_order_reschedule(bulk_order, request_data):
    """
    Reschedule bulk via detailer API; update BulkOrder.order_data and per-appointment rows.
    request_data: dict with new_date, optional start_time / new_time, end_time, number_of_vehicles, suggested_team_size.
    """
    import requests
    from django.conf import settings as django_settings

    log = logging.getLogger("main.views.fleet")
    data = request_data or {}
    if bulk_order.payment_status == "cancelled":
        return Response({"error": "Bulk order is cancelled"}, status=status.HTTP_400_BAD_REQUEST)
    job_start = bulk_order_job_start_dt(bulk_order)
    if not job_start:
        return Response({"error": "Could not determine appointment start time"}, status=status.HTTP_400_BAD_REQUEST)
    now = timezone.now()
    if (job_start - now).total_seconds() < 12 * 3600:
        return Response(
            {"error": "Cannot reschedule within 12 hours of appointment"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    new_date = data.get("new_date")
    if not new_date:
        return Response({"error": "new_date is required"}, status=status.HTTP_400_BAD_REQUEST)
    order_data = getattr(bulk_order, "order_data", None) or {}
    start_time = (
        data.get("start_time")
        or data.get("new_time")
        or order_data.get("start_time")
        or order_data.get("best_start_time", "06:00")
    )
    end_time = data.get("end_time") or order_data.get("end_time", "21:00")
    number_of_vehicles = int(data.get("number_of_vehicles") or bulk_order.number_of_vehicles or 0)
    suggested_team_size = int(data.get("suggested_team_size") or order_data.get("suggested_team_size", 1) or 1)
    if number_of_vehicles <= 0:
        return Response({"error": "number_of_vehicles is required"}, status=status.HTTP_400_BAD_REQUEST)
    detailer_app_url = getattr(django_settings, "DETAILER_APP_URL", None) or getattr(
        django_settings, "API_CONFIG", {}
    ).get("detailerAppUrl")
    if not detailer_app_url:
        return Response({"error": "Detailer app not configured"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    base = (detailer_app_url or "").rstrip("/")
    url = f"{base}/api/v1/booking/reschedule_bulk_booking/"
    payload = {
        "booking_reference": bulk_order.booking_reference,
        "date": new_date[:10] if isinstance(new_date, str) else str(new_date),
        "start_time": start_time if isinstance(start_time, str) else str(start_time),
        "end_time": end_time if isinstance(end_time, str) else str(end_time),
        "number_of_vehicles": number_of_vehicles,
        "suggested_team_size": suggested_team_size,
    }
    try:
        response = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=60)
        if response.status_code not in [200, 201]:
            err_body = response.json() if response.content else {}
            error_message = err_body.get("error", response.text or f"HTTP {response.status_code}")
            return Response({"error": error_message}, status=status.HTTP_400_BAD_REQUEST)
        body = response.json() if response.content else {}
        new_slots = body.get("new_slots") or []
        order_data_new = dict(order_data)
        order_data_new["date"] = new_date[:10] if isinstance(new_date, str) else str(new_date)
        order_data_new["appointment_date"] = order_data_new["date"]
        if new_slots:
            order_data_new["start_time"] = new_slots[0].get("appointment_time", start_time)
        bulk_order.order_data = order_data_new
        bulk_order.save()
        for slot in new_slots:
            ref = slot.get("booking_reference")
            apt_date = slot.get("appointment_date")
            apt_time = slot.get("appointment_time")
            if not ref or not apt_date:
                continue
            try:
                apt_date_parsed = datetime.strptime(apt_date[:10], "%Y-%m-%d").date()
            except (ValueError, TypeError):
                continue
            if apt_time and len(apt_time) == 5:
                apt_time = apt_time + ":00"
            try:
                t = datetime.strptime((apt_time or "06:00").split(".")[0], "%H:%M:%S").time()
            except ValueError:
                try:
                    t = datetime.strptime((apt_time or "06:00")[:5], "%H:%M").time()
                except ValueError:
                    t = datetime.strptime("06:00", "%H:%M").time()
            BookedAppointment.objects.filter(bulk_order=bulk_order, booking_reference=ref).update(
                appointment_date=apt_date_parsed,
                start_time=t,
            )
        return Response(
            {
                "message": "Bulk order rescheduled.",
                "new_slots": new_slots,
            },
            status=status.HTTP_200_OK,
        )
    except requests.RequestException as e:
        log.error("Detailer reschedule_bulk_booking request failed: %s", e)
        return Response(
            {"error": "Failed to reschedule with detailer. Please try again."},
            status=status.HTTP_502_BAD_GATEWAY,
        )


class FleetView(APIView):
    permission_classes = [IsAuthenticated]
    
    action_handlers = {
        'create_branch': 'create_branch',
        'get_branches': 'get_branches',
        'create_branch_admin': 'create_branch_admin',
        'get_fleet_dashboard': 'get_fleet_dashboard',
        'get_branch_vehicles': 'get_branch_vehicles',
        'get_branch_spend': 'get_branch_spend',
        'update_branch': 'update_branch',
        'delete_branch': 'delete_branch',
        'get_vehicle_bookings': 'get_vehicle_bookings',
        'get_branch_admins': 'get_branch_admins',
        'get_invoices': 'get_invoices',
        'get_branch_bulk_orders': 'get_branch_bulk_orders',
        'cancel_bulk_order': 'cancel_bulk_order',
        'reschedule_bulk_order': 'reschedule_bulk_order',
        'get_fleet_admins': 'get_fleet_admins',
        'update_branch_admin': 'update_branch_admin',
        'remove_branch_admin': 'remove_branch_admin',
    }
    
    def get(self, request, *args, **kwargs):
        """Route GET by action. Passes branch_id or vehicle_id from URL when present. Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        branch_id = kwargs.get('branch_id')
        vehicle_id = kwargs.get('vehicle_id')
        if branch_id is not None:
            return handler(request, branch_id)
        if vehicle_id is not None:
            return handler(request, vehicle_id)
        return handler(request)
    
    def post(self, request, *args, **kwargs):
        """Route POST by action (e.g. create_branch, create_branch_admin). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)
    
    def patch(self, request, *args, **kwargs):
        """Route PATCH by action. Passes branch_id from URL when present (e.g. update_branch). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        branch_id = kwargs.get('branch_id')
        if branch_id is not None:
            return handler(request, branch_id)
        return handler(request)
    
    def delete(self, request, *args, **kwargs):
        """Route DELETE by action. Passes branch_id from URL when present (e.g. delete_branch). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        branch_id = kwargs.get('branch_id')
        if branch_id is not None:
            return handler(request, branch_id)
        return handler(request)
    
    def create_branch(self, request):
        """
        Create a new branch for the fleet owner's fleet. Expects name; optional address, postcode, city, country, lat/lng.
        Checks subscription limit (can_add_branch). Returns branch payload.
        """
        try:
            # Check if user is a fleet owner
            if not request.user.is_fleet_owner:
                return Response({'error': 'Only fleet owners can create branches'}, status=status.HTTP_403_FORBIDDEN)
            
            # Get the fleet for this user
            fleet = Fleet.objects.filter(owner=request.user).first()
            if not fleet:
                return Response({'error': 'No fleet found for this user'}, status=status.HTTP_404_NOT_FOUND)
            
            # Check subscription limit
            can_add, error_msg = fleet.can_add_branch()
            if not can_add:
                return Response({'error': error_msg}, status=status.HTTP_403_FORBIDDEN)
            
            # Get branch data
            name = request.data.get('name')
            address = request.data.get('address', '')
            postcode = request.data.get('postcode', '')
            city = request.data.get('city', '')
            country = request.data.get('country', '')
            
            if not name:
                return Response({'error': 'Branch name is required'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Parse optional latitude and longitude
            latitude = request.data.get('latitude')
            longitude = request.data.get('longitude')
            if latitude is not None:
                try:
                    latitude = Decimal(str(latitude))
                    if not Decimal('-90') <= latitude <= Decimal('90'):
                        latitude = None
                except (TypeError, ValueError):
                    latitude = None
            if longitude is not None:
                try:
                    longitude = Decimal(str(longitude))
                    if not Decimal('-180') <= longitude <= Decimal('180'):
                        longitude = None
                except (TypeError, ValueError):
                    longitude = None
            
            # Create branch
            branch = Branch.objects.create(
                fleet=fleet,
                name=name,
                address=address,
                postcode=postcode,
                city=city,
                country=country,
                latitude=latitude,
                longitude=longitude,
            )
            
            return Response({
                'message': 'Branch created successfully',
                'branch': {
                    'id': str(branch.id),
                    'name': branch.name,
                    'address': branch.address,
                    'postcode': branch.postcode,
                    'city': branch.city,
                    'country': branch.country,
                    'latitude': float(branch.latitude) if branch.latitude is not None else None,
                    'longitude': float(branch.longitude) if branch.longitude is not None else None,
                    'fleet': str(fleet.id),
                }
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    def get_branches(self, request):
        """Get all branches for the fleet owner's fleet"""
        try:
            # Check if user is a fleet owner
            if not request.user.is_fleet_owner:
                return Response({'error': 'Only fleet owners can view branches'}, status=status.HTTP_403_FORBIDDEN)
            
            # Get the fleet for this user
            fleet = Fleet.objects.filter(owner=request.user).first()
            if not fleet:
                return Response({'branches': []}, status=status.HTTP_200_OK)
            
            # Get all branches for this fleet
            branches = Branch.objects.filter(fleet=fleet).annotate(
                vehicle_count=Count('branch_vehicles'),
                admin_count=Count('fleet_members', filter=Q(fleet_members__role='admin'), distinct=True)
            )
            
            branches_data = []
            for branch in branches:
                period = branch.spend_limit_period or 'monthly'
                spent = get_branch_spend_for_period(branch, period)
                limit = branch.spend_limit
                if limit is not None and limit > 0:
                    remaining = max(Decimal('0'), limit - spent)
                else:
                    remaining = None
                branches_data.append({
                    'id': str(branch.id),
                    'name': branch.name,
                    'address': branch.address,
                    'postcode': branch.postcode,
                    'city': branch.city,
                    'country': branch.country,
                    'latitude': float(branch.latitude) if branch.latitude is not None else None,
                    'longitude': float(branch.longitude) if branch.longitude is not None else None,
                    'fleet': str(fleet.id),
                    'vehicle_count': branch.vehicle_count,
                    'admin_count': branch.admin_count,
                    'spend_limit': float(limit) if limit is not None else None,
                    'spend_limit_period': branch.spend_limit_period,
                    'spent': float(spent),
                    'remaining': float(remaining) if remaining is not None else None,
                    'created_at': branch.created_at.isoformat(),
                })
            
            return Response({'branches': branches_data}, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    def create_branch_admin(self, request):
        """Create a branch admin account"""
        try:
            # Check if user is a fleet owner
            if not request.user.is_fleet_owner:
                return Response({'error': 'Only fleet owners can create branch admins'}, status=status.HTTP_403_FORBIDDEN)
            
            # Get the fleet for this user
            fleet = Fleet.objects.filter(owner=request.user).first()
            if not fleet:
                return Response({'error': 'No fleet found for this user'}, status=status.HTTP_404_NOT_FOUND)
            
            # Check subscription limit
            can_add, error_msg = fleet.can_add_admin()
            if not can_add:
                return Response({'error': error_msg}, status=status.HTTP_403_FORBIDDEN)
            
            # Get admin data
            name = request.data.get('name')
            email = request.data.get('email')
            phone = request.data.get('phone', '')
            password = request.data.get('password')
            branch_id = request.data.get('branch_id')
            
            # Validate required fields
            if not all([name, email, password, branch_id]):
                return Response({'error': 'Name, email, password, and branch_id are required'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Check if branch belongs to this fleet
            try:
                branch = Branch.objects.get(id=branch_id, fleet=fleet)
            except Branch.DoesNotExist:
                return Response({'error': 'Branch not found or does not belong to your fleet'}, status=status.HTTP_404_NOT_FOUND)
            
            # Check if email already exists
            if User.objects.filter(email=email).exists():
                return Response({'error': 'User with this email already exists'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Create user with branch admin flag
            user = User.objects.create_user(
                email=email,
                password=password,
                name=name,
                phone=phone,
                is_branch_admin=True
            )
            
            # Create fleet member with admin role and branch assignment
            fleet_member = FleetMember.objects.create(
                fleet=fleet,
                user=user,
                role='admin',
                branch=branch
            )

            # Send credentials email to the new admin/manager
            branch_address_parts = [branch.address, branch.city, branch.postcode, branch.country]
            branch_address_str = ", ".join(p for p in branch_address_parts if p and str(p).strip()) or "—"
            role_label = "Branch Admin" if fleet_member.role == "admin" else "Branch Manager"
            send_branch_admin_credentials_email.delay(
                recipient_email=user.email,
                recipient_name=user.name,
                branch_name=branch.name,
                branch_address=branch_address_str,
                password=password,
                role_label=role_label,
            )

            return Response({
                'message': 'Branch admin created successfully',
                'admin': {
                    'id': user.id,
                    'name': user.name,
                    'email': user.email,
                    'phone': user.phone,
                    'branch_id': str(branch.id),
                    'branch_name': branch.name,
                }
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    def get_fleet_dashboard(self, request):
        """
        Return fleet dashboard stats for fleet owner: branch performance, spend trends, vehicle health scores,
        booking activity, common issues. Uses fleet_analytics utils. Date range from query params.
        """
        """Get fleet dashboard data with optional date range filtering"""
        try:
            # Check if user is a fleet owner
            if not request.user.is_fleet_owner:
                return Response({'error': 'Only fleet owners can view fleet dashboard'}, status=status.HTTP_403_FORBIDDEN)
            
            # Get the fleet for this user
            fleet = Fleet.objects.filter(owner=request.user).first()
            if not fleet:
                return Response({'error': 'No fleet found for this user'}, status=status.HTTP_404_NOT_FOUND)
            
            # Get date range from query parameters (default: last 30 days)
            start_date_str = request.query_params.get('start_date')
            end_date_str = request.query_params.get('end_date')
            
            if start_date_str and end_date_str:
                try:
                    start_date = timezone.make_aware(datetime.strptime(start_date_str, '%Y-%m-%d'))
                    end_date = timezone.make_aware(datetime.strptime(end_date_str, '%Y-%m-%d'))
                    # Set end_date to end of day
                    end_date = end_date.replace(hour=23, minute=59, second=59, microsecond=999999)
                except ValueError:
                    return Response({'error': 'Invalid date format. Use YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
            else:
                # Default to last 30 days
                end_date = timezone.now()
                start_date = end_date - timedelta(days=30)
                start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
            
            # Get all branches
            branches = Branch.objects.filter(fleet=fleet)
            total_branches = branches.count()
            
            # Get all vehicles in fleet (through FleetVehicle); skip entries with no vehicle
            fleet_vehicles = FleetVehicle.objects.filter(fleet=fleet).select_related('vehicle')
            total_vehicles = fleet_vehicles.count()
            
            # Get all bookings for vehicles in this fleet
            vehicle_ids = [fv.vehicle.id for fv in fleet_vehicles if fv.vehicle]
            bookings = BookedAppointment.objects.filter(vehicle_id__in=vehicle_ids)
            fleet_bulk_orders = BulkOrder.objects.filter(
                fleet=fleet,
                payment_status__in=['succeeded', 'paid'],
            )
            total_bookings = bookings.count() + fleet_bulk_orders.count()
            
            # Get recent bookings (last 10)
            recent_bookings = bookings.order_by('-created_at')[:10]
            recent_bookings_data = []
            for booking in recent_bookings:
                recent_bookings_data.append({
                    'id': str(booking.id),
                    'booking_reference': booking.booking_reference,
                    'vehicle_reg': booking.vehicle.registration_number if booking.vehicle else None,
                    'service_type': booking.service_type.name if booking.service_type else None,
                    'status': booking.status,
                    'appointment_date': booking.appointment_date.isoformat(),
                    'total_amount': float(booking.total_amount),
                })
            
            # Get referral code
            referral_code = request.user.referral_code
            
            # Get branch stats (include spend cap data)
            branches_data = []
            for branch in branches:
                branch_vehicles = FleetVehicle.objects.filter(fleet=fleet, branch=branch).select_related('vehicle')
                branch_vehicle_ids = [bv.vehicle.id for bv in branch_vehicles if bv.vehicle]
                branch_bookings = BookedAppointment.objects.filter(
                    vehicle_id__in=branch_vehicle_ids
                )
                branch_bulk_orders = BulkOrder.objects.filter(
                    branch=branch,
                    payment_status__in=['succeeded', 'paid'],
                )
                branch_booking_count = branch_bookings.count() + branch_bulk_orders.count()
                period = branch.spend_limit_period or 'monthly'
                spent = get_branch_spend_for_period(branch, period)
                limit = branch.spend_limit
                remaining = None
                if limit is not None and limit > 0:
                    remaining = max(Decimal('0'), limit - spent)
                branches_data.append({
                    'id': str(branch.id),
                    'name': branch.name,
                    'address': branch.address,
                    'city': branch.city,
                    'vehicle_count': branch_vehicles.count(),
                    'booking_count': branch_booking_count,
                    'spend_limit': float(limit) if limit is not None else None,
                    'spend_limit_period': branch.spend_limit_period,
                    'spent': float(spent),
                    'remaining': float(remaining) if remaining is not None else None,
                })
            
            # Get analytics data (defensive: return empty on failure so dashboard still loads)
            try:
                branch_performance = get_branch_performance(fleet, start_date, end_date)
                spend_trends = get_spend_trends(fleet, start_date, end_date, granularity='daily')
                vehicle_health_scores = get_vehicle_health_scores(fleet, start_date, end_date)
                booking_activity = get_booking_activity(fleet, start_date, end_date)
                common_issues = get_common_issues(fleet, start_date, end_date)
            except Exception as analytics_err:
                logging.getLogger(__name__).exception(
                    "Fleet dashboard analytics failed: %s", analytics_err
                )
                branch_performance = []
                spend_trends = []
                vehicle_health_scores = []
                booking_activity = []
                common_issues = []
            
            return Response({
                'fleet': {
                    'id': str(fleet.id),
                    'name': fleet.name,
                },
                'stats': {
                    'total_vehicles': total_vehicles,
                    'total_bookings': total_bookings,
                    'total_branches': total_branches,
                },
                'referral_code': referral_code,
                'branches': branches_data,
                'recent_bookings': recent_bookings_data,
                'analytics': {
                    'branch_performance': branch_performance,
                    'spend_trends': spend_trends,
                    'vehicle_health_scores': vehicle_health_scores,
                    'booking_activity': booking_activity,
                    'common_issues': common_issues,
                },
                'date_range': {
                    'start_date': start_date.isoformat(),
                    'end_date': end_date.isoformat(),
                },
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    def get_branch_vehicles(self, request, branch_id=None):
        """Get vehicles for a specific branch"""
        try:
            branch_id = branch_id or request.query_params.get('branch_id')
            
            if not branch_id:
                return Response({'error': 'Branch ID is required'}, status=status.HTTP_400_BAD_REQUEST)
            
            try:
                branch = Branch.objects.get(id=branch_id)
            except Branch.DoesNotExist:
                return Response({'error': 'Branch not found'}, status=status.HTTP_404_NOT_FOUND)
            
            # Check permissions
            if request.user.is_fleet_owner:
                # Fleet owner can see all branches in their fleet
                fleet = Fleet.objects.filter(owner=request.user).first()
                if not fleet or branch.fleet != fleet:
                    return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
            elif request.user.is_branch_admin:
                # Branch admin can only see their own branch
                managed_branch = request.user.get_managed_branch()
                if not managed_branch or managed_branch.id != branch.id:
                    return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
            else:
                return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
            
            # Get vehicles for this branch
            fleet_vehicles = FleetVehicle.objects.filter(fleet=branch.fleet, branch=branch)
            
            vehicles_data = []
            for fv in fleet_vehicles:
                vehicle = fv.vehicle
                # Get current owner
                ownership = VehicleOwnership.objects.filter(
                    vehicle=vehicle,
                    end_date__isnull=True
                ).first()
                
                vehicles_data.append({
                    'id': str(vehicle.id),
                    'make': vehicle.make,
                    'model': vehicle.model,
                    'year': vehicle.year,
                    'color': vehicle.color,
                    'registration_number': vehicle.registration_number,
                    'country': vehicle.country,
                    'vin': vehicle.vin,
                    'current_owner': ownership.owner.name if ownership else None,
                    'branch_id': str(branch.id),
                    'branch_name': branch.name,
                })
            
            return Response({
                'branch': {
                    'id': str(branch.id),
                    'name': branch.name,
                },
                'vehicles': vehicles_data,
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    def get_branch_bulk_orders(self, request, branch_id=None):
        """Get bulk orders for a specific branch"""
        try:
            branch_id = branch_id or request.query_params.get('branch_id')
            
            if not branch_id:
                return Response({'error': 'Branch ID is required'}, status=status.HTTP_400_BAD_REQUEST)
            
            try:
                branch = Branch.objects.get(id=branch_id)
            except Branch.DoesNotExist:
                return Response({'error': 'Branch not found'}, status=status.HTTP_404_NOT_FOUND)
            
            if request.user.is_fleet_owner:
                fleet = Fleet.objects.filter(owner=request.user).first()
                if not fleet or branch.fleet != fleet:
                    return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
            elif request.user.is_branch_admin:
                managed_branch = request.user.get_managed_branch()
                if not managed_branch or managed_branch.id != branch.id:
                    return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
            else:
                return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
            
            bulk_orders = BulkOrder.objects.filter(
                branch=branch,
                payment_status__in=['succeeded', 'paid', 'invoice_later'],
            ).order_by('-created_at')
            orders_data = []
            for bo in bulk_orders:
                orders_data.append({
                    'id': str(bo.id),
                    'booking_reference': bo.booking_reference or '',
                    'number_of_vehicles': bo.number_of_vehicles or 0,
                    'total_amount': float(bo.total_amount) if bo.total_amount is not None else None,
                    'created_at': bo.created_at.isoformat() if bo.created_at else None,
                    'payment_status': bo.payment_status or '',
                    'order_data': bo.order_data,
                })
            
            return Response({
                'branch_id': str(branch.id),
                'bulk_orders': orders_data,
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def get_invoices(self, request):
        """Get fleet-level invoice list for fleet owner, including paid/unpaid and creator details."""
        try:
            if not request.user.is_fleet_owner:
                return Response({'error': 'Only fleet owners can view invoices'}, status=status.HTTP_403_FORBIDDEN)

            fleet = Fleet.objects.filter(owner=request.user).first()
            if not fleet:
                return Response({'invoices': []}, status=status.HTTP_200_OK)

            invoices_qs = (
                BulkOrder.objects.filter(
                    fleet=fleet,
                    payment_status__in=['invoice_later', 'succeeded', 'paid', 'failed', 'cancelled'],
                )
                .select_related('user', 'branch')
                .order_by('-created_at')
            )

            invoices = []
            for bulk_order in invoices_qs:
                invoices.append({
                    'id': str(bulk_order.id),
                    'booking_reference': bulk_order.booking_reference or '',
                    'invoice_id': bulk_order.stripe_invoice_id or None,
                    'payment_status': bulk_order.payment_status or '',
                    'total_amount': float(bulk_order.total_amount) if bulk_order.total_amount is not None else None,
                    'currency': 'eur',
                    'number_of_vehicles': bulk_order.number_of_vehicles or 0,
                    'created_at': bulk_order.created_at.isoformat() if bulk_order.created_at else None,
                    'created_by': {
                        'id': str(bulk_order.user.id) if bulk_order.user else None,
                        'name': bulk_order.user.name if bulk_order.user else None,
                        'email': bulk_order.user.email if bulk_order.user else None,
                    },
                    'branch': {
                        'id': str(bulk_order.branch.id) if bulk_order.branch else None,
                        'name': bulk_order.branch.name if bulk_order.branch else None,
                    },
                })

            return Response({'invoices': invoices}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def _get_bulk_order_for_user(self, request, bulk_order_id=None, booking_reference=None):
        """Resolve BulkOrder by id or booking_reference and check auth (user, fleet owner, or branch admin). Returns (bulk_order, None) or (None, Response)."""
        if not bulk_order_id and not booking_reference:
            return None, Response({'error': 'bulk_order_id or booking_reference is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            if bulk_order_id:
                bulk_order = BulkOrder.objects.get(id=bulk_order_id)
            else:
                bulk_order = BulkOrder.objects.get(booking_reference=booking_reference)
        except BulkOrder.DoesNotExist:
            return None, Response({'error': 'Bulk order not found'}, status=status.HTTP_404_NOT_FOUND)
        user = request.user
        if bulk_order.user_id == user.id:
            return bulk_order, None
        if user.is_fleet_owner:
            fleet = Fleet.objects.filter(owner=user).first()
            if fleet and bulk_order.fleet_id == fleet.id:
                return bulk_order, None
        if user.is_branch_admin:
            managed_branch = user.get_managed_branch()
            if managed_branch and bulk_order.branch_id == managed_branch.id:
                return bulk_order, None
        return None, Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    def cancel_bulk_order(self, request):
        """Cancel a bulk order: 12h check, cancel all related appointments, publish booking_cancelled per ref, full refund."""
        bulk_order_id = request.data.get('bulk_order_id') if request.data else request.query_params.get('bulk_order_id')
        booking_reference = request.data.get('booking_reference') if request.data else request.query_params.get('booking_reference')
        bulk_order, err_response = self._get_bulk_order_for_user(request, bulk_order_id=bulk_order_id, booking_reference=booking_reference)
        if err_response:
            return err_response
        return perform_bulk_order_cancellation(bulk_order)

    def reschedule_bulk_order(self, request):
        """Reschedule a bulk order to a new date/window. 12h check; call detailer reschedule_bulk_booking; update BulkOrder and BookedAppointments."""
        bulk_order_id = request.data.get('bulk_order_id') if request.data else None
        booking_reference = request.data.get('booking_reference') if request.data else None
        bulk_order, err_response = self._get_bulk_order_for_user(request, bulk_order_id=bulk_order_id, booking_reference=booking_reference)
        if err_response:
            return err_response
        return perform_bulk_order_reschedule(bulk_order, request.data or {})
    
    def get_branch_spend(self, request):
        """Get spend limit, spent, and remaining for a branch. Fleet owner: branch_id in query. Branch admin: managed branch."""
        try:
            branch = None
            if request.user.is_fleet_owner:
                branch_id = request.query_params.get('branch_id')
                if not branch_id:
                    return Response({'error': 'branch_id is required for fleet owners'}, status=status.HTTP_400_BAD_REQUEST)
                fleet = Fleet.objects.filter(owner=request.user).first()
                if not fleet:
                    return Response({'error': 'No fleet found'}, status=status.HTTP_404_NOT_FOUND)
                try:
                    branch = Branch.objects.get(id=branch_id, fleet=fleet)
                except Branch.DoesNotExist:
                    return Response({'error': 'Branch not found'}, status=status.HTTP_404_NOT_FOUND)
            elif request.user.is_branch_admin:
                branch = request.user.get_managed_branch()
                if not branch:
                    return Response({'error': 'No managed branch found'}, status=status.HTTP_404_NOT_FOUND)
            else:
                return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
            
            period = branch.spend_limit_period or 'monthly'
            spent = get_branch_spend_for_period(branch, period)
            limit = branch.spend_limit
            remaining = None
            if limit is not None and limit > 0:
                remaining = max(Decimal('0'), limit - spent)
            
            return Response({
                'branch_id': str(branch.id),
                'spend_limit': float(limit) if limit is not None else None,
                'spend_limit_period': branch.spend_limit_period,
                'spent': float(spent),
                'remaining': float(remaining) if remaining is not None else None,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    def update_branch(self, request, branch_id=None):
        """Update a branch"""
        try:
            branch_id = branch_id or request.data.get('branch_id')
            
            if not branch_id:
                return Response({'error': 'Branch ID is required'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Check if user is a fleet owner
            if not request.user.is_fleet_owner:
                return Response({'error': 'Only fleet owners can update branches'}, status=status.HTTP_403_FORBIDDEN)
            
            # Get the fleet for this user
            fleet = Fleet.objects.filter(owner=request.user).first()
            if not fleet:
                return Response({'error': 'No fleet found for this user'}, status=status.HTTP_404_NOT_FOUND)
            
            try:
                branch = Branch.objects.get(id=branch_id, fleet=fleet)
            except Branch.DoesNotExist:
                return Response({'error': 'Branch not found'}, status=status.HTTP_404_NOT_FOUND)
            
            # Update branch fields
            if 'name' in request.data:
                branch.name = request.data.get('name')
            if 'address' in request.data:
                branch.address = request.data.get('address')
            if 'postcode' in request.data:
                branch.postcode = request.data.get('postcode')
            if 'city' in request.data:
                branch.city = request.data.get('city')
            if 'country' in request.data:
                branch.country = request.data.get('country')
            if 'latitude' in request.data:
                lat = request.data.get('latitude')
                if lat is not None:
                    try:
                        lat_val = Decimal(str(lat))
                        if Decimal('-90') <= lat_val <= Decimal('90'):
                            branch.latitude = lat_val
                    except (TypeError, ValueError):
                        pass
            if 'longitude' in request.data:
                lon = request.data.get('longitude')
                if lon is not None:
                    try:
                        lon_val = Decimal(str(lon))
                        if Decimal('-180') <= lon_val <= Decimal('180'):
                            branch.longitude = lon_val
                    except (TypeError, ValueError):
                        pass
            if 'spend_limit' in request.data:
                sl = request.data.get('spend_limit')
                if sl is not None:
                    sl = Decimal(str(sl))
                    if sl < 0:
                        return Response(
                            {'error': 'spend_limit must be >= 0'},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    branch.spend_limit = sl
                    if sl == 0:
                        branch.spend_limit_period = None
            if 'spend_limit_period' in request.data:
                period = request.data.get('spend_limit_period')
                if period in ('weekly', 'monthly'):
                    branch.spend_limit_period = period
                elif period is None or period == '':
                    branch.spend_limit_period = None
            
            branch.save()
            
            period = branch.spend_limit_period or 'monthly'
            spent = get_branch_spend_for_period(branch, period)
            limit = branch.spend_limit
            remaining = None
            if limit is not None and limit > 0:
                remaining = max(Decimal('0'), limit - spent)
            
            return Response({
                'message': 'Branch updated successfully',
                'branch': {
                    'id': str(branch.id),
                    'name': branch.name,
                    'address': branch.address,
                    'postcode': branch.postcode,
                    'city': branch.city,
                    'country': branch.country,
                    'latitude': float(branch.latitude) if branch.latitude is not None else None,
                    'longitude': float(branch.longitude) if branch.longitude is not None else None,
                    'spend_limit': float(limit) if limit is not None else None,
                    'spend_limit_period': branch.spend_limit_period,
                    'spent': float(spent),
                    'remaining': float(remaining) if remaining is not None else None,
                }
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    def delete_branch(self, request, branch_id=None):
        """Delete a branch (only if it has no vehicles)"""
        try:
            branch_id = branch_id or request.query_params.get('branch_id') or request.data.get('branch_id')
            
            if not branch_id:
                return Response({'error': 'Branch ID is required'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Check if user is a fleet owner
            if not request.user.is_fleet_owner:
                return Response({'error': 'Only fleet owners can delete branches'}, status=status.HTTP_403_FORBIDDEN)
            
            # Get the fleet for this user
            fleet = Fleet.objects.filter(owner=request.user).first()
            if not fleet:
                return Response({'error': 'No fleet found for this user'}, status=status.HTTP_404_NOT_FOUND)
            
            try:
                branch = Branch.objects.get(id=branch_id, fleet=fleet)
            except Branch.DoesNotExist:
                return Response({'error': 'Branch not found'}, status=status.HTTP_404_NOT_FOUND)
            
            # Check if branch has vehicles
            vehicle_count = FleetVehicle.objects.filter(branch=branch).count()
            if vehicle_count > 0:
                return Response({
                    'error': f'Cannot delete branch with {vehicle_count} vehicle(s). Please remove vehicles first.'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            branch_name = branch.name
            branch.delete()
            
            return Response({
                'message': f'Branch {branch_name} deleted successfully'
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    def get_vehicle_bookings(self, request, vehicle_id=None):
        """Get bookings for a specific vehicle (last 90 days)"""
        try:
            vehicle_id = vehicle_id or request.query_params.get('vehicle_id')
            
            if not vehicle_id:
                return Response({'error': 'Vehicle ID is required'}, status=status.HTTP_400_BAD_REQUEST)
            
            try:
                vehicle = Vehicle.objects.get(id=vehicle_id)
            except Vehicle.DoesNotExist:
                return Response({'error': 'Vehicle not found'}, status=status.HTTP_404_NOT_FOUND)
            
            # Check permissions - user must have access to this vehicle
            has_access = False
            
            if request.user.is_fleet_owner:
                # Fleet owner: Check if vehicle is in their fleet
                fleet = Fleet.objects.filter(owner=request.user).first()
                if fleet:
                    has_access = FleetVehicle.objects.filter(
                        fleet=fleet,
                        vehicle=vehicle
                    ).exists()
            elif request.user.is_branch_admin:
                # Branch admin: Check if vehicle is in their managed branch
                managed_branch = request.user.get_managed_branch()
                if managed_branch:
                    has_access = FleetVehicle.objects.filter(
                        fleet=managed_branch.fleet,
                        branch=managed_branch,
                        vehicle=vehicle
                    ).exists()
            else:
                # Regular user: Check direct ownership
                ownership = VehicleOwnership.objects.filter(
                    vehicle=vehicle,
                    owner=request.user,
                    end_date__isnull=True
                ).first()
                has_access = ownership is not None
            
            if not has_access:
                return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
            
            # Get bookings for this vehicle in the last 90 days
            ninety_days_ago = timezone.now() - timedelta(days=90)
            bookings = BookedAppointment.objects.filter(
                vehicle=vehicle,
                created_at__gte=ninety_days_ago
            ).select_related('service_type').order_by('-created_at')
            
            bookings_data = []
            for booking in bookings:
                bookings_data.append({
                    'id': str(booking.id),
                    'booking_reference': booking.booking_reference,
                    'created_at': booking.created_at.isoformat(),
                    'appointment_date': booking.appointment_date.isoformat(),
                    'status': booking.status,
                    'service_type': booking.service_type.name if booking.service_type else 'N/A',
                    'total_amount': float(booking.total_amount),
                })
            
            return Response({
                'vehicle': {
                    'id': str(vehicle.id),
                    'make': vehicle.make,
                    'model': vehicle.model,
                    'year': vehicle.year,
                    'registration_number': vehicle.registration_number,
                },
                'bookings': bookings_data
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def get_branch_admins(self, request, branch_id=None):
        """Get all branch admins for a specific branch"""
        try:
            branch_id = branch_id or request.query_params.get('branch_id')
            
            if not branch_id:
                return Response({'error': 'Branch ID is required'}, status=status.HTTP_400_BAD_REQUEST)
            
            try:
                branch = Branch.objects.get(id=branch_id)
            except Branch.DoesNotExist:
                return Response({'error': 'Branch not found'}, status=status.HTTP_404_NOT_FOUND)
            
            # Check permissions
            if request.user.is_fleet_owner:
                # Fleet owner: Check if branch belongs to their fleet
                fleet = Fleet.objects.filter(owner=request.user).first()
                if not fleet or branch.fleet != fleet:
                    return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
            elif request.user.is_branch_admin:
                # Branch admin: Can only see admins of their own branch
                managed_branch = request.user.get_managed_branch()
                if not managed_branch or managed_branch.id != branch.id:
                    return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
            else:
                return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
            
            # Get all admins for this branch
            branch_admins = FleetMember.objects.filter(
                branch=branch,
                role='admin'
            ).select_related('user')
            
            admins_data = []
            for member in branch_admins:
                admins_data.append({
                    'id': str(member.user.id),
                    'name': member.user.name,
                    'email': member.user.email,
                    'phone': member.user.phone,
                    'joined_at': member.joined_at.isoformat(),
                })
            
            return Response({'admins': admins_data}, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def get_fleet_admins(self, request):
        """Get all branch admins for the fleet owner's fleet"""
        try:
            if not request.user.is_fleet_owner:
                return Response({'error': 'Only fleet owners can view fleet admins'}, status=status.HTTP_403_FORBIDDEN)
            fleet = Fleet.objects.filter(owner=request.user).first()
            if not fleet:
                return Response({'error': 'No fleet found for this user'}, status=status.HTTP_404_NOT_FOUND)
            members = FleetMember.objects.filter(fleet=fleet, role='admin').select_related('user', 'branch')
            admins_data = []
            for member in members:
                admins_data.append({
                    'id': str(member.user.id),
                    'name': member.user.name,
                    'email': member.user.email,
                    'phone': member.user.phone or '',
                    'joined_at': member.joined_at.isoformat(),
                    'branch_id': str(member.branch.id),
                    'branch_name': member.branch.name,
                })
            return Response({'admins': admins_data}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def update_branch_admin(self, request):
        """Update a branch admin (name, phone, optional branch reassignment). Fleet owner only."""
        try:
            if not request.user.is_fleet_owner:
                return Response({'error': 'Only fleet owners can update branch admins'}, status=status.HTTP_403_FORBIDDEN)
            fleet = Fleet.objects.filter(owner=request.user).first()
            if not fleet:
                return Response({'error': 'No fleet found for this user'}, status=status.HTTP_404_NOT_FOUND)
            admin_id = request.data.get('admin_id')
            if not admin_id:
                return Response({'error': 'admin_id is required'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                member = FleetMember.objects.get(fleet=fleet, user_id=admin_id, role='admin')
            except FleetMember.DoesNotExist:
                return Response({'error': 'Admin not found or does not belong to your fleet'}, status=status.HTTP_404_NOT_FOUND)
            user = member.user
            name = request.data.get('name')
            phone = request.data.get('phone')
            branch_id = request.data.get('branch_id')
            if name is not None:
                user.name = name
            if phone is not None:
                user.phone = phone
            if name is not None or phone is not None:
                user.save()
            if branch_id is not None:
                try:
                    new_branch = Branch.objects.get(id=branch_id, fleet=fleet)
                except Branch.DoesNotExist:
                    return Response({'error': 'Branch not found or does not belong to your fleet'}, status=status.HTTP_404_NOT_FOUND)
                member.branch = new_branch
                member.save()
            return Response({
                'message': 'Branch admin updated successfully',
                'admin': {
                    'id': str(user.id),
                    'name': user.name,
                    'email': user.email,
                    'phone': user.phone or '',
                    'branch_id': str(member.branch.id),
                    'branch_name': member.branch.name,
                }
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def remove_branch_admin(self, request):
        """Remove a branch admin from the fleet. Fleet owner only."""
        try:
            if not request.user.is_fleet_owner:
                return Response({'error': 'Only fleet owners can remove branch admins'}, status=status.HTTP_403_FORBIDDEN)
            fleet = Fleet.objects.filter(owner=request.user).first()
            if not fleet:
                return Response({'error': 'No fleet found for this user'}, status=status.HTTP_404_NOT_FOUND)
            admin_id = request.data.get('admin_id') if request.data else request.query_params.get('admin_id')
            if not admin_id:
                return Response({'error': 'admin_id is required'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                member = FleetMember.objects.get(fleet=fleet, user_id=admin_id, role='admin')
            except FleetMember.DoesNotExist:
                return Response({'error': 'Admin not found or does not belong to your fleet'}, status=status.HTTP_404_NOT_FOUND)
            member.delete()
            return Response({'message': 'Branch admin removed successfully'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)