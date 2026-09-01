"""
Dashboard API for the client app: upcoming appointments, recent services, stats, reviews, detailer location.

Actions: get_upcoming_appointments, cancel_appointment, get_recent_services, get_user_stats,
submit_review, get_detailer_location, get_perks_summary. Branch admins see appointments for their branch vehicles.
"""
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from main.models import BookedAppointment, FleetVehicle, Branch, BulkOrder
from django.conf import settings
from main.utils.media_helper import get_full_media_url
from django.utils import timezone
from main.tasks import publish_review_to_detailer, publish_booking_cancelled
from main.services.booking_quote import (
    get_loyalty_progress_snapshot,
    get_subscription_quick_sparkle_snapshot,
)
from main.utils.redis_geo import get_detailer_location as get_detailer_location_from_redis


def _dashboard_safe_float(value, default=0.0):
    """Coerce Decimal or JSON detailer payloads to float; invalid values → default."""
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _vehicle_media_image_url(vehicle):
    """Full URL for vehicle image, or None if missing/unreadable storage."""
    if not vehicle:
        return None
    try:
        field = getattr(vehicle, "image", None)
        name = getattr(field, "name", None) if field is not None else None
        if not name:
            return None
        relative = field.url if field is not None else None
        if not relative:
            return None
        return get_full_media_url(relative)
    except Exception:
        return None


