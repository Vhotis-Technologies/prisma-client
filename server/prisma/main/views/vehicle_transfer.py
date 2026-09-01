"""
Vehicle transfer web flow: approve or reject a transfer via email link.

WebTransferActionView: GET shows confirm/reject page; POST confirms or rejects.
JSON when ``Accept`` prefers ``application/json`` (SPA). HTML otherwise (old email links).
AllowAny — the UUID in the URL is the capability token.
"""
from django.http import JsonResponse
from django.shortcuts import render
from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from main.models import VehicleTransfer
from main.services.vehicle_transfer_actions import (
    apply_vehicle_transfer_approval,
    apply_vehicle_transfer_rejection,
)


def _transfer_rate_limit_block(request):
    """429 JSON when transfer POST rate is exceeded."""
    return JsonResponse({"detail": "Too many requests. Try again later."}, status=429)


def _wants_json(request):
    """True when the client prefers JSON over HTML (SPA axios vs browser navigation)."""
    accept = (request.headers.get("Accept") or "").lower()
    if "application/json" not in accept:
        return False
    html_pos = accept.find("text/html")
    json_pos = accept.find("application/json")
    return html_pos == -1 or json_pos < html_pos


def _transfer_payload(transfer, **extra):
    """Serialize a transfer for the SPA (same fields as the HTML confirm page)."""
    vehicle = transfer.vehicle
    requester = transfer.to_owner
    owner = transfer.from_owner
    payload = {
        "transfer_id": str(transfer.id),
        "status": transfer.status,
        "vehicle": {
            "make": vehicle.make,
            "model": vehicle.model,
            "year": vehicle.year,
            "registration_number": vehicle.registration_number,
            "color": getattr(vehicle, "color", "") or "",
        },
        "requester": {
            "name": getattr(requester, "name", "") or "",
            "email": getattr(requester, "email", "") or "",
        },
        "owner": {
            "name": getattr(owner, "name", "") or "",
            "email": getattr(owner, "email", "") or "",
        },
        "expires_at": transfer.expires_at.isoformat() if transfer.expires_at else None,
        "requested_at": (
            transfer.requested_at.isoformat() if getattr(transfer, "requested_at", None) else None
        ),
    }
    payload.update(extra)
    return payload


