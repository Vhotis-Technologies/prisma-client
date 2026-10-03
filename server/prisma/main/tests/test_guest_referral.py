"""
Guest checkout referral checks.

A code is stored on the shadow user and must not change the amount sent to
payment. These cases cover a customer code, a partner code, a bad code, a
self-referral, a repeat guest email, and an unchanged charge.
"""
import json
import uuid
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory

from main.models import Partner, Promotions, Referral, ReferralAttribution, User
from main.views.guest_booking import GuestBookingView
from main.services.guest import (
    GuestReferralInvalid,
    apply_guest_referral,
    get_or_create_guest_user,
    sanitize_guest_booking_data,
)

# Locmem so these requests do not share the Redis rate-limit buckets.
LOCMEM_CACHE = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "guest-referral-tests",
    }
}

CUSTOMER_CODE = "FRIEND1234"
PARTNER_CODE = "DPTESTCODE1"
QUOTED_CENTS = 5000
QUOTED_TOTAL = 50


def _pin_code(user, code):
    """Set a stable referral code. User.save regenerates one on first insert."""
    user.referral_code = code
    user.save(update_fields=["referral_code"])
    return user


def _member(email, name="Referrer"):
    user = User.objects.create_user(email=email, name=name, password="unused-pass-123")
    return user


def _partner(email="partner@example.com"):
    owner = _member(email, name="Depot Owner")
    # Explicit code so Partner.save does not generate a random DP* value.
    return Partner.objects.create(
        user=owner,
        business_name="Depot Motors",
        partner_type="dealership",
        referral_code=PARTNER_CODE,
    )


def _fake_vehicle():
    return SimpleNamespace(
        id=uuid.uuid4(),
        make="Toyota",
        model="Corolla",
        year=2021,
        color="Black",
        registration_number="241D12345",
        country="Ireland",
        body_style="Saloon",
    )


def _fake_address():
    return SimpleNamespace(
        id=uuid.uuid4(),
        address="12 Grafton Street",
        post_code="D02",
        city="Dublin",
        country="Ireland",
        latitude=None,
        longitude=None,
    )


