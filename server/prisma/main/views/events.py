"""
Events/booking API view for Prisma Car Care client app.

Provides GET/POST/PATCH/DELETE actions: get_service_type, get_valet_type, get_add_ons,
get_promotions, mark_promotion_used, check_free_wash, quote_booking, check_bulk_capacity,
get_timeslots, book_appointment, cancel_booking, reschedule_booking, reschedule_intent, get_payment_methods,
delete_payment_method.

- book_appointment (_book_appointment): Retired. Returns HTTP 410; use the payment sheet flow.
- cancel_booking: Cancels by booking_reference, tiered refund (>24h full, 12–24h half, ≤12h none),
  publishes to Redis for detailer, processes Stripe refund.
- reschedule_booking / reschedule_intent: Validate slot; free reschedule if >=12h before start.
  Within 12h the app must use create_reschedule_fee_payment_sheet + webhook (see payment view).

See docs/BOOKING_FLOW.md for the full booking and payment flow.
"""
from main.services.NotificationServices import NotificationService
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from main.models import BookedAppointment, BookedAppointmentImage, ServiceType, ValetType, AddOns, Address, DetailerProfile, Vehicle, Promotions, PaymentTransaction, RefundRecord, User, Branch, Partner
from main.services.booking_quote import (
    build_quick_sparkle_entitlements,
    quote_booking_for_user,
    validate_complimentary_choice,
    validate_booking_financials,
    consume_complimentary_quick_sparkle,
    is_quick_sparkle_service_name,
)
import uuid
import stripe
import requests
from django.conf import settings
from datetime import datetime
from django.utils import timezone
from main.tasks import publish_booking_cancelled, publish_booking_rescheduled, send_push_notification
from main.utils.detailer_client import detailer_request_headers
import logging
import traceback

# Initialize Stripe with your secret key
stripe.api_key = settings.STRIPE_SECRET_KEY

