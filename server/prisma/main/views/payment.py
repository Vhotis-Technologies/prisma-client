"""
Payment and Stripe webhook views for Prisma Car Care.

**PaymentView** (authenticated, action-routed via URL ``action`` kwarg):
- ``create_payment_sheet`` — PendingBooking + PaymentIntent, or zero-amount paths (winner/gift voucher,
  complimentary Quick Sparkle) that book immediately without Stripe.
- ``create_reschedule_fee_payment_sheet`` — late reschedule fee PaymentIntent.
- ``create_gift_voucher_payment_sheet`` — purchase a gift voucher for a recipient email.
- ``create_bulk_order_invoice_later`` — BulkOrder with Stripe Invoice (pay later) + detailer bulk job.
- ``apply_winner_voucher`` / ``apply_gift_voucher`` — validate codes and return checkout amounts.
- ``get_bulk_invoice_checkout`` / ``get_my_bulk_invoices`` — fleet/partner bulk invoice pay & list.
- ``get_invoice_later_eligibility`` — fleet subscription + overdue invoice gate for pay later.
- ``confirm_payment_intent`` / ``check_payment_status`` / ``get_refund_status`` — polling and support.

**StripeWebhookView** (unsigned POST, signature-verified):
- ``payment_intent.succeeded`` — booking/bulk fulfillment, subscriptions, gift voucher, reschedule fee.
- ``payment_intent.payment_failed`` — mark PendingBooking failed.
- ``invoice.*`` — subscription renewals, bulk invoice paid, reminders (upcoming / will_be_due / overdue).
- ``customer.subscription.*`` — trial end, plan/status updates, cancellation.
- ``charge.*`` / ``refund.failed`` / ``charge.dispute.created`` — refunds, failures, disputes.

**Module helpers** (shared by PaymentView and webhook):
- ``create_booking_from_pending``, ``build_detailer_payload_from_booking_data``,
  ``build_bulk_detailer_payload``, ``try_create_booking_on_detailer``,
  ``try_create_bulk_booking_on_detailer``, ``assign_detailer(s)_to_booking``,
  ``send_booking_to_detailer``, ``sync_bulk_order_paid_from_stripe_invoice``.

See docs/BOOKING_FLOW.md for the full booking flow.
"""
from rest_framework.response import Response
from rest_framework import status
from main.tasks import send_push_notification, publish_booking_cancelled, publish_booking_rescheduled
from main.services.NotificationServices import NotificationService
import stripe
from django.conf import settings
from rest_framework.permissions import IsAuthenticated, AllowAny
from datetime import datetime, timedelta, timezone as dt_timezone
from django.utils import timezone
from django.db import transaction, IntegrityError
from django.db.models import Q
from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit
from rest_framework.views import APIView
from main.utils.ratelimit_helpers import rate_limit_json_response
from main.models import (
    GiftVoucher,
    User, BookedAppointment, PaymentTransaction, RefundRecord, Address, PendingBooking, BulkOrder,
    Vehicle, ValetType, ServiceType, AddOns, LoyaltyProgram, Branch, ReferralAttribution, WinnerVoucher,
    Fleet,
)
from main.services.branch_spend import get_branch_spend_for_period
from main.utils.bulk_invoice import serialize_bulk_order_invoice_list
from main.services.booking_quote import (
    expected_bulk_total_from_booking_data,
    expected_bulk_payable_from_booking_data,
    record_bulk_complimentary_usage,
    validate_booking_financials,
    validate_bulk_booking_financials,
    validate_complimentary_choice,
    consume_complimentary_quick_sparkle,
    is_quick_sparkle_service_name,
)
from main.services.gift_voucher import (
    compute_gift_discount,
    gift_purchase_amount_error,
    gift_voucher_eligible_for_checkout,
    gift_voucher_validity_issue,
    gift_voucher_validity_user_message,
    redeem_gift_voucher_for_booking,
    validate_gift_voucher_for_payment,
)


from main.services.winner_voucher import (
    normalize_winner_code,
    voucher_eligible_for_checkout,
    winner_voucher_validity_issue,
    winner_voucher_validity_user_message,
    compute_winner_discount,
    amount_due_cents,
    validate_winner_voucher_for_payment,
    redeem_winner_voucher_for_booking,
)

from main.services.bulk_appointments import create_bulk_appointments
from main.utils.subscription_invoice import subscription_invoice_is_renewal
from main.utils.legal_urls import client_web_url
import json
import re
import time
import uuid
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
import logging

# Initialize Stripe with your secret key
stripe.api_key = settings.STRIPE_SECRET_KEY

logger = logging.getLogger(__name__)


def _stripe_nested_id(value):
    """
    Normalize Stripe id fields from API objects or webhook dicts.

    Stripe may return an id as a plain string, a nested dict ``{'id': '...'}``, or an object
    with an ``id`` attribute (e.g. expanded PaymentIntent on Invoice).

    Args:
        value: Stripe id field (str, dict, object, or None).

    Returns:
        str | None: The id string, or None if not present.
    """
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get('id')
    return getattr(value, 'id', None)


def _stripe_object_to_dict(obj):
    """
    Convert a Stripe API object or webhook payload fragment to a plain dict.

    Args:
        obj: StripeObject, dict, or None.

    Returns:
        dict: Empty dict if obj is None; otherwise dict representation suitable for .get().
    """
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, 'to_dict'):
        return obj.to_dict()
    return obj


def refund_payment_intent_for_slot_conflict(payment_intent_id, booking_reference, refund_reason):
    """
    Refund a PaymentIntent after the detailer API rejected the slot at booking time.

    This is not a crew cancellation — crews cannot cancel jobs from their app.
    Already-refunded charges count as success so Stripe webhook retries stay idempotent.
    Other Stripe or network failures raise so the webhook can return 500 and retry.
    """
    stripe.Refund.create(
        payment_intent=payment_intent_id,
        reason='requested_by_customer',
        metadata={
            'booking_reference': booking_reference or '',
            'refund_reason': refund_reason,
        },
    )


def _slot_conflict_already_refunded(exc):
    """True when Stripe rejected the refund because the charge is already refunded."""
    code = getattr(exc, 'code', None) or ''
    if code == 'charge_already_refunded':
        return True
    err = str(exc).lower()
    return 'already' in err and 'refund' in err


def try_refund_payment_intent(payment_intent_id, booking_reference, refund_reason):
    """
    Attempt a Stripe refund. True if created or already refunded; False if it failed.

    Callers should return HTTP 500 on False so Stripe retries the webhook.
    """
    try:
        refund_payment_intent_for_slot_conflict(
            payment_intent_id, booking_reference, refund_reason
        )
        return True
    except stripe.error.InvalidRequestError as exc:
        if _slot_conflict_already_refunded(exc):
            return True
        logger.warning(
            'refund failed for PI %s (%s): %s',
            payment_intent_id,
            refund_reason,
            exc,
        )
        return False
    except Exception as exc:
        logger.warning(
            'refund failed for PI %s (%s): %s',
            payment_intent_id,
            refund_reason,
            exc,
        )
        return False


def _existing_free_booking_response(booking_reference):
    """Return the success payload for an already-completed free ($0) booking, or None.

    Used to make the zero-amount checkout paths idempotent on ``booking_reference``:
    a duplicate submission (double-tap, client retry after a dropped response) that
    reuses the same reference should return the original result instead of creating
    a second ``BookedAppointment`` and consuming a second complimentary wash / voucher.
    """
    existing = BookedAppointment.objects.filter(booking_reference=booking_reference).first()
    if not existing:
        return None
    return Response({
        'free_booking': True,
        'booking_reference': booking_reference,
        'success': True,
        'appointment_id': str(existing.id),
    }, status=status.HTTP_200_OK)


def _create_pending_booking_idempotent(booking_reference, user, booking_data, detailer_booking_data, expires_at):
    """
    Create a ``PendingBooking`` for a zero-amount checkout, guarding against duplicate
    submissions that reuse the same ``booking_reference``.

    ``booking_reference`` is unique on both ``PendingBooking`` and ``BookedAppointment``,
    so a genuine duplicate (double-tap before the UI disables the button, or a retried
    request after a dropped response) is caught here instead of silently proceeding to
    create a second booking / consume a second complimentary wash.

    Returns:
        (pending_booking, duplicate_response) — exactly one is not None. When a
        duplicate is detected, ``duplicate_response`` is either the original booking's
        success payload (if it already completed) or a 409 telling the caller the
        request is already being processed.
    """
    duplicate_response = _existing_free_booking_response(booking_reference)
    if duplicate_response is not None:
        return None, duplicate_response
    try:
        pending_booking = PendingBooking.objects.create(
            booking_reference=booking_reference,
            user=user,
            booking_data=booking_data,
            detailer_booking_data=detailer_booking_data,
            payment_status='succeeded',
            expires_at=expires_at,
        )
    except IntegrityError:
        duplicate_response = _existing_free_booking_response(booking_reference)
        if duplicate_response is not None:
            return None, duplicate_response
        return None, Response(
            {'error': 'This booking is already being processed. Please check your bookings before retrying.'},
            status=status.HTTP_409_CONFLICT,
        )
    return pending_booking, None


def create_booking_from_pending(pending_booking):
    """
    Create actual BookedAppointment from pending booking data.

    Shared by PaymentView (free Quick Sparkle path) and StripeWebhookView (post-payment).
    Resolves vehicle, valet_type, service_type, address (or branch→address), parses date/time,
    applies free Quick Sparkle (loyalty or partner) if in booking_data, creates BookedAppointment,
    attaches add-ons. Members get a payment-received push. Guests get a hashed results token
    instead (the confirmation email later replaces it with the emailed secret). Does not call
    the detailer app.

    Args:
        pending_booking: PendingBooking instance with booking_data and user.

    Returns:
        BookedAppointment created.

    Raises:
        ValueError: If address or related IDs are invalid.
    """
    booking_data = pending_booking.booking_data
    user = pending_booking.user

    # Extract related objects
    vehicle_id = booking_data.get('vehicle', {}).get('id') if isinstance(booking_data.get('vehicle'), dict) else booking_data.get('vehicle_id')
    valet_type_id = booking_data.get('valet_type', {}).get('id') if isinstance(booking_data.get('valet_type'), dict) else booking_data.get('valet_type_id')
    service_type_id = booking_data.get('service_type', {}).get('id') if isinstance(booking_data.get('service_type'), dict) else booking_data.get('service_type_id')
    address_id = booking_data.get('address', {}).get('id') if isinstance(booking_data.get('address'), dict) else booking_data.get('address_id')

    vehicle = Vehicle.objects.get(id=vehicle_id) if vehicle_id else None
    valet_type = ValetType.objects.get(id=valet_type_id)
    service_type = ServiceType.objects.get(id=service_type_id)

    # Try to get Address by ID first (for regular addresses)
    try:
        address = Address.objects.get(id=address_id)
    except (Address.DoesNotExist, ValueError):
        # If not found, check if it's a branch ID (UUID)
        try:
            branch_uuid = uuid.UUID(str(address_id))
            branch = Branch.objects.get(id=branch_uuid)
            # Create or get Address from branch data
            address, created = Address.objects.get_or_create(
                user=user,
                address=branch.address or '',
                post_code=branch.postcode or '',
                city=branch.city or '',
                country=branch.country or '',
                defaults={
                    'latitude': branch.latitude,
                    'longitude': branch.longitude
                }
            )
        except (Branch.DoesNotExist, ValueError, TypeError) as e:
            raise ValueError(f"Address with ID {address_id} not found")

    # Parse dates/times
    date_str = booking_data.get('date') or booking_data.get('appointment_date')
    appointment_date = datetime.strptime(date_str, '%Y-%m-%d').date()

    start_time_str = booking_data.get('start_time')
    start_time = None
    if start_time_str:
        try:
            start_time = datetime.strptime(start_time_str, '%H:%M:%S.%f').time()
        except Exception:
            try:
                start_time = datetime.strptime(start_time_str, '%H:%M:%S').time()
            except Exception:
                pass

    # Calculate amounts (pre_voucher_total_amount = full service total stored on appointment when voucher used)
    subtotal_amount = booking_data.get('subtotal_amount')
    vat_amount = booking_data.get('vat_amount')
    vat_rate = booking_data.get('vat_rate', 23.00)
    pre_voucher_total = booking_data.get('pre_voucher_total_amount')
    total_amount = booking_data.get('total_amount')

    if pre_voucher_total is not None:
        try:
            total_amount = float(pre_voucher_total)
        except (TypeError, ValueError):
            total_amount = 0
        if subtotal_amount is None or vat_amount is None:
            vat_rate_decimal = vat_rate / 100 if vat_rate else 0.23
            subtotal_amount = total_amount / (1 + vat_rate_decimal)
            vat_amount = total_amount - subtotal_amount
    elif subtotal_amount is None or vat_amount is None:
        if total_amount:
            vat_rate_decimal = vat_rate / 100 if vat_rate else 0.23
            subtotal_amount = total_amount / (1 + vat_rate_decimal)
            vat_amount = total_amount - subtotal_amount
        else:
            subtotal_amount = 0
            vat_amount = 0

    applied_free_wash = bool(booking_data.get('applied_free_quick_sparkle', False))
    complimentary_source = booking_data.get('complimentary_quick_sparkle_source')
    consumed_tag = ''

    if applied_free_wash and is_quick_sparkle_service_name(service_type.name):
        ok_consume, consumed_tag = consume_complimentary_quick_sparkle(user, booking_data)
        if not ok_consume:
            raise ValueError('Complimentary Quick Sparkle could not be recorded for this booking.')

    resolved_source = None
    if applied_free_wash and is_quick_sparkle_service_name(service_type.name):
        if complimentary_source in ('loyalty', 'subscription', 'partner'):
            resolved_source = complimentary_source
        elif consumed_tag in ('loyalty', 'subscription', 'partner'):
            resolved_source = consumed_tag

    # Create booking
    appointment = BookedAppointment.objects.create(
        user=user,
        appointment_date=appointment_date,
        vehicle=vehicle,
        valet_type=valet_type,
        service_type=service_type,
        detailer=None,  # Will be assigned by detailer app
        address=address,
        status='confirmed',
        total_amount=total_amount,
        subtotal_amount=subtotal_amount,
        vat_amount=vat_amount,
        vat_rate=vat_rate,
        start_time=start_time,
        duration=booking_data.get('duration'),
        special_instructions=booking_data.get('special_instructions'),
        booking_reference=pending_booking.booking_reference,
        applied_free_quick_sparkle=applied_free_wash,
        complimentary_quick_sparkle_source=resolved_source,
    )

    # Add add-ons
    addons_data = booking_data.get('addons', [])
    if addons_data:
        addon_ids = []
        for addon in addons_data:
            if isinstance(addon, dict):
                addon_ids.append(addon.get('id'))
            else:
                addon_ids.append(addon)
        addons = AddOns.objects.filter(id__in=addon_ids)
        appointment.add_ons.set(addons)
        appointment.save()

    if getattr(user, "is_guest", False):
        # Confirmation email will revoke this and email a fresh raw token.
        try:
            from main.services.guest import issue_guest_access_token

            issue_guest_access_token(appointment)
        except Exception:
            logger.exception(
                "Failed to issue guest access token for %s",
                pending_booking.booking_reference,
            )
    else:
        send_push_notification.delay(
            user.id,
            "Payment received",
            f"Payment received for {appointment_date}. We're assigning your detailer.",
            "booking_confirmed"
        )

    return appointment


def build_detailer_payload_from_booking_data(booking_data, user, booking_reference):
    """
    Build the flat payload expected by the detailer app from client booking_data.

    Used when detailer_booking_data was not provided by the frontend (e.g. create_payment_sheet
    builds it server-side). Resolves address from ID (Address or Branch), vehicle/valet/service
    names, addon names, start/end time from duration, and loyalty fields.

    Args:
        booking_data: Dict with vehicle, valet_type, service_type, address (or address_id),
            date, start_time, duration, addons, special_instructions, total_amount, etc.
        user: User instance for name, phone, loyalty.
        booking_reference: Booking reference string.

    Returns:
        Dict suitable for POST to detailer create_booking (booking_reference, service_type,
        client_name, client_phone, vehicle_*, address, city, postcode, country, valet_type,
        addons, start_time, end_time, total_amount, status, booking_date, loyalty_tier, etc.).
    """
    if not booking_data or not isinstance(booking_data, dict):
        return {}

    # Resolve address to a dict with address, post_code, city, country, latitude, longitude
    address_obj = booking_data.get('address')
    address_id = None
    if isinstance(address_obj, dict):
        if 'address' in address_obj or 'city' in address_obj:
            addr = address_obj
        else:
            address_id = address_obj.get('id')
    else:
        address_id = booking_data.get('address_id')

    if address_id and not (isinstance(address_obj, dict) and ('address' in address_obj or 'city' in address_obj)):
        try:
            address = Address.objects.get(id=address_id)
            addr = {
                'address': address.address or '',
                'post_code': getattr(address, 'post_code', None) or '',
                'city': address.city or '',
                'country': address.country or '',
                'latitude': address.latitude,
                'longitude': address.longitude,
            }
        except (Address.DoesNotExist, ValueError):
            try:
                branch = Branch.objects.get(id=uuid.UUID(str(address_id)))
                addr = {
                    'address': branch.address or '',
                    'post_code': getattr(branch, 'postcode', None) or getattr(branch, 'post_code', None) or '',
                    'city': branch.city or '',
                    'country': branch.country or '',
                    'latitude': branch.latitude,
                    'longitude': branch.longitude,
                }
            except (Branch.DoesNotExist, ValueError, TypeError):
                addr = {'address': '', 'post_code': '', 'city': '', 'country': '', 'latitude': None, 'longitude': None}
    elif isinstance(address_obj, dict):
        addr = {
            'address': address_obj.get('address', ''),
            'post_code': address_obj.get('post_code', '') or address_obj.get('postcode', ''),
            'city': address_obj.get('city', ''),
            'country': address_obj.get('country', ''),
            'latitude': address_obj.get('latitude'),
            'longitude': address_obj.get('longitude'),
        }
    else:
        addr = {'address': '', 'post_code': '', 'city': '', 'country': '', 'latitude': None, 'longitude': None}

    # Vehicle
    vehicle = booking_data.get('vehicle') if isinstance(booking_data.get('vehicle'), dict) else {}
    valet_type = booking_data.get('valet_type')
    valet_type_name = valet_type.get('name', '') if isinstance(valet_type, dict) else ''
    service_type = booking_data.get('service_type')
    service_type_name = service_type.get('name', '') if isinstance(service_type, dict) else ''

    # Addons: list of names
    addons_raw = booking_data.get('addons', [])
    addon_names = []
    for a in addons_raw:
        if isinstance(a, dict):
            if a.get('name'):
                addon_names.append(a['name'])
        else:
            addon_names.append(str(a))
    # If we only have IDs, resolve names from AddOns
    if not addon_names and addons_raw:
        addon_ids = [a.get('id') if isinstance(a, dict) else a for a in addons_raw]
        addon_ids = [x for x in addon_ids if x is not None]
        if addon_ids:
            addon_names = list(AddOns.objects.filter(id__in=addon_ids).values_list('name', flat=True))

    # start_time + duration -> end_time
    start_time_str = booking_data.get('start_time', '00:00:00')
    duration_minutes = booking_data.get('duration') or 0
    if not duration_minutes and isinstance(service_type, dict):
        duration_minutes = service_type.get('duration') or 0
    try:
        duration_minutes = int(duration_minutes)
    except (TypeError, ValueError):
        duration_minutes = 0
    try:
        try:
            start_dt = datetime.strptime(start_time_str, '%H:%M:%S.%f')
        except ValueError:
            start_dt = datetime.strptime(start_time_str, '%H:%M:%S')
        end_dt = start_dt + timedelta(minutes=duration_minutes)
        end_time_str = end_dt.strftime('%H:%M:%S.%f')[:-3]
    except Exception:
        end_time_str = start_time_str

    date_str = booking_data.get('date') or booking_data.get('appointment_date', '')
    pre_v = booking_data.get('pre_voucher_total_amount')
    total_amount = pre_v if pre_v is not None else booking_data.get('total_amount', 0)
    if total_amount is not None:
        try:
            total_amount = float(total_amount)
        except (TypeError, ValueError):
            total_amount = 0

    # Loyalty (optional)
    loyalty_tier = 'bronze'
    loyalty_benefits = []
    try:
        loyalty = LoyaltyProgram.objects.get(user=user)
        loyalty_tier = getattr(loyalty, 'current_tier', 'bronze') or 'bronze'
        benefits = loyalty.get_tier_benefits() if hasattr(loyalty, 'get_tier_benefits') else {}
        loyalty_benefits = benefits.get('free_service', []) or []
    except LoyaltyProgram.DoesNotExist:
        pass

    return {
        'booking_reference': booking_reference,
        'service_type': service_type_name,
        'client_name': getattr(user, 'name', '') or '',
        'client_phone': getattr(user, 'phone', '') or '',
        'vehicle_registration': vehicle.get('licence', '') or '',
        'vehicle_make': vehicle.get('make', '') or '',
        'vehicle_model': vehicle.get('model', '') or '',
        'vehicle_color': vehicle.get('color', '') or '',
        'vehicle_year': vehicle.get('year'),
        'address': addr.get('address', ''),
        'city': (addr.get('city') or '').strip(),
        'postcode': addr.get('post_code', '') or addr.get('postcode', ''),
        'country': (addr.get('country') or '').strip(),
        'latitude': addr.get('latitude'),
        'longitude': addr.get('longitude'),
        'valet_type': valet_type_name,
        'addons': addon_names,
        'special_instructions': booking_data.get('special_instructions', '') or '',
        'total_amount': total_amount,
        'status': 'accepted',  # No separate accept step; job is accepted when created
        'booking_date': date_str,
        'start_time': start_time_str,
        'end_time': end_time_str,
        'duration': duration_minutes,
        'loyalty_tier': loyalty_tier,
        'loyalty_benefits': loyalty_benefits,
        'is_express_service': booking_data.get('is_express_service', False),
    }


