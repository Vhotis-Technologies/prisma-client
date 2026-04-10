"""
Events/booking API view for Prisma Car Care client app.

Provides GET/POST/PATCH/DELETE actions: get_service_type, get_valet_type, get_add_ons,
get_promotions, mark_promotion_used, check_free_wash, book_appointment, cancel_booking,
reschedule_booking, reschedule_intent, get_payment_methods, delete_payment_method.

- book_appointment (_book_appointment): Legacy path that creates BookedAppointment directly
  from request (used when not using the payment sheet flow). Resolves vehicle, valet, service,
  address (or branch), applies free Quick Sparkle, creates booking and add-ons.
- cancel_booking: Cancels by booking_reference, tiered refund (>12h full, 6–12h half, <6h none),
  publishes to Redis for detailer, processes Stripe refund.
- reschedule_booking / reschedule_intent: Validate slot, update booking (preserve status), publish_booking_rescheduled for detailer subscriber.

See docs/BOOKING_FLOW.md for the full booking and payment flow.
"""
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from main.models import BookedAppointment, BookedAppointmentImage, ServiceType, ValetType, AddOns, Address, DetailerProfile, Vehicle, Promotions, PaymentTransaction, RefundRecord, User, LoyaltyProgram, Branch, ReferralAttribution, Partner
import uuid
import stripe
import requests
from django.conf import settings
from datetime import datetime
from django.utils import timezone
from main.tasks import publish_booking_cancelled, publish_booking_rescheduled, send_push_notification
import logging
import traceback

# Initialize Stripe with your secret key
stripe.api_key = settings.STRIPE_SECRET_KEY