class DashboardView(APIView):
    """
    Client home dashboard: upcoming bookings, recent service, stats, reviews, detailer map, perks.

    Action-routed via ``dashboard/<action>/``. Branch admins see branch-wide data unless
    ``scope=my_bookings`` is set. Bulk orders appear as single upcoming items.
    """

    permission_classes = [IsAuthenticated]
    action_handlers = {
        'get_upcoming_appointments': '_get_upcoming_appointments',
        'cancel_appointment': '_cancel_appointment',
        'get_recent_services': '_get_recent_services',
        'get_user_stats': '_get_user_stats',
        'submit_review': 'submit_review',
        'get_detailer_location': '_get_detailer_location',
        'get_perks_summary': '_get_perks_summary',
    }

    def get(self, request, *args, **kwargs):
        """Route GET by action to the handler. Returns 400 if action not in action_handlers."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)
    
    def patch(self, request, *args, **kwargs):
        """Route PATCH by action (e.g. cancel_appointment, submit_review). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)
    

    def _get_upcoming_appointments(self, request):
        """
        Return upcoming appointments for the authenticated user.
        Query param scope=my_bookings: only this user's bookings and bulk orders they created
        (ignores branch-admin branch-wide view). Fleet owners use this for “my bookings” on the fleet home.
        Branch admins (default): appointments for all vehicles in their managed branch (excluding
        appointments that are part of a bulk order; the bulk order is returned as one item).
        Regular users / fleet owners (default): their own appointments, confirmed, scheduled, and in progress,
        excluding appointments that are part of a bulk order.
        Also appends upcoming bulk orders (same user or branch). Returns list of appointment dicts
        with detailer, vehicle, address, service_type, valet_type, add_ons, times, etc.
        """
        try:
            # scope=my_bookings: always list only this user's bookings + their bulk orders (fleet owner
            # personal flow), not branch-wide manager bookings.
            force_my_bookings = request.query_params.get('scope') == 'my_bookings'

            # For branch admins, get appointments for all vehicles in their managed branch
            # For regular users (and branch admin when scope=my_bookings), get their own appointments
            if request.user.is_branch_admin and not force_my_bookings:
                managed_branch = request.user.get_managed_branch()
                if managed_branch:
                    # Get all vehicles in the managed branch
                    branch_vehicles = FleetVehicle.objects.filter(
                        fleet=managed_branch.fleet,
                        branch=managed_branch
                    ).select_related('vehicle')
                    vehicle_ids = [fv.vehicle.id for fv in branch_vehicles if fv.vehicle]
                    # Get appointments for vehicles in this branch (exclude those part of a bulk order; bulk order is returned separately)
                    if vehicle_ids:
                        upcoming_appointments = BookedAppointment.objects.filter(
                            vehicle_id__in=vehicle_ids,
                            status__in=["confirmed", "scheduled", "in_progress"],
                            bulk_order__isnull=True,
                        ).select_related(
                            'detailer', 'vehicle', 'address', 'service_type', 'valet_type'
                        ).prefetch_related('add_ons').order_by('appointment_date', 'start_time')
                    else:
                        # No vehicles in branch, return empty
                        upcoming_appointments = BookedAppointment.objects.none()
                        print(f"upcoming_appointments for branch: {upcoming_appointments}")
                else:
                    # No managed branch, return empty
                    upcoming_appointments = BookedAppointment.objects.none()
            else:
                # Regular user / fleet owner: their own appointments (including in-progress).
                # Exclude appointments that are part of a bulk order; the bulk order is returned as one item.
                upcoming_appointments = BookedAppointment.objects.filter(
                    user=request.user,
                    status__in=["confirmed", "scheduled", "in_progress"],
                    bulk_order__isnull=True,
                ).select_related(
                    'detailer', 'vehicle', 'address', 'service_type', 'valet_type'
                ).prefetch_related('add_ons').order_by('appointment_date', 'start_time')

            upcoming_appointments_data = []
            for appointment in upcoming_appointments:
                # Calculate end time based on start time and duration
                end_time = None
                if appointment.start_time and appointment.duration:
                    from datetime import datetime, timedelta
                    start_datetime = datetime.combine(appointment.appointment_date, appointment.start_time)
                    end_datetime = start_datetime + timedelta(minutes=appointment.duration)
                    end_time = end_datetime.time().strftime('%H:%M')

                add_ons_data = []
                for add_on in appointment.add_ons.all():
                    add_ons_data.append({
                        "id": str(add_on.id),
                        "name": add_on.name,
                        "price": _dashboard_safe_float(add_on.price),
                        "description": add_on.description,
                        "extra_duration": add_on.extra_duration,
                    })

                # Prefer assigned_detailers (express = 2) when present; else build from single detailer FK
                assigned = getattr(appointment, "assigned_detailers", None) or []
                if assigned and isinstance(assigned, list):
                    detailers_list = [
                        {
                            "id": d.get("id"),
                            "name": d.get("name"),
                            "rating": _dashboard_safe_float(d.get("rating", 0) or 0),
                            "image": d.get("image"),
                            "phone": d.get("phone"),
                        }
                        for d in assigned
                        if isinstance(d, dict)
                    ]
                    first_detailer = detailers_list[0] if detailers_list else None
                else:
                    detailers_list = [
                        {
                            "id": str(appointment.detailer.id) if appointment.detailer else None,
                            "name": appointment.detailer.name if appointment.detailer else None,
                            "rating": _dashboard_safe_float(
                                appointment.detailer.rating
                            )
                            if appointment.detailer
                            else 0.0,
                            "image": None,
                            "phone": appointment.detailer.phone if appointment.detailer else None,
                        }
                    ] if appointment.detailer else []
                    first_detailer = detailers_list[0] if detailers_list else None
                upcoming_appointments_data.append({
                    "booking_reference": str(appointment.booking_reference),
                    "detailers": detailers_list,
                    "detailer": first_detailer or {},
                    "vehicle": {
                        "id": str(appointment.vehicle.id) if appointment.vehicle else None,
                        "model": appointment.vehicle.model if appointment.vehicle else None,
                        "make": appointment.vehicle.make if appointment.vehicle else None,
                        "year": appointment.vehicle.year if appointment.vehicle else None,
                        "color": appointment.vehicle.color if appointment.vehicle else None,
                        "licence": appointment.vehicle.registration_number if appointment.vehicle else None,
                        "image": _vehicle_media_image_url(appointment.vehicle),
                    },
                    "address": {
                        "address": appointment.address.address if appointment.address else None,
                        "post_code": appointment.address.post_code if appointment.address else None,
                        "city": appointment.address.city if appointment.address else None,
                        "country": appointment.address.country if appointment.address else None,
                        "latitude": _dashboard_safe_float(appointment.address.latitude, default=None)
                        if appointment.address and appointment.address.latitude is not None
                        else None,
                        "longitude": _dashboard_safe_float(appointment.address.longitude, default=None)
                        if appointment.address and appointment.address.longitude is not None
                        else None,
                    },
                    "service_type": {
                        "id": str(appointment.service_type.id) if appointment.service_type else None,
                        "name": appointment.service_type.name if appointment.service_type else None,
                        "description": appointment.service_type.description if appointment.service_type else None,
                        "price": _dashboard_safe_float(appointment.service_type.price),
                        "duration": appointment.service_type.duration if appointment.service_type else None,
                    },
                    "valet_type": {
                        "id": str(appointment.valet_type.id) if appointment.valet_type else None,
                        "name": appointment.valet_type.name if appointment.valet_type else None,
                        "description": appointment.valet_type.description if appointment.valet_type else None,
                    },
                    "booking_date": appointment.appointment_date.strftime('%Y-%m-%d'),
                    "total_amount": _dashboard_safe_float(appointment.total_amount),
                    "estimated_duration": f"{appointment.duration} minutes" if appointment.duration else "Not specified",
                    "special_instructions": appointment.special_instructions,
                    "status": appointment.status,
                    "start_time": appointment.start_time.strftime('%H:%M') if appointment.start_time else None,
                    "end_time": end_time,
                    'add_ons': add_ons_data,
                })

            # Add upcoming bulk orders (same user or branch)
            from datetime import datetime as dt_module
            today = timezone.now().date()
            if getattr(request.user, 'is_branch_admin', False) and not force_my_bookings:
                managed_branch = getattr(request.user, 'get_managed_branch', lambda: None)()
                bulk_orders = BulkOrder.objects.filter(
                    branch=managed_branch,
                    payment_status__in=['succeeded', 'invoice_later'],
                ).order_by('created_at') if managed_branch else BulkOrder.objects.none()
            else:
                bulk_orders = BulkOrder.objects.filter(
                    user=request.user,
                    payment_status__in=['succeeded', 'invoice_later'],
                ).order_by('created_at')

            for bulk in bulk_orders:
                order_data = getattr(bulk, 'order_data', None) or {}
                if not isinstance(order_data, dict):
                    continue
                date_str = order_data.get('date')
                if not date_str:
                    continue
                try:
                    bulk_date = dt_module.strptime(date_str, '%Y-%m-%d').date()
                except (ValueError, TypeError):
                    continue
                if bulk_date < today:
                    continue
                start_time_str = order_data.get('start_time', '06:00')
                end_time_str = order_data.get('end_time', '21:00')
                addr = order_data.get('address') or {}
                if isinstance(addr, dict):
                    address_data = {
                        "address": addr.get('address'),
                        "post_code": addr.get('postcode') or addr.get('post_code'),
                        "city": addr.get('city'),
                        "country": addr.get('country'),
                        "latitude": addr.get('latitude'),
                        "longitude": addr.get('longitude'),
                    }
                else:
                    address_data = {"address": None, "post_code": None, "city": None, "country": None, "latitude": None, "longitude": None}
                st = order_data.get('service_type')
                if isinstance(st, dict):
                    service_name = st.get('name', 'Bulk service') or 'Bulk service'
                    duration_min = st.get('duration')
                    if duration_min is None:
                        duration_min = order_data.get('service_duration') or 60
                    else:
                        try:
                            duration_min = int(duration_min)
                        except (TypeError, ValueError):
                            duration_min = 60
                elif isinstance(st, str):
                    service_name = st
                    duration_min = order_data.get('service_duration') or 60
                else:
                    service_name = 'Bulk service'
                    duration_min = order_data.get('service_duration') or 60
                vt = order_data.get('valet_type')
                if isinstance(vt, dict):
                    valet_type_name = vt.get('name') or 'Bulk'
                    valet_type_id = vt.get('id')
                    valet_type_desc = vt.get('description')
                elif isinstance(vt, str):
                    valet_type_name = vt or 'Bulk'
                    valet_type_id = None
                    valet_type_desc = None
                else:
                    valet_type_name = 'Bulk'
                    valet_type_id = None
                    valet_type_desc = None
                num_vehicles = getattr(bulk, 'number_of_vehicles', 0) or order_data.get('number_of_vehicles', 0)
                assigned = getattr(bulk, 'assigned_detailers', None) or []
                if isinstance(assigned, list) and len(assigned) > 0:
                    detailers_list = [
                        {
                            "id": str(d.get("id")) if d.get("id") is not None else None,
                            "name": d.get("name") or None,
                            "rating": _dashboard_safe_float(d.get("rating", 0) or 0),
                            "image": d.get("image"),
                            "phone": d.get("phone"),
                        }
                        for d in assigned
                    ]
                    first_detailer = detailers_list[0] if detailers_list else {"id": None, "name": None, "rating": 0.0, "image": None, "phone": None}
                else:
                    detailers_list = []
                    first_detailer = {"id": None, "name": None, "rating": 0.0, "image": None, "phone": None}
                upcoming_appointments_data.append({
                    "booking_reference": str(bulk.booking_reference),
                    "is_bulk": True,
                    "bulk_order_id": str(bulk.id),
                    "order_data": order_data,
                    "payment_status": getattr(bulk, 'payment_status', None) or 'succeeded',
                    "number_of_vehicles": num_vehicles,
                    "detailers": detailers_list,
                    "detailer": first_detailer,
                    "vehicle": {
                        "id": None,
                        "model": None,
                        "make": None,
                        "year": None,
                        "color": None,
                        "licence": f"Bulk · {num_vehicles} vehicles",
                        "image": None,
                    },
                    "address": address_data,
                    "service_type": {
                        "id": None,
                        "name": service_name,
                        "description": None,
                        "price": _dashboard_safe_float(bulk.total_amount),
                        "duration": duration_min,
                    },
                    "valet_type": {"id": valet_type_id, "name": valet_type_name, "description": valet_type_desc},
                    "booking_date": bulk_date.strftime('%Y-%m-%d'),
                    "total_amount": _dashboard_safe_float(bulk.total_amount),
                    "estimated_duration": f"{num_vehicles} vehicles · {duration_min} min each" if num_vehicles else "Not specified",
                    "special_instructions": None,
                    "status": "scheduled",
                    "start_time": start_time_str[:5] if isinstance(start_time_str, str) and len(start_time_str) >= 5 else start_time_str,
                    "end_time": end_time_str[:5] if isinstance(end_time_str, str) and len(end_time_str) >= 5 else end_time_str,
                    "add_ons": [],
                })

            # Sort combined list by booking_date then start_time
            def _sort_key(item):
                """Tuple key for chronological sort (date, then HH:MM start)."""
                d = item.get('booking_date') or '9999-99-99'
                t = item.get('start_time') or '00:00'
                if isinstance(t, str) and len(t) >= 5:
                    t = t[:5]
                return (d, t)
            upcoming_appointments_data.sort(key=_sort_key)
            return Response(upcoming_appointments_data, status=status.HTTP_200_OK)
            
        except Exception as e:
            import traceback
            return Response(
                {'error': f'Failed to fetch upcoming appointments: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
    def _cancel_appointment(self, request):
        """
        Cancel an appointment by appointment_id. Expects request.data.appointment_id.
        User must own the appointment; status must be confirmed/scheduled/in_progress.
        Sets status to cancelled and returns success message.
        """
        try:
            appointment_id = request.data.get('appointment_id')
            if not appointment_id:
                return Response({'error': 'Appointment ID is required'}, status=status.HTTP_400_BAD_REQUEST)
            
            appointment = BookedAppointment.objects.get(id=appointment_id, user=request.user, status__in=['confirmed', 'scheduled', 'in_progress'])
            if not appointment:
                return Response({'error': 'Appointment not found'}, status=status.HTTP_404_NOT_FOUND)
            
            appointment.status = 'cancelled'
            appointment.save()
            if appointment.booking_reference:
                publish_booking_cancelled.delay(appointment.booking_reference)
            return Response({'message': 'Appointment cancelled successfully'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': f'Failed to cancel appointment: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _get_detailer_location(self, request):
        """
        Return detailer's current (latitude, longitude) from Redis for map view.
        Query param: booking_reference. Returns 200 with lat/lng or nulls if not available.
        """
        try:
            booking_reference = request.query_params.get('booking_reference')
            if not booking_reference:
                return Response(
                    {'error': 'booking_reference is required'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                appointment = BookedAppointment.objects.get(
                    booking_reference=booking_reference,
                    user=request.user,
                )
            except BookedAppointment.DoesNotExist:
                return Response(
                    {'error': 'Appointment not found'},
                    status=status.HTTP_404_NOT_FOUND,
                )
            detailer = appointment.detailer
            if not detailer or getattr(detailer, 'external_id', None) is None:
                return Response(
                    {'latitude': None, 'longitude': None},
                    status=status.HTTP_200_OK,
                )
            coords = get_detailer_location_from_redis(int(detailer.external_id))
            if coords is None:
                return Response(
                    {'latitude': None, 'longitude': None},
                    status=status.HTTP_200_OK,
                )
            lat, lng = coords
            return Response(
                {'latitude': lat, 'longitude': lng},
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            # Return nulls so client can still show service address on map
            return Response(
                {'latitude': None, 'longitude': None},
                status=status.HTTP_200_OK,
            )
        
    def _get_recent_services(self, request):
        """
        Return the most recent completed booking for the user (or for branch admin: branch vehicles).
        Single object with date, vehicle_name, status, cost, detailer, valet_type, service_type,
        is_reviewed, rating, booking_reference. Returns empty shape 200 if none.
        """
        try:
            # #region agent log
            import json
            import time
            log_data = {
                "sessionId": "debug-session",
                "runId": "run1",
                "hypothesisId": "A",
                "location": "dashboard.py:_get_recent_services:entry",
                "message": "Entry: _get_recent_services called",
                "data": {
                    "user_id": str(request.user.id),
                    "user_email": request.user.email,
                    "is_branch_admin": request.user.is_branch_admin,
                    "is_fleet_owner": getattr(request.user, 'is_fleet_owner', False),
                },
                "timestamp": int(time.time() * 1000)
            }
            with open('c:\\Users\\gifte\\Projects\\prisma\\client\\.cursor\\debug.log', 'a') as f:
                f.write(json.dumps(log_data) + '\n')
            # #endregion
            
            # For branch admins, get recent services for all vehicles in their managed branch
            # For regular users, get their own recent services
            if request.user.is_branch_admin:
                # #region agent log
                log_data = {
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "A",
                    "location": "dashboard.py:_get_recent_services:branch_admin_path",
                    "message": "Branch admin path executed",
                    "data": {"user_id": str(request.user.id)},
                    "timestamp": int(time.time() * 1000)
                }
                with open('c:\\Users\\gifte\\Projects\\prisma\\client\\.cursor\\debug.log', 'a') as f:
                    f.write(json.dumps(log_data) + '\n')
                # #endregion
                
                managed_branch = request.user.get_managed_branch()
                
                # #region agent log
                log_data = {
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "D",
                    "location": "dashboard.py:_get_recent_services:managed_branch_check",
                    "message": "Managed branch check",
                    "data": {
                        "user_id": str(request.user.id),
                        "managed_branch": str(managed_branch.id) if managed_branch else None,
                        "branch_name": managed_branch.name if managed_branch else None,
                    },
                    "timestamp": int(time.time() * 1000)
                }
                with open('c:\\Users\\gifte\\Projects\\prisma\\client\\.cursor\\debug.log', 'a') as f:
                    f.write(json.dumps(log_data) + '\n')
                # #endregion
                
                if managed_branch:
                    # Get all vehicles in the managed branch
                    branch_vehicles = FleetVehicle.objects.filter(
                        fleet=managed_branch.fleet,
                        branch=managed_branch
                    ).select_related('vehicle')
                    vehicle_ids = [fv.vehicle.id for fv in branch_vehicles if fv.vehicle]
                    
                    # #region agent log
                    log_data = {
                        "sessionId": "debug-session",
                        "runId": "run1",
                        "hypothesisId": "B",
                        "location": "dashboard.py:_get_recent_services:vehicle_ids",
                        "message": "Vehicle IDs for branch",
                        "data": {
                            "user_id": str(request.user.id),
                            "vehicle_count": len(vehicle_ids),
                            "vehicle_ids": [str(vid) for vid in vehicle_ids[:10]],  # First 10 only
                        },
                        "timestamp": int(time.time() * 1000)
                    }
                    with open('c:\\Users\\gifte\\Projects\\prisma\\client\\.cursor\\debug.log', 'a') as f:
                        f.write(json.dumps(log_data) + '\n')
                    # #endregion
                    
                    # Get most recent completed service for vehicles in this branch
                    if vehicle_ids:
                        recent_service = BookedAppointment.objects.filter(
                            vehicle_id__in=vehicle_ids,
                            status='completed'
                        ).select_related(
                            'detailer', 'vehicle', 'service_type', 'valet_type', 'user'
                        ).order_by('-appointment_date', '-created_at').first()
                    else:
                        recent_service = None
                else:
                    recent_service = None
            else:
                # #region agent log
                log_data = {
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "C",
                    "location": "dashboard.py:_get_recent_services:regular_user_path",
                    "message": "Regular user path executed",
                    "data": {"user_id": str(request.user.id)},
                    "timestamp": int(time.time() * 1000)
                }
                with open('c:\\Users\\gifte\\Projects\\prisma\\client\\.cursor\\debug.log', 'a') as f:
                    f.write(json.dumps(log_data) + '\n')
                # #endregion
                
                # Regular user - get their own recent services
                # CRITICAL: Must filter by user to prevent data leakage
                recent_service = BookedAppointment.objects.filter(
                    user=request.user, 
                    status='completed'
                ).select_related(
                    'detailer', 'vehicle', 'service_type', 'valet_type', 'user'
                ).order_by('-appointment_date', '-created_at').first()
            
            # #region agent log
            import json
            import time
            log_data = {
                "sessionId": "debug-session",
                "runId": "run1",
                "hypothesisId": "E",
                "location": "dashboard.py:_get_recent_services:before_response",
                "message": "Recent service query result",
                "data": {
                    "user_id": str(request.user.id),
                    "recent_service_found": recent_service is not None,
                    "booking_reference": str(recent_service.booking_reference) if recent_service else None,
                    "booking_user_id": str(recent_service.user.id) if recent_service else None,
                    "booking_user_email": recent_service.user.email if recent_service else None,
                    "booking_user_is_branch_admin": recent_service.user.is_branch_admin if recent_service else None,
                    "vehicle_id": str(recent_service.vehicle.id) if recent_service and recent_service.vehicle else None,
                },
                "timestamp": int(time.time() * 1000)
            }
            with open('c:\\Users\\gifte\\Projects\\prisma\\client\\.cursor\\debug.log', 'a') as f:
                f.write(json.dumps(log_data) + '\n')
            # #endregion
            
            if not recent_service:
                # Return 200 with null body so client treats as no recent service and shows empty state
                return Response(None, status=status.HTTP_200_OK)
            
            # Format the response to match the frontend interface
            vehicle_name = "Unknown Vehicle"
            if recent_service.vehicle:
                vehicle_name = f"{recent_service.vehicle.make or ''} {recent_service.vehicle.model or ''}".strip()
                if not vehicle_name:
                    vehicle_name = "Unknown Vehicle"
            
            recent_service_data = {
                "date": recent_service.appointment_date.strftime('%Y-%m-%d'),
                "vehicle_name": vehicle_name,
                "status": recent_service.status,
                "cost": _dashboard_safe_float(recent_service.total_amount),
                "detailer": {
                    "id": str(recent_service.detailer.id) if recent_service.detailer else None,
                    "name": recent_service.detailer.name if recent_service.detailer else None,
                    "rating": _dashboard_safe_float(recent_service.detailer.rating)
                    if recent_service.detailer
                    else 0.0,
                    "phone": recent_service.detailer.phone if recent_service.detailer else None,
                },
                "valet_type": recent_service.valet_type.name if recent_service.valet_type else None,
                "service_type": recent_service.service_type.name if recent_service.service_type else None,
                "is_reviewed": recent_service.is_reviewed,
                "rating": _dashboard_safe_float(recent_service.review_rating),
                "booking_reference": str(recent_service.booking_reference),
            }
            
            return Response(recent_service_data, status=status.HTTP_200_OK)
        except Exception as e:
            import traceback
            return Response({'error': f'Failed to fetch recent services: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    

    def _get_user_stats(self, request):
        """
        Return booking counts for the current user: services_this_month, services_this_year.
        Branch admins: counts for all vehicles in their managed branch.
        """
        try:
            from datetime import datetime
            
            this_month = datetime.now().month
            this_year = datetime.now().year

            # For branch admins, get stats for all vehicles in their managed branch
            # For regular users, get their own stats
            if request.user.is_branch_admin:
                managed_branch = request.user.get_managed_branch()
                if managed_branch:
                    # Get all vehicles in the managed branch
                    branch_vehicles = FleetVehicle.objects.filter(
                        fleet=managed_branch.fleet,
                        branch=managed_branch
                    )
                    vehicle_ids = [fv.vehicle.id for fv in branch_vehicles]
                    # Get services for this month
                    services_this_month = BookedAppointment.objects.filter(
                        vehicle_id__in=vehicle_ids,
                        appointment_date__month=this_month, 
                        appointment_date__year=this_year
                    ).count()

                    # Get services for this year
                    services_this_year = BookedAppointment.objects.filter(
                        vehicle_id__in=vehicle_ids,
                        appointment_date__year=this_year
                    ).count()
                else:
                    services_this_month = 0
                    services_this_year = 0
            else:
                # Regular user - get their own stats
                services_this_month = BookedAppointment.objects.filter(
                    user=request.user, 
                    appointment_date__month=this_month, 
                    appointment_date__year=this_year
                ).count()

                # Get services for this year
                services_this_year = BookedAppointment.objects.filter(
                    user=request.user, 
                    appointment_date__year=this_year
                ).count()

            stats = {
                'services_this_month': services_this_month,
                'services_this_year': services_this_year,
            }

            return Response(stats, status=status.HTTP_200_OK)

        except Exception as e:
            return Response({'error': f'Failed to fetch user stats: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    def _get_perks_summary(self, request):
        """
        Read-only B2C perks payload: loyalty progress (tier, completed bookings, next tier,
        thresholds, benefits) and complimentary subscription Quick Sparkle allowance (remaining,
        max, period). Returns ``loyalty.is_b2c: False`` for fleet/branch/partner users so the
        client can hide the loyalty card.
        """
        try:
            payload = {
                'loyalty': get_loyalty_progress_snapshot(request.user),
                'subscription_complimentary': get_subscription_quick_sparkle_snapshot(request.user),
            }
            return Response(payload, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': f'Failed to fetch perks summary: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


    def submit_review(self, request):
        """
        Submit a review for a completed booking. Expects request.data: booking_reference, rating;
        optional comment (max 1000 chars).
        Updates BookedAppointment review fields; publishes to detailer via publish_review_to_detailer.
        """
        try:
            MAX_REVIEW_COMMENT_LEN = 1000

            booking_reference = request.data.get('booking_reference')
            rating = request.data.get('rating')
            comment_raw = request.data.get('comment')
            comment = None
            if comment_raw is not None and str(comment_raw).strip():
                comment = str(comment_raw).strip()
                if len(comment) > MAX_REVIEW_COMMENT_LEN:
                    return Response(
                        {'error': f'Comment must be at most {MAX_REVIEW_COMMENT_LEN} characters'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            try:
                rating_int = int(rating)
            except (TypeError, ValueError):
                rating_int = None
            if not booking_reference or rating_int is None:
                return Response(
                    {'error': 'Booking reference and rating are required'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if rating_int < 1 or rating_int > 5:
                return Response(
                    {'error': 'Rating must be an integer between 1 and 5'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Get the booking (with granular checks for debugging)
            booking = BookedAppointment.objects.filter(booking_reference=booking_reference).first()
            if not booking:
                return Response(
                    {'error': 'Booking not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            if booking.user_id != request.user.id:
                return Response(
                    {'error': 'Booking not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            if booking.status != 'completed':
                return Response(
                    {'error': f'Booking is not completed (status: {booking.status})'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if booking.is_reviewed:
                return Response(
                    {'error': 'This booking has already been reviewed'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Update the booking with review data
            booking.is_reviewed = True
            booking.review_rating = rating_int
            booking.review_comment = comment
            booking.review_submitted_at = timezone.now()
            booking.save()

            # Publish to Redis for detailer notification
            publish_review_to_detailer.delay(booking_reference, rating_int, comment)
            
            return Response({
                'message': 'Review submitted successfully',
                'booking_reference': booking_reference
            }, status=status.HTTP_200_OK)

        except Exception as e:
            import traceback
            return Response(
                {'error': f'Failed to submit review: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