@method_decorator(
    ratelimit(key="ip", rate="10/m", method="POST", block=_transfer_rate_limit_block),
    name="post",
)
class WebTransferActionView(APIView):
    """GET/POST ``/api/v1/garage/web-transfer-action/<uuid:transfer_id>/``."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, transfer_id):
        """Display the transfer confirmation page, or JSON details for the SPA."""
        wants_json = _wants_json(request)
        try:
            transfer = VehicleTransfer.objects.select_related(
                "vehicle", "from_owner", "to_owner"
            ).get(id=transfer_id)

            if transfer.status != "pending":
                if wants_json:
                    return Response(
                        _transfer_payload(
                            transfer,
                            valid=False,
                            error=f"This transfer request is {transfer.status} and cannot be processed",
                        ),
                        status=status.HTTP_200_OK,
                    )
                return render(
                    request,
                    "transfer_invalid.html",
                    {
                        "error": f"This transfer request is {transfer.status} and cannot be processed",
                        "transfer": transfer,
                    },
                )

            if transfer.is_expired():
                transfer.status = "expired"
                transfer.save()
                if wants_json:
                    return Response(
                        _transfer_payload(
                            transfer,
                            valid=False,
                            error="This transfer request has expired",
                        ),
                        status=status.HTTP_200_OK,
                    )
                return render(
                    request,
                    "transfer_invalid.html",
                    {
                        "error": "This transfer request has expired",
                        "transfer": transfer,
                    },
                )

            if wants_json:
                return Response(_transfer_payload(transfer, valid=True), status=status.HTTP_200_OK)

            return render(
                request,
                "transfer_action_confirm.html",
                {
                    "transfer": transfer,
                    "vehicle": transfer.vehicle,
                    "requester": transfer.to_owner,
                    "owner": transfer.from_owner,
                    "expires_at": transfer.expires_at,
                },
            )

        except VehicleTransfer.DoesNotExist:
            if wants_json:
                return Response(
                    {"valid": False, "error": "Transfer request not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )
            return render(request, "transfer_invalid.html", {"error": "Transfer request not found"})
        except Exception as e:
            if wants_json:
                return Response(
                    {"valid": False, "error": "An error occurred. Try again later."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            return render(
                request,
                "transfer_invalid.html",
                {"error": f"An error occurred: {str(e)}"},
            )

    def post(self, request, transfer_id):
        """Process transfer approval or rejection (HTML form or SPA JSON)."""
        wants_json = _wants_json(request)
        raw = request.data.get("action") if hasattr(request, "data") else None
        if raw is None:
            raw = request.POST.get("action", "")
        action = str(raw or "").strip().lower()

        if action not in ["approve", "reject"]:
            if wants_json:
                return Response(
                    {"success": False, "error": "Invalid action. Please use approve or reject."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return render(
                request,
                "transfer_invalid.html",
                {"error": "Invalid action. Please use approve or reject."},
            )

        try:
            transfer = VehicleTransfer.objects.select_related(
                "vehicle", "from_owner", "to_owner"
            ).get(id=transfer_id)

            if transfer.status != "pending":
                err = f"This transfer request is {transfer.status} and cannot be processed"
                if wants_json:
                    return Response(
                        _transfer_payload(transfer, success=False, error=err),
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                return render(
                    request,
                    "transfer_invalid.html",
                    {"error": err, "transfer": transfer},
                )

            if transfer.is_expired():
                transfer.status = "expired"
                transfer.save()
                err = "This transfer request has expired"
                if wants_json:
                    return Response(
                        _transfer_payload(transfer, success=False, error=err),
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                return render(
                    request,
                    "transfer_invalid.html",
                    {"error": err, "transfer": transfer},
                )

            if action == "approve":
                return self._process_approval(request, transfer, wants_json)
            return self._process_rejection(request, transfer, wants_json)

        except VehicleTransfer.DoesNotExist:
            if wants_json:
                return Response(
                    {"success": False, "error": "Transfer request not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )
            return render(request, "transfer_invalid.html", {"error": "Transfer request not found"})
        except Exception as e:
            if wants_json:
                return Response(
                    {"success": False, "error": "An error occurred. Try again later."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            return render(
                request,
                "transfer_invalid.html",
                {"error": f"An error occurred: {str(e)}"},
            )

    def _process_approval(self, request, transfer, wants_json=False):
        """Apply ownership change and notify parties via apply_vehicle_transfer_approval."""
        try:
            err = apply_vehicle_transfer_approval(transfer)
            if err:
                if wants_json:
                    transfer.refresh_from_db()
                    return Response(
                        _transfer_payload(transfer, success=False, error=err),
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                return render(
                    request,
                    "transfer_invalid.html",
                    {"error": err, "transfer": transfer},
                )
            transfer.refresh_from_db()
            if wants_json:
                return Response(
                    _transfer_payload(transfer, success=True, action="approve"),
                    status=status.HTTP_200_OK,
                )
            return render(
                request,
                "transfer_approve_success.html",
                {
                    "transfer": transfer,
                    "vehicle": transfer.vehicle,
                    "requester": transfer.to_owner,
                    "owner": transfer.from_owner,
                },
            )
        except Exception as e:
            if wants_json:
                return Response(
                    {"success": False, "error": "Failed to approve transfer. Try again later."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            return render(
                request,
                "transfer_invalid.html",
                {"error": f"Failed to approve transfer: {str(e)}", "transfer": transfer},
            )

    def _process_rejection(self, request, transfer, wants_json=False):
        """Process transfer rejection. If already expired, set status to expired and skip rejected email."""
        try:
            err = apply_vehicle_transfer_rejection(transfer)
            if err:
                if wants_json:
                    transfer.refresh_from_db()
                    return Response(
                        _transfer_payload(transfer, success=False, error=err),
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                return render(
                    request,
                    "transfer_invalid.html",
                    {"error": err, "transfer": transfer},
                )
            transfer.refresh_from_db()
            if wants_json:
                return Response(
                    _transfer_payload(transfer, success=True, action="reject"),
                    status=status.HTTP_200_OK,
                )
            return render(
                request,
                "transfer_reject_success.html",
                {
                    "transfer": transfer,
                    "vehicle": transfer.vehicle,
                    "requester": transfer.to_owner,
                    "owner": transfer.from_owner,
                },
            )
        except Exception as e:
            if wants_json:
                return Response(
                    {"success": False, "error": "Failed to reject transfer. Try again later."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            return render(
                request,
                "transfer_invalid.html",
                {"error": f"Failed to reject transfer: {str(e)}", "transfer": transfer},
            )