class EventsView(APIView):
    """
    Booking catalog and lifecycle: services, valets, quotes, book/cancel/reschedule, payment methods.

    Action-routed via ``events/<action>/``. Primary paid flow uses payment view + webhook;
    ``book_appointment`` returns 410 (retired direct-create path).
    """

    permission_classes = [IsAuthenticated]
    action_handlers = {
        'get_service_type' : 'get_service_type',
        'get_valet_type' : 'get_valet_type',
        'book_appointment' : '_book_appointment',
        'cancel_booking' : 'cancel_booking',
        'reschedule_booking' : 'reschedule_booking',
        'reschedule_intent' : 'reschedule_intent',
        'get_add_ons' : 'get_add_ons',
        'get_promotions' : 'get_promotions',
        'mark_promotion_used' : 'mark_promotion_used',
        'check_free_wash' : 'check_free_wash',
        'get_payment_methods' : 'get_payment_methods',
        'delete_payment_method' : 'delete_payment_method',
        'quote_booking' : 'quote_booking',
        'check_bulk_capacity' : 'check_bulk_capacity',
        'get_timeslots' : 'get_timeslots',
    }
    
    def get(self, request, *args, **kwargs):
        """Route GET by action (e.g. get_service_type, get_valet_type, get_add_ons, get_promotions, check_free_wash, get_payment_methods, check_bulk_capacity, get_timeslots)."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)
    
    def post(self, request, *args, **kwargs):
        """Route POST by action (e.g. book_appointment, mark_promotion_used, check_bulk_capacity)."""
        action = kwargs.get('action')
        if action not in self.action_handlers: 
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)
    
    def patch(self, request, *args, **kwargs):
        """Route PATCH by action (e.g. cancel_booking, reschedule_booking)."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)

    def delete(self, request, *args, **kwargs):
        """Route DELETE by action (e.g. delete_payment_method)."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)



    def get_promotions(self, request):
        """
        Return active promotion for the user (valid_until >= today). Excludes fleet owners, branch admins,
        fleet admins/managers, and partners (returns None). Returns promotion dict or None.
        """
        try:
            # Exclude promotions for fleet (owners, branch admins, fleet admins/managers) and partners
            if (
                request.user.is_fleet_owner
                or request.user.is_branch_admin
                or request.user.is_fleet_admin_or_manager()
                or Partner.objects.filter(user=request.user).exists()
            ):
                return Response(None, status=status.HTTP_200_OK)
            
            from datetime import date
            today = timezone.now().date()
            promotions = Promotions.objects.filter(
                user=request.user, 
                is_active=True,
                valid_until__gte=today  # Only return promotions that haven't expired
            ).first()
            if promotions:
                promotions_data = {
                    "id" : str(promotions.id),
                    "title" : promotions.title,
                    "discount_percentage" : promotions.discount_percentage,
                    "valid_until" : promotions.valid_until.strftime('%Y-%m-%d'),
                    "is_active" : promotions.is_active,
                    "terms_conditions" : promotions.terms_conditions,
                }
                return Response(promotions_data, status=status.HTTP_200_OK)
            else:
                return Response(None, status=status.HTTP_200_OK)
        except Exception as e:
            logger = logging.getLogger('main.views.booking')
            logger.error(f"Error fetching promotions: {str(e)}")
            return Response({'error': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    def mark_promotion_used(self, request):
        """
        Mark a promotion as used for a booking. Expects request.data: promotion_id, booking_reference.
        Validates promotion belongs to user and booking exists; calls promotion.mark_as_used(booking).
        """
        try:
            promotion_id = request.data.get('promotion_id')
            booking_reference = request.data.get('booking_reference')
            
            if not promotion_id or not booking_reference:
                return Response({'error': 'promotion_id and booking_reference are required'}, 
                              status=status.HTTP_400_BAD_REQUEST)
            try:
                promotion_id = int(promotion_id)
            except (TypeError, ValueError):
                return Response({'error': 'promotion_id must be a number'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Get the promotion
            try:
                promotion = Promotions.objects.get(id=promotion_id, user=request.user, is_active=True)
            except Promotions.DoesNotExist:
                return Response({'error': 'Promotion not found or already used'}, 
                              status=status.HTTP_404_NOT_FOUND)
            
            # Get the booking
            try:
                booking = BookedAppointment.objects.get(booking_reference=booking_reference, user=request.user)
            except BookedAppointment.DoesNotExist:
                return Response({'error': 'Booking not found'}, 
                              status=status.HTTP_404_NOT_FOUND)
            
            # Mark promotion as used
            promotion.mark_as_used(booking)
            
            return Response({'message': 'Promotion marked as used successfully'}, 
                          status=status.HTTP_200_OK)
            
        except Exception as e:
            logger = logging.getLogger('main.views.booking')
            logger.error(f"Error marking promotion as used: {str(e)}")
            return Response({'error': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            

    def get_service_type(self, request):
        """Return all service types ordered by price. Each with id, name, description, price, duration, fleet_price."""
        try:
            service_types = ServiceType.objects.all().order_by('price')
            service_type_data = []
            for service in service_types:
                service_items = {
                    "id": service.id,
                    "name": service.name,
                    "description": service.description,
                    "price": float(service.price),
                    "duration": service.duration,
                    "fleet_price": float(service.fleet_price) if service.fleet_price else None,
                }
                service_type_data.append(service_items)
            return Response(service_type_data, status=status.HTTP_200_OK)
        except Exception as e:
            logger = logging.getLogger('main.views.booking')
            logger.error(f"Error fetching service types: {str(e)}")
            return Response({'error': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        
    def get_valet_type(self, request):
        """Return all valet types. Each with id, name, description."""
        try:
            valet_type = ValetType.objects.all()
            valet_type_data = []
            for valet in valet_type:
                valet_items = {
                    "id" : valet.id,
                    "name" : valet.name,
                    "description" : valet.description
                }
                valet_type_data.append(valet_items)
            return Response(valet_type_data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    


    def cancel_booking(self, request):
        """
        Cancel a booking by booking_reference. User must own the booking.

        Refund: >24h until start = full; 12–24h = 50%; ≤12h (including past start) = no refund.
        Updates status to cancelled, publishes to Redis (publish_booking_cancelled), processes
        Stripe refund when applicable, sends push notification.
        """
        logger = logging.getLogger('main.views.booking')
        booking_reference = request.data.get('booking_reference')
        
        logger.info(f"Starting booking cancellation for reference: {booking_reference}, user: {request.user.id}")
        
        try:
            # Validate booking_reference
            if not booking_reference:
                logger.error("No booking_reference provided in request")
                return Response({'error': 'Booking reference is required'}, 
                              status=status.HTTP_400_BAD_REQUEST)
            
            # Get booking with user validation
            try:
                booking = BookedAppointment.objects.get(
                    booking_reference=booking_reference, 
                    user=request.user
                )
                logger.info(f"Found booking: {booking.id}, status: {booking.status}")
            except BookedAppointment.DoesNotExist:
                logger.error(f"Booking not found for reference: {booking_reference}, user: {request.user.id}")
                return Response({'error': 'Booking not found'}, 
                              status=status.HTTP_404_NOT_FOUND)
            
            # Check if booking can be cancelled - only allow if not completed, cancelled, or in progress
            if booking.status in ['completed', 'cancelled', 'in_progress']:
                logger.warning(f"Cannot cancel booking {booking_reference} - status: {booking.status}")
                if booking.status == 'in_progress':
                    return Response({'error': 'Cannot cancel - service is already in progress'}, 
                                  status=status.HTTP_400_BAD_REQUEST)
                else:
                    return Response({'error': 'Booking cannot be cancelled'}, 
                                  status=status.HTTP_400_BAD_REQUEST)
            
            # Calculate time until appointment
            now = timezone.now()
            try:
                appointment_datetime = timezone.datetime.combine(
                    booking.appointment_date, 
                    booking.start_time
                )
                # Make the appointment datetime timezone-aware
                appointment_datetime = timezone.make_aware(appointment_datetime)
                
                hours_until_appointment = (appointment_datetime - now).total_seconds() / 3600
                logger.info(f"Hours until appointment: {hours_until_appointment}")
            except Exception as e:
                logger.error(f"Error calculating appointment datetime: {str(e)}")
                return Response({'error': 'Invalid appointment data'}, 
                              status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            # Tiered refund: >24h full, 12-24h half, <=12h none (includes already-started / past start)
            if hours_until_appointment <= 12:
                refund_tier = 'none'
                refund_amount = 0
            elif hours_until_appointment >12 and hours_until_appointment <= 24:
                refund_tier = 'half'
                refund_amount = None  # computed in refund block
            else:
                refund_tier = 'full'
                refund_amount = None  # full amount, computed in refund block
            logger.info(f"Refund tier: {refund_tier}")
            
            # Update booking status
            try:
                booking.status = 'cancelled'
                booking.save()
                logger.info(f"Booking {booking_reference} status updated to cancelled")
            except Exception as e:
                logger.error(f"Error updating booking status: {str(e)}")
                return Response({'error': 'Failed to update booking status'}, 
                              status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            # Publish to Redis for detailer app updates (only once)
            try:
                publish_booking_cancelled.delay(booking_reference)
                logger.info(f"Published booking cancellation to Redis for {booking_reference}")
            except Exception as e:
                logger.error(f"Error publishing to Redis: {str(e)}")
                # Don't fail the cancellation for Redis errors
            
            refund_data = {'eligible': refund_tier != 'none', 'amount': 0, 'tier': refund_tier, 'processed': False}
            
            # Process refund when tier is full or half (get original amount first for half)
            if refund_tier != 'none':
                try:
                    original_transaction = PaymentTransaction.objects.filter(
                        booking=booking,
                        transaction_type='payment',
                        status='succeeded'
                    ).first()
                    if original_transaction:
                        if refund_tier == 'full':
                            refund_amount = float(original_transaction.amount)
                        else:  # half
                            refund_amount = float(original_transaction.amount) * 0.5
                        refund_data['amount'] = refund_amount
                        if refund_amount > 0:
                            # Call the _process_refund method to process the refund
                            refund_result = self._process_refund(booking, amount=refund_amount)
                            refund_data.update(refund_result)
                            logger.info(f"Refund processing result: {refund_result}")
                    else:
                        logger.warning(f"No payment found for booking {booking_reference}, skipping refund")
                except Exception as e:
                    logger.error(f"Error processing refund: {str(e)}")
                    refund_data['error'] = str(e)
            
            # Prepare response message based on refund eligibility
            try:
                vehicle_name = f"{booking.vehicle.make} {booking.vehicle.model}"
                message = f'You have cancelled your booking for {vehicle_name} on {booking.appointment_date}'
                
                if refund_data.get('processed', False):
                    message += f"\n\nRefund of £{refund_data['amount']} has been processed and will appear in your account within 3-5 business days."
                    
                    # Send push notification for refunded cancellation
                    try:
                        NotificationService().send_booking_cancelled(request.user, booking, message)
                        logger.info("Sent refund notification")
                    except Exception as e:
                        logger.error(f"Error sending refund notification: {str(e)}")
                elif refund_tier == 'half':
                    message += f"\n\n50% refund was available but could not be processed. Please contact support."
                    try:
                        NotificationService().send_booking_cancelled(request.user, booking, message)
                    except Exception as e:
                        logger.error(f"Error sending push notification: {str(e)}")
                else:
                    if refund_tier == 'none':
                        if hours_until_appointment <= 0:
                            message += (
                                "\n\nNo refund available — the appointment start time has already passed."
                            )
                        else:
                            message += (
                                "\n\nNo refund available — cancellations within 12 hours of the "
                                "start time are non-refundable."
                            )
                    else:
                        message += (
                            "\n\nNo refund available — please contact support if this looks wrong."
                        )
                    
                    # Non-refunded / no-refund cancellation — same channel as refund path (push + email + in-app)
                    try:
                        NotificationService().send_booking_cancelled(
                            request.user, booking, message
                        )
                        logger.info("Sent cancellation notification (no refund path)")
                    except Exception as e:
                        logger.error(f"Error sending no-refund notification: {str(e)}")
                
                logger.info(f"Booking cancellation completed successfully for {booking_reference}")
                return Response({
                    'message': message,
                    'booking_status': 'cancelled',
                    'refund': refund_data,
                    'hours_until_appointment': hours_until_appointment
                }, status=status.HTTP_200_OK)
                
            except Exception as e:
                logger.error(f"Error preparing response message: {str(e)}")
                return Response({'error': 'Failed to prepare response'}, 
                              status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
        except Exception as e:
            logger.error(f"Unexpected error in cancel_booking: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            return Response({'error': 'Internal server error'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)




    def _process_refund(self, booking, amount=None):
        """
        Process refund through Stripe for a booking. amount in same units as original (e.g. EUR/GBP);
        if None, refunds full original amount. Creates RefundRecord, stripe.Refund, PaymentTransaction (refund).
        Returns dict with processed, amount, refund_id, refund_record_id or error.
        """
        logger = logging.getLogger('main.views.booking')
        
        try:
            logger.info(f"Starting refund process for booking {booking.booking_reference}")
            
            # Get the original payment transaction
            original_transaction = PaymentTransaction.objects.filter(
                booking=booking,
                transaction_type='payment',
                status='succeeded'
            ).first()
            
            if not original_transaction:
                logger.error(f"No successful payment found for booking {booking.booking_reference}")
                return {'processed': False, 'error': 'No payment found'}
            
            refund_amount = amount if amount is not None else float(original_transaction.amount)
            refund_amount_cents = int(round(refund_amount * 100))
            if refund_amount_cents <= 0:
                return {'processed': False, 'error': 'Refund amount must be positive', 'amount': 0}
            
            logger.info(f"Found original transaction: {original_transaction.id}, refund amount: {refund_amount}")
            
            # Create refund record first
            try:
                refund_record = RefundRecord.objects.create(
                    booking=booking,
                    user=booking.user,
                    original_transaction=original_transaction,
                    requested_amount=refund_amount,
                    status='pending'
                )
                logger.info(f"Created refund record: {refund_record.id}")
            except Exception as e:
                logger.error(f"Error creating refund record: {str(e)}")
                return {'processed': False, 'error': f'Failed to create refund record: {str(e)}'}
            
            try:
                # Create refund with Stripe (partial or full)
                logger.info(f"Creating Stripe refund for payment intent: {original_transaction.stripe_payment_intent_id}, amount: {refund_amount_cents} cents")
                refund = stripe.Refund.create(
                    payment_intent=original_transaction.stripe_payment_intent_id,
                    amount=refund_amount_cents,
                    reason='requested_by_customer',
                    metadata={
                        'booking_reference': booking.booking_reference,
                        'refund_reason': 'Booking cancelled',
                        'refund_record_id': str(refund_record.id)
                    }
                )
                
                logger.info(f"Stripe refund created successfully: {refund.id}")
                
                # Update refund record with success
                refund_record.stripe_refund_id = refund.id
                refund_record.status = 'succeeded'
                refund_record.processed_at = timezone.now()
                refund_record.save()
                
                # Create refund transaction record (use refund.id for stripe_payment_intent_id to satisfy unique constraint)
                PaymentTransaction.objects.create(
                    booking=booking,
                    user=booking.user,
                    stripe_payment_intent_id=refund.id,
                    stripe_refund_id=refund.id,
                    transaction_type='refund',
                    amount=refund_amount,
                    currency=original_transaction.currency,
                    status='succeeded'
                )
                
                logger.info(f"Refund processed successfully: {refund.id}")
                return {
                    'processed': True,
                    'amount': refund_amount,
                    'refund_id': refund.id,
                    'refund_record_id': refund_record.id
                }
                
            except stripe.error.StripeError as e:
                logger.error(f"Stripe error during refund: {str(e)}")
                # Update refund record with failure
                refund_record.status = 'failed'
                refund_record.failure_reason = str(e)
                refund_record.processed_at = timezone.now()
                refund_record.save()
                
                return {
                    'processed': False, 
                    'error': str(e),
                    'refund_record_id': refund_record.id
                }
                
        except Exception as e:
            logger.error(f"Refund processing error: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            return {'processed': False, 'error': str(e)}



    def _fetch_detailer_timeslots(self, date_str, service_duration_minutes, country, city, latitude=None, longitude=None, is_express_service=False):
        """
        Call detailer app get_timeslots and return (list of slot start times, None) or (None, error_message).
        date_str YYYY-MM-DD; service_duration in minutes; optional lat/lng and is_express_service.
        """
        detailer_app_url = getattr(settings, 'DETAILER_APP_URL', None) or getattr(settings, 'API_CONFIG', {}).get('detailerAppUrl')
        if not detailer_app_url:
            return None, "Detailer app URL not configured"
        base = detailer_app_url.rstrip("/")
        
        url = f"{base}/api/v1/availability/get_timeslots/"
        params = {
            "date": date_str,
            "service_duration": service_duration_minutes,
            "country": country,
            "city": city,
        }
        if is_express_service:
            params["is_express_service"] = "true"
        if latitude is not None and longitude is not None:
            params["latitude"] = str(latitude)
            params["longitude"] = str(longitude)
        try:
            resp = requests.get(url, params=params, headers=detailer_request_headers(), timeout=15)
            if resp.status_code != 200:
                return None, resp.text or f"HTTP {resp.status_code}"
            data = resp.json()
            if data.get("error"):
                return None, data.get("error", "No slots")
            slots = data.get("slots") or data.get("available_slots") or []
            # Normalize to list of start_time strings (HH:MM or HH:MM:SS -> HH:MM)
            start_times = set()
            for s in slots:
                if isinstance(s, dict) and s.get("is_available") and s.get("start_time"):
                    st = s["start_time"]
                    if len(st) >= 5:
                        start_times.add(st[:5])  # HH:MM
            return list(start_times), None
        except Exception as e:
            return None, str(e)

    def _parse_reschedule_date_time(self, new_date, new_time):
        """Return (date_obj, time_obj, error_message or None)."""
        try:
            if hasattr(new_date, "year") and not hasattr(new_date, "hour"):
                nd = new_date
            else:
                nd = datetime.strptime(str(new_date).strip()[:10], "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return None, None, "Invalid date"
        nt = new_time
        if not hasattr(nt, "hour"):
            s = str(nt or "").strip()
            head = s.split(".")[0]
            parsed = None
            for fmt in ("%H:%M:%S", "%H:%M"):
                try:
                    parsed = datetime.strptime(head, fmt).time()
                    break
                except ValueError:
                    continue
            if parsed is None:
                return None, None, "Invalid time"
            nt = parsed
        return nd, nt, None

    def _validate_reschedule_slot(self, booking, new_date, new_time):
        """
        Reject past dates/times; ensure the slot appears in detailer get_timeslots for this address.
        Detailer Job is updated asynchronously via publish_booking_rescheduled → Redis subscriber.
        """
        try:
            nd, nt, parse_err = self._parse_reschedule_date_time(new_date, new_time)
            if parse_err:
                return False, parse_err
            now = timezone.now()
            if nd < now.date():
                return False, "Cannot reschedule to a date in the past"
            if nd == now.date():
                slot_dt = timezone.make_aware(
                    datetime.combine(nd, nt),
                    timezone.get_current_timezone(),
                )
                if slot_dt <= now:
                    return False, "Cannot reschedule to a time in the past"

            address = booking.address
            country = (address.country or "").strip() or "Ireland"
            city = (address.city or "").strip() or "Dublin"
            lat = address.latitude
            lng = address.longitude
            duration = 60
            if booking.service_type_id:
                st = ServiceType.objects.filter(id=booking.service_type_id).first()
                if st and st.duration:
                    duration = int(st.duration)
            is_express = getattr(booking, 'is_express_service', False) or False
            start_times, err = self._fetch_detailer_timeslots(
                nd.isoformat(),
                duration,
                country,
                city,
                latitude=lat,
                longitude=lng,
                is_express_service=is_express,
            )
            if err is not None:
                return False, err
            if not start_times:
                return False, "No available slots for the selected date"
            new_time_normalized = nt.strftime("%H:%M")
            if new_time_normalized not in start_times:
                return False, "Selected time is no longer available"
            return True, None
        except Exception as e:
            return False, str(e)

    def reschedule_intent(self, request):
        """
        Validate reschedule slot and return whether a fee is required. Expects data: booking_reference, new_date, new_time.
        Returns requires_fee (true if <12h before current appointment), fee_amount_cents (1000 or 0), slot_valid.
        """
        logger = logging.getLogger('main.views.booking')
        try:
            data = request.data.get('data') or request.data
            booking_reference = data.get('booking_reference')
            new_date = data.get('new_date')
            new_time = data.get('new_time')
            if not booking_reference or not new_date or not new_time:
                return Response(
                    {'error': 'booking_reference, new_date, and new_time are required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            try:
                booking = BookedAppointment.objects.get(
                    booking_reference=booking_reference,
                    user=request.user
                )
            except BookedAppointment.DoesNotExist:
                return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)
            if booking.status in ('completed', 'cancelled', 'in_progress'):
                return Response(
                    {'error': 'This booking cannot be rescheduled'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            now = timezone.now()
            try:
                apt_dt = timezone.datetime.combine(booking.appointment_date, booking.start_time or datetime.min.time())
                apt_dt = timezone.make_aware(apt_dt)
                hours_until = (apt_dt - now).total_seconds() / 3600
            except Exception:
                hours_until = 24
            requires_fee = hours_until < 12
            fee_cents = int(getattr(settings, 'RESCHEDULE_FEE_CENTS', 1000))
            fee_amount_cents = fee_cents if requires_fee else 0
            valid, err_msg = self._validate_reschedule_slot(booking, new_date, new_time)
            if not valid:
                return Response(
                    {'error': err_msg or 'Selected time is no longer available'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            return Response({
                'requires_fee': requires_fee,
                'fee_amount_cents': fee_amount_cents,
                'slot_valid': True,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"reschedule_intent error: {str(e)}")
            logger.error(traceback.format_exc())
            return Response({'error': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def reschedule_booking(self, request):
        """
        Reschedule: validate slot, update BookedAppointment (date/time/total), keep existing status,
        enqueue publish_booking_rescheduled for the detailer app's Redis subscriber, notify customer.
        """
        logger = logging.getLogger('main.views.booking')
        try:
            data = request.data.get('data') or request.data
            booking_reference = data.get('booking_reference') or data.get('booking_id')
            new_date = data.get('new_date')
            new_time = data.get('new_time')
            total_cost = data.get('total_cost')
            if not booking_reference or not new_date or not new_time:
                return Response(
                    {'error': 'booking_reference, new_date, and new_time are required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            try:
                booking = BookedAppointment.objects.get(
                    booking_reference=booking_reference,
                    user=request.user
                )
            except BookedAppointment.DoesNotExist:
                return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)
            if booking.status in ('completed', 'cancelled', 'in_progress'):
                return Response(
                    {'error': 'This booking cannot be rescheduled'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if booking.bulk_order_id:
                return Response(
                    {'error': 'Bulk bookings must be rescheduled using the fleet flow.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            now = timezone.now()
            try:
                _apt_dt = timezone.datetime.combine(
                    booking.appointment_date,
                    booking.start_time or datetime.min.time(),
                )
                _apt_dt = timezone.make_aware(_apt_dt)
                hours_until_reschedule = (_apt_dt - now).total_seconds() / 3600
            except Exception:
                hours_until_reschedule = 999.0
            if hours_until_reschedule < 12:
                fee_cents = int(getattr(settings, 'RESCHEDULE_FEE_CENTS', 1000))
                return Response(
                    {
                        'error': (
                            'This reschedule requires a late reschedule fee. '
                            'Complete payment in the app; your booking will update automatically when payment succeeds.'
                        ),
                        'code': 'RESCHEDULE_FEE_REQUIRED',
                        'requires_fee': True,
                        'fee_amount_cents': fee_cents,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            valid, err_msg = self._validate_reschedule_slot(booking, new_date, new_time)
            if not valid:
                return Response(
                    {'error': err_msg or 'Selected time is no longer available'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            nd, nt, parse_err = self._parse_reschedule_date_time(new_date, new_time)
            if parse_err:
                return Response({'error': parse_err}, status=status.HTTP_400_BAD_REQUEST)
            if total_cost is not None:
                booking.total_amount = total_cost
            booking.appointment_date = nd
            booking.start_time = nt
            booking.save()
            publish_booking_rescheduled.delay(
                booking.booking_reference,
                booking.appointment_date,
                booking.start_time,
                booking.total_amount
            )
            try:
                NotificationService().send_booking_rescheduled(request.user, booking)
            except Exception as e:
                logger.error(f"Error sending reschedule notification: {str(e)}")
            vehicle_name = f"{booking.vehicle.make} {booking.vehicle.model}" if booking.vehicle else "your vehicle"
            return Response(
                {'message': f'You have rescheduled your booking for {vehicle_name} on {booking.appointment_date}'},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            logger.error(f"reschedule_booking error: {str(e)}")
            logger.error(traceback.format_exc())
            return Response({'error': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    

    def _book_appointment(self, request):
        """Retired: old clients that POST book_appointment get a clear 410."""
        return Response(
            {
                "error": "This booking endpoint is no longer available. Use the payment sheet flow.",
                "code": "BOOK_APPOINTMENT_GONE",
            },
            status=status.HTTP_410_GONE,
        )

    def get_add_ons(self, request):
        """Return all add-ons ordered by price. Each with id, name, price, description, extra_duration."""
        try:
            add_ons = AddOns.objects.all().order_by('price')
            add_ons_data = []
            for add_on in add_ons:
                add_on_items = {
                    "id" : add_on.id,
                    "name" : add_on.name,
                    "price" : add_on.price,
                    "description" : add_on.description,
                    "extra_duration" : add_on.extra_duration
                }
                add_ons_data.append(add_on_items)
            return Response(add_ons_data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        


        
    def quote_booking(self, request):
        """POST: Server-priced quote and Quick Sparkle entitlements from a cart snapshot."""
        body = request.data or {}
        try:
            sid = body.get('service_type_id')
            if not sid:
                return Response({'error': 'service_type_id is required'}, status=status.HTTP_400_BAD_REQUEST)
            service = ServiceType.objects.get(id=sid)
        except ServiceType.DoesNotExist:
            return Response({'error': 'Invalid service_type_id'}, status=status.HTTP_400_BAD_REQUEST)

        addon_ids = body.get('addon_ids')
        if addon_ids is None:
            addon_ids = []
        if not isinstance(addon_ids, (list, tuple)):
            return Response({'error': 'addon_ids must be an array'}, status=status.HTTP_400_BAD_REQUEST)
        addons = list(AddOns.objects.filter(id__in=list(addon_ids)))
        from main.utils.vehicle_category import resolve_is_suv_mpv

        is_suv = resolve_is_suv_mpv(
            is_suv=bool(body.get('is_suv')) if 'is_suv' in body else None,
            body_style=body.get('body_style') or body.get('bodyStyle'),
        )
        is_express = bool(body.get('is_express'))
        apply_partner_booking_discount = bool(body.get('apply_partner_booking_discount'))

        payload = quote_booking_for_user(
            request.user,
            service=service,
            addons=addons,
            is_suv=is_suv,
            is_express=is_express,
            apply_partner_booking_discount=apply_partner_booking_discount,
        )
        return Response(payload, status=status.HTTP_200_OK)

    def check_bulk_capacity(self, request):
        """
        Proxy crew bulk-capacity check so the browser never calls the detailer host.

        GET/POST params match crew ``availability/check_bulk_capacity``: date, workload_minutes,
        service_duration, country, city, optional latitude, longitude, now.
        Fleet, branch admin, dealership, and partner accounts only.
        """
        user = request.user
        if not (
            user.is_fleet_owner
            or user.is_branch_admin
            or user.is_dealership
            or bool(getattr(user, "partner_referral_code", None))
            or Partner.objects.filter(user=user).exists()
        ):
            return Response({"error": "Access denied"}, status=status.HTTP_403_FORBIDDEN)

        detailer_app_url = getattr(settings, "DETAILER_APP_URL", None) or getattr(
            settings, "API_CONFIG", {}
        ).get("detailerAppUrl")
        if not detailer_app_url:
            return Response(
                {"error": "Detailer app not configured"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        src = request.query_params if request.method == "GET" else (request.data or {})
        params = {}
        for key in (
            "date",
            "workload_minutes",
            "service_duration",
            "country",
            "city",
            "latitude",
            "longitude",
            "now",
        ):
            value = src.get(key)
            if value is not None and str(value).strip() != "":
                params[key] = value

        if not params.get("date") or not params.get("country") or not params.get("city"):
            return Response(
                {"error": "Missing required parameters: date, country, city"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            params["workload_minutes"] = int(params.get("workload_minutes") or 0)
        except (TypeError, ValueError):
            return Response(
                {"error": "workload_minutes must be an integer"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            if "service_duration" in params:
                params["service_duration"] = int(params["service_duration"])
        except (TypeError, ValueError):
            params["service_duration"] = 60

        url = f"{str(detailer_app_url).rstrip('/')}/api/v1/availability/check_bulk_capacity/"
        logger = logging.getLogger("main.views.booking")
        try:
            response = requests.get(url, params=params, headers=detailer_request_headers(), timeout=30)
        except requests.RequestException as exc:
            logger.error("check_bulk_capacity proxy failed: %s", exc)
            return Response(
                {"error": "Unable to check capacity. Please try again.", "available": False, "options": []},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        try:
            body = response.json() if response.content else {}
        except ValueError:
            body = {"error": response.text or f"HTTP {response.status_code}"}

        if response.status_code in (200, 201):
            return Response(body, status=status.HTTP_200_OK)
        if response.status_code == 400:
            return Response(body if isinstance(body, dict) else {"error": str(body)}, status=status.HTTP_400_BAD_REQUEST)
        logger.error(
            "check_bulk_capacity crew returned %s: %s",
            response.status_code,
            body,
        )
        return Response(
            {
                "error": body.get("error") if isinstance(body, dict) else "Unable to check capacity. Please try again.",
                "available": False,
                "options": [],
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )

    def get_timeslots(self, request):
        """
        Proxy crew ``availability/get_timeslots`` so the browser never calls the detailer host.

        GET params match the native app: date, service_duration, country, city,
        optional latitude, longitude, is_express_service.
        """
        detailer_app_url = getattr(settings, "DETAILER_APP_URL", None) or getattr(
            settings, "API_CONFIG", {}
        ).get("detailerAppUrl")
        if not detailer_app_url:
            return Response(
                {"error": "Detailer app not configured"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        src = request.query_params
        date_str = (src.get("date") or "").strip()
        country = (src.get("country") or "").strip()
        city = (src.get("city") or "").strip()
        if not date_str or not country or not city:
            return Response(
                {"error": "Select an address and date to see available hours."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        params = {
            "date": date_str,
            "country": country,
            "city": city,
        }
        try:
            params["service_duration"] = int(src.get("service_duration") or 60)
        except (TypeError, ValueError):
            params["service_duration"] = 60

        express = (src.get("is_express_service") or "").strip().lower()
        if express in ("true", "1", "yes"):
            params["is_express_service"] = "true"
        else:
            params["is_express_service"] = "false"

        for key in ("latitude", "longitude"):
            value = src.get(key)
            if value is not None and str(value).strip() != "":
                params[key] = value

        url = f"{str(detailer_app_url).rstrip('/')}/api/v1/availability/get_timeslots/"
        logger = logging.getLogger("main.views.booking")
        try:
            response = requests.get(url, params=params, headers=detailer_request_headers(), timeout=15)
        except requests.RequestException as exc:
            logger.error("get_timeslots proxy failed: %s", exc)
            return Response(
                {"error": "Unable to check available hours. Please try again.", "slots": []},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        try:
            body = response.json() if response.content else {}
        except ValueError:
            body = {"error": response.text or f"HTTP {response.status_code}"}

        if response.status_code in (200, 201):
            return Response(body, status=status.HTTP_200_OK)
        if response.status_code == 400:
            return Response(
                body if isinstance(body, dict) else {"error": str(body)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        logger.error("get_timeslots crew returned %s: %s", response.status_code, body)
        return Response(
            {
                "error": body.get("error") if isinstance(body, dict) else "Unable to check available hours. Please try again.",
                "slots": [],
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )

    def check_free_wash(self, request):
        """
        Check complimentary Quick Sparkle eligibility: loyalty (Platinum), partner referral,
        or B2C subscription allowance. Uses read-only loyalty peek (does not mutate reset dates).
        """
        try:
            qs = build_quick_sparkle_entitlements(request.user, eligibility_only=True)
            can_use = (
                qs["eligible_loyalty"]
                or qs["eligible_partner"]
                or qs["eligible_subscription"]
            )
            if qs["eligible_loyalty"]:
                free_wash_source = "loyalty"
            elif qs["eligible_partner"]:
                free_wash_source = "partner"
            elif qs["eligible_subscription"]:
                free_wash_source = "subscription"
            else:
                free_wash_source = None

            body = {
                "can_use_free_wash": can_use,
                "remaining_quick_sparkles": qs.get("remaining_loyalty") or 0,
                "total_monthly_limit": qs.get("total_monthly_limit") or 0,
                "resets_in_days": qs.get("resets_in_days") or 30,
                "free_wash_source": free_wash_source,
                "partner_free_wash": qs.get("partner_free_wash"),
                "eligible_loyalty": qs["eligible_loyalty"],
                "eligible_partner": qs["eligible_partner"],
                "eligible_subscription": qs["eligible_subscription"],
                "remaining_subscription": qs.get("remaining_subscription") or 0,
                "max_subscription": qs.get("max_subscription") or 0,
                "subscription_period_label": qs.get("period_label") or "",
            }
            return Response(body, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def get_payment_methods(self, request):
        """
        Get saved payment methods for the authenticated user from Stripe (customer's payment methods, type=card).
        Returns list of { id, type, card: { brand, last4, exp_month, exp_year } }. Empty list if no stripe_customer_id.
        """
        try:
            user = request.user
            
            # Check if user has a Stripe customer ID
            if not user.stripe_customer_id:
                return Response({
                    'payment_methods': []
                }, status=status.HTTP_200_OK)
            
            # Retrieve payment methods from Stripe
            payment_methods = stripe.PaymentMethod.list(
                customer=user.stripe_customer_id,
                type='card'
            )
            
            # Format payment methods for response
            formatted_methods = []
            for pm in payment_methods.data:
                card = pm.card
                formatted_methods.append({
                    'id': pm.id,
                    'type': pm.type,
                    'card': {
                        'brand': card.brand,
                        'last4': card.last4,
                        'exp_month': card.exp_month,
                        'exp_year': card.exp_year,
                    }
                })
            
            return Response({
                'payment_methods': formatted_methods
            }, status=status.HTTP_200_OK)
            
        except stripe.error.StripeError as e:
            logger = logging.getLogger('main.views.booking')
            logger.error(f"Stripe error fetching payment methods: {str(e)}")
            return Response({
                'error': 'Failed to fetch payment methods'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger = logging.getLogger('main.views.booking')
            logger.error(f"Error fetching payment methods: {str(e)}")
            return Response({
                'error': 'Internal server error'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def delete_payment_method(self, request):
        """
        Detach a payment method from the user's Stripe customer. Expects request.data.payment_method_id.
        """
        try:
            payment_method_id = request.data.get('payment_method_id')
            
            if not payment_method_id:
                return Response({
                    'error': 'payment_method_id is required'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Detach payment method from customer
            stripe.PaymentMethod.detach(payment_method_id)
            
            return Response({
                'message': 'Payment method deleted successfully'
            }, status=status.HTTP_200_OK)
            
        except stripe.error.StripeError as e:
            logger = logging.getLogger('main.views.booking')
            logger.error(f"Stripe error deleting payment method: {str(e)}")
            return Response({
                'error': 'Failed to delete payment method'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger = logging.getLogger('main.views.booking')
            logger.error(f"Error deleting payment method: {str(e)}")
            return Response({
                'error': 'Internal server error'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
