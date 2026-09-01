"""
Public guest checkout APIs: catalog, Ireland reg lookup, quote, timeslots, payment, claim.

Guests never receive a JWT until they claim. Contact details are collected at payment
time and stored on a ``User`` with ``is_guest=True``. Winner and gift vouchers tied to
the guest email are supported; loyalty, promos, complimentary washes, and bulk booking
are not. Claiming sets a password on the same row so garage and history are preserved.
"""
from __future__ import annotations

import logging
import re
import secrets
import time
import uuid
from decimal import Decimal

import requests
from django.conf import settings as django_settings
from django.core.cache import cache
from django.utils.decorators import method_decorator
from django_ratelimit.core import is_ratelimited
from django_ratelimit.decorators import ratelimit
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from main.models import (
    AddOns,
    Address,
    GiftVoucher,
    LoyaltyProgram,
    Partner,
    PendingBooking,
    PaymentTransaction,
    ServiceType,
    ValetType,
    WinnerVoucher,
)
from main.services.booking_quote import quote_booking_for_user
from main.services.gift_voucher import (
    compute_gift_discount,
    gift_voucher_eligible_for_checkout,
    gift_voucher_validity_issue,
    gift_voucher_validity_user_message,
)
from main.services.winner_voucher import (
    amount_due_cents,
    compute_winner_discount,
    normalize_winner_code,
    voucher_eligible_for_checkout,
    winner_voucher_validity_issue,
    winner_voucher_validity_user_message,
)
from main.services.guest import (
    GuestAlreadyRegistered,
    GuestEmailInUse,
    GuestPasswordInvalid,
    GuestPlateBlocked,
    PLATE_OWNED_BY_REGISTERED,
    canonical_guest_country,
    canonical_guest_registration,
    claim_guest_account,
    get_or_create_guest_user,
    get_valid_guest_access_token,
    guest_vehicle_ownership_status,
    persist_guest_address,
    persist_guest_vehicle,
    sanitize_guest_booking_data,
    sanitize_guest_phone,
    serialize_guest_claim_preview,
    serialize_guest_results,
)
from main.services.regcheck_ireland import (
    RegcheckIrelandError,
    ireland_payload_for_cache,
    lookup_ireland,
)
from main.utils.detailer_client import detailer_request_headers
from main.utils.ratelimit_helpers import rate_limit_json_response
from main.utils.vehicle_category import resolve_is_suv_mpv
from main.views.garage import LOOKUP_TTL_SECONDS, lookup_cache_key
from main.views.payment import PaymentView, build_detailer_payload_from_booking_data

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _ip_limited(request, group: str, rate: str) -> bool:
    """
    True when this IP has exceeded ``rate`` for ``group``.

    Args:
        request: Incoming request (IP from django-ratelimit ``key="ip"``).
        group: Distinct bucket per action (e.g. ``guest_lookup_vehicle``).
        rate: django-ratelimit string such as ``3/h`` or ``30/m``.
    """
    return is_ratelimited(
        request,
        group=group,
        key="ip",
        rate=rate,
        method=request.method,
        increment=True,
    )


def _limit_response(message: str) -> Response:
    """
    JSON 429 used by the extra per-action IP limits (on top of the view decorator).

    Args:
        message: Client-facing reason.

    Returns:
        Response: ``code=rate_limited``.
    """
    return Response({"error": message, "code": "rate_limited"}, status=status.HTTP_429_TOO_MANY_REQUESTS)


def _invalid_token_response() -> Response:
    """Same 404 for missing and unknown tokens so the URL cannot be probed."""
    return Response(
        {"error": "This link is invalid or has expired.", "code": "invalid_token"},
        status=status.HTTP_404_NOT_FOUND,
    )


class _GuestPayRequest:
    """
    Minimal stand-in for a DRF ``Request`` used by ``PaymentView.create_payment_sheet``.

    That method only reads ``.user`` and ``.data``. Guests have no JWT, so we cannot
    pass the public request through as an authenticated user.
    """

    def __init__(self, user, data):
        self.user = user
        self.data = data


