"""
Garage API: vehicles CRUD, stats, S3 test, transfer approve/reject, pending transfers, vehicle events.

Actions: add_vehicle, lookup_vehicle_registration, get_vehicles, update_vehicle,
delete_vehicle, get_vehicle_stats, test_s3_connection, approve_transfer, reject_transfer,
get_pending_transfers, create_vehicle_event.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta

from django.conf import settings as django_settings
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from django_ratelimit.core import is_ratelimited
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from main.models import Vehicle, VehicleOwnership, VehicleEvent, BookedAppointment, VehicleTransfer, Fleet, FleetVehicle, Branch
from main.services.regcheck_ireland import (
    RegcheckIrelandError,
    download_provider_image,
    ireland_payload_for_cache,
    lookup_ireland,
)
from main.utils.media_helper import get_full_media_url


LOOKUP_TTL_SECONDS = 900

# Ireland RegCheck / carregistrations.ie abuse prevention (per authenticated user).
VEHICLE_REGISTRATION_LOOKUP_RATELIMIT_GROUP = 'garage_lookup_vehicle_registration'
VEHICLE_REGISTRATION_LOOKUP_RATELIMIT_RATE = '1/5m'


def lookup_cache_key(token: str) -> str:
    """Redis/cache key for a short-lived registration lookup preview token."""
    return f'vehicle_reg_lookup:{token}'


def canonical_garage_country(value) -> str:
    """Normalize country input; default Ireland for IE/empty variants."""
    v = (value or '').strip()
    if not v:
        return 'Ireland'
    low = v.lower()
    if low in ('ie', 'ireland', 'irl'):
        return 'Ireland'
    return v


def find_existing_vehicle_for_add(registration_number: str, country: str):
    """Return Vehicle if reg+country already exists (used before add_vehicle)."""
    try:
        return Vehicle.objects.get(
            registration_number=registration_number,
            country=country,
        )
    except Vehicle.DoesNotExist:
        return None


def vehicle_customer_payload(vehicle: Vehicle):
    """Serialize vehicle for client garage list (includes full image URL when present)."""
    img = None
    if vehicle.image:
        try:
            raw = vehicle.image.url
            if raw:
                img = get_full_media_url(raw)
        except Exception:
            img = None
    return {
        'id': str(vehicle.id),
        'make': vehicle.make,
        'model': vehicle.model,
        'year': vehicle.year,
        'color': vehicle.color,
        'registration_number': vehicle.registration_number,
        'country': vehicle.country,
        'body_style': vehicle.body_style,
        'owner_count': vehicle.owner_count,
        'image': img,
    }


class GarageView(APIView):
    """
    Vehicle garage: CRUD, Ireland reg lookup, transfers, events, stats, S3 diagnostics.

    Action-routed via ``garage/<action>/`` with optional ``vehicle_id`` in URL for
    update/delete/stats on a single vehicle.
    """

    permission_classes = [IsAuthenticated]

    action_handlers = {
        'lookup_vehicle_registration': 'lookup_vehicle_registration',
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

    def _resolve_vehicle_access(self, request, vehicle):
        """
        Whether this user can update/delete ``vehicle``, plus the rows to change.

        Fleet garage lists cars via ``FleetVehicle``, not only ``VehicleOwnership``
        for ``request.user``. Branch admins see branch cars owned by the fleet owner.
        """
        if request.user.is_fleet_owner:
            fleet = Fleet.objects.filter(owner=request.user).first()
            if not fleet:
                return False, None, None
            fleet_vehicle = FleetVehicle.objects.filter(fleet=fleet, vehicle=vehicle).first()
            if not fleet_vehicle:
                return False, None, None
            ownership = VehicleOwnership.objects.filter(
                vehicle=vehicle,
                owner=request.user,
                end_date__isnull=True,
            ).first()
            return True, ownership, fleet_vehicle

        if request.user.is_branch_admin:
            managed_branch = request.user.get_managed_branch()
            if not managed_branch:
                return False, None, None
            fleet_vehicle = FleetVehicle.objects.filter(
                fleet=managed_branch.fleet,
                branch=managed_branch,
                vehicle=vehicle,
            ).first()
            if not fleet_vehicle:
                return False, None, None
            ownership = VehicleOwnership.objects.filter(
                vehicle=vehicle,
                owner=managed_branch.fleet.owner,
                end_date__isnull=True,
            ).first()
            return True, ownership, fleet_vehicle

        ownership = VehicleOwnership.objects.filter(
            vehicle=vehicle,
            owner=request.user,
            end_date__isnull=True,
        ).first()
        return ownership is not None, ownership, None

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
    
    def lookup_vehicle_registration(self, request):
        """
        Ireland RegCheck lookup. POST JSON { licence|registration_number, country? } → preview + lookup_token.
        """
        if request.method != 'POST':
            return Response(
                {'error': 'Use POST', 'code': 'method_not_allowed'},
                status=status.HTTP_405_METHOD_NOT_ALLOWED,
            )

        if is_ratelimited(
            request,
            group=VEHICLE_REGISTRATION_LOOKUP_RATELIMIT_GROUP,
            key='user',
            rate=VEHICLE_REGISTRATION_LOOKUP_RATELIMIT_RATE,
            method='POST',
            increment=True,
        ):
            return Response(
                {
                    'error': (
                        'Registration lookup is limited to once every 5 minutes. '
                        'Please try again later.'
                    ),
                    'code': 'rate_limited',
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        reg = (
            (request.data.get('registration_number') or request.data.get('licence') or '')
            .strip()
            .upper()
            .replace(' ', '')
        )
        canon = canonical_garage_country(request.data.get('country'))
        if canon != 'Ireland':
            return Response(
                {
                    'error': 'Lookup is only available for Ireland',
                    'code': 'unsupported_country',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        username = getattr(django_settings, 'CAR_REG_USERNAME', None)
        if not username:
            return Response(
                {
                    'error': 'Registration lookup is not configured',
                    'code': 'config_error',
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if not reg:
            return Response(
                {'error': 'Registration number required', 'code': 'validation'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            payload = lookup_ireland(reg, username=str(username))
        except RegcheckIrelandError as exc:
            st = (
                status.HTTP_503_SERVICE_UNAVAILABLE
                if exc.code == 'upstream_error'
                else status.HTTP_400_BAD_REQUEST
            )
            return Response({'error': str(exc), 'code': exc.code}, status=st)

        token = secrets.token_urlsafe(32)
        cache.set(
            lookup_cache_key(token),
            ireland_payload_for_cache(payload),
            LOOKUP_TTL_SECONDS,
        )

        preview = {
            'registration_number': payload['registration_number'],
            'country': 'Ireland',
            'make': payload['make'],
            'model': payload['model'],
            'year': payload['year'],
            'color': payload.get('color') or None,
            'body_style': payload.get('body_style'),
            'image_url': payload.get('provider_image_url'),
        }

        return Response(
            {
                'preview': preview,
                'lookup_token': token,
                'expires_in_seconds': LOOKUP_TTL_SECONDS,
            },
            status=status.HTTP_200_OK,
        )

    def add_vehicle(self, request):
        """
        Add vehicle: POST multipart/JSON.

        Paths:
          A) Confirm Ireland lookup — send ``lookup_token`` from lookup_vehicle_registration; optional ``image``
             file replaces provider image.
          B) Manual entry — ``entry_mode=manual`` plus make, model, year, colour, image, licence, country.

        Fleet owners must send branch_id as before.
        """
        try:
            created_standalone_vehicle = False
            uploaded_image = request.FILES.get('image')
            lookup_token = (request.data.get('lookup_token') or '').strip()
            entry_manual = (
                request.data.get('entry_mode') == 'manual'
                or str(request.data.get('manual', '')).lower() == 'true'
                or request.data.get('manual') is True
            )

            blob = None

            if lookup_token and entry_manual:
                return Response(
                    {'error': 'Send either lookup_token or manual mode, not both', 'code': 'validation'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if lookup_token:
                blob = cache.get(lookup_cache_key(lookup_token))
                if not blob:
                    return Response(
                        {'error': 'Lookup session expired — add the vehicle manually or run lookup again', 'code': 'lookup_expired'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                registration_number = blob['registration_number']
                canon_country = blob['country']
            elif entry_manual:
                registration_number = (
                    (request.data.get('registration_number') or request.data.get('licence') or '').strip().upper().replace(' ', '')
                )
                canon_country = canonical_garage_country(request.data.get('country'))
                make = (request.data.get('make') or '').strip()
                model = (request.data.get('model') or '').strip()
                color = (request.data.get('color') or '').strip()
                year = request.data.get('year')

                if not registration_number:
                    return Response(
                        {'error': 'Licence plate is required (from lookup step)', 'code': 'validation'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                missing = []
                if not make:
                    missing.append('make')
                if not model:
                    missing.append('model')
                if not year:
                    missing.append('year')
                if not color:
                    missing.append('color')
                if not uploaded_image:
                    missing.append('image')
                if missing:
                    return Response(
                        {
                            'error': f'Manual add missing required fields: {", ".join(missing)}',
                            'code': 'validation',
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                try:
                    year_int = int(year)
                except (TypeError, ValueError):
                    return Response(
                        {'error': 'Year must be a number', 'code': 'validation'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if year_int < 1900 or year_int > timezone.now().year + 1:
                    return Response(
                        {'error': 'Invalid model year', 'code': 'validation'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                return Response(
                    {
                        'error': 'Send lookup_token (after lookup) or entry_mode=manual',
                        'code': 'validation',
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            existing_vehicle = find_existing_vehicle_for_add(
                registration_number,
                canon_country,
            )

            if existing_vehicle:
                active_ownership = existing_vehicle.get_active_ownership()

                if active_ownership:
                    managed_branch = request.user.get_managed_branch()
                    already_owns_or_same_fleet = (
                        active_ownership.owner == request.user
                        or (
                            managed_branch is not None
                            and active_ownership.vehicle.fleet_associations.filter(fleet=managed_branch.fleet).exists()
                        )
                    )
                    if already_owns_or_same_fleet:
                        return Response(
                            {
                                'error': 'You already own this vehicle',
                                'vehicle': vehicle_customer_payload(existing_vehicle),
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                    from main.tasks import send_transfer_request_email

                    existing_transfer = VehicleTransfer.objects.filter(
                        vehicle=existing_vehicle,
                        to_owner=request.user,
                        status='pending',
                    ).first()

                    if existing_transfer:
                        return Response(
                            {
                                'error': 'A transfer request for this vehicle is already pending',
                                'transfer_id': str(existing_transfer.id),
                                'message': 'Please wait for the current owner to respond to your transfer request.',
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                    transfer = VehicleTransfer.objects.create(
                        vehicle=existing_vehicle,
                        from_owner=active_ownership.owner,
                        to_owner=request.user,
                        expires_at=timezone.now() + timedelta(days=7),
                    )

                    send_transfer_request_email.delay(
                        transfer.id,
                        active_ownership.owner.email,
                        request.user.name,
                        existing_vehicle.registration_number,
                    )

                    return Response(
                        {
                            'message': 'This vehicle is already owned by another user. A transfer request has been sent to the current owner.',
                            'transfer_id': str(transfer.id),
                            'status': 'pending',
                            'vehicle': {
                                'id': str(existing_vehicle.id),
                                'make': existing_vehicle.make,
                                'model': existing_vehicle.model,
                                'year': existing_vehicle.year,
                                'registration_number': existing_vehicle.registration_number,
                            },
                        },
                        status=status.HTTP_202_ACCEPTED,
                    )

                vehicle = existing_vehicle
                if uploaded_image:
                    vehicle.image = uploaded_image
                    vehicle.save(update_fields=['image', 'updated_at'])
            else:
                if lookup_token:
                    vehicle = Vehicle(
                        registration_number=blob['registration_number'],
                        country=blob['country'],
                        make=blob['make'][:100],
                        model=blob['model'][:100],
                        year=int(blob['year']),
                        color=(blob.get('color') or 'Unknown').strip()[:100] or 'Unknown',
                        body_style=(blob.get('body_style') or '')[:100] if blob.get('body_style') else None,
                        owner_count=0,
                    )
                    vehicle.save()

                    if uploaded_image:
                        vehicle.image = uploaded_image
                        vehicle.save(update_fields=['image', 'updated_at'])
                    elif blob.get('provider_image_url'):
                        try:
                            raw, ctype = download_provider_image(blob['provider_image_url'])
                            ext = 'jpg'
                            if 'png' in (ctype or '').lower():
                                ext = 'png'
                            fname = f"{blob['registration_number'].replace('/', '_')}.{ext}"
                            vehicle.image.save(fname, ContentFile(raw), save=True)
                        except RegcheckIrelandError:
                            pass
                    created_standalone_vehicle = True
                else:
                    vehicle = Vehicle.objects.create(
                        make=make[:100],
                        model=model[:100],
                        year=year_int,
                        color=color[:100],
                        registration_number=registration_number,
                        country=canon_country,
                        owner_count=0,
                    )

                    vehicle.image = uploaded_image
                    vehicle.save()
                    created_standalone_vehicle = True

            ownership_type = 'private'
            branch = None
            fleet = None

            if request.user.is_fleet_owner:
                branch_id = request.data.get('branch_id')
                if not branch_id:
                    if created_standalone_vehicle:
                        vehicle.delete()
                    return Response({'error': 'Branch ID is required for fleet owners'}, status=status.HTTP_400_BAD_REQUEST)

                fleet = Fleet.objects.filter(owner=request.user).first()
                if not fleet:
                    if created_standalone_vehicle:
                        vehicle.delete()
                    return Response({'error': 'No fleet found for this user'}, status=status.HTTP_404_NOT_FOUND)

                can_add, error_msg = fleet.can_add_vehicle()
                if not can_add:
                    if created_standalone_vehicle:
                        vehicle.delete()
                    return Response({'error': error_msg}, status=status.HTTP_403_FORBIDDEN)

                try:
                    branch = Branch.objects.get(id=branch_id, fleet=fleet)
                except Branch.DoesNotExist:
                    if created_standalone_vehicle:
                        vehicle.delete()
                    return Response(
                        {'error': 'Branch not found or does not belong to your fleet'},
                        status=status.HTTP_403_FORBIDDEN,
                    )

                ownership_type = 'fleet'

            elif request.user.is_branch_admin:
                managed_branch = request.user.get_managed_branch()
                if not managed_branch:
                    return Response({'error': 'No branch assigned to this branch admin account'}, status=status.HTTP_400_BAD_REQUEST)

                branch = managed_branch
                fleet = branch.fleet

                can_add, error_msg = fleet.can_add_vehicle()
                if not can_add:
                    if created_standalone_vehicle:
                        vehicle.delete()
                    return Response({'error': error_msg}, status=status.HTTP_403_FORBIDDEN)

                ownership_type = 'fleet'

            actual_owner = request.user

            if request.user.is_fleet_owner or request.user.is_branch_admin:
                if ownership_type != 'fleet':
                    ownership_type = 'fleet'
                    if request.user.is_branch_admin and not branch:
                        managed_branch = request.user.get_managed_branch()
                        if managed_branch:
                            branch = managed_branch
                            fleet = branch.fleet
                    elif request.user.is_fleet_owner and not fleet:
                        fleet = Fleet.objects.filter(owner=request.user).first()

            if ownership_type == 'fleet':
                if request.user.is_fleet_owner:
                    actual_owner = request.user
                elif request.user.is_branch_admin and branch:
                    actual_owner = branch.fleet.owner

            with transaction.atomic():
                VehicleOwnership.objects.create(
                    vehicle=vehicle,
                    owner=actual_owner,
                    ownership_type=ownership_type,
                    start_date=timezone.now().date(),
                )

                vehicle.owner_count += 1
                vehicle.save()

                if branch and fleet:
                    FleetVehicle.objects.create(
                        fleet=fleet,
                        vehicle=vehicle,
                        branch=branch,
                        added_by=request.user,
                    )

            if lookup_token:
                cache.delete(lookup_cache_key(lookup_token))

            return Response(
                {
                    'message': f'You just added {vehicle.make} {vehicle.model} {vehicle.year} to your garage',
                    'vehicle': vehicle_customer_payload(vehicle),
                },
                status=status.HTTP_201_CREATED,
            )

        except Exception as e:
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
                        'body_style': vehicle.body_style,
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
                    'body_style': vehicle.body_style,
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
        registration_number (or licence), country; optional image. User must own vehicle (or be branch admin for
        branch vehicle). Returns updated vehicle payload.
        """
        try:
            make = request.data.get('make')
            model = request.data.get('model')
            year = request.data.get('year')
            color = request.data.get('color')
            registration_number = request.data.get('registration_number') or request.data.get('licence')
            country = request.data.get('country')

            # Get the vehicle_id from URL path first, then fallback to query params
            if vehicle_id is None:
                vehicle_id = request.query_params.get('vehicle_id')

            if not vehicle_id:
                return Response({'error': 'Vehicle ID is required'}, status=status.HTTP_400_BAD_REQUEST)

            try:
                vehicle = Vehicle.objects.get(id=vehicle_id)
                has_access, _ownership, _fleet_vehicle = self._resolve_vehicle_access(request, vehicle)
                if not has_access:
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
                'body_style': vehicle.body_style,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        

    def delete_vehicle(self, request, vehicle_id=None):
        """
        Remove a vehicle from this user's garage. Consumers end their VehicleOwnership.
        Fleet owners and branch admins also drop the FleetVehicle row (that is what the
        fleet garage list uses).
        """
        try:
            if vehicle_id is None:
                vehicle_id = request.query_params.get('vehicle_id')

            if not vehicle_id:
                return Response({'error': 'Vehicle ID is required'}, status=status.HTTP_400_BAD_REQUEST)

            try:
                vehicle = Vehicle.objects.get(id=vehicle_id)
            except Vehicle.DoesNotExist:
                return Response({'error': 'Vehicle not found'}, status=status.HTTP_404_NOT_FOUND)

            has_access, ownership, fleet_vehicle = self._resolve_vehicle_access(request, vehicle)
            if not has_access:
                return Response({'error': 'Vehicle not found or access denied'}, status=status.HTTP_404_NOT_FOUND)

            vehicle_make = vehicle.make
            vehicle_model = vehicle.model

            with transaction.atomic():
                if fleet_vehicle:
                    fleet_vehicle.delete()
                if ownership:
                    ownership.end_date = timezone.now().date()
                    ownership.save(update_fields=['end_date'])

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
                    'body_style': vehicle.body_style,
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
                """Shape a ``VehicleTransfer`` for the garage incoming/outgoing list API."""
                return {
                    'id': str(transfer.id),
                    'direction': direction,
                    'vehicle': {
                        'id': str(transfer.vehicle.id),
                        'make': transfer.vehicle.make,
                        'model': transfer.vehicle.model,
                        'year': transfer.vehicle.year,
                        'registration_number': transfer.vehicle.registration_number,
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
        Create a new vehicle event (inspection, repair, service, etc.).
        Authenticated owners may set visibility public or private.
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