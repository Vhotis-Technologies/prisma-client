"""Support ticket API: create, list, detail (client-owned tickets)."""
import logging

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from main.models import Ticket, TicketUpdate
from main.tasks import send_ticket_created_email

logger = logging.getLogger(__name__)


class TicketView(APIView):
    """Create (POST), list (GET), and detail (GET) for client tickets."""

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """Create a new ticket. URL: /api/v1/tickets/create/"""
        # Path-based routing (not action kwarg)
        if "create" not in request.path:
            return Response({"error": "Invalid path"}, status=status.HTTP_400_BAD_REQUEST)
        return self._create(request)

    def get(self, request, *args, **kwargs):
        """List tickets or get one ticket detail. URL: /api/v1/tickets/list/ or /api/v1/tickets/detail/<id>/"""
        ticket_id = kwargs.get("ticket_id")
        if ticket_id:
            return self._detail(request, ticket_id)
        return self._list(request)

    def _create(self, request):
        """Create a new support ticket. Expects description (required), optional issue_type and booking_reference. Returns ticket payload or 400/500."""
        try:
            issue_type = request.data.get("issue_type") or ""
            booking_reference = (request.data.get("booking_reference") or "").strip() or None
            description = (request.data.get("description") or "").strip()
            if not description:
                return Response(
                    {"error": "Description is required"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            ticket = Ticket.objects.create(
                user=request.user,
                issue_type=issue_type,
                booking_reference=booking_reference,
                description=description,
                status="pending",
            )
            preview = (description[:200] + "…") if len(description) > 200 else description
            # Side effect: confirmation email (async; failure logged only)
            try:
                send_ticket_created_email.delay(
                    request.user.email,
                    getattr(request.user, "name", None) or "",
                    ticket.ticket_code,
                    issue_type,
                    booking_reference or "",
                    preview,
                )
            except Exception as exc:
                logger.warning("Enqueue send_ticket_created_email failed: %s", exc)
            return Response(
                {
                    "id": str(ticket.id),
                    "ticket_code": ticket.ticket_code,
                    "subject": _ticket_subject(ticket),
                    "summary": _ticket_subject(ticket),
                    "status": ticket.status,
                    "created_at": ticket.created_at.isoformat(),
                    "issue_type": ticket.issue_type,
                    "booking_reference": ticket.booking_reference,
                },
                status=status.HTTP_201_CREATED,
            )
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _list(self, request):
        """List all tickets for the authenticated user, ordered by created_at descending."""
        try:
            tickets = Ticket.objects.filter(user=request.user).order_by("-created_at")
            tickets_data = [
                {
                    "id": str(t.id),
                    "ticket_code": t.ticket_code,
                    "subject": _ticket_subject(t),
                    "summary": _ticket_subject(t),
                    "status": t.status,
                    "created_at": t.created_at.isoformat(),
                    "issue_type": t.issue_type,
                    "booking_reference": t.booking_reference,
                }
                for t in tickets
            ]
            return Response({"tickets": tickets_data}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _detail(self, request, ticket_id):
        """Return a single ticket with updates, if owned by the authenticated user. 404 if not found."""
        try:
            ticket = Ticket.objects.get(id=ticket_id, user=request.user)
        except Ticket.DoesNotExist:
            return Response({"error": "Ticket not found"}, status=status.HTTP_404_NOT_FOUND)
        try:
            updates = list(
                ticket.updates.order_by("created_at").values(
                    "kind", "status_to", "message", "created_at"
                )
            )
            for u in updates:
                u["created_at"] = u["created_at"].isoformat()
            return Response(
                {
                    "id": str(ticket.id),
                    "ticket_code": ticket.ticket_code,
                    "subject": _ticket_subject(ticket),
                    "summary": _ticket_subject(ticket),
                    "status": ticket.status,
                    "created_at": ticket.created_at.isoformat(),
                    "issue_type": ticket.issue_type,
                    "booking_reference": ticket.booking_reference,
                    "description": ticket.description,
                    "updates": updates,
                },
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _ticket_subject(ticket):
    """Short subject/summary for list display."""
    text = ticket.description or ticket.issue_type or "Ticket"
    return (text[:50] + "…") if len(text) > 50 else text