""" The view is used to define the structure of the booking api for the client.  """
class EventsView(APIView):
    permission_classes = [IsAuthenticated]
    """ Action handlers designed to route the url to the appropriate function """
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
    }
    
    def get(self, request, *args, **kwargs):
        """Route GET by action (e.g. get_service_type, get_valet_type, get_add_ons, get_promotions, check_free_wash, get_payment_methods)."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)
    
    def post(self, request, *args, **kwargs):
        """Route POST by action (e.g. book_appointment, mark_promotion_used)."""
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

        Refund: >12h until appointment = full refund; 6–12h = 50%; <6h = no refund.
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
            
            # Tiered refund: >12h full, 6-12h half, <6h none
            if hours_until_appointment <= 6:
                refund_tier = 'none'
                refund_amount = 0
            elif hours_until_appointment <= 12:
                refund_tier = 'half'
                # Will set refund_amount after we have original_transaction
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
                            logger.info(f"Processing refund for booking {booking_reference}, amount: {refund_amount} ({refund_tier})")
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
                        send_push_notification.delay(
                            request.user.id,
                            "Booking Cancelled - Refund Processed!",
                            f"Your valet service has been cancelled for {booking.appointment_date} at {booking.start_time}. You will be refunded within 3-5 business days.",
                            "booking_cancelled_refunded"
                        )
                        logger.info("Sent refund notification")
                    except Exception as e:
                        logger.error(f"Error sending refund notification: {str(e)}")
                elif refund_tier == 'half':
                    message += f"\n\n50% refund was available but could not be processed. Please contact support."
                    try:
                        send_push_notification.delay(
                            request.user.id,
                            "Booking Cancelled",
                            f"Your valet service has been cancelled for {booking.appointment_date} at {booking.start_time}. Refund issue - please contact support.",
                            "booking_cancelled_no_refund"
                        )
                    except Exception as e:
                        logger.error(f"Error sending push notification: {str(e)}")
                else:
                    if refund_tier == 'none':
                        message += f"\n\nNo refund available - cancellation was within 6 hours of appointment start time."
                    else:
                        message += f"\n\nNo refund available - cancellation was within 12 hours of appointment start time."
                    
                    # Send push notification for non-refunded cancellation
                    try:
                        send_push_notification.delay(
                            request.user.id,
                            "Booking Cancelled",
                            f"Your valet service has been cancelled for {booking.appointment_date} at {booking.start_time}. No refund available due to late cancellation.",
                            "booking_cancelled_no_refund"
                        )
                        logger.info("Sent no-refund notification")
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
            resp = requests.get(url, params=params, headers={'Content-Type': 'application/json'}, timeout=15)
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
            fee_amount_cents = 1000 if requires_fee else 0
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
            send_push_notification.delay(
                request.user.id,
                "Booking Rescheduled!",
                f"Your valet service has been rescheduled for {booking.appointment_date} at {booking.start_time}",
                "booking_rescheduled"
            )
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
        """
        Legacy booking creation: create BookedAppointment directly from request (no payment sheet).

        Expects booking_data with vehicle, valet_type, service_type, address (or IDs), date,
        start_time, duration, total_amount, subtotal_amount, vat_amount, addons,
        booking_reference, status, optional applied_free_quick_sparkle, is_express_service.
        Resolves address from Address or Branch; applies free Quick Sparkle (loyalty/partner) if set.
        Creates BookedAppointment (detailer=None), adds add-ons, sends push notification.
        Returns appointment_id. Used when client does not go through create_payment_sheet + webhook.
        """
        logger = logging.getLogger('main.views.booking')
        appointment = None
        
        logger.info(f"Starting booking appointment creation for user: {request.user.id}")
        logger.info(f"Request data: {request.data}")
        
        try:
            # Get the booking data from the request
            booking_data = request.data.get('booking_data', request.data)
            logger.info(f"Booking data extracted: {booking_data}")

            # Detailer will be assigned later via Redis/detailer app
            # No longer creating detailer profile at booking time
            logger.info("Booking will be created without detailer assignment (pending status)")
            
            # Get existing objects by ID
            try:
                vehicle_id = booking_data.get('vehicle', {}).get('id')
                valet_type_id = booking_data.get('valet_type', {}).get('id')
                service_type_id = booking_data.get('service_type', {}).get('id')
                address_id = booking_data.get('address', {}).get('id')
                vehicle = Vehicle.objects.get(id=vehicle_id)
                valet_type = ValetType.objects.get(id=valet_type_id)
                logger.info(f"Valet type found: {valet_type.id} - {valet_type.name}")
                
                logger.info(f"Looking up service type ID: {service_type_id}")
                service_type = ServiceType.objects.get(id=service_type_id)
                logger.info(f"Service type found: {service_type.id} - {service_type.name}")
                
                logger.info(f"Looking up address ID: {address_id}")
                # Try to get Address by ID first (for regular addresses)
                try:
                    address = Address.objects.get(id=address_id)
                    logger.info(f"Address found: {address.id} - {address.address}")
                except (Address.DoesNotExist, ValueError):
                    # If not found, check if it's a branch ID (UUID)
                    # Branch addresses are UUIDs, Address IDs are integers
                    try:
                        # Try to parse as UUID to see if it's a branch ID
                        branch_uuid = uuid.UUID(str(address_id))
                        branch = Branch.objects.get(id=branch_uuid)
                        logger.info(f"Branch found: {branch.id} - {branch.address}")
                        # Create or get Address from branch data
                        # Check if address already exists for this user from this branch
                        address, created = Address.objects.get_or_create(
                            user=request.user,
                            address=branch.address or '',
                            post_code=branch.postcode or '',
                            city=branch.city or '',
                            country=branch.country or '',
                            defaults={
                                'latitude': branch.latitude,
                                'longitude': branch.longitude
                            }
                        )
                        if created:
                            logger.info(f"Created Address from branch: {address.id} - {address.address}")
                        else:
                            logger.info(f"Using existing Address from branch: {address.id} - {address.address}")
                    except (Branch.DoesNotExist, ValueError, TypeError) as e:
                        logger.error(f"Address not found and not a valid branch ID: {str(e)}")
                        raise ValueError(f"Address with ID {address_id} not found")
                
            except Exception as e:
                logger.error(f"Error fetching related objects: {str(e)}")
                raise e
            
            # Convert date string to date object
            try:
                logger.info("Converting date string...")
                date_str = booking_data.get('date')
                logger.info(f"Date string: {date_str}")
                appointment_date = datetime.strptime(date_str, '%Y-%m-%d').date()
                logger.info(f"Appointment date converted: {appointment_date}")
            except Exception as e:
                logger.error(f"Error converting date: {str(e)}")
                raise e
            
            # Convert start_time string to time object
            try:
                logger.info("Converting start time...")
                start_time_str = booking_data.get('start_time')
                logger.info(f"Start time string: {start_time_str}")
                start_time = None
                if start_time_str:
                    start_time = datetime.strptime(start_time_str, '%H:%M:%S.%f').time()
                    logger.info(f"Start time converted: {start_time}")
                else:
                    logger.info("No start time provided")
            except Exception as e:
                logger.error(f"Error converting start time: {str(e)}")
                raise e
            
            # Check if free Quick Sparkle should be applied (loyalty or partner referral)
            applied_free_wash = booking_data.get('applied_free_quick_sparkle', False)
            if applied_free_wash and service_type.name == 'The Quick Sparkle':
                loyalty_used = False
                try:
                    loyalty = LoyaltyProgram.objects.get(user=request.user)
                    if loyalty.can_use_free_quick_sparkle():
                        loyalty.use_free_quick_sparkle()
                        loyalty_used = True
                        logger.info(f"Free Quick Sparkle applied for user {request.user.id} (loyalty)")
                    else:
                        logger.warning(f"User {request.user.id} tried to use free wash but limit reached")
                except LoyaltyProgram.DoesNotExist:
                    pass

                if not loyalty_used:
                    try:
                        attr = ReferralAttribution.objects.get(
                            referred_user=request.user, source='partner'
                        )
                        if not attr.partner_free_wash_used and (
                            attr.expires_at is None or attr.expires_at > timezone.now()
                        ):
                            attr.partner_free_wash_used = True
                            attr.save()
                            logger.info(f"Free Quick Sparkle applied for user {request.user.id} (partner referral)")
                    except ReferralAttribution.DoesNotExist:
                        pass
            
            # Create the booking in the database without detailer
            try:
                logger.info("Creating BookedAppointment...")
                
                # Extract VAT breakdown from booking data
                subtotal_amount = booking_data.get('subtotal_amount')
                vat_amount = booking_data.get('vat_amount')
                vat_rate = booking_data.get('vat_rate', 23.00)  # Default to 23% if not provided
                total_amount = booking_data.get('total_amount')
                
                # If breakdown not provided, calculate from total_amount (backward compatibility)
                if subtotal_amount is None or vat_amount is None:
                    if total_amount:
                        # Calculate VAT breakdown if not provided
                        # total = subtotal + vat, where vat = subtotal * 0.23
                        # So: total = subtotal + subtotal * 0.23 = subtotal * 1.23
                        # Therefore: subtotal = total / 1.23
                        vat_rate_decimal = vat_rate / 100 if vat_rate else 0.23
                        subtotal_amount = total_amount / (1 + vat_rate_decimal)
                        vat_amount = total_amount - subtotal_amount
                    else:
                        subtotal_amount = 0
                        vat_amount = 0
                
                # Get is_express_service from booking data
                is_express_service = booking_data.get('is_express_service', False)
                if isinstance(is_express_service, str):
                    is_express_service = is_express_service.lower() == 'true'
                
                appointment = BookedAppointment.objects.create(
                    user = request.user,
                    appointment_date = appointment_date,
                    vehicle = vehicle,
                    valet_type = valet_type,
                    service_type = service_type,
                    detailer = None,
                    address = address,
                    status = booking_data.get('status'),
                    total_amount = total_amount,
                    subtotal_amount = subtotal_amount,
                    vat_amount = vat_amount,
                    vat_rate = vat_rate,
                    start_time = start_time,
                    duration = booking_data.get('duration'),
                    special_instructions = booking_data.get('special_instructions'),
                    booking_reference = booking_data.get('booking_reference'),
                    is_express_service = is_express_service
                )
                logger.info(f"BookedAppointment created successfully: {appointment.id}")
                logger.info(f"Booking reference: {appointment.booking_reference}")
            except Exception as e:
                logger.error(f"Error creating BookedAppointment: {str(e)}")
                raise e
            
            # Add add-ons if any (with error handling)
            try:
                logger.info("Processing add-ons...")
                addons_data = booking_data.get('addons', [])
                logger.info(f"Add-ons data: {addons_data}")
                if addons_data:
                    addon_ids = [addon.get('id') for addon in addons_data]
                    logger.info(f"Add-on IDs: {addon_ids}")
                    addons = AddOns.objects.filter(id__in=addon_ids)
                    logger.info(f"Found {addons.count()} add-ons")
                    appointment.add_ons.set(addons)
                    appointment.save()
                    logger.info("Add-ons added successfully")
                else:
                    logger.info("No add-ons to process")
            except Exception as e:
                logger.error(f"Error adding add-ons: {str(e)}")
                # Don't fail the entire booking for add-on errors

            # Send booking confirmation notification (with error handling)
            try:
                logger.info("Sending push notification...")
                send_push_notification.delay(
                    request.user.id,
                    "Booking Received!",
                    f"Your booking for {appointment.appointment_date} at {appointment.start_time} has been received. Waiting for detailer confirmation!",
                    "booking_pending"
                )
                logger.info("Push notification sent successfully")
            except Exception as e:
                logger.error(f"Error sending notification: {str(e)}")
                # Don't fail the entire booking for notification errors

            logger.info(f"Booking appointment creation completed successfully: {appointment.id}")
            logger.info(f"Waiting for detailer app to confirm via Redis (job_acceptance channel)")
            return Response({'appointment_id': str(appointment.id)}, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Error creating appointment: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            return Response({'error': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



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
        



    def check_free_wash(self, request):
        """
        Check if user can use a free Quick Sparkle: loyalty (Platinum) or partner referral.
        Returns can_use_free_wash, remaining_quick_sparkles, total_monthly_limit, resets_in_days,
        free_wash_source (loyalty|partner), partner_free_wash.
        """
        try:
            from datetime import timedelta

            user = request.user
            can_use_loyalty = False
            remaining_quick_sparkles = 0
            total_monthly_limit = 0
            days_until_reset = 30

            try:
                loyalty = LoyaltyProgram.objects.get(user=user)
                can_use_loyalty = loyalty.can_use_free_quick_sparkle()
                remaining_quick_sparkles = loyalty.get_remaining_free_quick_sparkles()
                total_monthly_limit = loyalty.get_free_wash_limit()
                if loyalty.free_quick_sparkle_reset_date:
                    reset_date = loyalty.free_quick_sparkle_reset_date + timedelta(days=30)
                    days_until_reset = (reset_date - timezone.now().date()).days
            except LoyaltyProgram.DoesNotExist:
                pass

            can_use_partner = False
            try:
                attr = ReferralAttribution.objects.get(referred_user=user, source='partner')
                if not attr.partner_free_wash_used and (attr.expires_at is None or attr.expires_at > timezone.now()):
                    can_use_partner = True
            except ReferralAttribution.DoesNotExist:
                pass

            can_use = can_use_loyalty or can_use_partner
            free_wash_source = 'loyalty' if can_use_loyalty else ('partner' if can_use_partner else None)
            partner_free_wash = can_use_partner

            return Response({
                'can_use_free_wash': can_use,
                'remaining_quick_sparkles': remaining_quick_sparkles,
                'total_monthly_limit': total_monthly_limit,
                'resets_in_days': days_until_reset,
                'free_wash_source': free_wash_source,
                'partner_free_wash': partner_free_wash,
            }, status=status.HTTP_200_OK)

        except Exception as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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