def build_bulk_detailer_payload(booking_data, user, booking_reference):
    """
    Build the flat payload expected by the detailer app for bulk (fleet) jobs.

    Resolves address from dict, address_id (Address or Branch), service/valet names,
    date window, vehicle count, and client contact fields.

    Args:
        booking_data: Dict with address/address_id, service_type, valet_type, date,
            start/end or best_start_time/estimated_finish_time, number_of_vehicles, etc.
        user: User instance (client_name, client_phone).
        booking_reference: Bulk booking reference string.

    Returns:
        dict | None: Payload for POST ``/api/v1/booking/create_bulk_booking/``, or None if
            address cannot be resolved.
    """
    if not booking_data or not isinstance(booking_data, dict):
        return None
    address_obj = booking_data.get('address')
    address_id = booking_data.get('address_id')
    addr = None
    if isinstance(address_obj, dict) and (address_obj.get('address') or address_obj.get('city') or address_id is not None):
        city = (address_obj.get('city') or '').strip()
        country = (address_obj.get('country') or '').strip()
        addr = {
            'address': address_obj.get('address', ''),
            'post_code': address_obj.get('post_code', '') or address_obj.get('postcode', ''),
            'city': city,
            'country': country,
            'latitude': address_obj.get('latitude'),
            'longitude': address_obj.get('longitude'),
        }
        # If city/country missing from dict but we have address_id, resolve from DB
        if (not city or not country) and address_id is not None:
            try:
                address = Address.objects.get(id=address_id)
                if not addr['city']:
                    addr['city'] = address.city or ''
                if not addr['country']:
                    addr['country'] = address.country or ''
                if not addr['address']:
                    addr['address'] = address.address or ''
            except (Address.DoesNotExist, ValueError):
                try:
                    branch = Branch.objects.get(id=uuid.UUID(str(address_id)))
                    if not addr['city']:
                        addr['city'] = branch.city or ''
                    if not addr['country']:
                        addr['country'] = branch.country or ''
                    if not addr['address']:
                        addr['address'] = branch.address or ''
                except (Branch.DoesNotExist, ValueError, TypeError):
                    pass
    if addr is None and address_id is not None:
        try:
            address = Address.objects.get(id=address_id)
            addr = {
                'address': address.address or '',
                'post_code': getattr(address, 'post_code', '') or '',
                'city': address.city or '',
                'country': address.country or '',
                'latitude': getattr(address, 'latitude', None),
                'longitude': getattr(address, 'longitude', None),
            }
        except (Address.DoesNotExist, ValueError):
            try:
                branch = Branch.objects.get(id=uuid.UUID(str(address_id)))
                addr = {
                    'address': branch.address or '',
                    'post_code': getattr(branch, 'postcode', '') or '',
                    'city': branch.city or '',
                    'country': branch.country or '',
                    'latitude': getattr(branch, 'latitude', None),
                    'longitude': getattr(branch, 'longitude', None),
                }
            except (Branch.DoesNotExist, ValueError, TypeError):
                return None
    if addr is None:
        return None
    service_type = booking_data.get('service_type')
    service_type_name = (service_type.get('name', '') if isinstance(service_type, dict) else str(service_type or '')).strip()
    valet_type = booking_data.get('valet_type')
    if isinstance(valet_type, dict):
        valet_type_name = (valet_type.get('name') or '').strip()
    elif isinstance(valet_type, str):
        valet_type_name = (valet_type or '').strip()
    else:
        valet_type_name = ''
    date_str = booking_data.get('date') or booking_data.get('appointment_date', '')
    if isinstance(date_str, str) and len(date_str) > 10:
        date_str = date_str[:10]
    start_time = booking_data.get('best_start_time') or booking_data.get('start_time', '06:00')
    end_time = booking_data.get('estimated_finish_time') or booking_data.get('end_time', '21:00')
    if len(start_time) == 5:
        start_time = start_time + ':00'
    if len(end_time) == 5:
        end_time = end_time + ':00'
    total_amount = booking_data.get('total_amount', 0)
    try:
        total_amount = float(total_amount)
    except (TypeError, ValueError):
        total_amount = 0
    try:
        number_of_vehicles = max(0, int(booking_data.get('number_of_vehicles', 0)))
    except (TypeError, ValueError):
        number_of_vehicles = 0
    duration_minutes = booking_data.get('duration') or booking_data.get('service_duration') or 0
    if not duration_minutes and isinstance(service_type, dict):
        duration_minutes = service_type.get('duration') or 0
    try:
        duration_minutes = int(duration_minutes)
    except (TypeError, ValueError):
        duration_minutes = 0
    return {
        'booking_reference': booking_reference,
        'address': addr.get('address', ''),
        'city': (addr.get('city') or '').strip(),
        'country': (addr.get('country') or '').strip(),
        'postcode': (addr.get('post_code', '') or addr.get('postcode', '')).strip(),
        'latitude': addr.get('latitude'),
        'longitude': addr.get('longitude'),
        'date': date_str,
        'start_time': start_time,
        'end_time': end_time,
        'service_type': service_type_name,
        'valet_type': valet_type_name,
        'duration': duration_minutes,
        'number_of_vehicles': number_of_vehicles,
        'total_amount': total_amount,
        'client_name': getattr(user, 'name', '') or '',
        'client_phone': getattr(user, 'phone', '') or '',
        'owner_note': booking_data.get('special_instructions', '') or '',
        'suggested_team_size': int(booking_data.get('suggested_team_size', 1)),
        'window': booking_data.get('window', 'fullday'),
    }


def _rollback_invoice_later_after_crew(bulk_order, invoice=None):
    """
    Cancel local invoice-later rows and crew jobs after Stripe invoice failure.

    Voids a draft/open invoice when possible, publishes ``booking_cancelled`` per
    appointment so the crew subscriber drops the jobs, then marks the bulk order cancelled.
    """
    if invoice is not None:
        try:
            invoice_id = getattr(invoice, "id", None) or (invoice.get("id") if isinstance(invoice, dict) else None)
            if invoice_id:
                stripe.Invoice.void_invoice(invoice_id)
        except Exception:
            logger.exception(
                "Failed to void Stripe invoice after invoice-later rollback %s",
                bulk_order.booking_reference,
            )
    appointments = BookedAppointment.objects.filter(bulk_order=bulk_order)
    for apt in appointments:
        if apt.status not in ("cancelled", "completed"):
            apt.status = "cancelled"
            apt.save(update_fields=["status"])
        try:
            publish_booking_cancelled.delay(apt.booking_reference)
        except Exception:
            logger.exception(
                "Failed to publish booking_cancelled for invoice-later rollback %s",
                apt.booking_reference,
            )
    bulk_order.payment_status = "cancelled"
    bulk_order.save(update_fields=["payment_status"])
    from main.models import FleetComplimentaryBooking
    FleetComplimentaryBooking.objects.filter(bulk_order=bulk_order).delete()


def try_create_bulk_booking_on_detailer(pending_booking_or_bulk_order, request_id=None):
    """
    POST bulk job to the detailer app (create_bulk_booking).

    Accepts either a PendingBooking (uses ``booking_data``) or a BulkOrder (uses ``order_data``).

    Args:
        pending_booking_or_bulk_order: PendingBooking or BulkOrder with user and booking_reference.

    Returns:
        tuple[bool, list | str]: ``(True, assigned_detailers)`` on HTTP 200/201 (list may be empty),
            or ``(False, error_message)`` on failure or missing configuration.
    """
    import requests
    if hasattr(pending_booking_or_bulk_order, 'booking_data'):
        payload = build_bulk_detailer_payload(
            pending_booking_or_bulk_order.booking_data,
            pending_booking_or_bulk_order.user,
            pending_booking_or_bulk_order.booking_reference,
        )
    else:
        order_data = getattr(pending_booking_or_bulk_order, 'order_data', None) or {}
        payload = build_bulk_detailer_payload(
            order_data,
            pending_booking_or_bulk_order.user,
            pending_booking_or_bulk_order.booking_reference,
        )
    if not payload:
        return (False, "Invalid bulk payload")
    import time
    from main.utils.detailer_client import detailer_request_headers
    from main.utils.observability import log_timed, new_request_id
    payload = dict(payload)
    request_id = request_id or new_request_id()
    payload["request_id"] = request_id
    detailer_app_url = getattr(settings, 'DETAILER_APP_URL', None) or getattr(settings, 'API_CONFIG', {}).get('detailerAppUrl')
    if not detailer_app_url:
        return (False, "Detailer app not configured")
    base = (detailer_app_url or "").rstrip("/")
    url = f"{base}/api/v1/booking/create_bulk_booking/"
    started = time.monotonic()
    try:
        response = requests.post(url, json=payload, headers=detailer_request_headers(), timeout=60)
        ok = response.status_code in [200, 201]
        log_timed(
            "detailer.create_bulk_booking",
            started,
            booking_reference=payload.get("booking_reference"),
            request_id=request_id,
            http_status=response.status_code,
            ok=ok,
        )
        if ok:
            body = response.json() if response.content else {}
            assigned_detailers = body.get("assigned_detailers")
            if not isinstance(assigned_detailers, list):
                assigned_detailers = []
            return (True, assigned_detailers)
        err_body = response.json() if response.content else {}
        error_message = err_body.get('error', response.text or f"HTTP {response.status_code}")
        return (False, error_message)
    except Exception as e:
        log_timed(
            "detailer.create_bulk_booking",
            started,
            booking_reference=payload.get("booking_reference"),
            request_id=request_id,
            ok=False,
            error=str(e),
        )
        return (False, str(e))


def try_create_booking_on_detailer(pending_booking, request_id=None):
    """
    Attempt to create a single job on the detailer app before confirming payment.

    Uses ``pending_booking.detailer_booking_data`` when present; otherwise builds payload
    via ``build_detailer_payload_from_booking_data``. Called before ``create_booking_from_pending``
    so a slot conflict can trigger a refund without creating a client-side appointment.

    Args:
        pending_booking: PendingBooking with booking_data, detailer_booking_data, and reference.

    Returns:
        tuple[bool, list | str]: ``(True, assigned_detailers)`` on HTTP 200/201 (list of detailer dicts,
            possibly empty), or ``(False, error_message)`` on failure.
    """
    import requests
    from main.utils.detailer_client import detailer_request_headers

    detailer_data = pending_booking.detailer_booking_data
    if not detailer_data or not isinstance(detailer_data, dict):
        detailer_data = build_detailer_payload_from_booking_data(
            pending_booking.booking_data,
            pending_booking.user,
            pending_booking.booking_reference,
        )
    if not detailer_data:
        return (False, "No detailer payload")

    import time
    from main.utils.observability import log_timed, new_request_id
    detailer_data = dict(detailer_data)
    request_id = request_id or new_request_id()
    detailer_data["request_id"] = request_id
    if 'booking_reference' not in detailer_data:
        detailer_data['booking_reference'] = pending_booking.booking_reference
    # No separate accept step; ensure detailer receives job as accepted
    detailer_data['status'] = 'accepted'

    detailer_app_url = getattr(settings, 'DETAILER_APP_URL', None)
    if not detailer_app_url:
        detailer_app_url = getattr(settings, 'API_CONFIG', {}).get('detailerAppUrl')
    if not detailer_app_url:
        return (False, "Detailer app not configured")

    started = time.monotonic()
    try:
        base = (detailer_app_url or "").rstrip("/")
        url = f"{base}/api/v1/booking/create_booking/"
        response = requests.post(
            url,
            json=detailer_data,
            headers=detailer_request_headers(),
            timeout=30
        )
        log_timed(
            "detailer.create_booking",
            started,
            booking_reference=detailer_data.get("booking_reference"),
            request_id=request_id,
            http_status=response.status_code,
            ok=response.status_code in [200, 201],
        )

        if response.status_code in [200, 201]:
            try:
                body = response.json()
                assigned_detailers = body.get("assigned_detailers") if isinstance(body, dict) else None
                if not isinstance(assigned_detailers, list):
                    # Fallback: single detailer (legacy or bulk single-job)
                    single = body.get("detailer") if isinstance(body, dict) else None
                    assigned_detailers = [single] if single and isinstance(single, dict) else []
            except Exception:
                assigned_detailers = []
            return (True, assigned_detailers)
        try:
            err_body = response.json()
            error_message = err_body.get('error', response.text)
        except Exception:
            error_message = response.text or f"HTTP {response.status_code}"
        return (False, error_message)

    except Exception as e:
        log_timed(
            "detailer.create_booking",
            started,
            booking_reference=detailer_data.get("booking_reference"),
            request_id=request_id,
            ok=False,
            error=str(e),
        )
        return (False, str(e))


def assign_detailer_to_booking(booking, detailer_info):
    """
    Assign one detailer to a booking from the detailer API response.

    Thin wrapper around ``assign_detailers_to_booking`` for a single detailer dict.
    Mirrors subscribe_redis job_acceptance so the client UI shows the detailer immediately.

    Args:
        booking: BookedAppointment to update.
        detailer_info: Dict with at least ``phone``; optional name, rating, id/detailer_id, image.

    Returns:
        None
    """
    if not detailer_info or not isinstance(detailer_info, dict) or not detailer_info.get("phone"):
        return
    assign_detailers_to_booking(booking, [detailer_info])


def assign_detailers_to_booking(booking, assigned_detailers_list):
    """
    Assign one or more detailers to a booking (express may have 2, standard 1).

    Upserts DetailerProfile rows by normalized phone, sets ``booking.assigned_detailers``
    (list of display dicts) and ``booking.detailer`` to the first profile.

    Args:
        booking: BookedAppointment to update.
        assigned_detailers_list: List of detailer dicts from detailer app (name, phone, rating, id).

    Returns:
        None
    """
    if not assigned_detailers_list or not isinstance(assigned_detailers_list, list):
        return
    from main.models import DetailerProfile
    from main.utils.phone_utils import normalize_phone

    saved_list = []
    first_profile = None
    for detailer_info in assigned_detailers_list:
        if not isinstance(detailer_info, dict) or not detailer_info.get("phone"):
            continue
        detailer_name = (detailer_info.get("name") or "").strip()
        detailer_phone = (detailer_info.get("phone") or "").strip()
        detailer_rating = detailer_info.get("rating", 0.0)
        detailer_id = detailer_info.get("id") or detailer_info.get("detailer_id")
        normalized_phone = normalize_phone(detailer_phone)
        if not normalized_phone:
            continue
        defaults = {"name": detailer_name or "Detailer", "rating": detailer_rating}
        if detailer_id is not None and hasattr(DetailerProfile, "external_id"):
            defaults["external_id"] = str(detailer_id)
        profile, created = DetailerProfile.objects.get_or_create(
            phone=normalized_phone,
            defaults=defaults,
        )
        if not created:
            if detailer_rating is not None and detailer_rating != profile.rating:
                profile.rating = detailer_rating
            if detailer_id is not None and hasattr(profile, "external_id") and getattr(profile, "external_id", None) != str(detailer_id):
                profile.external_id = str(detailer_id)
            profile.save()
        if first_profile is None:
            first_profile = profile
        saved_list.append({
            "id": str(profile.id),
            "name": profile.name or detailer_name,
            "rating": float(profile.rating or 0),
            "phone": profile.phone or detailer_phone,
            "image": detailer_info.get("image"),
        })
    if not saved_list:
        return
    booking.assigned_detailers = saved_list
    booking.detailer = first_profile
    booking.save(update_fields=["detailer", "assigned_detailers"])


def send_booking_to_detailer(pending_booking, booking):
    """
    Send booking data to the detailer app after payment validation.

    Shared by PaymentView (free Quick Sparkle path) and legacy flows. Prefer
    ``try_create_booking_on_detailer`` before creating the appointment when slot
    availability must be checked first.

    Args:
        pending_booking: PendingBooking with detailer payload fields.
        booking: BookedAppointment (unused by implementation; kept for call-site compatibility).

    Returns:
        bool: True if detailer app accepted the job, False otherwise.
    """
    success, _ = try_create_booking_on_detailer(pending_booking)
    return success


def _user_can_pay_bulk_invoice(user, bulk_order):
    """
    Whether the user may open checkout for a fleet/partner bulk invoice.

    Args:
        user: Authenticated User.
        bulk_order: BulkOrder with user_id, fleet_id, branch_id.

    Returns:
        bool: True if user is the booker, fleet owner of the order's fleet, or branch admin
            for the order's branch.
    """
    if bulk_order.user_id == user.id:
        return True
    if getattr(user, "is_fleet_owner", False):
        fleet = Fleet.objects.filter(owner=user).first()
        if fleet and bulk_order.fleet_id and bulk_order.fleet_id == fleet.id:
            return True
    if getattr(user, "is_branch_admin", False):
        managed_branch = user.get_managed_branch()
        if managed_branch and bulk_order.branch_id == managed_branch.id:
            return True
    return False


