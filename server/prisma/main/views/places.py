"""
Public Google Places proxy (autocomplete + details).

The API key stays server-side; clients must not call Google directly.
"""
from __future__ import annotations

from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from main.services.google_places import autocomplete, place_details, places_configured
from main.utils.ratelimit_helpers import rate_limit_json_response


@method_decorator(
    ratelimit(key="ip", rate="120/m", method="GET", block=rate_limit_json_response),
    name="get",
)
class PlacesView(APIView):
    """
    ``GET places/autocomplete/?input=...&latitude=...&longitude=...&radius=...``
    ``GET places/details/?place_id=...``
    ``GET places/status/`` — whether the server has a Places key configured.
    """

    permission_classes = [AllowAny]

    action_handlers = {
        "autocomplete": "autocomplete",
        "details": "details",
        "status": "status",
    }

    def get(self, request, *args, **kwargs):
        action = kwargs.get("action")
        if action not in self.action_handlers:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)

    def status(self, request):
        return Response({"configured": places_configured()})

    def autocomplete(self, request):
        if not places_configured():
            return Response(
                {"error": "Address search is not configured.", "code": "places_unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        input_text = request.query_params.get("input", "")
        latitude = request.query_params.get("latitude")
        longitude = request.query_params.get("longitude")
        radius = request.query_params.get("radius", "50000")

        lat = float(latitude) if latitude not in (None, "") else None
        lng = float(longitude) if longitude not in (None, "") else None
        try:
            radius_int = int(radius)
        except (TypeError, ValueError):
            radius_int = 50_000

        try:
            payload = autocomplete(
                input_text,
                latitude=lat,
                longitude=lng,
                radius=radius_int,
            )
        except ValueError as exc:
            return Response(
                {"error": str(exc), "code": "places_error"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(payload)

    def details(self, request):
        if not places_configured():
            return Response(
                {"error": "Address search is not configured.", "code": "places_unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        place_id = request.query_params.get("place_id", "")
        try:
            payload = place_details(place_id)
        except ValueError as exc:
            return Response(
                {"error": str(exc), "code": "places_error"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if payload.get("status") != "OK" or not payload.get("result"):
            return Response(
                {"error": "Could not fetch address details.", "code": "place_not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(payload)