def _guest_user_for_voucher_apply(body: dict):
    """
    Resolve the shadow guest user for voucher validation.

    Uses the same email as checkout so voucher assignment matches payment.

    Raises:
        GuestEmailInUse: Registered account owns this email.
        ValueError: Missing or invalid contact fields.
    """
    email = (body.get("email") or "").strip().lower()
    name = (body.get("name") or "").strip()
    phone = sanitize_guest_phone(body.get("phone") or "")
    if not name or not email or not _EMAIL_RE.match(email):
        raise ValueError("Name and a valid email are required to apply a voucher.")
    if len("".join(ch for ch in phone if ch.isdigit())) < 7:
        raise ValueError("A phone number is required to apply a voucher.")
    return get_or_create_guest_user(name=name, email=email, phone=phone)


def _voucher_apply_response(voucher_type: str, voucher, pre: Decimal, discount: Decimal, due: Decimal):
    """Shared JSON shape for guest voucher apply endpoints (matches member checkout)."""
    cents = amount_due_cents(pre, discount)
    return Response(
        {
            "valid": True,
            "voucher_type": voucher_type,
            "voucher_id": str(voucher.id),
            "credit_amount": float(voucher.credit_amount),
            "discount_applied": float(discount),
            "pre_voucher_total": float(pre),
            "amount_due": float(due),
            "amount_due_cents": cents,
        },
        status=status.HTTP_200_OK,
    )