def _stripe_inv_field(invoice, key, default=None):
    """
    Read a field from a Stripe Invoice whether it is a dict or StripeObject.

    Args:
        invoice: Invoice dict (webhook) or stripe.Invoice object.
        key: Field name (e.g. ``status``, ``hosted_invoice_url``, ``amount_paid``).
        default: Value if the field is missing.

    Returns:
        Any: Field value or default.
    """
    if isinstance(invoice, dict):
        return invoice.get(key, default)
    return getattr(invoice, key, default)


def sync_bulk_order_paid_from_stripe_invoice(bulk_order, invoice):
    """
    If the Stripe invoice is paid, align BulkOrder and PaymentTransaction (idempotent).

    Used when the customer pays via hosted invoice URL before the webhook arrives, or from
    reminder handlers that re-fetch invoice state.

    Args:
        bulk_order: BulkOrder to update when invoice status is ``paid``.
        invoice: Stripe Invoice dict or object.

    Returns:
        None
    """
    if _stripe_inv_field(invoice, "status") != "paid":
        return
    if bulk_order.payment_status == "succeeded":
        return
    bulk_order.payment_status = "succeeded"
    payment_intent_id = _stripe_inv_field(invoice, "payment_intent")
    if isinstance(payment_intent_id, dict):
        payment_intent_id = payment_intent_id.get("id")
    if payment_intent_id:
        bulk_order.stripe_payment_intent_id = payment_intent_id
    bulk_order.save()
    pi_for_tx = payment_intent_id or _stripe_inv_field(invoice, "id")
    if not pi_for_tx:
        return
    if not PaymentTransaction.objects.filter(stripe_payment_intent_id=pi_for_tx).exists():
        PaymentTransaction.objects.create(
            booking=None,
            bulk_order=bulk_order,
            user=bulk_order.user,
            booking_reference=bulk_order.booking_reference,
            stripe_payment_intent_id=pi_for_tx,
            transaction_type="payment",
            amount=Decimal(str(_stripe_inv_field(invoice, "amount_paid", 0))) / 100,
            currency=_stripe_inv_field(invoice, "currency", "eur"),
            status="succeeded",
        )


