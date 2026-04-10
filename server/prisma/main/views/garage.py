"""
Garage API: vehicles CRUD, stats, S3 test, transfer approve/reject, pending transfers, vehicle events.

Actions: add_vehicle, get_vehicles, update_vehicle, delete_vehicle, get_vehicle_stats,
test_s3_connection, approve_transfer, reject_transfer, get_pending_transfers, create_vehicle_event.
"""
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.db import models
from main.models import Vehicle, VehicleOwnership, VehicleEvent, BookedAppointment, VehicleTransfer, Fleet, FleetVehicle, FleetMember, Branch, EventDataManagement
from datetime import datetime, timedelta
from django.utils import timezone
from django.db import transaction
from main.util.media_helper import get_full_media_url


class GarageView(APIView):
    permission_classes = [IsAuthenticated]


    """ Define a set of action handlers that would be used to route the url to the appropriate function """
    action_handlers = {
        'add_vehicle': 'add_vehicle',
        'get_vehicles': 'get_vehicles',
        'update_vehicle': 'update_vehicle',
        'delete_vehicle': 'delete_vehicle',
        'get_vehicle_stats': 'get_vehicle_stats',
        'test_s3_connection': 'test_s3_connection',
        'approve_transfer': 'approve_transfer',
        'reject_transfer': 'reject_transfer',
        'get_pending_transfers': 'get_pending_transfers',
        'create_vehicle_event': 'create_vehicle_event',
    }

    def get(self, request, *args, **kwargs):
        """Route GET by action. Passes vehicle_id from URL to handler when present (e.g. update_vehicle, get_vehicle_stats)."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        vehicle_id = kwargs.get('vehicle_id')
        if vehicle_id is not None:
            return handler(request, vehicle_id)
        return handler(request)
    
    def post(self, request, *args, **kwargs):
        """Route POST by action (e.g. add_vehicle, create_vehicle_event). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)
    
    def patch(self, request, *args, **kwargs):
        """Route PATCH by action. Passes vehicle_id from URL when present (e.g. update_vehicle). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        
        # Check if we have vehicle_id in kwargs (from URL path)
        vehicle_id = kwargs.get('vehicle_id')
        if vehicle_id is not None:
            return handler(request, vehicle_id)
        return handler(request)
    
    
    def delete(self, request, *args, **kwargs):
        """Route DELETE by action. Passes vehicle_id from URL when present (e.g. delete_vehicle). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        
        # Check if we have vehicle_id in kwargs (from URL path)
        vehicle_id = kwargs.get('vehicle_id')
        if vehicle_id is not None:
            return handler(request, vehicle_id)
        return handler(request)
    
    """ Here we will define the methods that would handle the jobs that are to be done on the server """

    def add_vehicle(self, request):
        """
        Add a new vehicle for the user. Expects make, model, year, color, registration_number (or licence), country, vin;
        optional image (file). Creates or gets Vehicle, creates VehicleOwnership. For fleet branch: links via FleetVehicle.
        Returns vehicle payload with id, make, model, year, color, licence, image URL, etc.
        """
        
        try:
            make = request.data.get('make')
            model = request.data.get('model')
            year = request.data.get('year')
            color = request.data.get('color')
            registration_number = request.data.get('registration_number') or request.data.get('licence')  # Support both field names for backward compatibility
            country = request.data.get('country', 'Unknown')  # Default to 'Unknown' if not provided
            vin = request.data.get('vin')  # VIN is REQUIRED
            image = request.FILES.get('image')  # Get the uploaded image file
            
            
            # Validate required fields including VIN
            if not all([make, model, year, color, registration_number, vin]):
                return Response({
                    'error': 'Missing required fields. VIN is required for vehicle registration.'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Check if vehicle with this VIN already exists
            try:
                existing_vehicle = Vehicle.objects.get(vin=vin)
                
                # Check if vehicle has an active owner
                active_ownership = existing_vehicle.get_active_ownership()
                
                if active_ownership:
                    # Vehicle is already owned - check if it's the same user or associated with the same fleet
                    managed_branch = request.user.get_managed_branch()
                    already_owns_or_same_fleet = (
                        active_ownership.owner == request.user
                        or (managed_branch is not None and active_ownership.vehicle.fleet_associations.filter(fleet=managed_branch.fleet).exists())
                    )
                    if already_owns_or_same_fleet:
                        return Response({
                            'error': 'You already own this vehicle',
                            'vehicle': {
                                'id': str(existing_vehicle.id),
                                'make': existing_vehicle.make,
                                'model': existing_vehicle.model,
                                'year': existing_vehicle.year,
                                'color': existing_vehicle.color,
                                'registration_number': existing_vehicle.registration_number,
                                'country': existing_vehicle.country,
                                'vin': existing_vehicle.vin,
                            }
                        }, status=status.HTTP_400_BAD_REQUEST)
                    
                    # Vehicle is owned by someone else - create transfer request
                    from main.tasks import send_transfer_request_email
                    
                    # Check if there's already a pending transfer for this vehicle
                    existing_transfer = VehicleTransfer.objects.filter(
                        vehicle=existing_vehicle,
                        to_owner=request.user,
                        status='pending'
                    ).first()
                    
                    if existing_transfer:
                        return Response({
                            'error': 'A transfer request for this vehicle is already pending',
                            'transfer_id': str(existing_transfer.id),
                            'message': 'Please wait for the current owner to respond to your transfer request.'
                        }, status=status.HTTP_400_BAD_REQUEST)
                    
                    # Create transfer request
                    transfer = VehicleTransfer.objects.create(
                        vehicle=existing_vehicle,
                        from_owner=active_ownership.owner,
                        to_owner=request.user,
                        expires_at=timezone.now() + timedelta(days=7)
                    )
                    
                    # Send email to current owner
                    send_transfer_request_email.delay(
                        transfer.id,
                        active_ownership.owner.email,
                        request.user.name,
                        existing_vehicle.registration_number
                    )
                    
                    return Response({
                        'message': 'This vehicle is already owned by another user. A transfer request has been sent to the current owner.',
                        'transfer_id': str(transfer.id),
                        'status': 'pending',
                        'vehicle': {
                            'id': str(existing_vehicle.id),
                            'make': existing_vehicle.make,
                            'model': existing_vehicle.model,
                            'year': existing_vehicle.year,
                            'registration_number': existing_vehicle.registration_number,
                        }
                    }, status=status.HTTP_202_ACCEPTED)
                
                else:
                    # Vehicle exists but has no active owner - create ownership for new user
                    vehicle = existing_vehicle
                    if image:
                        vehicle.image = image
                        vehicle.save()
                    
            except Vehicle.DoesNotExist:
                # Vehicle doesn't exist - create new vehicle
                vehicle = Vehicle.objects.create(
                    make=make,
                    model=model,
                    year=year,
                    color=color,
                    registration_number=registration_number,
                    country=country,
                    vin=vin,
                    image=image if image else None,
                    owner_count=0
                )
            
            # Determine ownership type and branch based on user type
            ownership_type = 'private'
            branch = None
            fleet = None  # Initialize fleet variable
            
            if request.user.is_fleet_owner:
                # Fleet owner: require branch_id and validate it belongs to their fleet
                branch_id = request.data.get('branch_id')
                if not branch_id:
                    return Response({
                        'error': 'Branch ID is required for fleet owners'
                    }, status=status.HTTP_400_BAD_REQUEST)
                
                # Get the fleet for this user
                fleet = Fleet.objects.filter(owner=request.user).first()
                if not fleet:
                    return Response({
                        'error': 'No fleet found for this user'
                    }, status=status.HTTP_404_NOT_FOUND)
                
                # Check subscription limit
                can_add, error_msg = fleet.can_add_vehicle()
                if not can_add:
                    return Response({'error': error_msg}, status=status.HTTP_403_FORBIDDEN)
                
                # Validate branch belongs to this fleet
                try:
                    branch = Branch.objects.get(id=branch_id, fleet=fleet)
                except Branch.DoesNotExist:
                    return Response({
                        'error': 'Branch not found or does not belong to your fleet'
                    }, status=status.HTTP_403_FORBIDDEN)
                
                ownership_type = 'fleet'
                
            elif request.user.is_branch_admin:
                # Branch admin: automatically use their managed branch
                managed_branch = request.user.get_managed_branch()
                if not managed_branch:
                    return Response({
                        'error': 'No branch assigned to this branch admin account'
                    }, status=status.HTTP_400_BAD_REQUEST)
                
                branch = managed_branch
                fleet = branch.fleet  # Get fleet from branch
                
                # Check subscription limit (fleet-level check)
                can_add, error_msg = fleet.can_add_vehicle()
                if not can_add:
                    return Response({'error': error_msg}, status=status.HTTP_403_FORBIDDEN)
                
                ownership_type = 'fleet'
            
            # Determine the actual owner for VehicleOwnership
            # For fleet vehicles: owner is the fleet owner
            # For private vehicles: owner is the user themselves
            actual_owner = request.user
            
            # Ensure ownership_type is 'fleet' if user adding the vehicle is a fleet owner or admin
            # This is a safeguard to ensure fleet users always get 'fleet' ownership type
            # even if the earlier logic didn't catch it for some reason
            if request.user.is_fleet_owner or request.user.is_branch_admin:
                if ownership_type != 'fleet':
                    ownership_type = 'fleet'
                    # Ensure we have branch and fleet set for branch admins
                    if request.user.is_branch_admin and not branch:
                        managed_branch = request.user.get_managed_branch()
                        if managed_branch:
                            branch = managed_branch
                            fleet = branch.fleet
                    # Ensure we have fleet set for fleet owners
                    elif request.user.is_fleet_owner and not fleet:
                        fleet = Fleet.objects.filter(owner=request.user).first()
            
            if ownership_type == 'fleet':
                if request.user.is_fleet_owner:
                    actual_owner = request.user
                elif request.user.is_branch_admin and branch:
                    # Get the fleet owner from the branch's fleet
                    actual_owner = branch.fleet.owner
            
            # Create ownership record for this user (vehicle has no active owner)
            with transaction.atomic():
                VehicleOwnership.objects.create(
                    vehicle=vehicle,
                    owner=actual_owner,
                    ownership_type=ownership_type,
                    start_date=timezone.now().date(),
                )
                
                # Increment owner count
                vehicle.owner_count += 1
                vehicle.save()

                # Only create FleetVehicle if branch and fleet are set
                if branch and fleet:
                    FleetVehicle.objects.create(
                        fleet=fleet,
                        vehicle=vehicle,
                        branch=branch,
                        added_by=request.user,
                    )
            
            # Prepare vehicle data for response
            vehicle_data = {
                'id': str(vehicle.id),
                'make': vehicle.make,
                'model': vehicle.model,
                'year': vehicle.year,
                'color': vehicle.color,
                'registration_number': vehicle.registration_number,
                'country': vehicle.country,
                'vin': vehicle.vin,
                'owner_count': vehicle.owner_count,
                'image': get_full_media_url(vehicle.image.url) if vehicle.image else None,
            }
            return Response({
                'message': f'You just added {vehicle.make} {vehicle.model} {vehicle.year} to your garage',
                'vehicle': vehicle_data,
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            import traceback
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


    def get_vehicles(self, request):
        """
        Return vehicles for the user. Regular user: their owned vehicles (VehicleOwnership). Branch admin: vehicles in
        managed branch (FleetVehicle). Fleet owner: all vehicles in their fleet. Returns list with vehicle dicts and
        optional branch_id/branch_name; grouped by branch for branch admin.
        """
        try:
            # Check user type and get vehicles accordingly
            if request.user.is_fleet_owner:
                # Fleet owner: Get all vehicles grouped by branch
                fleet = Fleet.objects.filter(owner=request.user).first()
                if not fleet:
                    return Response({'branches': []}, status=status.HTTP_200_OK)
                
                fleet_vehicles = FleetVehicle.objects.filter(fleet=fleet).select_related('vehicle', 'branch').order_by('branch__name', 'vehicle__make')
                
                # Group vehicles by branch
                branches_dict = {}
                for fv in fleet_vehicles:
                    branch_id = str(fv.branch.id) if fv.branch else 'unassigned'
                    branch_name = fv.branch.name if fv.branch else 'Unassigned'
                    
                    if branch_id not in branches_dict:
                        branches_dict[branch_id] = {
                            'branch_id': branch_id,
                            'branch_name': branch_name,
                            'vehicles': []
                        }
                    
                    vehicle = fv.vehicle
                    # Get image URL with proper error handling
                    image_url = None
                    if vehicle.image:
                        try:
                            raw_url = vehicle.image.url
                            if raw_url:
                                image_url = get_full_media_url(raw_url)
                        except Exception as e:
                            image_url = None
                    
                    vehicle_data = {
                        'id': str(vehicle.id),
                        'make': vehicle.make,
                        'model': vehicle.model,
                        'year': vehicle.year,
                        'color': vehicle.color,
                        'registration_number': vehicle.registration_number,
                        'country': vehicle.country,
                        'vin': vehicle.vin,
                        'image': image_url,
                        'branch_id': branch_id,
                        'branch_name': branch_name,
                    }
                    branches_dict[branch_id]['vehicles'].append(vehicle_data)
                
                # Convert to list format
                branches_list = list(branches_dict.values())
                return Response({'branches': branches_list}, status=status.HTTP_200_OK)
                
            elif request.user.is_branch_admin:
                # Branch admin: Get only vehicles in their assigned branch (flat list)
                managed_branch = request.user.get_managed_branch()
                if not managed_branch:
                    return Response({'vehicles': []}, status=status.HTTP_200_OK)
                
                # Filter by both fleet and branch to ensure we only get vehicles from the correct fleet
                fleet_vehicles = FleetVehicle.objects.filter(
                    fleet=managed_branch.fleet, 
                    branch=managed_branch
                ).select_related('vehicle')
                vehicles = [fv.vehicle for fv in fleet_vehicles]
            else:
                # Regular user: Get their own vehicles (flat list)
                vehicles = request.user.get_current_vehicles()

            # For branch admins and regular users, return flat list
            vehicles_list = []
            for vehicle in vehicles:
                # Get image URL with proper error handling
                image_url = None
                if vehicle.image:
                    try:
                        raw_url = vehicle.image.url
                        if raw_url:
                            image_url = get_full_media_url(raw_url)
                        else:
                            image_url = None
                    except Exception as e:
                        image_url = None
                else:
                    image_url = None

                vehicle_data = {
                    'id': str(vehicle.id),
                    'make': vehicle.make,
                    'model': vehicle.model,
                    'year': vehicle.year,
                    'color': vehicle.color,
                    'registration_number': vehicle.registration_number,
                    'country': vehicle.country,
                    'vin': vehicle.vin,
                    'image': image_url,  # This will be None if no image or if error occurs
                }
                vehicles_list.append(vehicle_data)
            return Response({'vehicles': vehicles_list}, status=status.HTTP_200_OK)
        except Exception as e:
            import traceback
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        

    def update_vehicle(self, request, vehicle_id=None):
        """
        Update an existing vehicle. vehicle_id from URL or request.data. Expects make, model, year, color,
        registration_number (or licence), country; optional vin, image. User must own vehicle (or be branch admin for
        branch vehicle). Returns updated vehicle payload.
        """
        try:
            make = request.data.get('make')
            model = request.data.get('model')
            year = request.data.get('year')
            color = request.data.get('color')
            registration_number = request.data.get('registration_number') or request.data.get('licence')
            country = request.data.get('country')
            vin = request.data.get('vin')

            # Get the vehicle_id from URL path first, then fallback to query params
            if vehicle_id is None:
                vehicle_id = request.query_params.get('vehicle_id')

            if not vehicle_id:
                return Response({'error': 'Vehicle ID is required'}, status=status.HTTP_400_BAD_REQUEST)

            try:
                # Get the vehicle from the db - check ownership instead of direct user relation
                vehicle = Vehicle.objects.get(id=vehicle_id)
                # Verify ownership
                current_ownership = VehicleOwnership.objects.filter(
                    vehicle=vehicle,
                    owner=request.user,
                    end_date__isnull=True
                ).first()
                
                if not current_ownership:
                    return Response({'error': 'Vehicle not found or access denied'}, status=status.HTTP_404_NOT_FOUND)
            except Vehicle.DoesNotExist:
                return Response({'error': 'Vehicle not found'}, status=status.HTTP_404_NOT_FOUND)
            except Exception as e:
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

            # Update the vehicle with the new values or the old values if no new values are provided
            vehicle.make = make if make else vehicle.make
            vehicle.model = model if model else vehicle.model
            vehicle.year = year if year else vehicle.year
            vehicle.color = color if color else vehicle.color
            if registration_number:
                vehicle.registration_number = registration_number
            if country:
                vehicle.country = country
            if vin is not None:  # Allow clearing VIN by passing empty string
                vehicle.vin = vin if vin else None
            # Save the vehicle to the db
            vehicle.save()
            # Return the vehicle object
            return Response({
                'id': str(vehicle.id),
                'make': vehicle.make,
                'model': vehicle.model,
                'year': vehicle.year,
                'color': vehicle.color,
                'registration_number': vehicle.registration_number,
                'country': vehicle.country,
                'vin': vehicle.vin,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        

    def delete_vehicle(self, request, vehicle_id=None):
        """
        Delete (end ownership for) a vehicle. vehicle_id from URL or request. User must be current owner or have
        permission (branch admin for branch vehicle). Ends VehicleOwnership; may delete Vehicle if no other owners.
        """
        try:
            # Get the vehicle_id from URL path first, then fallback to query params
            if vehicle_id is None:
                vehicle_id = request.query_params.get('vehicle_id')
            
            if not vehicle_id:
                return Response({'error': 'Vehicle ID is required'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Get the vehicle and ownership from the db
            try:
                vehicle = Vehicle.objects.get(id=vehicle_id)
                # Get current ownership
                ownership = VehicleOwnership.objects.filter(
                    vehicle=vehicle,
                    owner=request.user,
                    end_date__isnull=True
                ).first()
                
                if not ownership:
                    return Response({'error': 'Vehicle not found or access denied'}, status=status.HTTP_404_NOT_FOUND)
            except Vehicle.DoesNotExist:
                return Response({'error': 'Vehicle not found'}, status=status.HTTP_404_NOT_FOUND)
            
            # Store vehicle info before ending ownership for the response message
            vehicle_make = vehicle.make
            vehicle_model = vehicle.model
            
            # Soft delete: End ownership instead of deleting the vehicle
            ownership.end_date = timezone.now().date()
            ownership.save()
            
            # Return success message
            return Response({
                'message': f'You have successfully removed {vehicle_make} {vehicle_model} from your garage',
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)  
        
        
    def get_vehicle_stats(self, request, vehicle_id=None):
        """
        Return stats for a vehicle: total services, completed, cancelled; last service date; optional promotions
        for user. vehicle_id from URL or request. User must have access to the vehicle.
        """
        try:
            # Get the vehicle_id from URL path first, then fallback to query params
            if vehicle_id is None:
                vehicle_id = request.query_params.get('vehicle_id')
            
            if not vehicle_id:
                return Response({'error': 'Vehicle ID is required'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Get the vehicle from the db
            try:
                vehicle = Vehicle.objects.get(id=vehicle_id)
                
                # Verify access based on user type
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
                    return Response({'error': 'Vehicle not found or access denied'}, status=status.HTTP_404_NOT_FOUND)
                    
            except Vehicle.DoesNotExist:
                return Response({'error': 'Vehicle not found'}, status=status.HTTP_404_NOT_FOUND)
            
            # Get all wash events for this vehicle (using VehicleEvent instead of BookedAppointment)
            wash_events = VehicleEvent.objects.filter(
                vehicle=vehicle,
                event_type='wash'
            ).order_by('-event_date')
            
            total_washes = wash_events.count()
            
            # Get bookings for this vehicle to calculate total amount
            bookings = BookedAppointment.objects.filter(vehicle=vehicle, status='completed')
            total_amount = 0.0
            
            for booking in bookings:
                booking_total = float(booking.total_amount)
                total_amount += booking_total
            
            # Get the last cleaned date (last wash event)
            last_cleaned = None
            last_wash_event = wash_events.first()
            if last_wash_event:
                last_cleaned = last_wash_event.event_date.date().isoformat()
            
            # Calculate next recommended service (14 days from last cleaning or 14 days from now if no previous cleaning)
            next_recommended_service = None
            if last_cleaned:
                last_cleaned_date = datetime.fromisoformat(last_cleaned.replace('Z', '+00:00'))
                next_recommended_service = (last_cleaned_date + timedelta(days=14)).isoformat()
            else:
                next_recommended_service = (datetime.now() + timedelta(days=14)).isoformat()

            
            # Get image URL with proper error handling
            image_url = None
            if vehicle.image:
                try:
                    raw_url = vehicle.image.url
                    if raw_url:
                        image_url = get_full_media_url(raw_url)
                except Exception as e:
                    image_url = None
            
            # Get latest inspection data from most recent completed booking
            latest_inspection = None
            try:
                latest_booking = bookings.order_by('-appointment_date').first()
                if latest_booking and hasattr(latest_booking, 'eventdatamanagement'):
                    from main.serializer import EventDataManagementSerializer
                    inspection_data = latest_booking.eventdatamanagement
                    inspection_serializer = EventDataManagementSerializer(inspection_data)
                    latest_inspection = inspection_serializer.data
                    # Add booking reference and appointment date for context
                    latest_inspection['booking_reference'] = latest_booking.booking_reference
                    # Use appointment_date instead of inspected_at for display
                    latest_inspection['appointment_date'] = latest_booking.appointment_date.isoformat()
            except Exception as e:
                latest_inspection = None
            
            # Return the vehicle stats
            return Response({
                'vehicle': {
                    'id': str(vehicle.id),
                    'make': vehicle.make,
                    'model': vehicle.model,
                    'year': vehicle.year,
                    'color': vehicle.color,
                    'registration_number': vehicle.registration_number,
                    'licence': vehicle.registration_number,  # Add licence field for compatibility
                    'country': vehicle.country,
                    'vin': vehicle.vin,
                    'image': image_url,  # Include image field
                },
                'total_bookings': total_washes,
                'total_amount': float(total_amount),
                'last_cleaned': last_cleaned,
                'next_recommended_service': next_recommended_service,
                'latest_inspection': latest_inspection,
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def test_s3_connection(self, request):
        """Test S3 connection and configuration"""
        try:
            from django.conf import settings
            import boto3
            from botocore.exceptions import ClientError, NoCredentialsError
            
            
            # Test S3 connection
            s3_client = boto3.client(
                's3',
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                region_name=settings.AWS_S3_REGION_NAME
            )
            
            # Test bucket access
            try:
                response = s3_client.head_bucket(Bucket=settings.AWS_STORAGE_BUCKET_NAME)
                
                # Test file upload
                test_key = 'test/connection_test.txt'
                test_content = 'S3 connection test'
                
                s3_client.put_object(
                    Bucket=settings.AWS_STORAGE_BUCKET_NAME,
                    Key=test_key,
                    Body=test_content,
                    ContentType='text/plain'
                )
                
                # Test file URL generation
                test_url = f"https://{settings.AWS_STORAGE_BUCKET_NAME}.s3.{settings.AWS_S3_REGION_NAME}.amazonaws.com/{test_key}"
                
                # Clean up test file
                s3_client.delete_object(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=test_key)
                
                return Response({
                    'status': 'success',
                    'message': 'S3 connection successful',
                    'bucket': settings.AWS_STORAGE_BUCKET_NAME,
                    'region': settings.AWS_S3_REGION_NAME,
                    'test_url': test_url
                }, status=status.HTTP_200_OK)
                
            except ClientError as e:
                error_code = e.response['Error']['Code']
                return Response({
                    'status': 'error',
                    'message': f'S3 bucket access failed: {error_code}',
                    'error': str(e)
                }, status=status.HTTP_400_BAD_REQUEST)
                
        except NoCredentialsError:
            return Response({
                'status': 'error',
                'message': 'AWS credentials not configured',
                'error': 'No AWS credentials found'
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            return Response({
                'status': 'error',
                'message': 'S3 connection test failed',
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
    
    def approve_transfer(self, request, transfer_id=None):
        """
        Approve a vehicle transfer request.
        Ends current ownership and creates new ownership for the requester.
        """
        try:
            if transfer_id is None:
                transfer_id = request.query_params.get('transfer_id') or request.data.get('transfer_id')
            
            if not transfer_id:
                return Response({'error': 'Transfer ID is required'}, status=status.HTTP_400_BAD_REQUEST)
            
            try:
                transfer = VehicleTransfer.objects.get(id=transfer_id)
            except VehicleTransfer.DoesNotExist:
                return Response({'error': 'Transfer request not found'}, status=status.HTTP_404_NOT_FOUND)
            
            # Verify that the current user is the from_owner (current owner)
            if transfer.from_owner != request.user:
                return Response({
                    'error': 'You are not authorized to approve this transfer'
                }, status=status.HTTP_403_FORBIDDEN)
            
            # Check if transfer can still be approved
            if not transfer.can_be_approved():
                if transfer.is_expired():
                    transfer.status = 'expired'
                    transfer.save()
                    return Response({
                        'error': 'This transfer request has expired'
                    }, status=status.HTTP_400_BAD_REQUEST)
                return Response({
                    'error': f'This transfer request is {transfer.status} and cannot be approved'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Verify vehicle still has active ownership by from_owner
            active_ownership = transfer.vehicle.get_active_ownership()
            if not active_ownership or active_ownership.owner != transfer.from_owner:
                return Response({
                    'error': 'Vehicle ownership has changed. Transfer cannot be completed.'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Approve transfer
            with transaction.atomic():
                # End current ownership
                active_ownership.end_date = timezone.now().date()
                active_ownership.save()
                
                # Create new ownership for to_owner
                VehicleOwnership.objects.create(
                    vehicle=transfer.vehicle,
                    owner=transfer.to_owner,
                    ownership_type='private',
                    start_date=timezone.now().date(),
                )
                
                # Update transfer status
                transfer.status = 'approved'
                transfer.responded_at = timezone.now()
                transfer.save()
                
                # Remove vehicle from any fleet so it no longer appears in previous owner's garage
                FleetVehicle.objects.filter(vehicle=transfer.vehicle).delete()
                
                # Reject any other pending transfers for the same vehicle
                VehicleTransfer.objects.filter(
                    vehicle=transfer.vehicle,
                    status='pending'
                ).exclude(id=transfer.id).update(
                    status='rejected',
                    responded_at=timezone.now()
                )
                
                # Increment owner count
                transfer.vehicle.owner_count += 1
                transfer.vehicle.save()
            
            # Send notification emails
            from main.tasks import send_transfer_approved_email
            send_transfer_approved_email.delay(
                transfer.id,
                transfer.to_owner.email,
                transfer.from_owner.name,
                transfer.vehicle.registration_number
            )
            
            return Response({
                'message': f'Vehicle {transfer.vehicle.registration_number} has been transferred to {transfer.to_owner.name}',
                'transfer_id': str(transfer.id),
                'status': 'approved'
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            import traceback
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    def reject_transfer(self, request, transfer_id=None):
        """
        Reject a vehicle transfer request.
        """
        try:
            if transfer_id is None:
                transfer_id = request.query_params.get('transfer_id') or request.data.get('transfer_id')
            
            if not transfer_id:
                return Response({'error': 'Transfer ID is required'}, status=status.HTTP_400_BAD_REQUEST)
            
            try:
                transfer = VehicleTransfer.objects.get(id=transfer_id)
            except VehicleTransfer.DoesNotExist:
                return Response({'error': 'Transfer request not found'}, status=status.HTTP_404_NOT_FOUND)
            
            # Verify that the current user is the from_owner (current owner)
            if transfer.from_owner != request.user:
                return Response({
                    'error': 'You are not authorized to reject this transfer'
                }, status=status.HTTP_403_FORBIDDEN)
            
            # If already expired, set status to expired and do not send rejected email
            if transfer.is_expired():
                transfer.status = 'expired'
                transfer.responded_at = timezone.now()
                transfer.save()
                return Response({
                    'message': 'This transfer request had already expired.',
                    'transfer_id': str(transfer.id),
                    'status': 'expired'
                }, status=status.HTTP_200_OK)
            
            # Reject transfer
            transfer.status = 'rejected'
            transfer.responded_at = timezone.now()
            transfer.save()
            
            # Send notification email only when actively rejected (not expired)
            from main.tasks import send_transfer_rejected_email
            send_transfer_rejected_email.delay(
                transfer.id,
                transfer.to_owner.email,
                transfer.from_owner.name,
                transfer.vehicle.registration_number
            )
            
            return Response({
                'message': f'Transfer request for vehicle {transfer.vehicle.registration_number} has been rejected',
                'transfer_id': str(transfer.id),
                'status': 'rejected'
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            import traceback
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    def get_pending_transfers(self, request):
        """
        Get all pending transfer requests for the current user (both incoming and outgoing).
        """
        try:
            # Get transfers where user is the current owner (incoming requests)
            incoming_transfers = VehicleTransfer.objects.filter(
                from_owner=request.user,
                status='pending'
            ).select_related('vehicle', 'to_owner').order_by('-requested_at')
            
            # Get transfers where user is the requester (outgoing requests)
            outgoing_transfers = VehicleTransfer.objects.filter(
                to_owner=request.user,
                status='pending'
            ).select_related('vehicle', 'from_owner').order_by('-requested_at')
            
            def format_transfer(transfer, direction):
                return {
                    'id': str(transfer.id),
                    'direction': direction,
                    'vehicle': {
                        'id': str(transfer.vehicle.id),
                        'make': transfer.vehicle.make,
                        'model': transfer.vehicle.model,
                        'year': transfer.vehicle.year,
                        'registration_number': transfer.vehicle.registration_number,
                        'vin': transfer.vehicle.vin,
                    },
                    'from_owner': {
                        'id': transfer.from_owner.id,
                        'name': transfer.from_owner.name,
                        'email': transfer.from_owner.email,
                    },
                    'to_owner': {
                        'id': transfer.to_owner.id,
                        'name': transfer.to_owner.name,
                        'email': transfer.to_owner.email,
                    },
                    'status': transfer.status,
                    'requested_at': transfer.requested_at.isoformat(),
                    'expires_at': transfer.expires_at.isoformat(),
                    'is_expired': transfer.is_expired(),
                }
            
            incoming_data = [format_transfer(t, 'incoming') for t in incoming_transfers]
            outgoing_data = [format_transfer(t, 'outgoing') for t in outgoing_transfers]
            
            return Response({
                'incoming_transfers': incoming_data,
                'outgoing_transfers': outgoing_data,
                'total_pending': len(incoming_data) + len(outgoing_data)
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            import traceback
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def create_vehicle_event(self, request):
        """
        Create a new vehicle event (inspection, repair, service, etc.)
        Can be accessed publicly via VIN if visibility is 'public'
        """
        try:
            vehicle_id = request.data.get('vehicle_id')
            event_type = request.data.get('event_type')
            metadata = request.data.get('metadata', {})
            visibility = request.data.get('visibility', 'public')
            notes = request.data.get('notes', '')
            event_date = request.data.get('event_date')
            
            # Validate required fields
            if not all([vehicle_id, event_type]):
                return Response({
                    'error': 'vehicle_id and event_type are required'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Validate event_type against choices
            valid_event_types = [choice[0] for choice in VehicleEvent.EVENT_TYPE_CHOICES]
            if event_type not in valid_event_types:
                return Response({
                    'error': f'invalid event_type. Must be one of: {", ".join(valid_event_types)}'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Validate visibility against choices
            valid_visibility = [choice[0] for choice in VehicleEvent.VISIBILITY_CHOICES]
            if visibility not in valid_visibility:
                return Response({
                    'error': f'invalid visibility. Must be one of: {", ".join(valid_visibility)}'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Get vehicle - check ownership for private events
            try:
                vehicle = Vehicle.objects.get(id=vehicle_id)
            except Vehicle.DoesNotExist:
                return Response({
                    'error': 'Vehicle not found'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Check if user has permission (for private events or if user is creating)
            if visibility == 'private':
                # User must own the vehicle
                if not VehicleOwnership.objects.filter(
                    vehicle=vehicle,
                    owner=request.user,
                    end_date__isnull=True
                ).exists():
                    return Response({
                        'error': 'You do not have permission to create private events for this vehicle'
                    }, status=status.HTTP_403_FORBIDDEN)
            else:
                # For public events, still verify user has some relationship to the vehicle
                # This prevents spam but allows documented services
                if not VehicleOwnership.objects.filter(
                    vehicle=vehicle,
                    owner=request.user
                ).exists():
                    # Allow creating public events even if not current owner (for mechanics, etc.)
                    # But log it for audit purposes
                    pass
            
            # Parse event_date
            if event_date:
                try:
                    # Handle ISO format strings
                    if isinstance(event_date, str):
                        if 'Z' in event_date:
                            event_date = event_date.replace('Z', '+00:00')
                        event_date = timezone.datetime.fromisoformat(event_date.replace('Z', '+00:00'))
                    elif isinstance(event_date, datetime):
                        event_date = event_date
                except (ValueError, AttributeError) as e:
                    event_date = timezone.now()
            else:
                event_date = timezone.now()
            
            # Add notes to metadata if provided
            if notes:
                metadata['notes'] = notes
            
            # Create the event
            vehicle_event = VehicleEvent.objects.create(
                vehicle=vehicle,
                event_type=event_type,
                performed_by=request.user,
                metadata=metadata,
                visibility=visibility,
                event_date=event_date,
            )
            
            return Response({
                'id': str(vehicle_event.id),
                'message': f'{event_type} event created successfully',
                'event': {
                    'id': str(vehicle_event.id),
                    'event_type': vehicle_event.event_type,
                    'event_date': vehicle_event.event_date.isoformat(),
                    'visibility': vehicle_event.visibility,
                }
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            import traceback
            return Response({
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)