@method_decorator(
    ratelimit(key="ip", rate="60/m", method="GET", block=rate_limit_json_response),
    name="get",
)
@method_decorator(
    ratelimit(key="ip", rate="30/m", method="POST", block=rate_limit_json_response),
    name="post",
)
class GuestBookingView(APIView):
    """
    Public guest booking: catalog, lookup, quote, slots, payment sheet, confirm, results, claim.

    No JWT. Contact details are collected at ``create_payment_sheet`` and stored on a
    shadow ``User`` with ``is_guest=True``. Loyalty and complimentary washes are
    stripped before payment; email-matched vouchers are validated like member checkout.
    ``claim_account`` sets a password on that same row.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    GET_ACTIONS = ("catalog", "get_timeslots", "results", "claim")
    POST_ACTIONS = (
        "lookup_vehicle",
        "quote_booking",
        "apply_winner_voucher",
        "apply_gift_voucher",
        "create_payment_sheet",
        "confirm_payment_intent",
        "claim_account",
    )
    action_handlers = {
        "catalog": "get_catalog",
        "lookup_vehicle": "lookup_vehicle",
        "quote_booking": "quote_booking",
        "get_timeslots": "get_timeslots",
        "results": "get_results",
        "claim": "get_claim",
        "apply_winner_voucher": "apply_winner_voucher",
        "apply_gift_voucher": "apply_gift_voucher",
        "create_payment_sheet": "create_payment_sheet",
        "confirm_payment_intent": "confirm_payment_intent",
        "claim_account": "claim_account",
    }

    def get(self, request, *args, **kwargs):
        """
        Route GET by URL ``action``.

        Args:
            request: Unauthenticated request.
            **kwargs: Must include ``action`` in ``GET_ACTIONS``.
        """
        action = kwargs.get("action")
        if action not in self.GET_ACTIONS:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)

    def post(self, request, *args, **kwargs):
        """
        Route POST by URL ``action``.

        Args:
            request: Unauthenticated request.
            **kwargs: Must include ``action`` in ``POST_ACTIONS``.
        """
        action = kwargs.get("action")
        if action not in self.POST_ACTIONS:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)

    def get_catalog(self, request):
        """
        Public service, valet, and add-on lists (standard B2C prices).

        Omits ``fleet_price``. Used by the guest wizard before any contact details exist.
        """
        services = [
            {
                "id": service.id,
                "name": service.name,
                "description": service.description,
                "price": float(service.price),
                "duration": service.duration,
            }
            for service in ServiceType.objects.all().order_by("price")
        ]
        valets = [
            {"id": valet.id, "name": valet.name, "description": valet.description}
            for valet in ValetType.objects.all()
        ]
        add_ons = [
            {
                "id": add_on.id,
                "name": add_on.name,
                "price": float(add_on.price),
                "description": add_on.description,
                "extra_duration": add_on.extra_duration,
            }
            for add_on in AddOns.objects.all().order_by("price")
        ]
        return Response(
            {"services": services, "valets": valets, "add_ons": add_ons},
            status=status.HTTP_200_OK,
        )

    def lookup_vehicle(self, request):
        """
        Ireland RegCheck lookup plus plate-ownership policy for guest checkout.

        Returns a short-lived ``lookup_token`` (cached vehicle blob) so payment can
        persist the vehicle without a second provider call. Extra IP limit: 3/hour.
        """
        if _ip_limited(request, "guest_lookup_vehicle", "3/h"):
            return _limit_response(
                "Registration lookup is limited to three times per hour. Please try again later."
            )

        reg = canonical_guest_registration(
            request.data.get("registration_number") or request.data.get("licence") or ""
        )
        canon = canonical_guest_country(request.data.get("country"))
        if canon != "Ireland":
            return Response(
                {"error": "Lookup is only available for Ireland", "code": "unsupported_country"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not reg:
            return Response(
                {"error": "Registration number required", "code": "validation"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        username = getattr(django_settings, "CAR_REG_USERNAME", None)
        if not username:
            return Response(
                {"error": "Registration lookup is not configured", "code": "config_error"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            payload = lookup_ireland(reg, username=str(username))
        except RegcheckIrelandError as exc:
            st = (
                status.HTTP_503_SERVICE_UNAVAILABLE
                if exc.code == "upstream_error"
                else status.HTTP_400_BAD_REQUEST
            )
            return Response({"error": str(exc), "code": exc.code}, status=st)

        token = secrets.token_urlsafe(32)
        cache.set(lookup_cache_key(token), ireland_payload_for_cache(payload), LOOKUP_TTL_SECONDS)

        preview = {
            "registration_number": payload["registration_number"],
            "country": "Ireland",
            "make": payload["make"],
            "model": payload["model"],
            "year": payload["year"],
            "color": payload.get("color") or None,
            "body_style": payload.get("body_style"),
            "image_url": payload.get("provider_image_url"),
        }
        plate = guest_vehicle_ownership_status(preview["registration_number"], preview["country"])
        # No guest user yet: another guest's plate can continue if they use the same
        # email at pay. Registered owners are blocked immediately.
        can_book = plate["status"] != PLATE_OWNED_BY_REGISTERED

        return Response(
            {
                "preview": preview,
                "lookup_token": token,
                "expires_in_seconds": LOOKUP_TTL_SECONDS,
                "plate": {
                    "status": plate["status"],
                    "can_book": can_book,
                    "message": plate["message"],
                },
            },
            status=status.HTTP_200_OK,
        )

    def quote_booking(self, request):
        """
        Anonymous B2C quote: no loyalty, vouchers, or complimentary washes.

        Calls ``quote_booking_for_user(None, ...)`` so promo helpers treat the
        shopper as excluded from promotions.
        """
        if _ip_limited(request, "guest_quote_booking", "30/m"):
            return _limit_response("Too many quote requests. Please try again shortly.")

        body = request.data or {}
        try:
            sid = body.get("service_type_id")
            if not sid:
                return Response(
                    {"error": "service_type_id is required"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            service = ServiceType.objects.get(id=sid)
        except ServiceType.DoesNotExist:
            return Response({"error": "Invalid service_type_id"}, status=status.HTTP_400_BAD_REQUEST)

        addon_ids = body.get("addon_ids")
        if addon_ids is None:
            addon_ids = []
        if not isinstance(addon_ids, (list, tuple)):
            return Response({"error": "addon_ids must be an array"}, status=status.HTTP_400_BAD_REQUEST)
        addons = list(AddOns.objects.filter(id__in=list(addon_ids)))
        is_suv = resolve_is_suv_mpv(
            is_suv=bool(body.get("is_suv")) if "is_suv" in body else None,
            body_style=body.get("body_style") or body.get("bodyStyle"),
        )
        payload = quote_booking_for_user(
            None,
            service=service,
            addons=addons,
            is_suv=is_suv,
            is_express=bool(body.get("is_express")),
            apply_partner_booking_discount=False,
        )
        return Response(payload, status=status.HTTP_200_OK)

    def apply_winner_voucher(self, request):
        """
        Validate a winner discount code for a guest checkout email.

        Body: ``code``, ``pre_voucher_total_amount``, ``name``, ``email``, ``phone``.
        Creates or reuses the shadow guest user so eligibility matches payment.
        """
        if _ip_limited(request, "guest_apply_winner_voucher", "20/h"):
            return _limit_response("Too many voucher attempts. Please try again later.")

        body = request.data or {}
        code = body.get("code")
        pre_raw = body.get("pre_voucher_total_amount")
        if not code or pre_raw is None:
            return Response(
                {"error": "code and pre_voucher_total_amount are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            user = _guest_user_for_voucher_apply(body)
        except GuestEmailInUse as exc:
            return Response({"error": str(exc), "code": exc.code}, status=status.HTTP_409_CONFLICT)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            voucher = WinnerVoucher.objects.get(code=normalize_winner_code(code))
        except WinnerVoucher.DoesNotExist:
            return Response({"error": "Invalid code"}, status=status.HTTP_400_BAD_REQUEST)
        validity_issue = winner_voucher_validity_issue(voucher)
        if validity_issue:
            return Response(
                {"error": winner_voucher_validity_user_message(validity_issue)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not voucher_eligible_for_checkout(voucher, user):
            return Response(
                {"error": "This code cannot be used with this email"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pre = Decimal(str(pre_raw))
        discount = compute_winner_discount(voucher, pre)
        due = pre - discount
        if due < 0:
            due = Decimal("0")
        return _voucher_apply_response("winner", voucher, pre, discount, due)

    def apply_gift_voucher(self, request):
        """
        Validate a gift voucher code for a guest checkout email.

        Body: ``code``, ``pre_voucher_total_amount``, ``name``, ``email``, ``phone``.
        """
        if _ip_limited(request, "guest_apply_gift_voucher", "20/h"):
            return _limit_response("Too many voucher attempts. Please try again later.")

        body = request.data or {}
        code = body.get("code")
        pre_raw = body.get("pre_voucher_total_amount")
        if not code or pre_raw is None:
            return Response(
                {"error": "code and pre_voucher_total_amount are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            user = _guest_user_for_voucher_apply(body)
        except GuestEmailInUse as exc:
            return Response({"error": str(exc), "code": exc.code}, status=status.HTTP_409_CONFLICT)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            voucher = GiftVoucher.objects.get(code=normalize_winner_code(code))
        except GiftVoucher.DoesNotExist:
            return Response({"error": "Invalid code"}, status=status.HTTP_400_BAD_REQUEST)
        validity_issue = gift_voucher_validity_issue(voucher)
        if validity_issue:
            return Response(
                {"error": gift_voucher_validity_user_message(validity_issue)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not gift_voucher_eligible_for_checkout(voucher, user):
            return Response(
                {"error": "This code cannot be used with this email"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pre = Decimal(str(pre_raw))
        discount = compute_gift_discount(voucher, pre)
        due = pre - discount
        if due < 0:
            due = Decimal("0")
        return _voucher_apply_response("gift", voucher, pre, discount, due)

    def get_timeslots(self, request):
        """
        Proxy crew availability the same way authenticated booking does.

        Query params: date, country, city, optional service_duration, is_express_service,
        latitude, longitude. Hits the detailer ``get_timeslots`` matcher (~30 km).
        """
        if _ip_limited(request, "guest_get_timeslots", "30/m"):
            return _limit_response("Too many availability checks. Please try again shortly.")

        detailer_app_url = getattr(django_settings, "DETAILER_APP_URL", None) or getattr(
            django_settings, "API_CONFIG", {}
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

        params = {"date": date_str, "country": country, "city": city}
        try:
            params["service_duration"] = int(src.get("service_duration") or 60)
        except (TypeError, ValueError):
            params["service_duration"] = 60
        express = (src.get("is_express_service") or "").strip().lower()
        params["is_express_service"] = "true" if express in ("true", "1", "yes") else "false"
        for key in ("latitude", "longitude"):
            value = src.get(key)
            if value is not None and str(value).strip() != "":
                params[key] = value

        url = f"{str(detailer_app_url).rstrip('/')}/api/v1/availability/get_timeslots/"
        try:
            response = requests.get(url, params=params, headers=detailer_request_headers(), timeout=15)
        except requests.RequestException as exc:
            logger.error("guest get_timeslots proxy failed: %s", exc)
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
        logger.error("guest get_timeslots crew returned %s: %s", response.status_code, body)
        return Response(
            {
                "error": body.get("error")
                if isinstance(body, dict)
                else "Unable to check available hours. Please try again.",
                "slots": [],
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )

    def get_results(self, request):
        """
        Public booking status, photos, and health-check notes for a guest results token.

        Query: ``token`` (raw secret from the emailed URL). Missing and invalid tokens
        share the same 404 body.
        """
        if _ip_limited(request, "guest_results", "30/m"):
            return _limit_response("Too many requests. Please try again shortly.")
        raw = (request.query_params.get("token") or "").strip()
        if not raw:
            return _invalid_token_response()
        token = get_valid_guest_access_token(raw)
        if token is None:
            return _invalid_token_response()
        return Response(serialize_guest_results(token), status=status.HTTP_200_OK)

    def create_payment_sheet(self, request):
        """
        Create a guest user, persist vehicle/address, then reuse the paid booking sheet.

        Extra IP limit: 8/hour. Body must include name, email, phone, ``lookup_token``,
        and ``booking_data``. Loyalty fields in ``booking_data`` are stripped; vouchers
        are validated at payment when present.
        """
        if _ip_limited(request, "guest_create_payment_sheet", "8/h"):
            return _limit_response("Too many checkout attempts. Please try again later.")

        body = request.data or {}
        name = (body.get("name") or "").strip()
        email = (body.get("email") or "").strip().lower()
        phone = sanitize_guest_phone(body.get("phone") or "")
        lookup_token = (body.get("lookup_token") or "").strip()
        if not name or not email or not _EMAIL_RE.match(email):
            return Response(
                {"error": "Name and a valid email are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len("".join(ch for ch in phone if ch.isdigit())) < 7:
            return Response(
                {"error": "A phone number is required so the detailer can reach you."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not lookup_token:
            return Response(
                {"error": "Vehicle lookup is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        booking_data = body.get("booking_data")
        if not booking_data or not isinstance(booking_data, dict):
            return Response(
                {"error": "booking_data is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        booking_data = sanitize_guest_booking_data(booking_data)

        try:
            user = get_or_create_guest_user(name=name, email=email, phone=phone)
        except GuestEmailInUse as exc:
            return Response({"error": str(exc), "code": exc.code}, status=status.HTTP_409_CONFLICT)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            vehicle = persist_guest_vehicle(user, lookup_token)
            address_payload = booking_data.get("address") if isinstance(booking_data.get("address"), dict) else {}
            address = persist_guest_address(user, address_payload)
        except GuestPlateBlocked as exc:
            return Response({"error": str(exc), "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        vehicle_payload = booking_data.get("vehicle") if isinstance(booking_data.get("vehicle"), dict) else {}
        vehicle_payload.update(
            {
                "id": str(vehicle.id),
                "make": vehicle.make,
                "model": vehicle.model,
                "year": vehicle.year,
                "color": vehicle.color,
                "registration_number": vehicle.registration_number,
                "licence": vehicle.registration_number,
                "country": vehicle.country,
                "body_style": vehicle.body_style,
            }
        )
        booking_data["vehicle"] = vehicle_payload
        booking_data["address"] = {
            "id": str(address.id),
            "address": address.address,
            "post_code": address.post_code,
            "city": address.city,
            "country": address.country,
            "latitude": float(address.latitude) if address.latitude is not None else None,
            "longitude": float(address.longitude) if address.longitude is not None else None,
        }

        booking_reference = body.get("booking_reference") or booking_data.get("booking_reference")
        if not booking_reference:
            booking_reference = f"APT{int(time.time() * 1000)}{str(uuid.uuid4())[:8].upper()}"
        booking_data["booking_reference"] = booking_reference

        detailer_booking_data = build_detailer_payload_from_booking_data(
            booking_data, user, booking_reference
        )

        amount = body.get("amount", 0)
        pay_request = _GuestPayRequest(
            user,
            {
                "booking_data": booking_data,
                "detailer_booking_data": detailer_booking_data,
                "booking_reference": booking_reference,
                "amount": amount,
            },
        )
        return PaymentView().create_payment_sheet(pay_request)

    def confirm_payment_intent(self, request):
        """
        Poll webhook fulfillment for a guest PaymentIntent (id is the capability).

        Member PaymentIntents are treated as unconfirmed so this public endpoint
        cannot be used to probe another customer's checkout.
        """
        if _ip_limited(request, "guest_confirm_payment_intent", "30/m"):
            return _limit_response("Too many confirmation checks. Please try again shortly.")
        payment_intent_id = (request.data or {}).get("payment_intent_id")
        if not payment_intent_id:
            return Response(
                {"error": "payment_intent_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pending = (
            PendingBooking.objects.filter(stripe_payment_intent_id=payment_intent_id)
            .select_related("user")
            .first()
        )
        txn = (
            PaymentTransaction.objects.filter(stripe_payment_intent_id=payment_intent_id)
            .select_related("user")
            .first()
        )
        owner = pending.user if pending is not None else (txn.user if txn is not None else None)
        if owner is not None and not getattr(owner, "is_guest", False):
            return Response(
                {"confirmed": False, "payment_intent_id": payment_intent_id},
                status=status.HTTP_200_OK,
            )
        return PaymentView().confirm_payment_intent(request)

    def get_claim(self, request):
        """
        Prefill the claim form: email, booking, and whether this user already registered.

        Query: ``token`` (same secret as the results page).
        """
        if _ip_limited(request, "guest_claim_preview", "30/m"):
            return _limit_response("Too many requests. Please try again shortly.")
        raw = (request.query_params.get("token") or "").strip()
        if not raw:
            return _invalid_token_response()
        token = get_valid_guest_access_token(raw)
        if token is None:
            return _invalid_token_response()
        return Response(serialize_guest_claim_preview(token), status=status.HTTP_200_OK)

    def claim_account(self, request):
        """
        Set a password on the guest ``User`` and return a JWT session.

        Body: ``token``, ``password``, optional ``allow_marketing``. Same User pk is kept
        so garage vehicles and booking history stay attached.
        """
        if _ip_limited(request, "guest_claim_account", "8/h"):
            return _limit_response("Too many account attempts. Please try again later.")
        body = request.data or {}
        raw = (body.get("token") or "").strip()
        password = body.get("password") or ""
        allow_marketing = bool(body.get("allow_marketing"))
        if not raw:
            return _invalid_token_response()
        token = get_valid_guest_access_token(raw)
        if token is None:
            return _invalid_token_response()
        try:
            user = claim_guest_account(
                token,
                password,
                allow_marketing=allow_marketing,
            )
        except GuestAlreadyRegistered as exc:
            return Response(
                {"error": str(exc), "code": exc.code},
                status=status.HTTP_409_CONFLICT,
            )
        except GuestPasswordInvalid as exc:
            return Response({"error": str(exc), "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)

        from main.tasks import send_welcome_email

        send_welcome_email.apply_async(args=[user.email], countdown=60)
        return Response(_claimed_auth_payload(user), status=status.HTTP_200_OK)


def _claimed_auth_payload(user) -> dict:
    """
    JWT pair plus profile, matching login/register so the SPA can apply a session.

    Args:
        user: Newly claimed (no longer guest) ``User``.

    Returns:
        dict: ``access``, ``refresh``, ``user``, ``message``.
    """
    refresh = RefreshToken.for_user(user)
    address = Address.objects.filter(user=user).first()
    loyalty = (
        LoyaltyProgram.objects.filter(user=user).first()
        if user.is_b2c_user()
        else None
    )
    loyalty_benefits = loyalty.get_tier_benefits() if loyalty else None
    is_dealership = False
    partner_referral_code = None
    partner_business_name = None
    try:
        partner_profile = user.partner_profile
        is_dealership = True
        partner_referral_code = partner_profile.referral_code
        partner_business_name = partner_profile.business_name
    except Partner.DoesNotExist:
        pass
    return {
        "message": "Your account is ready. Your bookings and vehicles are in the garage.",
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": {
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "phone": user.phone,
            "is_fleet_owner": user.is_fleet_owner,
            "is_branch_admin": user.is_branch_admin,
            "is_guest": user.is_guest,
            "is_dealership": is_dealership,
            "partner_referral_code": partner_referral_code,
            "business_name": partner_business_name,
            "managed_branch": None,
            "address": {
                "address": address.address if address else None,
                "city": address.city if address else None,
                "post_code": address.post_code if address else None,
                "country": address.country if address else None,
            },
            "push_notification_token": user.allow_push_notifications,
            "email_notification_token": user.allow_email_notifications,
            "marketing_email_token": user.allow_marketing_emails,
            "loyalty_tier": loyalty.current_tier if loyalty else None,
            "loyalty_benefits": loyalty_benefits,
            "referral_code": user.referral_code if user.referral_code else None,
        },
    }