class PaymentView(APIView):
    """
    Authenticated payment API routed by URL ``action`` (see ``action_handlers``).

    ``get`` and ``post`` look up ``kwargs['action']`` and delegate to the matching handler.
    Invalid actions return 400. Rate limits apply at the URL layer where configured.

    Actions:
        create_payment_sheet (POST) — Stripe Payment Sheet for a booking or bulk pay-now;
            zero-amount winner/gift/Quick Sparkle paths skip Stripe and book immediately.
        create_reschedule_fee_payment_sheet (POST) — PaymentIntent for late reschedule fee.
        create_gift_voucher_payment_sheet (POST) — PaymentIntent to purchase a gift voucher.
        create_bulk_order_invoice_later (POST) — BulkOrder + Stripe Invoice (email pay later).
        apply_winner_voucher (POST) — Validate winner code; return discount and amount due.
        apply_gift_voucher (POST) — Validate gift voucher code; return discount and amount due.
        get_bulk_invoice_checkout (GET) — Hosted invoice URL; sync paid status from Stripe.
        get_my_bulk_invoices (GET) — List bulk orders / invoices for the current user.
        get_invoice_later_eligibility (GET) — Whether the user may create an invoice-later bulk order.
        get_refund_status (GET) — RefundRecord list for a booking_reference.
        check_payment_status (GET) — PaymentTransaction or pending refund-by-slot status.
        confirm_payment_intent (POST) — Poll whether webhook created PaymentTransaction.
    """
    permission_classes = [IsAuthenticated]

    action_handlers = {
        'create_payment_sheet': 'create_payment_sheet',
        'create_reschedule_fee_payment_sheet': 'create_reschedule_fee_payment_sheet',
        'create_bulk_order_invoice_later': 'create_bulk_order_invoice_later',
        'get_refund_status': 'get_refund_status',
        'check_payment_status': 'check_payment_status',
        'confirm_payment_intent': 'confirm_payment_intent',
        'apply_winner_voucher': 'apply_winner_voucher',
        'apply_gift_voucher': 'apply_gift_voucher',
        'create_gift_voucher_payment_sheet': 'create_gift_voucher_payment_sheet',
        'get_bulk_invoice_checkout': 'get_bulk_invoice_checkout',
        'get_my_bulk_invoices': 'get_my_bulk_invoices',
        'get_invoice_later_eligibility': 'get_invoice_later_eligibility',
    }

    def get(self, request, *args, **kwargs):
        """
        Route GET requests by ``action`` URL segment.

        Args:
            request: DRF request; query/body params depend on the handler.
            kwargs: Must include ``action`` matching a key in ``action_handlers``.

        Returns:
            Response: Handler result, or 400 if action is unknown.
        """
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)
    
    def post(self, request, *args, **kwargs):
        """
        Route POST requests by ``action`` URL segment.

        Args:
            request: DRF request with JSON body per handler.
            kwargs: Must include ``action`` matching a key in ``action_handlers``.

        Returns:
            Response: Handler result, or 400 if action is unknown.
        """
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)

    def apply_winner_voucher(self, request):
        """
        Validate a winner discount code for the current user and return checkout amounts.

        Args:
            request.data: ``code``, ``pre_voucher_total_amount`` (required).

        Returns:
            Response: 200 with valid, voucher_type, discount_applied, amount_due, amount_due_cents;
                400 on missing fields, invalid code, expiry, or ineligible user.
        """
        code = request.data.get('code')
        pre_raw = request.data.get('pre_voucher_total_amount')
        if not code or pre_raw is None:
            return Response(
                {'error': 'code and pre_voucher_total_amount are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = request.user
        try:
            voucher = WinnerVoucher.objects.get(code=normalize_winner_code(code))
        except WinnerVoucher.DoesNotExist:
            return Response({'error': 'Invalid code'}, status=status.HTTP_400_BAD_REQUEST)
        validity_issue = winner_voucher_validity_issue(voucher)
        if validity_issue:
            return Response(
                {'error': winner_voucher_validity_user_message(validity_issue)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not voucher_eligible_for_checkout(voucher, user):
            return Response(
                {'error': 'This code cannot be used with your account'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pre = Decimal(str(pre_raw))
        discount = compute_winner_discount(voucher, pre)
        due = pre - discount
        if due < 0:
            due = Decimal('0')
        cents = amount_due_cents(pre, discount)
        return Response({
            'valid': True,
            'voucher_type': 'winner',
            'voucher_id': str(voucher.id),
            'credit_amount': float(voucher.credit_amount),
            'discount_applied': float(discount),
            'pre_voucher_total': float(pre),
            'amount_due': float(due),
            'amount_due_cents': cents,
        }, status=status.HTTP_200_OK)

    def apply_gift_voucher(self, request):
        """
        Validate a paid gift voucher code for the current user and return checkout amounts.

        Args:
            request.data: ``code``, ``pre_voucher_total_amount`` (required).

        Returns:
            Response: 200 with valid, voucher_type, discount_applied, amount_due, amount_due_cents;
                400 on missing fields, invalid code, expiry, or ineligible user.
        """
        code = request.data.get('code')
        pre_raw = request.data.get('pre_voucher_total_amount')
        if not code or pre_raw is None:
            return Response(
                {'error': 'code and pre_voucher_total_amount are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = request.user
        try:
            voucher = GiftVoucher.objects.get(code=normalize_winner_code(code))
        except GiftVoucher.DoesNotExist:
            return Response({'error': 'Invalid code'}, status=status.HTTP_400_BAD_REQUEST)
        validity_issue = gift_voucher_validity_issue(voucher)
        if validity_issue:
            return Response(
                {'error': gift_voucher_validity_user_message(validity_issue)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not gift_voucher_eligible_for_checkout(voucher, user):
            return Response(
                {'error': 'This code cannot be used with your account'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pre = Decimal(str(pre_raw))
        discount = compute_gift_discount(voucher, pre)
        due = pre - discount
        if due < 0:
            due = Decimal('0')
        cents = amount_due_cents(pre, discount)
        return Response({
            'valid': True,
            'voucher_type': 'gift',
            'voucher_id': str(voucher.id),
            'credit_amount': float(voucher.credit_amount),
            'discount_applied': float(discount),
            'pre_voucher_total': float(pre),
            'amount_due': float(due),
            'amount_due_cents': cents,
        }, status=status.HTTP_200_OK)

    def get_my_bulk_invoices(self, request):
        """
        List bulk orders / invoices for the authenticated user.

        Includes orders in invoice_later, succeeded, paid, failed, or cancelled states.

        Args:
            request: Authenticated user (no extra query params).

        Returns:
            Response: 200 with ``invoices`` serialized list; 400 on unexpected errors.
        """
        try:
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
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def get_invoice_later_eligibility(self, request):
        """
        Whether the current user may create a bulk order billed via invoice later.

        Fleet owners and branch admins need an active or trialing fleet subscription,
        and must not have an unpaid invoice older than 30 days. Partners are not gated.
        Pay-now bookings are never blocked by this check.
        """
        return Response(
            Fleet.invoice_later_eligibility_for_user(request.user),
            status=status.HTTP_200_OK,
        )

    def get_bulk_invoice_checkout(self, request):
        """
        Return Stripe hosted invoice URL for an unpaid fleet/partner bulk invoice.

        Syncs paid status from Stripe when the customer paid before the webhook (idempotent via
        ``sync_bulk_order_paid_from_stripe_invoice``). Access gated by ``_user_can_pay_bulk_invoice``.

        Args:
            request.query_params: ``bulk_order_id`` (required).

        Returns:
            Response: 200 with bulk_order_id, payment_status, hosted_invoice_url, amount_due_cents,
                already_paid; 400/403/404/502 on validation, access, missing order, or Stripe errors.
        """
        bulk_order_id = (request.query_params.get("bulk_order_id") or "").strip()
        if not bulk_order_id:
            return Response({"error": "bulk_order_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            bulk_order = BulkOrder.objects.select_related("user", "fleet").get(pk=bulk_order_id)
        except BulkOrder.DoesNotExist:
            return Response({"error": "Order not found"}, status=status.HTTP_404_NOT_FOUND)
        if not _user_can_pay_bulk_invoice(request.user, bulk_order):
            return Response({"error": "Access denied"}, status=status.HTTP_403_FORBIDDEN)
        if bulk_order.payment_status in ("cancelled", "failed"):
            return Response(
                {"error": "This order is not payable."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if bulk_order.payment_status == "succeeded":
            return Response(
                {
                    "bulk_order_id": str(bulk_order.id),
                    "booking_reference": bulk_order.booking_reference or "",
                    "number_of_vehicles": bulk_order.number_of_vehicles or 0,
                    "total_amount": float(bulk_order.total_amount or 0),
                    "currency": "eur",
                    "payment_status": bulk_order.payment_status,
                    "already_paid": True,
                    "hosted_invoice_url": None,
                    "invoice_status": "paid",
                    "amount_due_cents": 0,
                },
                status=status.HTTP_200_OK,
            )
        if not bulk_order.stripe_invoice_id:
            return Response(
                {"error": "No Stripe invoice is attached to this order."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            inv = stripe.Invoice.retrieve(bulk_order.stripe_invoice_id)
        except stripe.error.StripeError as e:
            return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)
        sync_bulk_order_paid_from_stripe_invoice(bulk_order, inv)
        bulk_order.refresh_from_db()
        hosted = _stripe_inv_field(inv, "hosted_invoice_url")
        amount_due = int(_stripe_inv_field(inv, "amount_due") or 0)
        inv_status = _stripe_inv_field(inv, "status")
        return Response(
            {
                "bulk_order_id": str(bulk_order.id),
                "booking_reference": bulk_order.booking_reference or "",
                "number_of_vehicles": bulk_order.number_of_vehicles or 0,
                "total_amount": float(bulk_order.total_amount or 0),
                "currency": _stripe_inv_field(inv, "currency") or "eur",
                "payment_status": bulk_order.payment_status,
                "already_paid": bulk_order.payment_status == "succeeded",
                "hosted_invoice_url": hosted,
                "invoice_status": inv_status,
                "amount_due_cents": amount_due,
            },
            status=status.HTTP_200_OK,
        )

    def create_payment_sheet(self, request):
        """
        Create a payment sheet for Stripe payment processing.

        Expects booking_data, optional booking_reference and detailer_booking_data.
        Amount can be in request or derived from booking_data.total_amount (converted to cents).

        - If amount is 0 and booking_data has applied_free_quick_sparkle for Prisma Quick Sparkle (normalized):
          validates free wash (loyalty/partner), creates PendingBooking with payment_status=succeeded,
          calls try_create_booking_on_detailer; if OK, create_booking_from_pending, assign_detailer,
          deletes pending, returns free_booking=True (no Stripe).
        - Otherwise: creates PendingBooking (expires 24h), builds detailer payload if not provided,
          creates Stripe PaymentIntent with metadata.pending_booking_id and booking_reference,
          returns paymentIntent client secret, ephemeralKey, customer, booking_reference.

        Branch admins: blocked if branch spend limit would be exceeded (403 BRANCH_SPEND_LIMIT_EXCEEDED).

        Args:
            request.data: booking_data (required), optional booking_reference, detailer_booking_data,
                amount (cents; derived from total_amount if omitted).

        Returns:
            Response: Payment Sheet fields (paymentIntent, ephemeralKey, customer, booking_reference),
                or free_booking payload; 400/403/500 on validation, slot conflict, or spend limit.
        """
        try:
            booking_data = request.data.get('booking_data')
            detailer_booking_data = request.data.get('detailer_booking_data')

            if not booking_data:
                return Response(
                    {'error': 'booking_data is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if not isinstance(booking_data, dict):
                return Response(
                    {'error': 'booking_data must be an object'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            booking_data = dict(booking_data)

            booking_reference = request.data.get('booking_reference')
            if not booking_reference:
                booking_reference = booking_data.get('booking_reference')
            if not booking_reference:
                booking_reference = f"APT{int(time.time() * 1000)}{str(uuid.uuid4())[:8].upper()}"

            user = User.objects.get(id=request.user.id)
            if getattr(user, "is_guest", False):
                from main.services.guest import sanitize_guest_booking_data

                # Guest wizard cannot opt into loyalty/complimentary/bulk; vouchers are allowed.
                booking_data = sanitize_guest_booking_data(booking_data)

            amount = request.data.get('amount', 0)
            if amount == 0:
                ta = booking_data.get('total_amount', 0)
                if ta:
                    amount = int(float(ta) * 100)

            if amount == 0:
                winner_vid = booking_data.get('winner_voucher_id')
                if winner_vid:
                    try:
                        validate_winner_voucher_for_payment(user, booking_data, 0)
                    except ValueError as e:
                        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
                    expires_at = timezone.now() + timedelta(hours=24)
                    pending_booking, duplicate_response = _create_pending_booking_idempotent(
                        booking_reference,
                        user,
                        booking_data,
                        detailer_booking_data or build_detailer_payload_from_booking_data(booking_data, user, booking_reference),
                        expires_at,
                    )
                    if duplicate_response is not None:
                        return duplicate_response
                    success, result = try_create_booking_on_detailer(pending_booking)
                    if not success:
                        pending_booking.delete()
                        return Response({
                            'error': 'This time slot is no longer available. Please choose another.',
                            'detail': result,
                        }, status=status.HTTP_400_BAD_REQUEST)
                    with transaction.atomic():
                        booking = create_booking_from_pending(pending_booking)
                        redeem_winner_voucher_for_booking(str(winner_vid), user, booking)
                    if result and isinstance(result, list):
                        try:
                            assign_detailers_to_booking(booking, result)
                        except Exception:
                            logger.exception(
                                "Failed to assign detailers after winner-voucher booking %s",
                                booking_reference,
                            )
                    pending_booking.delete()
                    return Response({
                        'free_booking': True,
                        'booking_reference': booking_reference,
                        'success': True,
                        'appointment_id': str(booking.id),
                    }, status=status.HTTP_200_OK)

                gift_vid = booking_data.get('gift_voucher_id')
                if gift_vid:
                    try:
                        validate_gift_voucher_for_payment(user, booking_data, 0)
                    except ValueError as e:
                        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
                    expires_at = timezone.now() + timedelta(hours=24)
                    pending_booking, duplicate_response = _create_pending_booking_idempotent(
                        booking_reference,
                        user,
                        booking_data,
                        detailer_booking_data or build_detailer_payload_from_booking_data(booking_data, user, booking_reference),
                        expires_at,
                    )
                    if duplicate_response is not None:
                        return duplicate_response
                    success, result = try_create_booking_on_detailer(pending_booking)
                    if not success:
                        pending_booking.delete()
                        return Response({
                            'error': 'This time slot is no longer available. Please choose another.',
                            'detail': result,
                        }, status=status.HTTP_400_BAD_REQUEST)
                    with transaction.atomic():
                        booking = create_booking_from_pending(pending_booking)
                        redeem_gift_voucher_for_booking(str(gift_vid), user, booking)
                    if result and isinstance(result, list):
                        try:
                            assign_detailers_to_booking(booking, result)
                        except Exception:
                            logger.exception(
                                "Failed to assign detailers after gift-voucher booking %s",
                                booking_reference,
                            )
                    pending_booking.delete()
                    return Response({
                        'free_booking': True,
                        'booking_reference': booking_reference,
                        'success': True,
                        'appointment_id': str(booking.id),
                    }, status=status.HTTP_200_OK)

                applied_free = booking_data.get('applied_free_quick_sparkle', False)
                total_amount_chk = booking_data.get('total_amount', 0)
                if applied_free and (total_amount_chk == 0 or total_amount_chk == 0.0):
                    service_type_data = booking_data.get('service_type', {})
                    service_name = service_type_data.get('name', '') if isinstance(service_type_data, dict) else ''
                    if is_quick_sparkle_service_name(service_name):
                        err_cq = validate_complimentary_choice(user, booking_data)
                        if err_cq:
                            return Response({'error': err_cq}, status=status.HTTP_400_BAD_REQUEST)
                        err_fin = validate_booking_financials(user, booking_data)
                        if err_fin:
                            return Response({'error': err_fin}, status=status.HTTP_400_BAD_REQUEST)
                        expires_at = timezone.now() + timedelta(hours=24)
                        pending_booking, duplicate_response = _create_pending_booking_idempotent(
                            booking_reference,
                            user,
                            booking_data,
                            detailer_booking_data or build_detailer_payload_from_booking_data(booking_data, user, booking_reference),
                            expires_at,
                        )
                        if duplicate_response is not None:
                            return duplicate_response
                        success, result = try_create_booking_on_detailer(pending_booking)
                        if not success:
                            pending_booking.delete()
                            return Response({
                                'error': 'This time slot is no longer available. Please choose another.',
                                'detail': result,
                            }, status=status.HTTP_400_BAD_REQUEST)
                        booking = create_booking_from_pending(pending_booking)
                        if result and isinstance(result, list):
                            try:
                                assign_detailers_to_booking(booking, result)
                            except Exception:
                                logger.exception(
                                    "Failed to assign detailers after complimentary booking %s",
                                    booking_reference,
                                )
                        pending_booking.delete()
                        return Response({
                            'free_booking': True,
                            'booking_reference': booking_reference,
                            'success': True,
                            'appointment_id': str(booking.id),
                        }, status=status.HTTP_200_OK)

                return Response(
                    {'error': 'Amount is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Get country for currency setup
            try:
                # Try to get address from booking data or user's addresses
                address_id = None
                if booking_data and isinstance(booking_data, dict):
                    address_id = booking_data.get('address', {}).get('id') if isinstance(booking_data.get('address'), dict) else booking_data.get('address_id')
                if address_id:
                    # Try to get Address by ID first (for regular addresses)
                    try:
                        address = Address.objects.get(id=address_id)
                        country = address.country
                    except (Address.DoesNotExist, ValueError):
                        # If not found, check if it's a branch ID (UUID)
                        try:
                            branch_uuid = uuid.UUID(str(address_id))
                            branch = Branch.objects.get(id=branch_uuid)
                            country = branch.country or 'Ireland'
                        except (Branch.DoesNotExist, ValueError, TypeError):
                            # Fall back to default
                            country = 'Ireland'
                else:
                    address = Address.objects.filter(user=request.user).first()
                    if address:
                        country = address.country
                    else:
                        country = 'Ireland'
            except Exception:
                country = 'Ireland'

            # Set currency based on country
            if country == 'United Kingdom':
                currency = 'gbp'
                merchant_country_code = 'GB'
            else:
                currency = 'eur'
                merchant_country_code = 'IE'

            try:
                err_cq = validate_complimentary_choice(user, booking_data)
                if err_cq:
                    return Response({'error': err_cq}, status=status.HTTP_400_BAD_REQUEST)
                err_fin = validate_booking_financials(user, booking_data)
                if err_fin:
                    return Response({'error': err_fin}, status=status.HTTP_400_BAD_REQUEST)
                if isinstance(booking_data, dict) and booking_data.get('is_bulk') is True:
                    payable, _applied = expected_bulk_payable_from_booking_data(user, booking_data)
                    expected_cents = int((payable * Decimal("100")).quantize(Decimal("1")))
                    if abs(int(amount) - expected_cents) > 2:
                        return Response(
                            {'error': 'Payment amount does not match the balance due. Refresh and try again.'},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                validate_winner_voucher_for_payment(user, booking_data, int(amount))
                validate_gift_voucher_for_payment(user, booking_data, int(amount))
            except ValueError as e:
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

            # Branch spend leash: block branch admins over limit before creating PaymentIntent
            if user.is_branch_admin:
                branch = user.get_managed_branch()
                if branch:
                    limit = branch.spend_limit
                    if limit is not None and limit > 0:
                        period = branch.spend_limit_period or 'monthly'
                        spent = get_branch_spend_for_period(branch, period)
                        amount_for_booking = Decimal(amount) / 100  # cents -> same unit as spend_limit
                        if spent + amount_for_booking > limit:
                            return Response(
                                {
                                    'error': 'Branch spending limit exceeded for this period.',
                                    'code': 'BRANCH_SPEND_LIMIT_EXCEEDED',
                                },
                                status=status.HTTP_403_FORBIDDEN,
                            )
            
            # Create pending booking (expires in 24 hours). Bulk bookings don't use single-job detailer payload.
            is_bulk = isinstance(booking_data, dict) and booking_data.get('is_bulk') is True
            detailer_payload = None
            if not is_bulk:
                detailer_payload = detailer_booking_data or build_detailer_payload_from_booking_data(booking_data, user, booking_reference)
            expires_at = timezone.now() + timedelta(hours=24)
            pending_booking = PendingBooking.objects.create(
                booking_reference=booking_reference,
                user=user,
                booking_data=booking_data,
                detailer_booking_data=detailer_payload,
                payment_status='pending',
                expires_at=expires_at
            )
            
            # Get or create Stripe customer
            if hasattr(user, 'stripe_customer_id') and user.stripe_customer_id:
                customer = stripe.Customer.retrieve(user.stripe_customer_id)
            else:
                customer = stripe.Customer.create(
                    email=user.email,
                    name=user.name,
                    metadata={
                        'user_id': str(user.id),
                    }
                )
                if hasattr(user, 'stripe_customer_id'):
                    user.stripe_customer_id = customer.id
                    user.save()
            
            # Create payment intent with pending booking reference in metadata
            # Prepare payment intent metadata
            payment_intent_metadata = {
                'user_id': str(user.id),
                'booking_reference': booking_reference,
            }
            
            if pending_booking:
                payment_intent_metadata['pending_booking_id'] = str(pending_booking.id)
            
            payment_intent = stripe.PaymentIntent.create(
                amount=amount,
                currency=currency,
                customer=customer.id,
                receipt_email=user.email,
                automatic_payment_methods={
                    'enabled': True,
                },
                # Guests do not save cards; omit setup_future_usage so Stripe does not
                # attach the payment method for off-session reuse.
                **({} if getattr(user, 'is_guest', False) else {'setup_future_usage': 'off_session'}),
                metadata=payment_intent_metadata
            )
            
            if pending_booking:
                pending_booking.stripe_payment_intent_id = payment_intent.id
                pending_booking.payment_status = 'processing'
                pending_booking.save()
            
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
                'booking_reference': booking_reference,
            }, status=status.HTTP_200_OK)

        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def create_gift_voucher_payment_sheet(self, request):
        """
        Create Stripe PaymentIntent for purchasing a gift voucher.

        Creates a pending GiftVoucher row; webhook ``payment_intent.succeeded`` with
        metadata.type=gift_voucher fulfills code, validity, PaymentTransaction, and email.

        Args:
            request.data: recipient_email, credit_amount, validity_days (30–60).

        Returns:
            Response: paymentIntent client secret, ephemeralKey, customer, giftVoucherId; 400/502 on validation or Stripe errors.
        """
        email_re = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
        try:
            email_raw = (
                request.data.get('recipient_email') or request.data.get('assigned_email') or ''
            ).strip()
            credit_raw = request.data.get('credit_amount')
            validity_days_raw = request.data.get('validity_days')
            if not email_raw or not email_re.match(email_raw):
                return Response(
                    {'error': 'valid recipient_email is required'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                credit = Decimal(str(credit_raw))
            except (InvalidOperation, TypeError, ValueError):
                credit = Decimal('-1')
            if credit <= 0:
                return Response(
                    {'error': 'credit_amount must be a positive decimal'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            amount_error = gift_purchase_amount_error(credit)
            if amount_error:
                return Response(
                    {'error': amount_error},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            amount_cents = int(
                (credit * Decimal('100')).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
            )

            try:
                v_int = int(validity_days_raw)
            except (TypeError, ValueError):
                return Response(
                    {'error': 'validity_days must be an integer between 30 and 60'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if v_int < 30 or v_int > 60:
                return Response(
                    {'error': 'validity_days must be between 30 and 60 inclusive'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user = User.objects.get(id=request.user.id)
            try:
                addr = Address.objects.filter(user=user).first()
                country = addr.country if addr else 'Ireland'
            except Exception:
                country = 'Ireland'
            if country == 'United Kingdom':
                currency = 'gbp'
                merchant_country_code = 'GB'
            else:
                currency = 'eur'
                merchant_country_code = 'IE'

            voucher = GiftVoucher.objects.create(
                assigned_email=email_raw,
                purchased_by=user,
                credit_amount=credit,
                validity_days=v_int,
                purchase_currency=currency,
            )

            if hasattr(user, 'stripe_customer_id') and user.stripe_customer_id:
                customer = stripe.Customer.retrieve(user.stripe_customer_id)
            else:
                customer = stripe.Customer.create(
                    email=user.email,
                    name=user.name,
                    metadata={'user_id': str(user.id)},
                )
                if hasattr(user, 'stripe_customer_id'):
                    user.stripe_customer_id = customer.id
                    user.save()

            try:
                payment_intent = stripe.PaymentIntent.create(
                    amount=amount_cents,
                    currency=currency,
                    customer=customer.id,
                    receipt_email=user.email,
                    automatic_payment_methods={'enabled': True},
                    setup_future_usage='off_session',
                    metadata={
                        'type': 'gift_voucher',
                        'gift_voucher_id': str(voucher.id),
                        'user_id': str(user.id),
                    },
                    description=f'Gift voucher for {email_raw}',
                )
            except stripe.error.StripeError:
                voucher.delete()
                raise

            voucher.stripe_payment_intent_id = payment_intent.id
            voucher.save(update_fields=['stripe_payment_intent_id', 'updated_at'])

            ephemeral_key = stripe.EphemeralKey.create(
                customer=customer.id,
                stripe_version='2022-11-15',
            )

            return Response({
                'paymentIntent': payment_intent.client_secret,
                'paymentIntentId': payment_intent.id,
                'ephemeralKey': ephemeral_key.secret,
                'customer': customer.id,
                'giftVoucherId': str(voucher.id),
                'publishableKey': getattr(settings, 'STRIPE_PUBLISHABLE_KEY', '') or '',
                'merchantCountryCode': merchant_country_code,
                'currency': currency,
            }, status=status.HTTP_200_OK)

        except stripe.error.StripeError as e:
            return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def create_reschedule_fee_payment_sheet(self, request):
        """
        Payment sheet for late reschedule (less than 12 hours before appointment start).

        Creates a PaymentIntent with metadata.type=reschedule_fee; webhook verifies amount,
        records PaymentTransaction, and applies the new slot via EventsView validation.

        Args:
            request.data: booking_reference, new_date, new_time (required).

        Returns:
            Response: paymentIntent client secret and fee_amount_cents; 400 if no fee required,
                slot invalid, or bulk booking; 404 if booking not found.
        """
        from main.views.events import EventsView

        try:
            booking_reference = (request.data.get('booking_reference') or '').strip()
            new_date = (request.data.get('new_date') or '').strip()
            new_time = (request.data.get('new_time') or '').strip()
            if not booking_reference or not new_date or not new_time:
                return Response(
                    {'error': 'booking_reference, new_date, and new_time are required'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                booking = BookedAppointment.objects.get(
                    booking_reference=booking_reference,
                    user=request.user,
                )
            except BookedAppointment.DoesNotExist:
                return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)

            if booking.bulk_order_id:
                return Response(
                    {'error': 'Bulk bookings must be rescheduled using the fleet flow.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if booking.status in ('completed', 'cancelled', 'in_progress'):
                return Response(
                    {'error': 'This booking cannot be rescheduled'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            events = EventsView()
            valid, err_msg = events._validate_reschedule_slot(booking, new_date, new_time)
            if not valid:
                return Response(
                    {'error': err_msg or 'Selected time is no longer available'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            now = timezone.now()
            try:
                apt_dt = datetime.combine(
                    booking.appointment_date,
                    booking.start_time or datetime.min.time(),
                )
                apt_dt = timezone.make_aware(apt_dt)
                hours_until = (apt_dt - now).total_seconds() / 3600
            except Exception:
                hours_until = 999.0

            if hours_until >= 12:
                return Response(
                    {
                        'error': 'No late fee is required for this reschedule. Use standard reschedule.',
                        'code': 'RESCHEDULE_NO_FEE_REQUIRED',
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            fee_cents = int(getattr(settings, 'RESCHEDULE_FEE_CENTS', 1000))
            if fee_cents <= 0:
                return Response({'error': 'Reschedule fee is not configured'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            try:
                address = booking.address
                if address and (address.country or '').strip() == 'United Kingdom':
                    currency = 'gbp'
                else:
                    currency = 'eur'
            except Exception:
                currency = 'eur'

            user = User.objects.get(id=request.user.id)
            if hasattr(user, 'stripe_customer_id') and user.stripe_customer_id:
                customer = stripe.Customer.retrieve(user.stripe_customer_id)
            else:
                customer = stripe.Customer.create(
                    email=user.email,
                    name=user.name,
                    metadata={'user_id': str(user.id)},
                )
                if hasattr(user, 'stripe_customer_id'):
                    user.stripe_customer_id = customer.id
                    user.save()

            nt_short = new_time[:5] if len(new_time) >= 5 else new_time
            payment_intent = stripe.PaymentIntent.create(
                amount=fee_cents,
                currency=currency,
                customer=customer.id,
                receipt_email=user.email,
                automatic_payment_methods={'enabled': True},
                setup_future_usage='off_session',
                metadata={
                    'type': 'reschedule_fee',
                    'user_id': str(user.id),
                    'booking_reference': booking_reference,
                    'new_date': new_date[:10],
                    'new_time': nt_short,
                },
            )

            ephemeral_key = stripe.EphemeralKey.create(
                customer=customer.id,
                stripe_version='2022-11-15',
            )

            return Response({
                'paymentIntent': payment_intent.client_secret,
                'paymentIntentId': payment_intent.id,
                'ephemeralKey': ephemeral_key.secret,
                'customer': customer.id,
                'booking_reference': booking_reference,
                'fee_amount_cents': fee_cents,
                'currency': currency,
            }, status=status.HTTP_200_OK)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception('create_reschedule_fee_payment_sheet failed')
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def create_bulk_order_invoice_later(self, request):
        """
        Create a bulk order billed via Stripe Invoice (pay later) and notify the detailer app.

        Creates BulkOrder appointments, POSTs create_bulk_booking to crew first, then
        finalizes and emails a Stripe Invoice. Crew failure returns 409 (local rows deleted).
        Invoice failure after crew success cancels local rows and crew jobs (502).
        Branch spend limits apply for admins.

        Args:
            request.data: booking_data (or root body), optional booking_reference.

        Returns:
            Response: 201 with success, booking_reference, bulk_order_id; 403 spend limit,
                missing fleet subscription, or overdue invoice; 409 if crew create fails;
                502 if Stripe invoice fails after crew success.
        """
        try:
            booking_data = request.data.get('booking_data') or request.data
            if not booking_data or not isinstance(booking_data, dict):
                return Response({'error': 'booking_data is required'}, status=status.HTTP_400_BAD_REQUEST)
            booking_reference = (request.data.get('booking_reference') or
                                 booking_data.get('booking_reference') or
                                 f"BULK{int(time.time() * 1000)}{str(uuid.uuid4())[:8].upper()}")
            user = User.objects.get(id=request.user.id)
            booking_data = dict(booking_data)
            err_fin = validate_bulk_booking_financials(user, booking_data)
            if err_fin:
                return Response({'error': err_fin}, status=status.HTTP_400_BAD_REQUEST)
            try:
                payable, complimentary_applied = expected_bulk_payable_from_booking_data(user, booking_data)
                gross_total = expected_bulk_total_from_booking_data(user, booking_data)
            except ValueError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            except Exception:
                return Response(
                    {'error': 'Could not validate booking price. Refresh and try again.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            total_amount = payable
            booking_data['total_amount'] = float(total_amount)
            booking_data['complimentary_vehicles_applied'] = complimentary_applied
            booking_data['complimentary_credit'] = float(gross_total - payable)

            if total_amount > 0:
                eligibility = Fleet.invoice_later_eligibility_for_user(user)
                if not eligibility.get('allowed'):
                    return Response(
                        {
                            'error': eligibility.get('message') or 'Invoice later is not available.',
                            'code': eligibility.get('code'),
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )
            discount_applied = Decimal(str(booking_data.get('discount_applied', 0) or 0))
            number_of_vehicles = int(booking_data.get('number_of_vehicles', 0))
            address_id = (booking_data.get('address') or {}).get('id') if isinstance(booking_data.get('address'), dict) else booking_data.get('address_id')
            address_obj = None
            branch_obj = None
            fleet_obj = None
            if user.is_branch_admin:
                branch_obj = user.get_managed_branch()
                fleet_obj = branch_obj.fleet if branch_obj else None
            if address_id:
                try:
                    address_obj = Address.objects.get(id=address_id)
                except (Address.DoesNotExist, ValueError):
                    try:
                        branch = Branch.objects.get(id=uuid.UUID(str(address_id)))
                        branch_obj = branch if not branch_obj else branch_obj
                        fleet_obj = branch.fleet if branch_obj else fleet_obj
                        address_obj, _ = Address.objects.get_or_create(
                            user=user,
                            address=branch.address or '',
                            post_code=branch.postcode or '',
                            city=branch.city or '',
                            country=branch.country or '',
                            defaults={'latitude': branch.latitude, 'longitude': branch.longitude},
                        )
                    except (Branch.DoesNotExist, ValueError, TypeError):
                        pass
            if user.is_fleet_owner and not fleet_obj and hasattr(user, 'owned_fleets'):
                fleet_obj = user.owned_fleets.first()
            # Branch spend limit: block before creating invoice
            if user.is_branch_admin and total_amount > 0:
                branch = user.get_managed_branch()
                if branch and branch.spend_limit is not None and branch.spend_limit > 0:
                    period = branch.spend_limit_period or 'monthly'
                    spent = get_branch_spend_for_period(branch, period)
                    if spent + total_amount > branch.spend_limit:
                        return Response(
                            {
                                'error': 'Branch spending limit exceeded for this period.',
                                'code': 'BRANCH_SPEND_LIMIT_EXCEEDED',
                            },
                            status=status.HTTP_403_FORBIDDEN,
                        )

            bulk_order = BulkOrder.objects.create(
                booking_reference=booking_reference,
                user=user,
                branch=branch_obj,
                fleet=fleet_obj,
                address=address_obj,
                payment_status='invoice_later',
                total_amount=total_amount,
                discount_applied=discount_applied,
                number_of_vehicles=number_of_vehicles,
                order_data=booking_data,
            )
            try:
                create_bulk_appointments(bulk_order)
            except Exception:
                logger.exception(
                    "create_bulk_appointments failed for invoice-later %s",
                    booking_reference,
                )
                bulk_order.delete()
                return Response(
                    {'error': 'Could not create appointments for this order. Please try again.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            success, assigned = try_create_bulk_booking_on_detailer(bulk_order)
            if not success:
                BookedAppointment.objects.filter(bulk_order=bulk_order).delete()
                bulk_order.delete()
                return Response(
                    {
                        'error': 'This time slot is no longer available. Please choose another.',
                        'detail': assigned,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            if assigned:
                bulk_order.assigned_detailers = assigned
                bulk_order.save(update_fields=['assigned_detailers'])
                for apt in BookedAppointment.objects.filter(bulk_order=bulk_order):
                    try:
                        assign_detailers_to_booking(apt, assigned)
                    except Exception:
                        logger.exception(
                            "Failed to assign detailers on invoice-later appointment %s",
                            apt.booking_reference,
                        )
            invoice = None
            try:
                country = 'Ireland'
                if bulk_order.address:
                    country = bulk_order.address.country or 'Ireland'
                elif bulk_order.order_data:
                    addr = bulk_order.order_data.get('address')
                    if isinstance(addr, dict):
                        country = addr.get('country', 'Ireland')
                    else:
                        country = (bulk_order.order_data.get('country') or 'Ireland')
                currency = 'gbp' if country == 'United Kingdom' else 'eur'

                if float(bulk_order.total_amount) <= 0:
                    record_bulk_complimentary_usage(user, booking_data, bulk_order)
                    bulk_order.payment_status = 'succeeded'
                    bulk_order.save(update_fields=['payment_status'])
                    return Response({
                        'success': True,
                        'booking_reference': bulk_order.booking_reference,
                        'bulk_order_id': bulk_order.id,
                        'message': 'Complimentary Quick Sparkles cover this order. No payment is due.',
                        'is_complimentary': True,
                    }, status=status.HTTP_201_CREATED)

                if hasattr(user, 'stripe_customer_id') and user.stripe_customer_id:
                    customer = stripe.Customer.retrieve(user.stripe_customer_id)
                else:
                    customer = stripe.Customer.create(
                        email=user.email,
                        name=user.name,
                        metadata={'user_id': str(user.id)},
                    )
                    if hasattr(user, 'stripe_customer_id'):
                        user.stripe_customer_id = customer.id
                        user.save()
                amount_cents = int(float(bulk_order.total_amount) * 100)
                if amount_cents <= 0:
                    _rollback_invoice_later_after_crew(bulk_order)
                    return Response({'error': 'Invalid amount'}, status=status.HTTP_400_BAD_REQUEST)
                invoice = stripe.Invoice.create(
                    customer=customer.id,
                    collection_method='send_invoice',
                    days_until_due=30,
                    metadata={
                        'bulk_order_id': str(bulk_order.id),
                        'booking_reference': bulk_order.booking_reference,
                        'user_id': str(user.id),
                    },
                )
                stripe.InvoiceItem.create(
                    customer=customer.id,
                    invoice=invoice.id,
                    amount=amount_cents,
                    currency=currency,
                    description=f"Bulk detail – {bulk_order.number_of_vehicles} vehicles",
                )
                stripe.Invoice.finalize_invoice(invoice.id)
                stripe.Invoice.send_invoice(invoice.id)
                bulk_order.stripe_invoice_id = invoice.id
                bulk_order.save(update_fields=['stripe_invoice_id'])
                record_bulk_complimentary_usage(user, booking_data, bulk_order)
            except stripe.StripeError as e:
                _rollback_invoice_later_after_crew(bulk_order, invoice=invoice)
                return Response(
                    {'error': f'Invoice could not be sent: {str(e)}'},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            return Response({
                'success': True,
                'booking_reference': bulk_order.booking_reference,
                'bulk_order_id': bulk_order.id,
                'message': 'Invoice has been sent to your email; you can pay when ready.',
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def get_refund_status(self, request):
        """
        List refund records for a booking (support / dispute resolution).

        Args:
            request.data or query: booking_reference.

        Returns:
            Response: 200 with booking_reference and refunds list; 404 if booking not found.
        """
        try:
            booking_reference = request.data.get('booking_reference')
            booking = BookedAppointment.objects.get(booking_reference=booking_reference)
            
            refunds = RefundRecord.objects.filter(booking=booking).order_by('-created_at')
            
            refund_data = []
            for refund in refunds:
                refund_data.append({
                    'id': refund.id,
                    'requested_amount': float(refund.requested_amount),
                    'status': refund.status,
                    'stripe_refund_id': refund.stripe_refund_id,
                    'failure_reason': refund.failure_reason,
                    'admin_notes': refund.admin_notes,
                    'dispute_resolved': refund.dispute_resolved,
                    'created_at': refund.created_at,
                    'processed_at': refund.processed_at
                })
            
            return Response({
                'booking_reference': booking_reference,
                'refunds': refund_data
            }, status=status.HTTP_200_OK)
            
        except BookedAppointment.DoesNotExist:
            return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


############################

    def confirm_payment_intent(self, request):
        """
        Poll whether a PaymentIntent was fulfilled by the Stripe webhook.

        Works for bookings, bulk orders, fleet/B2C subscriptions, gift vouchers, and
        reschedule_fee transactions (any succeeded PaymentTransaction with this intent id).
        Also reports refunded_slot_unavailable when detailer rejected the slot after charge.

        Args:
            request.data: payment_intent_id (required).

        Returns:
            Response: confirmed True/False, transaction_type when confirmed, or slot refund status.
        """
        try:
            payment_intent_id = request.data.get('payment_intent_id')
            if not payment_intent_id:
                return Response({'error': 'payment_intent_id is required'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Check if PaymentTransaction exists for this payment intent
            payment_transaction = PaymentTransaction.objects.filter(
                stripe_payment_intent_id=payment_intent_id,
                status='succeeded'
            ).first()
            
            if payment_transaction:
                booking = payment_transaction.booking
                bulk_order = payment_transaction.bulk_order
                if booking and booking.status == 'cancelled':
                    refunded_pending = PendingBooking.objects.filter(
                        stripe_payment_intent_id=payment_intent_id,
                        slot_conflict_refunded_at__isnull=False,
                    ).first()
                    if refunded_pending:
                        return Response({
                            'confirmed': False,
                            'payment_intent_id': payment_intent_id,
                            'status': 'refunded_slot_unavailable',
                            'message': 'This time slot was no longer available. Your payment has been refunded. Please choose another slot.',
                        }, status=status.HTTP_200_OK)
                if bulk_order and getattr(bulk_order, 'payment_status', None) == 'cancelled':
                    refunded_pending = PendingBooking.objects.filter(
                        stripe_payment_intent_id=payment_intent_id,
                        slot_conflict_refunded_at__isnull=False,
                    ).first()
                    if refunded_pending:
                        return Response({
                            'confirmed': False,
                            'payment_intent_id': payment_intent_id,
                            'status': 'refunded_slot_unavailable',
                            'message': 'This time slot was no longer available. Your payment has been refunded. Please choose another slot.',
                        }, status=status.HTTP_200_OK)
                needs_assignment = bool(booking or bulk_order)
                assigned = False
                if booking and isinstance(booking.assigned_detailers, list) and booking.assigned_detailers:
                    assigned = True
                if bulk_order and isinstance(bulk_order.assigned_detailers, list) and bulk_order.assigned_detailers:
                    assigned = True
                if not needs_assignment:
                    assigned = True
                return Response({
                    'confirmed': True,
                    'assigned': assigned,
                    'assigning': needs_assignment and not assigned,
                    'payment_intent_id': payment_intent_id,
                    'transaction_id': str(payment_transaction.id),
                    'booking_reference': payment_transaction.booking_reference,
                    'transaction_type': payment_transaction.transaction_type,
                }, status=status.HTTP_200_OK)
            # Check if payment was refunded due to slot conflict
            pending = PendingBooking.objects.filter(
                stripe_payment_intent_id=payment_intent_id,
                slot_conflict_refunded_at__isnull=False,
            ).first()
            if pending:
                return Response({
                    'confirmed': False,
                    'payment_intent_id': payment_intent_id,
                    'status': 'refunded_slot_unavailable',
                    'message': 'This time slot was no longer available. Your payment has been refunded. Please choose another slot.',
                }, status=status.HTTP_200_OK)
            return Response({
                'confirmed': False,
                'payment_intent_id': payment_intent_id,
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    def check_payment_status(self, request):
        """
        Check payment status by payment_intent_id or booking_reference (debugging / client poll).

        Args:
            request.data: payment_intent_id and/or booking_reference (one required).

        Returns:
            Response: has_payment, payment_status, amount; or refunded_slot_unavailable for
                pending bookings refunded after slot conflict; 404 if booking not found.
        """
        try:
            booking_reference = request.data.get('booking_reference')
            payment_intent_id = request.data.get('payment_intent_id')
            
            # If payment_intent_id is provided, check by that first (works before booking exists)
            if payment_intent_id:
                payment_transaction = PaymentTransaction.objects.filter(
                    stripe_payment_intent_id=payment_intent_id,
                    transaction_type='payment'
                ).first()
                
                if payment_transaction:
                    return Response({
                        'payment_intent_id': payment_intent_id,
                        'has_payment': payment_transaction.status == 'succeeded',
                        'payment_status': payment_transaction.status,
                        'amount': float(payment_transaction.amount),
                        'currency': payment_transaction.currency,
                        'transaction_id': str(payment_transaction.id),
                    }, status=status.HTTP_200_OK)
                # Check if payment was refunded due to slot conflict
                pending = PendingBooking.objects.filter(
                    stripe_payment_intent_id=payment_intent_id,
                    slot_conflict_refunded_at__isnull=False,
                ).first()
                if pending:
                    return Response({
                        'payment_intent_id': payment_intent_id,
                        'status': 'refunded_slot_unavailable',
                        'message': 'This time slot was no longer available. Your payment has been refunded. Please choose another slot.',
                    }, status=status.HTTP_200_OK)
                return Response({
                    'payment_intent_id': payment_intent_id,
                    'has_payment': False,
                    'payment_status': 'not_found',
                }, status=status.HTTP_200_OK)
            
            # Fall back to booking_reference lookup
            if not booking_reference:
                return Response({'error': 'booking_reference or payment_intent_id is required'}, status=status.HTTP_400_BAD_REQUEST)
            
            booking = BookedAppointment.objects.get(booking_reference=booking_reference)
            
            # Check for payment transactions
            payment_transactions = PaymentTransaction.objects.filter(
                booking=booking,
                transaction_type='payment'
            ).order_by('-created_at')
            
            payment_data = []
            for transaction in payment_transactions:
                payment_data.append({
                    'id': transaction.id,
                    'stripe_payment_intent_id': transaction.stripe_payment_intent_id,
                    'amount': float(transaction.amount),
                    'currency': transaction.currency,
                    'status': transaction.status,
                    'created_at': transaction.created_at,
                    'processed_at': transaction.processed_at
                })
            
            return Response({
                'booking_reference': booking_reference,
                'booking_id': booking.id,
                'booking_total_amount': float(booking.total_amount),
                'has_payment': payment_transactions.filter(status='succeeded').exists(),
                'payment_transactions': payment_data,
                'successful_payments': payment_transactions.filter(status='succeeded').count()
            }, status=status.HTTP_200_OK)
            
        except BookedAppointment.DoesNotExist:
            return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@method_decorator(
    ratelimit(key="ip", rate="300/m", method="POST", block=rate_limit_json_response),
    name="post",
)
class StripeWebhookView(APIView):
    """
    Handles Stripe webhook events (POST). Used for payment_intent.succeeded and payment_failed.

    payment_intent.succeeded:
        - Resolves PendingBooking from metadata.pending_booking_id.
        - Creates the client appointment / BulkOrder and PaymentTransaction, then returns 200.
        - Crew job create runs in Celery (``fulfill_paid_booking_on_detailer``); slot failure
          refunds and cancels the appointment.
        - Other metadata types: fleet subscription (handled in separate methods). Deprecated
          vin_lookup intents are acknowledged without side effects.

    payment_intent.payment_failed:
        - Can mark pending booking as failed (see implementation in post()).

    Webhook URL must end with / when APPEND_SLASH=True (e.g. /api/v1/payment/stripe-webhook/).
    """
    permission_classes = [AllowAny]
    
    def post(self, request, *args, **kwargs):
        """
        Verify Stripe signature, parse event, and dispatch by ``event['type']``.

        Major branches: payment_intent.succeeded/failed, invoice.payment_succeeded/failed/upcoming/
        will_be_due/overdue/sent, customer.subscription.*, charge.*, refund.failed,
        charge.dispute.created. Unrecognized types return 200 with event_type for ack only.

        Args:
            request: Raw body required for signature verification; HTTP_STRIPE_SIGNATURE header.

        Returns:
            Response: 200 on handled/ignored events, 400 on bad signature/payload, 500 on unexpected errors.
        """
        try:
            # Raw body must not be parsed JSON before construct_event (signature bytes).
            payload = request.body
            
            # Get the Stripe signature from headers
            sig_header = request.META.get('HTTP_STRIPE_SIGNATURE')
            
            # Get webhook secret from settings
            webhook_secret = settings.STRIPE_WEBHOOK_SECRET
            
            # Require signature verification: do not process without secret and signature
            if not webhook_secret or not sig_header:
                return Response(
                    {'error': 'Webhook secret or signature missing'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            try:
                event = stripe.Webhook.construct_event(
                    payload, sig_header, webhook_secret
                )
            except stripe.error.SignatureVerificationError as e:
                return Response({'error': 'Invalid signature'}, status=status.HTTP_400_BAD_REQUEST)

            # stripe-python returns StripeObject; .get() is not dict.get (AttributeError: 'get').
            if hasattr(event, 'to_dict'):
                event = event.to_dict()

            event_type = event.get('type')

            # --- payment_intent.succeeded: bookings, bulk, subscriptions, gift voucher, reschedule ---
            if event_type == 'payment_intent.succeeded':
                payment_intent = event['data']['object']
                metadata = payment_intent.get('metadata', {})
                
                try:
                    # Legacy vin_lookup product — acknowledge without side effects (idempotent).
                    transaction_type = metadata.get('transaction_type')
                    if transaction_type == 'vin_lookup':
                        logger.info(
                            'stripe webhook: ignoring deprecated vin_lookup payment_intent %s',
                            payment_intent.get('id'),
                        )
                        return Response(
                            {'status': 'ignored_deprecated_vin_lookup'},
                            status=status.HTTP_200_OK,
                        )

                    # Fleet subscription first payment / renewal (metadata.type=fleet_subscription).
                    if metadata.get('type') == 'fleet_subscription':
                        return self._handle_fleet_subscription_payment_intent(payment_intent, metadata)

                    # Consumer subscription (metadata.type=b2c_subscription).
                    if metadata.get('type') == 'b2c_subscription':
                        return self._handle_b2c_subscription_payment_intent(payment_intent, metadata)

                    # Gift voucher purchase — issue code and email recipient.
                    if metadata.get('type') == 'gift_voucher':
                        return self._handle_gift_voucher_payment_intent(payment_intent, metadata)

                    # Late reschedule fee — apply new slot and record transaction.
                    if metadata.get('type') == 'reschedule_fee':
                        return self._handle_reschedule_fee_payment_intent(payment_intent, metadata)
                    
                    # Standard booking / bulk pay-now: pending_booking_id in metadata (invoice-later bulk uses invoice.*).
                    pending_booking_id = metadata.get('pending_booking_id')
                    booking_reference = metadata.get('booking_reference')
                    user_id = metadata.get('user_id')
                    
                    if not pending_booking_id:
                        # Pre–PendingBooking clients: booking_reference + user_id only.
                        return self._handle_payment_old_flow(payment_intent, metadata, booking_reference, user_id)
                    
                    # Get pending booking
                    try:
                        pending_booking = PendingBooking.objects.get(id=pending_booking_id)
                    except PendingBooking.DoesNotExist:
                        already = BookedAppointment.objects.filter(
                            booking_reference=booking_reference
                        ).exists() or BulkOrder.objects.filter(
                            booking_reference=booking_reference
                        ).exists()
                        if already:
                            return Response(
                                {'status': 'booking already created'},
                                status=status.HTTP_200_OK,
                            )
                        return Response(
                            {'error': 'Pending booking not found'},
                            status=status.HTTP_404_NOT_FOUND,
                        )

                    booking = None
                    bulk_order = None
                    is_bulk = isinstance(pending_booking.booking_data, dict) and pending_booking.booking_data.get('is_bulk') is True

                    if is_bulk:
                        try:
                            bulk_order = BulkOrder.objects.get(booking_reference=booking_reference)
                        except BulkOrder.DoesNotExist:
                            bd = pending_booking.booking_data
                            user_for_bulk = pending_booking.user
                            address_id = (bd.get('address') or {}).get('id') if isinstance(bd.get('address'), dict) else bd.get('address_id')
                            address_obj = None
                            branch_obj = None
                            fleet_obj = None
                            if user_for_bulk.is_branch_admin:
                                branch_obj = user_for_bulk.get_managed_branch()
                                fleet_obj = branch_obj.fleet if branch_obj else None
                            if address_id:
                                try:
                                    address_obj = Address.objects.get(id=address_id)
                                except (Address.DoesNotExist, ValueError):
                                    try:
                                        branch = Branch.objects.get(id=uuid.UUID(str(address_id)))
                                        branch_obj = branch if not branch_obj else branch_obj
                                        fleet_obj = branch.fleet if branch_obj else fleet_obj
                                        address_obj, _ = Address.objects.get_or_create(
                                            user=user_for_bulk,
                                            address=branch.address or '',
                                            post_code=branch.postcode or '',
                                            city=branch.city or '',
                                            country=branch.country or '',
                                            defaults={'latitude': branch.latitude, 'longitude': branch.longitude},
                                        )
                                    except (Branch.DoesNotExist, ValueError, TypeError):
                                        pass
                            if user_for_bulk.is_fleet_owner and not fleet_obj and hasattr(user_for_bulk, 'owned_fleets'):
                                fleet_obj = user_for_bulk.owned_fleets.first()
                            bulk_order = BulkOrder.objects.create(
                                booking_reference=booking_reference,
                                user=user_for_bulk,
                                branch=branch_obj,
                                fleet=fleet_obj,
                                address=address_obj,
                                payment_status='succeeded',
                                stripe_payment_intent_id=payment_intent.get('id'),
                                total_amount=Decimal(str(bd.get('total_amount', 0) or 0)),
                                discount_applied=Decimal(str(bd.get('discount_applied', 0) or 0)),
                                number_of_vehicles=int(bd.get('number_of_vehicles', 0)),
                                order_data=bd,
                                assigned_detailers=[],
                            )
                            try:
                                create_bulk_appointments(bulk_order)
                            except Exception:
                                logger.exception(
                                    "create_bulk_appointments failed for paid bulk %s",
                                    booking_reference,
                                )
                    else:
                        try:
                            booking = BookedAppointment.objects.get(booking_reference=booking_reference)
                        except BookedAppointment.DoesNotExist:
                            pending_booking.payment_status = 'succeeded'
                            pending_booking.save(update_fields=['payment_status'])
                            booking = create_booking_from_pending(pending_booking)

                    if is_bulk and bulk_order:
                        record_bulk_complimentary_usage(
                            pending_booking.user,
                            pending_booking.booking_data or {},
                            bulk_order,
                        )

                    if not is_bulk and booking:
                        wv = pending_booking.booking_data.get('winner_voucher_id')
                        gv_id = pending_booking.booking_data.get('gift_voucher_id')
                        if wv:
                            redeem_winner_voucher_for_booking(str(wv), pending_booking.user, booking)
                        if gv_id:
                            redeem_gift_voucher_for_booking(str(gv_id), pending_booking.user, booking)

                    payment_intent_id = payment_intent.get('id')
                    existing_transaction = PaymentTransaction.objects.filter(
                        stripe_payment_intent_id=payment_intent_id
                    ).first()

                    if not existing_transaction:
                        payment_method_details = payment_intent.get('payment_method_details', {})
                        card_details = payment_method_details.get('card', {})
                        PaymentTransaction.objects.create(
                            booking=booking,
                            bulk_order=bulk_order,
                            user=pending_booking.user,
                            booking_reference=booking_reference,
                            stripe_payment_intent_id=payment_intent_id,
                            transaction_type='payment',
                            amount=payment_intent.get('amount', 0) / 100,
                            currency=payment_intent.get('currency', 'gbp'),
                            last_4_digits=card_details.get('last4'),
                            card_brand=card_details.get('brand'),
                            status='succeeded'
                        )

                    if pending_booking.payment_status != 'succeeded':
                        pending_booking.payment_status = 'succeeded'
                        pending_booking.save(update_fields=['payment_status'])

                    from main.tasks.bookings.events import fulfill_paid_booking_on_detailer
                    from main.utils.observability import log_timed, new_request_id
                    request_id = new_request_id()
                    webhook_started = time.monotonic()
                    fulfill_paid_booking_on_detailer.delay(
                        str(pending_booking.id),
                        payment_intent_id,
                        booking_id=str(booking.id) if booking else None,
                        bulk_order_id=str(bulk_order.id) if bulk_order else None,
                        request_id=request_id,
                    )
                    log_timed(
                        "webhook.booking_fulfill_enqueued",
                        webhook_started,
                        booking_reference=booking_reference,
                        request_id=request_id,
                        is_bulk=is_bulk,
                    )

                    return Response({'status': 'booking created successfully'}, status=status.HTTP_200_OK)
                    
                except Exception as e:
                    return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
            

            # --- payment_intent.payment_failed: mark PendingBooking failed ---
            elif event_type == 'payment_intent.payment_failed':
                payment_intent = event['data']['object']
                metadata = payment_intent.get('metadata', {})
                pending_booking_id = metadata.get('pending_booking_id')
                
                if pending_booking_id:
                    try:
                        pending_booking = PendingBooking.objects.get(id=pending_booking_id)
                        pending_booking.payment_status = 'failed'
                        pending_booking.save()
                    except PendingBooking.DoesNotExist:
                        pass
                
                return Response({'status': 'payment failed handled'}, status=status.HTTP_200_OK)
            
            # --- charge / refund / dispute lifecycle ---
            elif event_type == 'charge.dispute.created':
                dispute = event['data']['object']
                return self._handle_dispute(dispute)

            elif event_type == 'charge.refunded':
                charge = event['data']['object']
                return self._handle_charge_refunded(charge)

            elif event_type == 'charge.updated':
                charge = event['data']['object']
                return self._handle_charge_updated(charge)

            elif event_type == 'charge.failed':
                charge = event['data']['object']
                return self._handle_charge_failed(charge)

            elif event_type == 'refund.failed':
                refund_obj = event['data']['object']
                return self._handle_stripe_refund_failed(refund_obj)

            # --- invoice.payment_succeeded: bulk invoice pay-later or subscription renewal ---
            elif event_type == 'invoice.payment_succeeded':
                invoice = event['data']['object']
                metadata = invoice.get('metadata') or {}
                bulk_order_id = metadata.get('bulk_order_id')
                if bulk_order_id:
                    # Fleet/partner bulk order paid via Stripe Invoice (not PaymentIntent checkout).
                    try:
                        bulk_order = BulkOrder.objects.get(id=bulk_order_id)
                    except BulkOrder.DoesNotExist:
                        return Response({'status': 'bulk order not found'}, status=status.HTTP_200_OK)
                    if bulk_order.payment_status == 'succeeded':
                        return Response({'status': 'bulk order already paid'}, status=status.HTTP_200_OK)
                    bulk_order.payment_status = 'succeeded'
                    payment_intent_id = invoice.get('payment_intent')
                    if payment_intent_id:
                        bulk_order.stripe_payment_intent_id = payment_intent_id
                    bulk_order.save()
                    pi_for_tx = payment_intent_id or invoice.get('id')
                    if not PaymentTransaction.objects.filter(stripe_payment_intent_id=pi_for_tx).exists():
                        PaymentTransaction.objects.create(
                            booking=None,
                            bulk_order=bulk_order,
                            user=bulk_order.user,
                            booking_reference=bulk_order.booking_reference,
                            stripe_payment_intent_id=pi_for_tx,
                            transaction_type='payment',
                            amount=Decimal(invoice.get('amount_paid', 0)) / 100,
                            currency=invoice.get('currency', 'eur'),
                            status='succeeded',
                        )
                    return Response({'status': 'bulk order payment recorded'}, status=status.HTTP_200_OK)
                # B2C / fleet subscription invoice paid — extend entitlements, record transaction.
                return self._handle_subscription_payment(invoice)

            # --- invoice.upcoming: subscription renewal reminder email (backup to Stripe emails) ---
            elif event_type == 'invoice.upcoming':
                invoice = event['data']['object']
                return self._handle_invoice_upcoming(invoice)

            # --- customer.subscription.trial_will_end: notify before trial ends ---
            elif event_type == 'customer.subscription.trial_will_end':
                subscription = event['data']['object']
                return self._handle_trial_will_end(subscription)
            
            # --- customer.subscription.updated: plan/status sync to User / Fleet ---
            elif event_type == 'customer.subscription.updated':
                subscription = event['data']['object']
                previous_attributes = (event.get('data') or {}).get('previous_attributes') or {}
                return self._handle_subscription_updated(subscription, previous_attributes)
            
            # --- customer.subscription.deleted: cancel entitlements ---
            elif event_type == 'customer.subscription.deleted':
                subscription = event['data']['object']
                return self._handle_subscription_deleted(subscription)
            
            # --- invoice.payment_failed: dunning / subscription or bulk invoice failure ---
            elif event_type == 'invoice.payment_failed':
                invoice = event['data']['object']
                return self._handle_invoice_payment_failed(invoice)

            # --- invoice.sent: acknowledge (invoice email handled by Stripe) ---
            elif event_type == 'invoice.sent':
                return Response({'status': 'received'}, status=status.HTTP_200_OK)

            # --- invoice.will_be_due / invoice.overdue: bulk invoice reminder emails ---
            elif event_type == 'invoice.will_be_due':
                invoice = event['data']['object']
                return self._handle_bulk_invoice_payment_reminder(invoice, 'due_soon')

            elif event_type == 'invoice.overdue':
                invoice = event['data']['object']
                return self._handle_bulk_invoice_payment_reminder(invoice, 'overdue')
            
            # Unhandled event types — return 200 so Stripe does not retry indefinitely.
            else:
                return Response({
                    'status': 'success',
                    'message': f'Received {event_type}',
                    'event_type': event_type
                }, status=status.HTTP_200_OK)

        except json.JSONDecodeError as e:
            return Response({'error': 'Invalid payload'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    def _handle_bulk_invoice_payment_reminder(self, invoice, reminder_kind):
        """
        invoice.will_be_due / invoice.overdue: queue Graph email with Stripe hosted invoice URL
        for fleet/partner bulk orders (invoice metadata contains bulk_order_id).
        """
        from main.tasks import send_bulk_invoice_payment_reminder_email

        invoice_d = _stripe_object_to_dict(invoice)
        metadata = invoice_d.get('metadata') or {}
        bulk_order_id = metadata.get('bulk_order_id')
        if not bulk_order_id:
            return Response({'status': 'not a bulk order invoice'}, status=status.HTTP_200_OK)
        try:
            bulk_order = BulkOrder.objects.select_related('user').get(pk=bulk_order_id)
        except BulkOrder.DoesNotExist:
            return Response({'status': 'bulk order not found'}, status=status.HTTP_200_OK)

        sync_bulk_order_paid_from_stripe_invoice(bulk_order, invoice_d)
        bulk_order.refresh_from_db()
        if bulk_order.payment_status == 'succeeded':
            return Response({'status': 'already paid'}, status=status.HTTP_200_OK)
        if bulk_order.payment_status != 'invoice_later':
            return Response({'status': 'not invoice_later'}, status=status.HTTP_200_OK)

        user = bulk_order.user
        if not getattr(user, 'allow_email_notifications', True):
            return Response({'status': 'user opted out'}, status=status.HTTP_200_OK)

        hosted = _stripe_inv_field(invoice_d, 'hosted_invoice_url')
        inv_id = _stripe_inv_field(invoice_d, 'id')
        if not hosted and inv_id:
            try:
                inv = stripe.Invoice.retrieve(inv_id)
                hosted = _stripe_inv_field(inv, 'hosted_invoice_url')
            except stripe.error.StripeError:
                hosted = None
        if not hosted:
            return Response({'status': 'no hosted_invoice_url'}, status=status.HTTP_200_OK)

        amount_cents = int(_stripe_inv_field(invoice_d, 'amount_due') or 0)
        amount_display = f'{(amount_cents / 100):.2f}'
        currency = _stripe_inv_field(invoice_d, 'currency') or 'eur'
        due_ts = _stripe_inv_field(invoice_d, 'due_date')
        due_date_display = ''
        if due_ts:
            due_date_display = datetime.fromtimestamp(
                int(due_ts), tz=dt_timezone.utc
            ).strftime('%B %d, %Y')

        send_bulk_invoice_payment_reminder_email.delay(
            str(bulk_order.id),
            user.email,
            bulk_order.booking_reference or '',
            hosted,
            amount_display,
            currency,
            due_date_display,
            reminder_kind,
        )
        return Response({'status': 'bulk invoice reminder queued'}, status=status.HTTP_200_OK)


    def _handle_invoice_upcoming(self, invoice):
        """
        Fired before the next subscription invoice is created. Send app-owned reminders for fleet
        and B2C subscriptions when Stripe invoice emails may be off for the customer.
        """
        from main.models import User, FleetSubscription, B2CSubcription
        from main.tasks import send_subscription_renewal_reminder_email
        from main.tasks.b2c.subscription_emails import (
            send_b2c_subscription_payment_due_reminder_email,
        )

        try:
            invoice_d = _stripe_object_to_dict(invoice)
            subscription_id = invoice_d.get('subscription')
            if not subscription_id:
                return Response({'status': 'no subscription on invoice'}, status=status.HTTP_200_OK)

            if isinstance(subscription_id, str):
                subscription_obj = stripe.Subscription.retrieve(subscription_id)
            else:
                subscription_obj = subscription_id
            subscription_dict = _stripe_object_to_dict(subscription_obj)

            metadata = subscription_dict.get('metadata', {}) or {}
            subscription_db_id = metadata.get('subscription_id')
            user_id = metadata.get('user_id')
            amount_due_dec = Decimal(invoice_d.get('amount_due', 0)) / 100
            currency_u = (invoice_d.get('currency') or 'eur').upper()
            next_ts = invoice_d.get('next_payment_attempt') or subscription_dict.get(
                'current_period_end'
            )

            inv_id = _stripe_inv_field(invoice_d, 'id')
            hosted_invoice_url = _stripe_inv_field(invoice_d, 'hosted_invoice_url')
            if not hosted_invoice_url and inv_id:
                try:
                    inv = stripe.Invoice.retrieve(inv_id)
                    hosted_invoice_url = _stripe_inv_field(inv, 'hosted_invoice_url')
                except stripe.error.StripeError:
                    hosted_invoice_url = None

            if metadata.get('type') == 'b2c_subscription':
                if not subscription_db_id or not user_id:
                    return Response(
                        {'error': 'Missing required metadata (subscription_id or user_id)'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                try:
                    user = User.objects.get(id=user_id)
                except User.DoesNotExist:
                    return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

                try:
                    db_subscription = B2CSubcription.objects.select_related('plan', 'plan__tier').get(
                        id=subscription_db_id
                    )
                except B2CSubcription.DoesNotExist:
                    return Response({'error': 'Subscription not found'}, status=status.HTTP_404_NOT_FOUND)

                plan_name = (
                    db_subscription.plan.tier.name
                    if db_subscription.plan and db_subscription.plan.tier
                    else 'Subscription'
                )

                if next_ts:
                    renewal_dt = datetime.fromtimestamp(int(next_ts), tz=dt_timezone.utc)
                    renewal_display = renewal_dt.strftime('%B %d, %Y')
                else:
                    renewal_display = 'your next billing date'

                if getattr(user, 'allow_email_notifications', True):
                    send_b2c_subscription_payment_due_reminder_email.delay(
                        user.email,
                        user.name or '',
                        plan_name,
                        renewal_display,
                        float(amount_due_dec),
                        currency_u,
                        hosted_invoice_url,
                    )
                return Response({'status': 'b2c renewal reminder queued'}, status=status.HTTP_200_OK)

            if metadata.get('type') != 'fleet_subscription':
                return Response({'status': 'not a subscription we remind'}, status=status.HTTP_200_OK)

            if not subscription_db_id or not user_id:
                return Response(
                    {'error': 'Missing required metadata (subscription_id or user_id)'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

            try:
                db_subscription = FleetSubscription.objects.select_related('fleet', 'plan', 'plan__tier').get(
                    id=subscription_db_id
                )
            except FleetSubscription.DoesNotExist:
                return Response({'error': 'Subscription not found'}, status=status.HTTP_404_NOT_FOUND)

            plan_name = (
                db_subscription.plan.tier.name
                if db_subscription.plan and db_subscription.plan.tier
                else 'Subscription'
            )
            if next_ts:
                renewal_dt = datetime.fromtimestamp(int(next_ts), tz=dt_timezone.utc)
                renewal_iso = renewal_dt.isoformat()
            else:
                renewal_iso = None

            if getattr(user, 'allow_email_notifications', True):
                send_subscription_renewal_reminder_email.delay(
                    user.email,
                    db_subscription.fleet.name,
                    plan_name,
                    renewal_iso,
                    float(amount_due_dec),
                    currency_u,
                    hosted_invoice_url,
                )
            return Response({'status': 'renewal reminder queued'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': f'Failed to process invoice.upcoming: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _handle_subscription_payment(self, invoice):
        """
        Handle subscription invoice payment webhook.
        Creates PaymentTransaction record and updates subscription status.
        Handles both initial payments and renewals.
        """
        from main.models import (
            PaymentTransaction,
            User,
            FleetSubscription,
            SubscriptionBilling,
            B2CSubcription,
            B2CSubcriptionBilling,
        )
        from dateutil.relativedelta import relativedelta
        
        try:
            # Get subscription from invoice
            subscription_id = invoice.get('subscription')
            if not subscription_id:
                return Response({
                    'error': 'No subscription ID in invoice'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Retrieve subscription to get metadata
            if isinstance(subscription_id, str):
                subscription_obj = stripe.Subscription.retrieve(subscription_id)
            else:
                subscription_obj = subscription_id
            if hasattr(subscription_obj, 'to_dict'):
                subscription_obj = subscription_obj.to_dict()

            metadata = subscription_obj.get('metadata', {}) or {}
            subscription_db_id = metadata.get('subscription_id')
            billing_id = metadata.get('billing_id')  # Sticky checkout id; not a renewal signal
            user_id = metadata.get('user_id')
            subscription_type = metadata.get('type')

            if subscription_type == 'fleet_subscription':
                SubscriptionModel = FleetSubscription
                BillingModel = SubscriptionBilling
            elif subscription_type == 'b2c_subscription':
                SubscriptionModel = B2CSubcription
                BillingModel = B2CSubcriptionBilling
            else:
                return Response({'status': 'not a subscription we handle'}, status=status.HTTP_200_OK)
            
            if not subscription_db_id or not user_id:
                return Response({
                    'error': 'Missing required metadata (subscription_id or user_id)'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Get user
            try:
                user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                return Response({
                    'error': 'User not found'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Get subscription
            try:
                subscription = SubscriptionModel.objects.select_related('plan', 'plan__tier').get(
                    id=subscription_db_id
                )
            except SubscriptionModel.DoesNotExist:
                return Response({
                    'error': 'Subscription not found'
                }, status=status.HTTP_404_NOT_FOUND)
            
            seed_billing = None
            if billing_id:
                seed_billing = BillingModel.objects.filter(id=billing_id).first()
            is_renewal = subscription_invoice_is_renewal(
                invoice.get('billing_reason'),
                seed_billing_is_pending=bool(seed_billing and seed_billing.status == 'pending'),
            )

            # Get payment intent from invoice
            payment_intent_id = invoice.get('payment_intent')
            payment_intent = None
            payment_intent_id_str = None
            
            if payment_intent_id:
                if isinstance(payment_intent_id, str):
                    payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id)
                    if hasattr(payment_intent, 'to_dict'):
                        payment_intent = payment_intent.to_dict()
                    payment_intent_id_str = payment_intent_id
                else:
                    payment_intent = payment_intent_id
                    if hasattr(payment_intent, 'to_dict'):
                        payment_intent = payment_intent.to_dict()
                    payment_intent_id_str = (
                        payment_intent.get('id') if isinstance(payment_intent, dict) else payment_intent.id
                    )
            
            # If no payment intent, try to get from charge
            if not payment_intent_id_str:
                charge_id = invoice.get('charge')
                if charge_id:
                    if isinstance(charge_id, str):
                        charge = stripe.Charge.retrieve(charge_id)
                    else:
                        charge = charge_id
                    payment_intent_id_str = charge.get('payment_intent') if isinstance(charge, dict) else getattr(charge, 'payment_intent', None)
                    if payment_intent_id_str:
                        payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id_str)
                        if hasattr(payment_intent, 'to_dict'):
                            payment_intent = payment_intent.to_dict()
            
            # For renewals, payment_intent might not exist if using saved payment method
            # Use invoice ID as fallback for transaction tracking
            if not payment_intent_id_str:
                # Use invoice ID as transaction identifier for renewals
                payment_intent_id_str = f"inv_{invoice.get('id')}"
            
            # Check if transaction already exists (idempotency)
            existing_transaction = PaymentTransaction.objects.filter(
                stripe_payment_intent_id=payment_intent_id_str
            ).first()

            invoice_id = invoice.get('id')
            invoice_keys = [
                key for key in (invoice_id, payment_intent_id_str, f"inv_{invoice_id}")
                if key
            ]
            billing_for_invoice = BillingModel.objects.filter(
                subscription=subscription,
                transaction_id__in=invoice_keys,
            ).first()
            renewal_already_recorded = bool(
                is_renewal
                and billing_for_invoice is not None
                and (seed_billing is None or billing_for_invoice.id != seed_billing.id)
            )

            if not is_renewal:
                if not seed_billing:
                    return Response({
                        'error': 'Billing record not found'
                    }, status=status.HTTP_404_NOT_FOUND)
                billing = seed_billing
                if existing_transaction:
                    subscription.status = 'active'
                    subscription.save()
                    billing.status = 'paid'
                    billing.save()
                    return Response({'status': 'subscription payment already recorded'}, status=status.HTTP_200_OK)
            elif renewal_already_recorded:
                subscription.status = 'active'
                subscription.save()
                billing_for_invoice.status = 'paid'
                billing_for_invoice.save()
                return Response({'status': 'subscription payment already recorded'}, status=status.HTTP_200_OK)
            else:
                billing = BillingModel.objects.create(
                    subscription=subscription,
                    amount=Decimal(invoice.get('amount_paid', 0)) / 100,
                    billing_date=timezone.now(),
                    status='paid',
                    transaction_id=invoice_id,
                )
                billing_cycle = subscription.plan.billing_cycle
                if billing_cycle == 'monthly':
                    subscription.end_date = subscription.end_date + relativedelta(months=1)
                elif billing_cycle == 'yearly':
                    subscription.end_date = subscription.end_date + relativedelta(years=1)
                else:
                    subscription.end_date = subscription.end_date + relativedelta(months=1)
                if subscription_type == 'b2c_subscription':
                    subscription.expiring_notice_sent_for_end_date = None
                    subscription.complimentary_sparkles_used = 0
                subscription.save()

            # Create payment transaction record for subscription
            # Extract payment method details from payment intent or charge
            last_4_digits = None
            card_brand = None
            
            if payment_intent:
                payment_method_details = payment_intent.get('payment_method_details', {}) if isinstance(payment_intent, dict) else getattr(payment_intent, 'payment_method_details', {})
                card_details = payment_method_details.get('card', {})
                last_4_digits = card_details.get('last4')
                card_brand = card_details.get('brand')
            else:
                # Try to get from charge if payment intent not available
                charge_id = invoice.get('charge')
                if charge_id:
                    if isinstance(charge_id, str):
                        charge = stripe.Charge.retrieve(charge_id)
                    else:
                        charge = charge_id
                    if isinstance(charge, dict):
                        payment_method_details = charge.get('payment_method_details', {})
                        card_details = payment_method_details.get('card', {})
                        last_4_digits = card_details.get('last4')
                        card_brand = card_details.get('brand')
            
            if existing_transaction:
                payment_transaction = existing_transaction
            else:
                payment_transaction = PaymentTransaction.objects.create(
                    booking=None,  # Subscriptions don't have bookings
                    user=user,
                    booking_reference=None,  # Subscriptions don't have booking references
                    stripe_payment_intent_id=payment_intent_id_str,
                    transaction_type=subscription_type,
                    amount=Decimal(invoice.get('amount_paid', 0)) / 100,  # Convert from cents
                    currency=invoice.get('currency', 'eur'),
                    last_4_digits=last_4_digits,
                    card_brand=card_brand,
                    status='succeeded'
                )
            
            # Link payment transaction to billing record
            billing.payment = payment_transaction
            billing.transaction_id = payment_intent_id_str
            billing.save()
            
            # Check if trial just ended (subscription was in trialing status; fleet-only)
            trial_just_ended = (
                subscription_type == 'fleet_subscription'
                and getattr(subscription, 'status', None) == 'trialing'
            )
            
            # Update subscription and billing status
            subscription.status = 'active'
            subscription.save()
            
            billing.status = 'paid'
            billing.save()
            
            # Send trial ended email if this is the first paid invoice after trial
            if trial_just_ended:
                from main.tasks import send_trial_ended_email
                from dateutil.relativedelta import relativedelta
                
                # Calculate next billing date
                billing_cycle = subscription.plan.billing_cycle
                if billing_cycle == 'monthly':
                    next_billing_date = timezone.now() + relativedelta(months=1)
                elif billing_cycle == 'yearly':
                    next_billing_date = timezone.now() + relativedelta(years=1)
                else:
                    next_billing_date = timezone.now() + relativedelta(months=1)
                
                if getattr(user, 'allow_email_notifications', True):
                    send_trial_ended_email.delay(
                        user.email,
                        subscription.fleet.name,
                        subscription.plan.tier.name,
                        float(billing.amount),
                        next_billing_date.isoformat(),
                    )

            if subscription_type == 'b2c_subscription' and getattr(
                user, 'allow_email_notifications', True
            ):
                from main.tasks.b2c.subscription_emails import (
                    send_b2c_subscription_payment_confirmation_email,
                )

                br = (invoice.get('billing_reason') or '').strip()
                if br == 'subscription_cycle':
                    email_is_renewal = True
                elif br == 'subscription_create':
                    email_is_renewal = False
                else:
                    email_is_renewal = is_renewal

                b2c_plan_name = (
                    subscription.plan.tier.name
                    if subscription.plan and subscription.plan.tier
                    else 'Subscription'
                )
                send_b2c_subscription_payment_confirmation_email.delay(
                    user.email,
                    user.name or '',
                    b2c_plan_name,
                    float(Decimal(invoice.get('amount_paid', 0)) / 100),
                    (invoice.get('currency') or 'eur').upper(),
                    email_is_renewal,
                    subscription.end_date.isoformat() if subscription.end_date else None,
                )

            return Response({'status': 'subscription payment recorded successfully'}, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'error': f'Failed to process subscription payment: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _handle_fleet_subscription_payment_intent(self, payment_intent, metadata):
        """
        Handle payment_intent.succeeded for fleet subscription payments.
        Creates a PaymentTransaction so confirm_payment_intent returns quickly for the client.
        Also activates FleetSubscription and SubscriptionBilling when subscription_id and
        billing_id are in metadata (initial payment). invoice.payment_succeeded will still
        run and is idempotent (finds existing transaction and re-applies same status updates).
        """
        from main.models import FleetSubscription, SubscriptionBilling
        try:
            payment_intent_id = payment_intent.get('id')
            user_id = metadata.get('user_id')
            if not user_id:
                return Response({'error': 'No user_id in metadata'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
            existing = PaymentTransaction.objects.filter(
                stripe_payment_intent_id=payment_intent_id,
                status='succeeded',
            ).first()
            if existing:
                payment_transaction = existing
            else:
                payment_method_details = payment_intent.get('payment_method_details', {}) or {}
                card_details = payment_method_details.get('card', {})
                last_4_digits = card_details.get('last4')
                card_brand = card_details.get('brand')
                payment_transaction = PaymentTransaction.objects.create(
                    booking=None,
                    user=user,
                    booking_reference=None,
                    stripe_payment_intent_id=payment_intent_id,
                    transaction_type='fleet_subscription',
                    amount=Decimal(payment_intent.get('amount', 0)) / 100,
                    currency=payment_intent.get('currency', 'eur'),
                    last_4_digits=last_4_digits,
                    card_brand=card_brand,
                    status='succeeded',
                )
            subscription_db_id = metadata.get('subscription_id')
            billing_id = metadata.get('billing_id')
            if subscription_db_id and billing_id:
                try:
                    subscription = FleetSubscription.objects.get(id=subscription_db_id)
                    billing = SubscriptionBilling.objects.get(id=billing_id)
                    # billing_id remains on Stripe subscription metadata after checkout.
                    # Only activate the still-pending seed row; renewals are applied
                    # by invoice.payment_succeeded so end_date is extended once.
                    if billing.status == 'pending':
                        subscription.status = 'active'
                        subscription.save(update_fields=['status', 'updated_at'])
                        billing.status = 'paid'
                        billing.payment = payment_transaction
                        billing.transaction_id = payment_intent_id
                        billing.save(update_fields=['status', 'payment', 'transaction_id', 'updated_at'])
                except FleetSubscription.DoesNotExist:
                    pass
                except SubscriptionBilling.DoesNotExist:
                    pass
            # If this PaymentIntent was standalone (metadata has invoice_id), mark the Stripe
            # invoice as paid out of band so the subscription becomes Active in the dashboard.
            invoice_id = metadata.get('invoice_id')
            if invoice_id:
                try:
                    stripe.Invoice.pay(invoice_id, paid_out_of_band=True)
                except stripe.error.InvalidRequestError as e:
                    pass
            return Response({'status': 'subscription payment recorded'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _handle_b2c_subscription_payment_intent(self, payment_intent, metadata):
        """
        Handle payment_intent.succeeded for B2C subscription payments.
        Creates a PaymentTransaction so confirm_payment_intent returns quickly for the client.
        Also activates B2CSubcription and B2CSubcriptionBilling when subscription_id and
        billing_id are in metadata (initial payment). invoice.payment_succeeded will still
        run and is idempotent (finds existing transaction and re-applies same status updates).
        """
        from main.models import B2CSubcription, B2CSubcriptionBilling
        try:
            payment_intent_id = payment_intent.get('id')
            user_id = metadata.get('user_id')
            if not user_id:
                return Response({'error': 'No user_id in metadata'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
            existing = PaymentTransaction.objects.filter(
                stripe_payment_intent_id=payment_intent_id,
                status='succeeded',
            ).first()
            if existing:
                payment_transaction = existing
            else:
                payment_method_details = payment_intent.get('payment_method_details', {}) or {}
                card_details = payment_method_details.get('card', {})
                last_4_digits = card_details.get('last4')
                card_brand = card_details.get('brand')
                payment_transaction = PaymentTransaction.objects.create(
                    booking=None,
                    user=user,
                    booking_reference=None,
                    stripe_payment_intent_id=payment_intent_id,
                    transaction_type='b2c_subscription',
                    amount=Decimal(payment_intent.get('amount', 0)) / 100,
                    currency=payment_intent.get('currency', 'eur'),
                    last_4_digits=last_4_digits,
                    card_brand=card_brand,
                    status='succeeded',
                )
            subscription_db_id = metadata.get('subscription_id')
            billing_id = metadata.get('billing_id')
            if subscription_db_id and billing_id:
                try:
                    subscription = B2CSubcription.objects.get(id=subscription_db_id)
                    billing = B2CSubcriptionBilling.objects.get(id=billing_id)
                    if billing.status == 'pending':
                        subscription.status = 'active'
                        subscription.save(update_fields=['status'])
                        billing.status = 'paid'
                        billing.payment = payment_transaction
                        billing.transaction_id = payment_intent_id
                        billing.save(update_fields=['status', 'payment', 'transaction_id'])
                except B2CSubcription.DoesNotExist:
                    pass
                except B2CSubcriptionBilling.DoesNotExist:
                    pass
            invoice_id = metadata.get('invoice_id')
            if invoice_id:
                try:
                    stripe.Invoice.pay(invoice_id, paid_out_of_band=True)
                except stripe.error.InvalidRequestError:
                    pass
            return Response({'status': 'b2c subscription payment recorded'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _handle_gift_voucher_payment_intent(self, payment_intent, metadata):
        """Fulfill gift voucher: code, dates, PaymentTransaction, link user, queue recipient email."""
        from main.models.voucher import generate_gift_voucher_code_candidate
        from main.tasks.emails.voucher_email import send_gift_voucher_email
        from main.services.gift_voucher import try_link_gift_voucher_existing_user

        try:
            payment_intent_id = payment_intent.get('id')
            gv_id = metadata.get('gift_voucher_id')
            user_id = metadata.get('user_id')
            if not payment_intent_id or not gv_id or not user_id:
                return Response(
                    {'error': 'Missing gift voucher metadata'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            fulfilled = GiftVoucher.objects.filter(
                stripe_payment_intent_id=payment_intent_id,
                code__isnull=False,
                payment_transaction_id__isnull=False,
            ).first()
            if fulfilled:
                return Response(
                    {'status': 'gift voucher already fulfilled'},
                    status=status.HTTP_200_OK,
                )

            paid_at = timezone.now()

            with transaction.atomic():
                voucher = GiftVoucher.objects.select_for_update().get(pk=gv_id)
                if voucher.code and voucher.payment_transaction_id:
                    return Response(
                        {'status': 'gift voucher already fulfilled'},
                        status=status.HTTP_200_OK,
                    )
                if str(voucher.purchased_by_id) != str(user_id):
                    return Response(
                        {'error': 'Purchaser mismatch'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                expected_pi = voucher.stripe_payment_intent_id
                if expected_pi and expected_pi != payment_intent_id:
                    return Response(
                        {'error': 'Payment intent mismatch'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                pi_amount = int(payment_intent.get('amount') or 0)
                expected_cents = int(
                    (voucher.credit_amount * Decimal('100')).quantize(
                        Decimal('1'), rounding=ROUND_HALF_UP
                    )
                )
                if pi_amount != expected_cents:
                    logger.warning(
                        'gift_voucher PI amount mismatch: got %s expected %s',
                        pi_amount,
                        expected_cents,
                    )
                    return Response(
                        {'error': 'Invalid payment amount'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                pi_cur = (payment_intent.get('currency') or 'eur').lower()
                if pi_cur != (voucher.purchase_currency or 'eur').lower():
                    return Response(
                        {'error': 'Currency mismatch'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                code_ok = None
                for _ in range(64):
                    cand = generate_gift_voucher_code_candidate()
                    rows = GiftVoucher.objects.filter(pk=voucher.pk, code__isnull=True).update(
                        code=cand
                    )
                    if rows:
                        code_ok = cand
                        break
                if not code_ok:
                    return Response(
                        {'error': 'Could not assign gift code'},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )

                voucher.refresh_from_db()
                exp = paid_at + timedelta(days=voucher.validity_days)
                GiftVoucher.objects.filter(pk=voucher.pk).update(
                    valid_from=paid_at,
                    expires_at=exp,
                )
                voucher.refresh_from_db()

                payment_method_details = payment_intent.get('payment_method_details', {}) or {}
                card_details = payment_method_details.get('card', {})
                txn = PaymentTransaction.objects.create(
                    booking=None,
                    bulk_order=None,
                    user=voucher.purchased_by,
                    booking_reference=None,
                    stripe_payment_intent_id=payment_intent_id,
                    transaction_type='gift_voucher',
                    amount=Decimal(payment_intent.get('amount', 0)) / 100,
                    currency=payment_intent.get('currency', 'eur'),
                    last_4_digits=card_details.get('last4'),
                    card_brand=card_details.get('brand'),
                    status='succeeded',
                )
                voucher.payment_transaction = txn
                voucher.save(update_fields=['payment_transaction', 'updated_at'])

            voucher = GiftVoucher.objects.select_related('purchased_by').get(pk=gv_id)
            try_link_gift_voucher_existing_user(voucher)
            voucher.refresh_from_db()
            if voucher.assigned_user_id:
                try:
                    from main.tasks.notifications.push import send_push_notification

                    send_push_notification.delay(
                        voucher.assigned_user_id,
                        "You've received a gift voucher",
                        'Open the app to use your voucher credit.',
                        'gift_voucher',
                    )
                except Exception as exc:
                    logger.warning('gift voucher push failed: %s', exc)

            send_gift_voucher_email.delay(str(voucher.pk))
            return Response(
                {'status': 'gift voucher fulfilled'},
                status=status.HTTP_200_OK,
            )
        except GiftVoucher.DoesNotExist:
            return Response({'error': 'Gift voucher not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.exception('gift voucher webhook')
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _handle_reschedule_fee_payment_intent(self, payment_intent, metadata):
        """Verify late-reschedule fee, apply new slot, record PaymentTransaction (idempotent by PI id)."""
        from main.views.events import EventsView

        try:
            payment_intent_id = payment_intent.get('id')
            expected_cents = int(getattr(settings, 'RESCHEDULE_FEE_CENTS', 1000))
            pi_amount = int(payment_intent.get('amount') or 0)
            if pi_amount != expected_cents:
                logger.warning(
                    "reschedule_fee PI amount mismatch: got %s expected %s",
                    pi_amount,
                    expected_cents,
                )
                return Response({'error': 'Invalid payment amount'}, status=status.HTTP_400_BAD_REQUEST)

            if PaymentTransaction.objects.filter(stripe_payment_intent_id=payment_intent_id).exists():
                return Response({'status': 'reschedule fee already processed'}, status=status.HTTP_200_OK)

            booking_reference = (metadata.get('booking_reference') or '').strip()
            new_date = (metadata.get('new_date') or '').strip()
            new_time = (metadata.get('new_time') or '').strip()
            user_id = metadata.get('user_id')
            if not booking_reference or not new_date or not new_time or not user_id:
                return Response({'error': 'Missing reschedule metadata'}, status=status.HTTP_400_BAD_REQUEST)

            try:
                booking = BookedAppointment.objects.get(booking_reference=booking_reference)
            except BookedAppointment.DoesNotExist:
                return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)

            if str(booking.user_id) != str(user_id):
                return Response({'error': 'Booking user mismatch'}, status=status.HTTP_400_BAD_REQUEST)

            if booking.bulk_order_id:
                return Response({'error': 'Bulk booking reschedule via fee is not supported'}, status=status.HTTP_400_BAD_REQUEST)

            if booking.status in ('completed', 'cancelled', 'in_progress'):
                if not try_refund_payment_intent(
                    payment_intent_id, booking_reference, 'reschedule_invalid_status',
                ):
                    return Response(
                        {'error': 'Booking cannot be rescheduled and refund could not be completed'},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )
                return Response({'status': 'refunded_booking_not_reschedulable'}, status=status.HTTP_200_OK)

            events = EventsView()
            valid, err_msg = events._validate_reschedule_slot(booking, new_date, new_time)
            if not valid:
                if not try_refund_payment_intent(
                    payment_intent_id, booking_reference, 'reschedule_slot_unavailable',
                ):
                    return Response(
                        {'error': 'Slot unavailable and refund could not be completed'},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )
                return Response({'status': 'refunded_slot_unavailable'}, status=status.HTTP_200_OK)

            nd, nt, parse_err = events._parse_reschedule_date_time(new_date, new_time)
            if parse_err:
                if not try_refund_payment_intent(
                    payment_intent_id, booking_reference, 'reschedule_invalid_datetime',
                ):
                    return Response(
                        {'error': 'Invalid reschedule time and refund could not be completed'},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )
                return Response({'status': 'refunded_invalid_datetime'}, status=status.HTTP_200_OK)

            payment_method_details = payment_intent.get('payment_method_details', {}) or {}
            card_details = payment_method_details.get('card', {}) or {}

            with transaction.atomic():
                booking = BookedAppointment.objects.select_for_update().get(
                    pk=booking.pk
                )
                booking.appointment_date = nd
                booking.start_time = nt
                booking.save()
                PaymentTransaction.objects.create(
                    booking=booking,
                    user=booking.user,
                    booking_reference=booking.booking_reference,
                    stripe_payment_intent_id=payment_intent_id,
                    transaction_type='reschedule_fee',
                    amount=Decimal(pi_amount) / 100,
                    currency=payment_intent.get('currency', 'eur'),
                    last_4_digits=card_details.get('last4'),
                    card_brand=card_details.get('brand'),
                    status='succeeded',
                )

            def _after_commit():
                """Run post-reschedule side effects only after DB commit (Redis + emails)."""
                publish_booking_rescheduled.delay(
                    booking.booking_reference,
                    booking.appointment_date,
                    booking.start_time,
                    booking.total_amount,
                )
                try:
                    booking.refresh_from_db()
                    NotificationService().send_booking_rescheduled(booking.user, booking)
                except Exception as exc:
                    logger.warning("reschedule_fee customer notification failed: %s", exc)

            transaction.on_commit(_after_commit)
            return Response({'status': 'reschedule applied'}, status=status.HTTP_200_OK)
        except Exception as e:
            logger.exception("reschedule_fee webhook error")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



    def _handle_trial_will_end(self, subscription):
        """
        Handle trial_will_end webhook (triggered 7 days before trial ends).
        Sends email and push notification to user.
        """
        from main.models import User, FleetSubscription
        from main.tasks import send_trial_ending_soon_email, send_push_notification
        
        try:
            metadata = subscription.get('metadata', {})
            if metadata.get('type') == 'b2c_subscription':
                return Response({'status': 'trial will end skipped for b2c'}, status=status.HTTP_200_OK)
            subscription_db_id = metadata.get('subscription_id')
            user_id = metadata.get('user_id')
            
            if not subscription_db_id or not user_id:
                return Response({
                    'error': 'Missing required metadata'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Get user
            try:
                user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                return Response({
                    'error': 'User not found'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Get subscription
            try:
                db_subscription = FleetSubscription.objects.get(id=subscription_db_id)
            except FleetSubscription.DoesNotExist:
                return Response({
                    'error': 'Subscription not found'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Get trial end date from Stripe subscription
            trial_end_timestamp = subscription.get('trial_end')
            if trial_end_timestamp:
                from datetime import datetime
                trial_end_date = datetime.fromtimestamp(trial_end_timestamp, tz=dt_timezone.utc)
            else:
                trial_end_date = db_subscription.trial_end_date
            
            # Get plan details
            plan_name = db_subscription.plan.tier.name if db_subscription.plan and db_subscription.plan.tier else "Subscription"
            billing_amount = float(db_subscription.plan.price) if db_subscription.plan else 0
            
            if getattr(user, 'allow_email_notifications', True):
                send_trial_ending_soon_email.delay(
                    user.email,
                    db_subscription.fleet.name,
                    trial_end_date.isoformat() if trial_end_date else None,
                    plan_name,
                    billing_amount,
                )
            
            # Send push notification
            send_push_notification.delay(
                str(user.id),
                "Trial Ending Soon",
                f"Your {plan_name} trial ends in 7 days. Billing will start automatically.",
                "subscription_trial_ending"
            )
            
            return Response({'status': 'trial ending notification sent'}, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'error': f'Failed to process trial_will_end: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    def _handle_subscription_updated(self, subscription, previous_attributes=None):
        """
        Handle subscription.updated webhook.
        Handles status changes and emails when the default payment method changes (Stripe previous_attributes).
        """
        from main.models import User, FleetSubscription
        from main.tasks import send_payment_method_updated_email

        previous_attributes = previous_attributes or {}

        try:
            metadata = subscription.get('metadata', {}) or {}
            sub_type = metadata.get('type')
            subscription_db_id = metadata.get('subscription_id')
            user_id = metadata.get('user_id')

            if not subscription_db_id or not user_id:
                return Response(
                    {'error': 'Missing required metadata'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                return Response(
                    {'error': 'User not found'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            stripe_status = subscription.get('status')

            if sub_type == 'b2c_subscription':
                from main.models import B2CSubcription
                try:
                    db_subscription = B2CSubcription.objects.get(id=subscription_db_id)
                except B2CSubcription.DoesNotExist:
                    return Response(
                        {'error': 'Subscription not found'},
                        status=status.HTTP_404_NOT_FOUND,
                    )
                status_mapping = {
                    'active': 'active',
                    'trialing': 'pending',
                    'past_due': 'past_due',
                    'canceled': 'cancelled',
                    'unpaid': 'expired',
                }
                new_status = status_mapping.get(stripe_status, db_subscription.status)
                if db_subscription.status != new_status:
                    db_subscription.status = new_status
                    db_subscription.save(update_fields=['status'])

                # Payment method updates are confirmed from the B2C API (avoids duplicate mail with Stripe).
                if subscription.get('cancel_at_period_end') and previous_attributes.get(
                    'cancel_at_period_end'
                ) is False:
                    from main.tasks.b2c.subscription_emails import (
                        send_b2c_subscription_scheduled_cancel_email,
                    )

                    period_end_ts = subscription.get('current_period_end')
                    if period_end_ts:
                        access_dt = datetime.fromtimestamp(int(period_end_ts), tz=dt_timezone.utc)
                        access_display = timezone.localtime(access_dt).strftime('%B %d, %Y')
                    else:
                        access_display = (
                            timezone.localtime(db_subscription.end_date).strftime('%B %d, %Y')
                            if db_subscription.end_date
                            else 'the end of your billing period'
                        )
                    plan_name_b2c = (
                        db_subscription.plan.tier.name
                        if db_subscription.plan and db_subscription.plan.tier
                        else 'Subscription'
                    )
                    if getattr(user, 'allow_email_notifications', True):
                        send_b2c_subscription_scheduled_cancel_email.delay(
                            user.email,
                            user.name or '',
                            plan_name_b2c,
                            access_display,
                        )

                return Response({'status': 'b2c subscription updated'}, status=status.HTTP_200_OK)

            if sub_type != 'fleet_subscription':
                return Response({'status': 'not a subscription we handle'}, status=status.HTTP_200_OK)

            try:
                db_subscription = FleetSubscription.objects.get(id=subscription_db_id)
            except FleetSubscription.DoesNotExist:
                return Response({
                    'error': 'Subscription not found'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Map Stripe status to our status
            status_mapping = {
                'active': 'active',
                'trialing': 'trialing',
                'past_due': 'past_due',
                'canceled': 'cancelled',
                'unpaid': 'expired',
            }
            
            new_status = status_mapping.get(stripe_status, db_subscription.status)
            
            # Update subscription status if changed
            if db_subscription.status != new_status:
                old_status = db_subscription.status
                db_subscription.status = new_status
                db_subscription.save()
            
            if (
                'default_payment_method' in previous_attributes
                and getattr(user, 'allow_email_notifications', True)
            ):
                send_payment_method_updated_email.delay(user.email, db_subscription.fleet.name)

            # Handle plan changes (if items changed)
            items = subscription.get('items', {}).get('data', [])
            if items:
                # Plan might have changed - Stripe handles proration automatically
                # We could update the plan here if needed, but Stripe manages billing
                pass
            
            return Response({'status': 'subscription updated'}, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'error': f'Failed to process subscription.updated: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    def _handle_subscription_deleted(self, subscription):
        """
        Handle subscription.deleted webhook (cancellation).
        Updates subscription status and sends cancellation email.
        """
        from main.models import User, FleetSubscription
        from main.tasks import send_subscription_cancelled_email, send_push_notification
        from datetime import datetime
        
        try:
            metadata = subscription.get('metadata', {}) or {}
            subscription_db_id = metadata.get('subscription_id')
            user_id = metadata.get('user_id')
            sub_type = metadata.get('type')
            
            if not subscription_db_id or not user_id:
                return Response({
                    'error': 'Missing required metadata'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Get user
            try:
                user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                return Response({
                    'error': 'User not found'
                }, status=status.HTTP_404_NOT_FOUND)

            if sub_type == 'b2c_subscription':
                from main.models import B2CSubcription
                try:
                    db_subscription = B2CSubcription.objects.get(id=subscription_db_id)
                except B2CSubcription.DoesNotExist:
                    return Response({
                        'error': 'Subscription not found'
                    }, status=status.HTTP_404_NOT_FOUND)
                access_until_date = db_subscription.end_date
                db_subscription.status = 'cancelled'
                db_subscription.cancellation_date = timezone.now()
                db_subscription.cancellation_reason = 'Cancelled via Stripe'
                db_subscription.save()
                plan_name = (
                    db_subscription.plan.tier.name
                    if db_subscription.plan and db_subscription.plan.tier
                    else 'Subscription'
                )
                cancel_dt = timezone.localtime(db_subscription.cancellation_date)
                cancel_display = cancel_dt.strftime('%B %d, %Y')
                if access_until_date:
                    access_display = timezone.localtime(access_until_date).strftime('%B %d, %Y')
                else:
                    access_display = 'the end of your billing period'
                if getattr(user, 'allow_email_notifications', True):
                    from main.tasks.b2c.subscription_emails import (
                        send_b2c_subscription_cancelled_email,
                    )

                    send_b2c_subscription_cancelled_email.delay(
                        user.email,
                        user.name or '',
                        plan_name,
                        cancel_display,
                        access_display,
                    )
                send_push_notification.delay(
                    str(user.id),
                    'Subscription Cancelled',
                    (
                        f'Your {plan_name} subscription has been cancelled. Access continues until '
                        f'{access_until_date.strftime("%B %d, %Y") if access_until_date else "the end of your billing period"}.'
                    ),
                    'subscription_cancelled',
                )
                return Response({'status': 'b2c subscription cancelled'}, status=status.HTTP_200_OK)

            if sub_type != 'fleet_subscription':
                return Response({'status': 'not a subscription we handle'}, status=status.HTTP_200_OK)

            # Get subscription (fleet)
            try:
                db_subscription = FleetSubscription.objects.get(id=subscription_db_id)
            except FleetSubscription.DoesNotExist:
                return Response({
                    'error': 'Subscription not found'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Store old status before updating
            old_status = db_subscription.status
            
            # Calculate access until date before updating status
            # If during trial, access until trial_end_date
            # If active, access until end_date
            if old_status == 'trialing' and db_subscription.trial_end_date:
                access_until_date = db_subscription.trial_end_date
            else:
                access_until_date = db_subscription.end_date
            
            # Update subscription status
            db_subscription.status = 'cancelled'
            db_subscription.cancellation_date = timezone.now()
            db_subscription.cancellation_reason = 'Cancelled by user via Stripe'
            db_subscription.save()
            
            # Get plan details
            plan_name = db_subscription.plan.tier.name if db_subscription.plan and db_subscription.plan.tier else "Subscription"
            
            if getattr(user, 'allow_email_notifications', True):
                send_subscription_cancelled_email.delay(
                    user.email,
                    db_subscription.fleet.name,
                    plan_name,
                    db_subscription.cancellation_date.isoformat(),
                    access_until_date.isoformat() if access_until_date else None,
                )
            
            # Send push notification
            send_push_notification.delay(
                str(user.id),
                "Subscription Cancelled",
                f"Your {plan_name} subscription has been cancelled. Access continues until {access_until_date.strftime('%B %d, %Y') if access_until_date else 'the end of your billing period'}.",
                "subscription_cancelled"
            )
            
            return Response({'status': 'subscription cancelled'}, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'error': f'Failed to process subscription.deleted: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _handle_invoice_payment_failed(self, invoice):
        """
        Handle invoice.payment_failed webhook for subscription payments.
        Updates subscription status, sets grace period, and sends notifications.
        """
        from main.models import User, FleetSubscription
        from main.tasks import send_payment_failed_email, send_push_notification
        from datetime import datetime, timedelta
        
        try:
            # Get subscription from invoice
            subscription_id = invoice.get('subscription')
            if not subscription_id:
                return Response({
                    'error': 'No subscription ID in invoice'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Retrieve subscription to get metadata
            if isinstance(subscription_id, str):
                subscription_obj = stripe.Subscription.retrieve(subscription_id)
            else:
                subscription_obj = subscription_id
            if hasattr(subscription_obj, 'to_dict'):
                subscription_obj = subscription_obj.to_dict()

            metadata = subscription_obj.get('metadata', {}) or {}
            subscription_db_id = metadata.get('subscription_id')
            user_id = metadata.get('user_id')
            subscription_type = metadata.get('type')

            if not subscription_db_id or not user_id:
                return Response({
                    'error': 'Missing required metadata'
                }, status=status.HTTP_400_BAD_REQUEST)

            # Get user (fleet and B2C)
            try:
                user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                return Response({
                    'error': 'User not found'
                }, status=status.HTTP_404_NOT_FOUND)

            failed_amount = Decimal(invoice.get('amount_due', 0)) / 100
            retry_date = None
            if invoice.get('next_payment_attempt'):
                retry_date = datetime.fromtimestamp(invoice.get('next_payment_attempt'), tz=dt_timezone.utc)

            update_payment_url = client_web_url('/settings')

            if subscription_type == 'b2c_subscription':
                from main.models import B2CSubcription
                from main.tasks.b2c.subscription_emails import (
                    send_b2c_subscription_payment_failed_email,
                )

                try:
                    subscription = B2CSubcription.objects.get(id=subscription_db_id)
                except B2CSubcription.DoesNotExist:
                    return Response({
                        'error': 'Subscription not found'
                    }, status=status.HTTP_404_NOT_FOUND)
                subscription.status = 'past_due'
                subscription.save(update_fields=['status'])
                grace_until = timezone.now() + timedelta(days=3)
                plan_name = (
                    subscription.plan.tier.name
                    if subscription.plan and subscription.plan.tier
                    else 'Subscription'
                )
                retry_display = (
                    timezone.localtime(retry_date).strftime('%B %d, %Y')
                    if retry_date
                    else None
                )
                grace_display = timezone.localtime(grace_until).strftime('%B %d, %Y')
                if getattr(user, 'allow_email_notifications', True):
                    send_b2c_subscription_payment_failed_email.delay(
                        user.email,
                        user.name or '',
                        plan_name,
                        float(failed_amount),
                        (invoice.get('currency') or 'eur').upper(),
                        retry_display,
                        update_payment_url,
                        grace_display,
                    )
                send_push_notification.delay(
                    str(user.id),
                    'Payment Failed',
                    (
                        f'Your {plan_name} subscription payment failed. Please update your payment '
                        'method to avoid service interruption.'
                    ),
                    'subscription_payment_failed',
                )
                return Response({'status': 'b2c payment failure handled'}, status=status.HTTP_200_OK)

            if subscription_type != 'fleet_subscription':
                return Response({'status': 'not a subscription we handle'}, status=status.HTTP_200_OK)
            
            # Get subscription (fleet)
            try:
                subscription = FleetSubscription.objects.get(id=subscription_db_id)
            except FleetSubscription.DoesNotExist:
                return Response({
                    'error': 'Subscription not found'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Update payment failure tracking
            subscription.payment_failure_count += 1
            subscription.last_payment_failure_date = timezone.now()
            subscription.grace_period_until = timezone.now() + timedelta(days=3)  # 3 day grace period
            subscription.status = 'past_due'
            subscription.save()
            
            # Get plan details
            plan_name = subscription.plan.tier.name if subscription.plan and subscription.plan.tier else "Subscription"

            if getattr(user, 'allow_email_notifications', True):
                send_payment_failed_email.delay(
                    user.email,
                    subscription.fleet.name,
                    plan_name,
                    float(failed_amount),
                    retry_date.isoformat() if retry_date else None,
                    update_payment_url,
                    subscription.grace_period_until.isoformat(),
                )
            
            # Send push notification
            send_push_notification.delay(
                str(user.id),
                "Payment Failed",
                f"Your {plan_name} subscription payment failed. Please update your payment method to avoid service interruption.",
                "subscription_payment_failed"
            )
            
            return Response({'status': 'payment failure handled'}, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'error': f'Failed to process invoice.payment_failed: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    def _handle_payment_old_flow(self, payment_intent, metadata, booking_reference, user_id):
        """Handle payment webhook with old flow (for backward compatibility)"""
        try:
            if not booking_reference:
                return Response({'error': 'No booking reference in metadata'}, status=status.HTTP_400_BAD_REQUEST)
            
            if not user_id:
                return Response({'error': 'No user_id in metadata'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Check if PaymentTransaction already exists to avoid duplicates
            payment_intent_id = payment_intent.get('id')
            existing_transaction = PaymentTransaction.objects.filter(
                stripe_payment_intent_id=payment_intent_id
            ).first()
            
            if existing_transaction:
                return Response({'status': 'payment already recorded'}, status=status.HTTP_200_OK)
            
            # Get user from metadata
            try:
                user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                return Response({'error': 'User not found'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Try to get booking if it exists (may not exist yet)
            booking = None
            try:
                booking = BookedAppointment.objects.get(booking_reference=booking_reference)
            except BookedAppointment.DoesNotExist:
                pass
            
            # Safely get payment method details (may not exist)
            last_4_digits = None
            card_brand = None
            try:
                payment_method_details = payment_intent.get('payment_method_details', {})
                card_details = payment_method_details.get('card', {})
                last_4_digits = card_details.get('last4')
                card_brand = card_details.get('brand')
            except (AttributeError, KeyError, TypeError) as e:
                pass
            
            # Create payment transaction record (booking may be None)
            payment_transaction = PaymentTransaction.objects.create(
                booking=booking,  # May be None if booking doesn't exist yet
                user=user,
                booking_reference=booking_reference,
                stripe_payment_intent_id=payment_intent_id,
                transaction_type='payment',
                amount=payment_intent.get('amount', 0) / 100,  # Convert from cents
                currency=payment_intent.get('currency', 'gbp'),
                last_4_digits=last_4_digits,
                card_brand=card_brand,
                status='succeeded'
            )
            
            # If booking exists, save it to trigger any signals
            if booking:
                booking.save()
            
            return Response({'status': 'payment recorded'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def _finalize_refund_record_succeeded(self, refund_record):
        """Mark RefundRecord succeeded and send customer email (idempotent for pending only)."""
        if refund_record.status != 'pending':
            return
        refund_record.status = 'succeeded'
        refund_record.processed_at = timezone.now()
        refund_record.save()
        from main.tasks import send_refund_success_email

        send_refund_success_email.delay(
            user_email=refund_record.user.email,
            customer_name=refund_record.user.name,
            booking_reference=refund_record.booking.booking_reference,
            original_date=refund_record.booking.appointment_date,
            vehicle_make=refund_record.booking.vehicle.make,
            vehicle_model=refund_record.booking.vehicle.model,
            service_type_name=refund_record.booking.service_type.name,
            refund_amount=float(refund_record.requested_amount),
            refund_date=timezone.now(),
        )

    def _handle_charge_refunded(self, charge):
        """
        charge.refunded delivers the Charge. Match Refund rows by refund id on the charge,
        or by PaymentIntent when a pending record has no stripe_refund_id yet (race with API).
        """
        try:
            charge_d = _stripe_object_to_dict(charge)
            refunds_block = charge_d.get('refunds') or {}
            if isinstance(refunds_block, dict):
                refund_items = refunds_block.get('data') or []
            elif isinstance(refunds_block, list):
                refund_items = refunds_block
            else:
                refund_items = []

            for ref in refund_items:
                ref_d = _stripe_object_to_dict(ref)
                rid = ref_d.get('id')
                if not rid:
                    continue
                for record in RefundRecord.objects.filter(stripe_refund_id=rid, status='pending'):
                    self._finalize_refund_record_succeeded(record)

            pi_id = _stripe_nested_id(charge_d.get('payment_intent'))
            if pi_id and refund_items:
                last_ref = refund_items[-1]
                last_d = _stripe_object_to_dict(last_ref)
                latest_rid = last_d.get('id')
                if not latest_rid:
                    return Response({'status': 'charge refunded processed'}, status=status.HTTP_200_OK)
                pending_no_stripe_id = RefundRecord.objects.filter(
                    original_transaction__stripe_payment_intent_id=pi_id,
                    status='pending',
                ).filter(Q(stripe_refund_id__isnull=True) | Q(stripe_refund_id=''))
                if pending_no_stripe_id.count() == 1:
                    rec = pending_no_stripe_id.first()
                    rec.stripe_refund_id = latest_rid
                    rec.save(update_fields=['stripe_refund_id'])
                    self._finalize_refund_record_succeeded(rec)

            return Response({'status': 'charge refunded processed'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _handle_charge_updated(self, charge):
        """charge.updated: optional future sync; acknowledge so Stripe does not retry indefinitely."""
        try:
            _stripe_object_to_dict(charge)
            return Response({'status': 'charge updated acknowledged'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _handle_charge_failed(self, charge):
        """
        charge.failed is a failed customer payment attempt, not a failed Stripe refund.
        Do not map to RefundRecord; acknowledge only (booking failures use payment_intent.payment_failed).
        """
        try:
            charge_d = _stripe_object_to_dict(charge)
            return Response(
                {
                    'status': 'charge failed acknowledged',
                    'charge_id': charge_d.get('id'),
                },
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _handle_stripe_refund_failed(self, refund_obj):
        """refund.failed: refund could not be completed; update RefundRecord if we have a row for this id."""
        try:
            r_d = _stripe_object_to_dict(refund_obj)
            rid = r_d.get('id')
            if not rid:
                return Response({'status': 'refund failed: no id'}, status=status.HTTP_200_OK)
            reason = r_d.get('failure_reason') or r_d.get('description') or 'Unknown failure'
            refund_record = RefundRecord.objects.filter(stripe_refund_id=rid).first()
            if refund_record:
                refund_record.status = 'failed'
                refund_record.failure_reason = reason
                refund_record.processed_at = timezone.now()
                refund_record.save()
            return Response({'status': 'refund failure processed'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _handle_dispute(self, dispute):
        """charge.dispute.created: resolve PaymentIntent from disputed Charge, mark related RefundRecord."""
        try:
            dispute_d = _stripe_object_to_dict(dispute)
            charge_id = _stripe_nested_id(dispute_d.get('charge'))
            reason = dispute_d.get('reason') or 'unknown'
            if not charge_id:
                return Response({'status': 'dispute missing charge id'}, status=status.HTTP_200_OK)

            ch = stripe.Charge.retrieve(charge_id)
            ch_d = _stripe_object_to_dict(ch)
            pi_id = _stripe_nested_id(ch_d.get('payment_intent'))
            if not pi_id:
                return Response({'status': 'dispute charge has no payment_intent'}, status=status.HTTP_200_OK)

            refund_record = (
                RefundRecord.objects.filter(original_transaction__stripe_payment_intent_id=pi_id)
                .order_by('-created_at')
                .first()
            )
            if refund_record:
                refund_record.status = 'disputed'
                refund_record.admin_notes = f"Dispute created: {reason}"
                refund_record.save()

            return Response({'status': 'dispute handled'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
