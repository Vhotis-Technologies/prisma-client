"""
VIN lookup API: check if VIN exists, get vehicle history, initiate/verify VIN lookup payment (Stripe).

AllowAny for unregistered users. Actions: check_vin_exists, get_vehicle_history,
initiate_vin_lookup_payment, verify_vin_lookup_payment.
"""
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from main.models import Vehicle, VehicleEvent, VinLookupPurchase, PaymentTransaction, VehicleOwnership
from django.utils import timezone
from django.conf import settings
from datetime import timedelta
import stripe
import uuid
import time
import logging

logger = logging.getLogger(__name__)

# Initialize Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY


class VinLookupView(APIView):
    """
    VIN lookup API with payment gating.
    Supports both registered and unregistered users.
    """
    permission_classes = [AllowAny]  # Supports unregistered users

    action_handlers = {
        'check_vin_exists': 'check_vin_exists',
        'get_vehicle_history': 'get_vehicle_history',
        'initiate_vin_lookup_payment': 'initiate_vin_lookup_payment',
        'verify_vin_lookup_payment': 'verify_vin_lookup_payment',
    }

    def get(self, request, *args, **kwargs):
        """Route GET by action (check_vin_exists, get_vehicle_history, etc.). Optional purchase_reference in kwargs for verify_vin_lookup_payment. Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        purchase_reference = kwargs.get('purchase_reference')
        if purchase_reference is not None:
            return handler(request, purchase_reference)
        return handler(request)

    def post(self, request, *args, **kwargs):
        """Route POST by action (initiate_vin_lookup_payment, etc.). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)

    def check_vin_exists(self, request):
        """
        Check if a VIN exists in the database.
        Public endpoint - no payment required.
        Returns basic vehicle info only.
        """
        vin = request.query_params.get('vin')
        
        if not vin:
            return Response({
                'error': 'VIN parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate VIN format
        vin = vin.upper().strip()
        if len(vin) != 17:
            return Response({
                'error': 'VIN must be exactly 17 characters'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # VIN should be alphanumeric (excluding I, O, Q)
        import re
        vin_regex = re.compile(r'^[A-HJ-NPR-Z0-9]{17}$')
        if not vin_regex.match(vin):
            return Response({
                'error': 'VIN contains invalid characters (I, O, Q are not allowed)'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            vehicle = Vehicle.objects.get(vin=vin)
            return Response({
                'exists': True,
                'vehicle': {
                    'make': vehicle.make,
                    'model': vehicle.model,
                    'year': vehicle.year,
                    'vin': vehicle.vin,
                    'registration_number': vehicle.registration_number,
                    'country': vehicle.country,
                },
                'price': float(settings.VIN_LOOKUP_PRICE),
                'currency': 'eur',
            }, status=status.HTTP_200_OK)
        except Vehicle.DoesNotExist:
            return Response({
                'exists': False,
                'error': 'Vehicle not found with this VIN'
            }, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error checking VIN existence: {str(e)}")
            return Response({
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)

    def get_vehicle_history(self, request):
        """
        Get complete vehicle history.
        Requires valid purchase (payment verified).
        Supports both registered and unregistered users.
        """
        vin = request.query_params.get('vin')
        email = request.query_params.get('email')
        
        if not vin:
            return Response({
                'error': 'VIN parameter is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Normalize VIN
        vin = vin.upper().strip()
        
        try:
            vehicle = Vehicle.objects.get(vin=vin)
        except Vehicle.DoesNotExist:
            return Response({
                'error': 'Vehicle not found with this VIN'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Determine user identifier
        user = None
        user_email = None
        
        if request.user.is_authenticated:
            user = request.user
            user_email = user.email
        elif email:
            user_email = email.lower().strip()
        else:
            return Response({
                'error': 'Email parameter is required for unregistered users'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check for valid purchase
        valid_purchase = None
        if user:
            # Check by user first, then by email
            valid_purchase = VinLookupPurchase.objects.filter(
                vehicle=vehicle,
                vin=vin,
                user=user,
                is_active=True
            ).filter(expires_at__gt=timezone.now()).order_by('-purchased_at').first()
            
            if not valid_purchase:
                valid_purchase = VinLookupPurchase.objects.filter(
                    vehicle=vehicle,
                    vin=vin,
                    email=user_email,
                    is_active=True
                ).filter(expires_at__gt=timezone.now()).order_by('-purchased_at').first()
        else:
            # Unregistered user - check by email only
            valid_purchase = VinLookupPurchase.objects.filter(
                vehicle=vehicle,
                vin=vin,
                email=user_email,
                is_active=True
            ).filter(expires_at__gt=timezone.now()).order_by('-purchased_at').first()
        
        if not valid_purchase or not valid_purchase.is_valid():
            # No valid purchase - return basic info with payment requirement
            return Response({
                'requires_payment': True,
                'vehicle': {
                    'make': vehicle.make,
                    'model': vehicle.model,
                    'year': vehicle.year,
                    'vin': vehicle.vin,
                    'registration_number': vehicle.registration_number,
                    'country': vehicle.country,
                },
                'price': float(settings.VIN_LOOKUP_PRICE),
            }, status=status.HTTP_200_OK)
        
        # Valid purchase exists - return complete history
        # Get all events (both public and private if user owns the vehicle)
        events_query = VehicleEvent.objects.filter(vehicle=vehicle)
        
        # If user owns the vehicle, show all events; otherwise only public
        if user:
            owns_vehicle = VehicleOwnership.objects.filter(
                vehicle=vehicle,
                owner=user,
                end_date__isnull=True
            ).exists()
            if not owns_vehicle:
                events_query = events_query.filter(visibility='public')
        else:
            events_query = events_query.filter(visibility='public')
        
        events = events_query.order_by('-event_date')[:100]
        
        # Get ownership history
        ownerships = VehicleOwnership.objects.filter(vehicle=vehicle).order_by('start_date')
        ownership_history = []
        for ownership in ownerships:
            ownership_history.append({
                'owner_name': ownership.owner.name if ownership.owner else 'Unknown',
                'owner_email': ownership.owner.email if ownership.owner else None,
                'start_date': ownership.start_date.isoformat() if ownership.start_date else None,
                'end_date': ownership.end_date.isoformat() if ownership.end_date else None,
                'is_current': ownership.end_date is None,
            })
        
        # Transform events
        events_data = []
        for event in events:
            event_data = {
                'id': str(event.id),
                'event_type': event.event_type,
                'event_date': event.event_date.isoformat(),
                'metadata': event.metadata,
                'visibility': event.visibility,
            }
            
            if event.performed_by:
                event_data['performed_by'] = {
                    'id': str(event.performed_by.id),
                    'name': event.performed_by.name if hasattr(event.performed_by, 'name') else 'Unknown',
                }
            else:
                event_data['performed_by'] = None
            
            events_data.append(event_data)
        
        return Response({
            'requires_payment': False,
            'vehicle': {
                'make': vehicle.make,
                'model': vehicle.model,
                'year': vehicle.year,
                'color': vehicle.color,
                'vin': vehicle.vin,
                'registration_number': vehicle.registration_number,
                'country': vehicle.country,
            },
            'ownership_history': ownership_history,
            'events': events_data,
            'total_events': len(events_data),
            'purchase': {
                'purchase_reference': valid_purchase.purchase_reference,
                'purchased_at': valid_purchase.purchased_at.isoformat(),
                'expires_at': valid_purchase.expires_at.isoformat(),
            }
        }, status=status.HTTP_200_OK)

    def initiate_vin_lookup_payment(self, request):
        """
        Create payment intent for VIN lookup.
        Supports both registered and unregistered users.
        """
        vin = request.data.get('vin')
        email = request.data.get('email')
        
        if not vin:
            return Response({
                'error': 'VIN is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Normalize VIN
        vin = vin.upper().strip()
        
        # Validate VIN format
        if len(vin) != 17:
            return Response({
                'error': 'VIN must be exactly 17 characters'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        import re
        vin_regex = re.compile(r'^[A-HJ-NPR-Z0-9]{17}$')
        if not vin_regex.match(vin):
            return Response({
                'error': 'VIN contains invalid characters (I, O, Q are not allowed)'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get user and email
        user = None
        user_email = None
        
        if request.user.is_authenticated:
            user = request.user
            user_email = user.email
        elif email:
            user_email = email.lower().strip()
            # Validate email format
            from django.core.validators import validate_email
            from django.core.exceptions import ValidationError
            try:
                validate_email(user_email)
            except ValidationError:
                return Response({
                    'error': 'Invalid email format'
                }, status=status.HTTP_400_BAD_REQUEST)
        else:
            return Response({
                'error': 'Email is required for unregistered users'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if vehicle exists
        try:
            vehicle = Vehicle.objects.get(vin=vin)
        except Vehicle.DoesNotExist:
            return Response({
                'error': 'Vehicle not found with this VIN'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Check if user already has a valid purchase
        if user:
            existing_purchase = VinLookupPurchase.objects.filter(
                vehicle=vehicle,
                vin=vin,
                user=user,
                is_active=True
            ).filter(expires_at__gt=timezone.now()).first()
            
            if existing_purchase and existing_purchase.is_valid():
                return Response({
                    'error': 'You already have a valid purchase for this VIN',
                    'purchase_reference': existing_purchase.purchase_reference,
                }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check by email as well
        existing_purchase = VinLookupPurchase.objects.filter(
            vehicle=vehicle,
            vin=vin,
            email=user_email,
            is_active=True
        ).filter(expires_at__gt=timezone.now()).first()
        
        if existing_purchase and existing_purchase.is_valid():
            return Response({
                'error': 'A valid purchase already exists for this VIN and email',
                'purchase_reference': existing_purchase.purchase_reference,
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Generate purchase reference
        purchase_reference = f"VIN-{int(time.time() * 1000)}-{str(uuid.uuid4())[:8].upper()}"
        
        # Get amount and currency
        amount = int(float(settings.VIN_LOOKUP_PRICE) * 100)  # Convert to cents
        currency = 'eur'  # Default currency, can be made configurable
        
        # Get or create Stripe customer
        customer = None
        if user and hasattr(user, 'stripe_customer_id') and user.stripe_customer_id:
            try:
                customer = stripe.Customer.retrieve(user.stripe_customer_id)
            except stripe.error.StripeError:
                customer = None
        
        if not customer:
            # Create new customer
            customer = stripe.Customer.create(
                email=user_email,
                name=user.name if user else None,
                metadata={
                    'user_id': str(user.id) if user else None,
                }
            )
            
            # Save customer ID if user is authenticated
            if user and hasattr(user, 'stripe_customer_id'):
                user.stripe_customer_id = customer.id
                user.save()
        
        # Create payment intent
        metadata = {
            'email': user_email,
            'vin': vin,
            'purchase_reference': purchase_reference,
            'transaction_type': 'vin_lookup',
        }
        if user:
            metadata['user_id'] = str(user.id)
        payment_intent = stripe.PaymentIntent.create(
            amount=amount,
            currency=currency,
            customer=customer.id,
            receipt_email=user_email,
            automatic_payment_methods={
                'enabled': True,
            },
            metadata=metadata,
        )
        
        # Create ephemeral key
        ephemeral_key = stripe.EphemeralKey.create(
            customer=customer.id,
            stripe_version='2022-11-15',
        )
        
        return Response({
            'paymentIntent': payment_intent.client_secret,
            'paymentIntentId': payment_intent.id,
            'ephemeralKey': ephemeral_key.secret,
            'customer': customer.id,
            'purchase_reference': purchase_reference,
            'amount': float(settings.VIN_LOOKUP_PRICE),
            'currency': currency,
        }, status=status.HTTP_200_OK)

    def verify_vin_lookup_payment(self, request, purchase_reference=None):
        """
        Verify payment status for a VIN lookup purchase.
        Used for polling after payment completion.
        """
        if not purchase_reference:
            purchase_reference = request.query_params.get('purchase_reference')
        
        if not purchase_reference:
            return Response({
                'error': 'purchase_reference is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        email = request.query_params.get('email')
        user = None
        
        if request.user.is_authenticated:
            user = request.user
            user_email = user.email
        elif email:
            user_email = email.lower().strip()
        else:
            return Response({
                'error': 'Email parameter is required for unregistered users'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            purchase = VinLookupPurchase.objects.get(purchase_reference=purchase_reference)
            
            # Verify ownership
            if user:
                if purchase.user != user and purchase.email != user_email:
                    return Response({
                        'error': 'Purchase does not belong to this user'
                    }, status=status.HTTP_403_FORBIDDEN)
            else:
                if purchase.email != user_email:
                    return Response({
                        'error': 'Purchase does not belong to this email'
                    }, status=status.HTTP_403_FORBIDDEN)
            
            # Check payment status
            payment_transaction = purchase.payment_transaction
            if payment_transaction.status == 'succeeded':
                return Response({
                    'status': 'succeeded',
                    'purchase': {
                        'purchase_reference': purchase.purchase_reference,
                        'purchased_at': purchase.purchased_at.isoformat(),
                        'expires_at': purchase.expires_at.isoformat(),
                        'is_valid': purchase.is_valid(),
                    },
                    'vehicle': {
                        'vin': purchase.vin,
                        'make': purchase.vehicle.make,
                        'model': purchase.vehicle.model,
                        'year': purchase.vehicle.year,
                    }
                }, status=status.HTTP_200_OK)
            elif payment_transaction.status == 'pending':
                return Response({
                    'status': 'pending',
                    'message': 'Payment is still being processed'
                }, status=status.HTTP_200_OK)
            else:
                return Response({
                    'status': 'failed',
                    'error': 'Payment failed'
                }, status=status.HTTP_400_BAD_REQUEST)
                
        except VinLookupPurchase.DoesNotExist:
            # Check if payment intent exists but purchase not created yet
            # This might happen if webhook hasn't processed yet
            return Response({
                'status': 'pending',
                'message': 'Purchase not found. Payment may still be processing.'
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error verifying VIN lookup payment: {str(e)}")
            return Response({
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
