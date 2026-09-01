"""
Image proxy for booking photos.

Authenticated ``BookingImageProxyView`` watermarks images for non-subscribers.
Public ``GuestBookingImageProxyView`` serves clean bytes when a guest results
token matches the booking.
"""
from __future__ import annotations

import logging

import requests
from django.http import HttpResponse
from django_ratelimit.core import is_ratelimited
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from main.models import BookedAppointment, BookedAppointmentImage, Fleet, FleetVehicle
from main.services.guest import get_valid_guest_access_token
from main.services.image_watermark import (
    apply_watermark,
    cache_watermarked_image,
    get_cached_watermark,
)
from main.utils.ratelimit_helpers import rate_limit_json_response
from main.utils.subscription_entitlement import should_watermark_images

logger = logging.getLogger(__name__)

IMAGE_FETCH_TIMEOUT = 10  # seconds


class BookingImageProxyView(APIView):
    """
    Proxy endpoint for serving booking images with subscription-based watermarking.

    GET /api/v1/images/<image_id>/

    Returns the image directly (watermarked for non-subscribers, clean for subscribers).
    Requires authentication and booking access verification.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, image_id):
        """
        Serve a booking image, applying watermark if user is not subscribed.

        Args:
            request: HTTP request with authenticated user.
            image_id: UUID of the BookedAppointmentImage.

        Returns:
            HttpResponse with image data and appropriate content type.
        """
        try:
            image = BookedAppointmentImage.objects.select_related(
                'booking', 'booking__bulk_order'
            ).get(id=image_id)
        except BookedAppointmentImage.DoesNotExist:
            return Response(
                {'error': 'Image not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        if not self._user_can_access_image(request.user, image):
            return Response(
                {'error': 'Access denied'},
                status=status.HTTP_403_FORBIDDEN
            )

        image_url = image.image_url
        if not image_url:
            return Response(
                {'error': 'Image URL not available'},
                status=status.HTTP_404_NOT_FOUND
            )

        needs_watermark = should_watermark_images(request.user)

        if needs_watermark:
            cached = get_cached_watermark(image_url)
            if cached:
                return self._image_response(cached, 'image/jpeg')

        try:
            image_data = self._fetch_image(image_url)
        except Exception as e:
            logger.error(f"Failed to fetch image {image_id}: {e}")
            return Response(
                {'error': 'Could not retrieve image'},
                status=status.HTTP_502_BAD_GATEWAY
            )

        if needs_watermark:
            try:
                watermarked = apply_watermark(image_data)
                cache_watermarked_image(image_url, watermarked)
                return self._image_response(watermarked, 'image/jpeg')
            except Exception as e:
                logger.error(f"Failed to watermark image {image_id}: {e}")
                return self._image_response(image_data, self._detect_content_type(image_url))

        return self._image_response(image_data, self._detect_content_type(image_url))

    def _user_can_access_image(self, user, image: BookedAppointmentImage) -> bool:
        """
        Verify the user has access to view this image's booking.

        Args:
            user: Authenticated user.
            image: The BookedAppointmentImage instance.

        Returns:
            bool: True if user can access the image.
        """
        booking = image.booking
        if not booking:
            return False

        if booking.user == user:
            return True

        if user.is_branch_admin:
            managed_branch = user.get_managed_branch()
            if managed_branch and booking.vehicle:
                return FleetVehicle.objects.filter(
                    fleet=managed_branch.fleet,
                    branch=managed_branch,
                    vehicle=booking.vehicle
                ).exists()

        if user.is_fleet_owner:
            fleet = Fleet.objects.filter(owner=user).first()
            if fleet and booking.vehicle:
                return FleetVehicle.objects.filter(
                    fleet=fleet,
                    vehicle=booking.vehicle
                ).exists()

        bulk_order = getattr(booking, 'bulk_order', None)
        if bulk_order and booking.vehicle is None:
            if user == bulk_order.user:
                return True
            if user.is_branch_admin:
                managed_branch = user.get_managed_branch()
                if managed_branch and bulk_order.branch_id == managed_branch.id:
                    return True
            if user.is_fleet_owner:
                fleet = Fleet.objects.filter(owner=user).first()
                if fleet and bulk_order.fleet_id == fleet.id:
                    return True

        return False

    def _fetch_image(self, url: str) -> bytes:
        """
        Fetch image bytes from a URL.

        Args:
            url: Image URL (GCS or other).

        Returns:
            Raw image bytes.

        Raises:
            requests.RequestException: On fetch failure.
        """
        response = requests.get(url, timeout=IMAGE_FETCH_TIMEOUT)
        response.raise_for_status()
        return response.content

    def _image_response(self, data: bytes, content_type: str) -> HttpResponse:
        """
        Create an HTTP response for image data.

        Args:
            data: Image bytes.
            content_type: MIME type.

        Returns:
            HttpResponse with image.
        """
        response = HttpResponse(data, content_type=content_type)
        response['Cache-Control'] = 'private, max-age=3600'
        return response

    def _detect_content_type(self, url: str) -> str:
        """
        Detect content type from URL extension.

        Args:
            url: Image URL.

        Returns:
            MIME type string.
        """
        url_lower = url.lower()
        if url_lower.endswith('.png'):
            return 'image/png'
        if url_lower.endswith('.gif'):
            return 'image/gif'
        if url_lower.endswith('.webp'):
            return 'image/webp'
        return 'image/jpeg'


class GuestBookingImageProxyView(BookingImageProxyView):
    """
    Public clean-image proxy for a valid guest results token.

    GET /api/v1/guest/images/<image_id>/?token=...
    Optional ``download=1`` sets Content-Disposition: attachment.
    Guests always receive unwatermarked bytes (no subscription check).
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def _guest_image_not_found(self):
        """Identical 404 for missing and wrong-booking images (no existence leak)."""
        return Response(
            {"error": "Image not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    def get(self, request, image_id):
        """
        Serve a booking image when ``token`` matches that booking.

        Does not update ``last_used_at`` (``touch=False``) so a gallery load does
        not write the database once per photo. IP limit: 60/minute.

        Args:
            request: Unauthenticated request; query ``token`` is required.
            image_id: UUID of ``BookedAppointmentImage``.

        Returns:
            HttpResponse with image bytes, or JSON 404/429/502.
        """
        if is_ratelimited(
            request,
            group="guest_image_proxy",
            key="ip",
            rate="60/m",
            method="GET",
            increment=True,
        ):
            return rate_limit_json_response(request)

        raw = (request.query_params.get("token") or "").strip()
        token = get_valid_guest_access_token(raw, touch=False)
        if token is None:
            return Response(
                {"error": "This link is invalid or has expired.", "code": "invalid_token"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            image = BookedAppointmentImage.objects.select_related("booking").get(id=image_id)
        except BookedAppointmentImage.DoesNotExist:
            return self._guest_image_not_found()

        if image.booking_id != token.booking_id:
            return self._guest_image_not_found()

        image_url = image.image_url
        if not image_url:
            return self._guest_image_not_found()

        try:
            image_data = self._fetch_image(image_url)
        except Exception as exc:
            logger.error("Failed to fetch guest image %s: %s", image_id, exc)
            return Response(
                {"error": "Could not retrieve image"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        content_type = self._detect_content_type(image_url)
        response = self._image_response(image_data, content_type)
        want_download = str(request.query_params.get("download") or "").strip() in (
            "1",
            "true",
            "yes",
        )
        kind = image.image_type or "photo"
        segment = image.segment or "vehicle"
        filename = f"prisma-{kind}-{segment}-{str(image.id)[:8]}.jpg"
        if want_download:
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
        else:
            response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response