@override_settings(CACHES=LOCMEM_CACHE)
class GuestReferralTests(TestCase):
    """Referral attachment and the guest payment sheet."""

    def setUp(self):
        # Call the view directly so the test does not load HTTP middleware.
        self.factory = APIRequestFactory()
        self.captured = []

    def _checkout(self, email, code=None, field="referral_code"):
        """
        Post a guest payment sheet.

        Vehicle, address, and Stripe are stubbed. The captured payment body is
        what the guest would be charged.
        """
        vehicle = _fake_vehicle()
        address = _fake_address()

        def _sheet(_self, request):
            self.captured.append(request.data)
            return Response(
                {"paymentIntent": "pi_test", "booking_reference": request.data["booking_reference"]},
                status=200,
            )

        body = {
            "name": "Guest Tester",
            "email": email,
            "phone": "0870000000",
            "lookup_token": "lookup-token",
            "amount": QUOTED_CENTS,
            "booking_reference": "APT-GUEST-REF",
            "booking_data": {
                "address": {
                    "address": "12 Grafton Street",
                    "city": "Dublin",
                    "country": "Ireland",
                    "post_code": "D02",
                },
                "total_amount": QUOTED_TOTAL,
                # A client must not be able to opt into a discount on this wash.
                "apply_partner_booking_discount": True,
                "applied_free_quick_sparkle": True,
            },
        }
        if code is not None:
            body[field] = code

        request = self.factory.post(
            "/api/v1/guest/create_payment_sheet/",
            body,
            format="json",
        )
        with (
            patch("main.views.guest_booking.persist_guest_vehicle", return_value=vehicle),
            patch("main.views.guest_booking.persist_guest_address", return_value=address),
            patch("main.views.guest_booking.build_detailer_payload_from_booking_data", return_value={}),
            patch("main.views.guest_booking.PaymentView.create_payment_sheet", _sheet),
        ):
            response = GuestBookingView.as_view()(request, action="create_payment_sheet")
        if hasattr(response, "render"):
            response.render()
        response.data = json.loads(response.content.decode() or "{}")
        return response

    def _assert_list_price(self):
        """The charge matches the quote, with partner discount forced off."""
        self.assertEqual(len(self.captured), 1)
        paid = self.captured[0]
        booking = paid["booking_data"]
        self.assertEqual(paid["amount"], QUOTED_CENTS)
        self.assertEqual(booking["total_amount"], QUOTED_TOTAL)
        self.assertFalse(booking["apply_partner_booking_discount"])
        self.assertFalse(booking["applied_free_quick_sparkle"])

    def test_customer_code_links_referrer_without_a_discount(self):
        referrer = _pin_code(_member("friend@example.com"), CUSTOMER_CODE)
        response = self._checkout("guest-customer@example.com", "friend1234")
        self.assertEqual(response.status_code, 200)
        guest = User.objects.get(email="guest-customer@example.com")
        self.assertTrue(guest.is_guest)
        self.assertEqual(guest.referred_by_id, referrer.id)
        self.assertTrue(Referral.objects.filter(referrer=referrer, referred=guest).exists())
        self.assertFalse(ReferralAttribution.objects.filter(referred_user=guest).exists())
        self._assert_list_price()

    def test_partner_code_creates_later_promotion_without_discounting_this_wash(self):
        partner = _partner()
        response = self._checkout("guest-partner@example.com", "dptestcode1")
        self.assertEqual(response.status_code, 200)
        guest = User.objects.get(email="guest-partner@example.com")
        self.assertIsNone(guest.referred_by_id)
        attribution = ReferralAttribution.objects.get(referred_user=guest)
        self.assertEqual(attribution.partner_id, partner.id)
        self.assertEqual(attribution.source, "partner")
        self.assertIsNotNone(attribution.expires_at)
        promo = Promotions.objects.get(user=guest, title="Partner Referral Discount")
        self.assertEqual(promo.discount_percentage, 40)
        self.assertTrue(promo.is_active)
        self._assert_list_price()

    def test_unknown_code_is_rejected(self):
        response = self._checkout("guest-bad@example.com", "NOTACODE")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "invalid_referral")
        guest = User.objects.get(email="guest-bad@example.com")
        self.assertIsNone(guest.referred_by_id)
        self.assertFalse(Referral.objects.filter(referred=guest).exists())
        self.assertEqual(self.captured, [])

    def test_guest_cannot_use_their_own_code(self):
        guest = get_or_create_guest_user(name="Guest Tester", email="guest-self@example.com", phone="0870000000")
        _pin_code(guest, CUSTOMER_CODE)
        response = self._checkout("guest-self@example.com", CUSTOMER_CODE)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "invalid_referral")
        guest.refresh_from_db()
        self.assertIsNone(guest.referred_by_id)
        self.assertEqual(self.captured, [])

    def test_partner_cannot_apply_their_own_code(self):
        partner = _partner()
        with self.assertRaises(GuestReferralInvalid):
            apply_guest_referral(partner.user, PARTNER_CODE)

    def test_repeat_guest_keeps_the_first_referrer(self):
        referrer = _pin_code(_member("first@example.com"), CUSTOMER_CODE)
        _partner("second-partner@example.com")
        first = self._checkout("guest-repeat@example.com", CUSTOMER_CODE)
        self.assertEqual(first.status_code, 200)
        # A later checkout with a different code must not replace the link.
        self.captured.clear()
        second = self._checkout("guest-repeat@example.com", PARTNER_CODE)
        self.assertEqual(second.status_code, 200)
        guest = User.objects.get(email="guest-repeat@example.com")
        self.assertEqual(guest.referred_by_id, referrer.id)
        self.assertEqual(Referral.objects.filter(referred=guest).count(), 1)
        self.assertFalse(ReferralAttribution.objects.filter(referred_user=guest).exists())
        self.assertFalse(Promotions.objects.filter(user=guest, title="Partner Referral Discount").exists())
        self._assert_list_price()

    def test_blank_code_and_referred_code_alias(self):
        response = self._checkout("guest-blank@example.com", "   ")
        self.assertEqual(response.status_code, 200)
        guest = User.objects.get(email="guest-blank@example.com")
        self.assertIsNone(guest.referred_by_id)
        self._assert_list_price()

        referrer = _pin_code(_member("alias@example.com"), CUSTOMER_CODE)
        self.captured.clear()
        aliased = self._checkout("guest-alias@example.com", CUSTOMER_CODE, field="referred_code")
        self.assertEqual(aliased.status_code, 200)
        alias_guest = User.objects.get(email="guest-alias@example.com")
        self.assertEqual(alias_guest.referred_by_id, referrer.id)
        self._assert_list_price()

    def test_sanitize_keeps_this_wash_at_list_price(self):
        cleaned = sanitize_guest_booking_data(
            {"apply_partner_booking_discount": True, "applied_free_quick_sparkle": True, "total_amount": 50}
        )
        self.assertFalse(cleaned["apply_partner_booking_discount"])
        self.assertFalse(cleaned["applied_free_quick_sparkle"])
        self.assertEqual(cleaned["total_amount"], 50)
