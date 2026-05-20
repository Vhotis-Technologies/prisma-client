"""
Service history API: list completed/cancelled bookings and booking images.

Actions: get_service_history (user/branch/fleet scoped), get_booking_images.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from main.models import BookedAppointment, BookedAppointmentImage, FleetVehicle, Fleet
from django.db.models import Q
import logging


class ServiceHistoryView(APIView):
    """
    Completed booking history and before/after images for the client app.

    Action-routed via ``service-history/<action>/``. Scope expands for fleet owners
    and branch admins; fleet subscription may gate vehicle detail images.
    """

    permission_classes = [IsAuthenticated]

    action_handlers = {
        "get_service_history": "get_service_history",
        "get_booking_images": "get_booking_images",
    }

    def get(self, request, *args, **kwargs):
        """Route GET by action: get_service_history or get_booking_images. Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        
        handler = getattr(self, self.action_handlers[action])
        return handler(request)

    def get_service_history(self, request):
        """
        Get all service history (completed and cancelled bookings) for the authenticated user.
        For fleet owners: includes bookings for vehicles in their fleet
        For branch admins: includes bookings for vehicles in their managed branch
        For regular users: only their own bookings
        Returns appointments ordered by appointment_date in descending order (most recent first).
        """
        try:
            # Build the base query filter
            query_filter = Q(status__in=["completed"])
            
            # Start with bookings where user is the current user
            user_filter = Q(user=request.user)
            
            # If user is a branch admin, also include bookings for vehicles in their branch
            if request.user.is_branch_admin:
                managed_branch = request.user.get_managed_branch()
                if managed_branch:
                    # Get vehicles in the managed branch
                    branch_vehicles = FleetVehicle.objects.filter(
                        fleet=managed_branch.fleet,
                        branch=managed_branch
                    ).values_list('vehicle_id', flat=True)
                    
                    # Add filter for bookings with vehicles in this branch
                    user_filter |= Q(vehicle_id__in=branch_vehicles)
                    # Include bulk order appointments for this branch
                    user_filter |= Q(bulk_order__branch=managed_branch)
            
            # If user is a fleet owner, also include bookings for vehicles in their fleet
            elif request.user.is_fleet_owner:
                fleet = Fleet.objects.filter(owner=request.user).first()
                if fleet:
                    # Get all vehicles in the fleet (across all branches)
                    fleet_vehicles = FleetVehicle.objects.filter(
                        fleet=fleet
                    ).values_list('vehicle_id', flat=True)
                    
                    # Add filter for bookings with vehicles in this fleet
                    user_filter |= Q(vehicle_id__in=fleet_vehicles)
                    # Include bulk order appointments for this fleet
                    user_filter |= Q(bulk_order__fleet=fleet)
            else:
                # Regular user: include their bulk order appointments
                user_filter |= Q(bulk_order__user=request.user)
            
            # Combine filters
            query_filter &= user_filter
            
            # Get all booked appointments matching the filter
            # Include related data to avoid N+1 queries
            # Order by appointment_date in descending order (most recent first)
            appointments = BookedAppointment.objects.filter(
                query_filter
            ).select_related(
                'service_type',
                'valet_type',
                'vehicle',
                'address',
                'detailer',
                'bulk_order',
            ).order_by('-appointment_date')
            
            service_history = []
            
            for appointment in appointments:
                try:
                    # Format the service history data to match MyServiceHistoryProps interface
                    if appointment.vehicle:
                        vehicle_reg = appointment.vehicle.registration_number or 'Unknown'
                    elif appointment.bulk_order_id and appointment.booking_reference:
                        # Bulk slot: e.g. BULKxxx-3 -> "Vehicle 3"
                        ref = appointment.booking_reference
                        if '-' in ref:
                            suffix = ref.split('-')[-1]
                            vehicle_reg = f"Vehicle {suffix}" if suffix.isdigit() else ref
                        else:
                            vehicle_reg = 'Bulk'
                    else:
                        vehicle_reg = 'Unknown'
                    # Use assigned_detailers when present (express = 2), else single detailer
                    assigned = getattr(appointment, "assigned_detailers", None) or []
                    if assigned and isinstance(assigned, list):
                        detailers_list = [{"id": str(d.get("id") or ""), "name": d.get("name") or "Unknown", "rating": float(d.get("rating") or 0), "phone": d.get("phone") or ""} for d in assigned if isinstance(d, dict)]
                    elif appointment.detailer:
                        d = appointment.detailer
                        detailers_list = [{"id": str(d.id), "name": d.name or "Unknown", "rating": float(d.rating or 0), "phone": d.phone or ""}]
                    else:
                        detailers_list = []
                    first_detailer = detailers_list[0] if detailers_list else {"id": "", "name": "Unknown", "rating": 0.0, "phone": ""}
                    service_history_item = {
                        'id': str(appointment.id),
                        'booking_date': appointment.booking_date.isoformat(),
                        'appointment_date': appointment.appointment_date.isoformat(),
                        'service_type': appointment.service_type.name if appointment.service_type else 'Unknown',
                        'valet_type': appointment.valet_type.name if appointment.valet_type else 'Unknown',
                        'vehicle_reg': vehicle_reg,
                        'address': {
                            'id': str(appointment.address.id) if appointment.address else '',
                            'address': appointment.address.address if appointment.address else '',
                            'post_code': appointment.address.post_code if appointment.address else '',
                            'city': appointment.address.city if appointment.address else '',
                            'country': appointment.address.country if appointment.address else ''
                        },
                        'detailers': detailers_list,
                        'detailer': first_detailer,
                        'status': appointment.status,
                        'total_amount': float(appointment.total_amount),
                        'rating': float(appointment.review_rating) if appointment.review_rating else 0.0,
                        'is_reviewed': appointment.review_rating is not None and appointment.review_rating > 0,
                        'booking_reference': str(appointment.booking_reference),
                    }
                    
                    service_history.append(service_history_item)
                except Exception as item_error:
                    # Log the error for individual items but continue processing
                    continue
            
            return Response({'service_history': service_history}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def get_booking_images(self, request):
        """
        Fetch all before/after images for a specific booking.
        Called from service history when client views completed bookings.
        
        Args:
            request: HTTP request with booking_id in query params
        
        Returns:
            Response with grouped before/after images
        """
        try:
            booking_id = request.query_params.get('booking_id')
            if not booking_id:
                return Response({
                    'error': 'booking_id is required'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Get the booking and verify access
            try:
                booking = BookedAppointment.objects.select_related('bulk_order').get(id=booking_id)
            except BookedAppointment.DoesNotExist:
                return Response({
                    'error': 'Booking not found'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Check if user has access to this booking
            has_access = False
            
            # User owns the booking
            if booking.user == request.user:
                has_access = True
            # Branch admin - check if vehicle is in their branch
            elif request.user.is_branch_admin:
                managed_branch = request.user.get_managed_branch()
                if managed_branch and booking.vehicle:
                    has_access = FleetVehicle.objects.filter(
                        fleet=managed_branch.fleet,
                        branch=managed_branch,
                        vehicle=booking.vehicle
                    ).exists()
            # Fleet owner - check if vehicle is in their fleet
            elif request.user.is_fleet_owner:
                fleet = Fleet.objects.filter(owner=request.user).first()
                if fleet and booking.vehicle:
                    has_access = FleetVehicle.objects.filter(
                        fleet=fleet,
                        vehicle=booking.vehicle
                    ).exists()
            # Bulk order appointments: check access via bulk_order
            if not has_access and booking.vehicle is None and getattr(booking, 'bulk_order', None):
                bulk_order = booking.bulk_order
                if request.user == bulk_order.user:
                    has_access = True
                elif request.user.is_branch_admin:
                    managed_branch = request.user.get_managed_branch()
                    if managed_branch and bulk_order.branch_id == managed_branch.id:
                        has_access = True
                elif request.user.is_fleet_owner:
                    fleet = Fleet.objects.filter(owner=request.user).first()
                    if fleet and bulk_order.fleet_id == fleet.id:
                        has_access = True
            
            if not has_access:
                return Response({
                    'error': 'Booking not found or access denied'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Check if user can view vehicle details (subscription check for fleet users)
            can_view = request.user.can_view_vehicle_details(booking.vehicle)
            if not can_view:
                # Return empty arrays with access_denied flag for fleet users without subscription
                return Response({
                    'booking_reference': booking.booking_reference,
                    'before_images_interior': [],
                    'before_images_exterior': [],
                    'after_images_interior': [],
                    'after_images_exterior': [],
                    'event_data_management': None,
                    'access_denied': True,
                    'message': 'Detailed vehicle information is only available with an active fleet subscription.'
                }, status=status.HTTP_200_OK)
            
            # Fetch images grouped by segment
            before_images_interior = BookedAppointmentImage.objects.filter(
                booking=booking,
                image_type='before',
                segment='interior'
            ).order_by('created_at')
            
            before_images_exterior = BookedAppointmentImage.objects.filter(
                booking=booking,
                image_type='before',
                segment='exterior'
            ).order_by('created_at')
            
            after_images_interior = BookedAppointmentImage.objects.filter(
                booking=booking,
                image_type='after',
                segment='interior'
            ).order_by('created_at')
            
            after_images_exterior = BookedAppointmentImage.objects.filter(
                booking=booking,
                image_type='after',
                segment='exterior'
            ).order_by('created_at')
            
            # Format response with images grouped by segment
            before_images_interior_data = [
                {
                    'id': img.id,
                    'image_url': img.image_url,
                    'created_at': img.created_at.isoformat()
                } for img in before_images_interior
            ]
            
            before_images_exterior_data = [
                {
                    'id': img.id,
                    'image_url': img.image_url,
                    'created_at': img.created_at.isoformat()
                } for img in before_images_exterior
            ]
            
            after_images_interior_data = [
                {
                    'id': img.id,
                    'image_url': img.image_url,
                    'created_at': img.created_at.isoformat()
                } for img in after_images_interior
            ]
            
            after_images_exterior_data = [
                {
                    'id': img.id,
                    'image_url': img.image_url,
                    'created_at': img.created_at.isoformat()
                } for img in after_images_exterior
            ]
            
            # Get EventDataManagement if exists
            event_data = None
            if hasattr(booking, 'eventdatamanagement'):
                from main.serializer import EventDataManagementSerializer
                event_data = EventDataManagementSerializer(booking.eventdatamanagement).data
            
            return Response({
                'booking_reference': booking.booking_reference,
                'before_images_interior': before_images_interior_data,
                'before_images_exterior': before_images_exterior_data,
                'after_images_interior': after_images_interior_data,
                'after_images_exterior': after_images_exterior_data,
                'event_data_management': event_data
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logging.error(f"Error fetching booking images: {str(e)}")
            return Response({
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
