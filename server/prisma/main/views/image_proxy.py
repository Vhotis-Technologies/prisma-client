"""
Image proxy for booking photos.

Authenticated ``BookingImageProxyView`` streams the stored photo to users who
own (or manage) the booking. Public ``GuestBookingImageProxyView`` serves the
same bytes when a guest results token matches the booking.

GCS photos are loaded with service-account credentials from the stable object
path so expired signed URLs in ``image_url`` still work.
"""
from __future__ import annotations

import logging
from urllib.parse import urlparse

from django.http import HttpResponse
from django_ratelimit.core import is_ratelimited
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from main.models import BookedAppointment, BookedAppointmentImage, Fleet, FleetVehicle
from main.services.guest import get_valid_guest_access_token
from main.utils.gcs_media import fetch_image_bytes
from main.utils.ratelimit_helpers import rate_limit_json_response

logger = logging.getLogger(__name__)

TRUTHY_QUERY_VALUES = ('1', 'true', 'yes')


def _wants_download(request) -> bool:
    """True when the caller asked for the photo as a file attachment."""
    return str(request.query_params.get('download') or '').strip().lower() in TRUTHY_QUERY_VALUES


class BookingImageProxyView(APIView):
    """
    Proxy endpoint for serving booking images.

    GET /api/v1/images/<image_id>/
    Optional ``download=1`` sets Content-Disposition: attachment, and requires
    an active subscription - viewing stays open to anyone who owns the booking.

    Requires authentication and booking access verification.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, image_id):
        """
        Serve a booking image to a user who can access its booking.

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

        want_download = _wants_download(request)
        if want_download and not request.user.can_download_vehicle_details(image.booking.vehicle):
            return Response(
                {
                    'error': 'An active subscription is required to download or share photos.',
                    'code': 'subscription_required',
                },
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            image_data = self._fetch_image(image_url)
        except Exception as e:
            logger.error(f"Failed to fetch image {image_id}: {e}")
            return Response(
                {'error': 'Could not retrieve image'},
                status=status.HTTP_502_BAD_GATEWAY
            )

        response = self._image_response(image_data, self._detect_content_type(image_url))
        self._set_content_disposition(response, image, want_download)
        return response

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
        Fetch image bytes via GCS credentials when possible, else HTTP.

        Args:
            url: Stored image URL (may include an expired GCS signature).

        Returns:
            Raw image bytes.
        """
        return fetch_image_bytes(url)

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

    def _set_content_disposition(
        self,
        response: HttpResponse,
        image: BookedAppointmentImage,
        want_download: bool,
    ) -> None:
        """
        Name the photo and mark it as an attachment when a download was asked for.

        Args:
            response: Image response to annotate.
            image: The BookedAppointmentImage being served.
            want_download: True to force a save-as instead of inline display.
        """
        kind = image.image_type or 'photo'
        segment = image.segment or 'vehicle'
        filename = f"prisma-{kind}-{segment}-{str(image.id)[:8]}.jpg"
        disposition = 'attachment' if want_download else 'inline'
        response['Content-Disposition'] = f'{disposition}; filename="{filename}"'

    def _detect_content_type(self, url: str) -> str:
        """
        Detect content type from URL path extension (ignores query string).

        Args:
            url: Image URL.

        Returns:
            MIME type string.
        """
        path = urlparse(url).path if "://" in (url or "") else (url or "")
        path_lower = path.lower().split("?", 1)[0]
        if path_lower.endswith('.png'):
            return 'image/png'
        if path_lower.endswith('.gif'):
            return 'image/gif'
        if path_lower.endswith('.webp'):
            return 'image/webp'
        return 'image/jpeg'


class GuestBookingImageProxyView(BookingImageProxyView):
    """
    Public image proxy for a valid guest results token.

    GET /api/v1/guest/images/<image_id>/?token=...
    Optional ``download=1`` sets Content-Disposition: attachment.
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

        response = self._image_response(image_data, self._detect_content_type(image_url))
        self._set_content_disposition(response, image, _wants_download(request))
        return response
