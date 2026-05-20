"""
Support ticket tools: list, detail, and status updates for staff.

**Auth:** ``SupportPermissionAccess`` (internal key via support server proxy).

**Emails:** Transitioning a ticket from a non-terminal status to ``resolved`` or ``closed``
triggers ``send_ticket_resolved_email`` at most once (``resolution_email_sent_at``).
"""
from __future__ import annotations

import logging
from typing import Any

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from main.models import Ticket, TicketUpdate
from main.tasks import send_ticket_resolved_email
from main.views.support.support_permission_access import SupportPermissionAccess

logger = logging.getLogger(__name__)

TERMINAL_STATUSES = frozenset({"resolved", "closed"})


def _ticket_subject_line(ticket: Ticket) -> str:
    """Short one-line subject for list rows (description or issue type, truncated)."""
    text = ticket.description or ticket.issue_type or "Ticket"
    return (text[:50] + "…") if len(text) > 50 else text


def _serialize_list_item(ticket: Ticket) -> dict[str, Any]:
    """Shape a ``Ticket`` for the support app ticket queue list."""
    user = ticket.user
    return {
        "id": str(ticket.id),
        "ticket_code": ticket.ticket_code,
        "subject": _ticket_subject_line(ticket),
        "client_name": getattr(user, "name", "") or "",
        "client_email": getattr(user, "email", "") or "",
        "timestamp": ticket.created_at.isoformat(),
        "status": ticket.status,
    }


def _serialize_update_row(u: TicketUpdate) -> dict[str, Any]:
    """Serialize one row from the ticket activity timeline."""
    return {
        "id": str(u.id),
        "kind": u.kind,
        "status_to": u.status_to,
        "message": u.message,
        "created_at": u.created_at.isoformat(),
    }


def _serialize_detail(ticket: Ticket) -> dict[str, Any]:
    """Full ticket payload for the support detail screen (includes update history)."""
    user = ticket.user
    updates = [
        _serialize_update_row(u)
        for u in ticket.updates.order_by("created_at")
    ]
    return {
        "id": str(ticket.id),
        "ticket_code": ticket.ticket_code,
        "subject": _ticket_subject_line(ticket),
        "client_name": getattr(user, "name", "") or "",
        "client_email": getattr(user, "email", "") or "",
        "timestamp": ticket.created_at.isoformat(),
        "status": ticket.status,
        "description": ticket.description,
        "issue_type": ticket.issue_type,
        "booking_reference": ticket.booking_reference,
        "updates": updates,
    }


class SupportTicketsView(APIView):
    """
    Internal support API for customer tickets (list, detail, status updates).

    Routed by URL action segment; all methods require ``SupportPermissionAccess``.
    """

    permission_classes = [SupportPermissionAccess]

    get_action_handler = {
        "list_tickets": "_list_tickets",
        "get_ticket_detail": "_get_ticket_detail",
    }
    patch_action_handler = {
        "update_ticket": "_patch_update_ticket",
    }

    def get(self, request, *args, **kwargs):
        """
        Dispatch GET by URL ``action`` (``list_tickets``, ``get_ticket_detail``).

        Returns:
            DRF ``Response`` from the matched handler, or 400 for unknown actions.
        """
        action = kwargs.get("action")
        if action not in self.get_action_handler:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.get_action_handler[action])
        return handler(request, **kwargs)

    def patch(self, request, *args, **kwargs):
        """
        Dispatch PATCH by URL ``action`` (currently ``update_ticket``).

        Returns:
            DRF ``Response`` from the matched handler, or 400 for unknown actions.
        """
        action = kwargs.get("action")
        if action not in self.patch_action_handler:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.patch_action_handler[action])
        return handler(request, **kwargs)

    def _list_tickets(self, request, **kwargs):
        """Return all tickets newest-first as lightweight list rows for the support queue."""
        tickets = (
            Ticket.objects.select_related("user")
            .order_by("-created_at")
        )
        rows = [_serialize_list_item(t) for t in tickets]
        return Response({"data": {"tickets": rows}})

    def _get_ticket_detail(self, request, **kwargs):
        """
        Full ticket payload including update timeline.

        Query params:
            ticket_id: Primary key of the ``Ticket``.

        Returns:
            ``{'data': {'ticket': ...}}`` or 400/404.
        """
        ticket_id = request.query_params.get("ticket_id")
        if not ticket_id:
            return Response(
                {"error": "ticket_id required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            ticket = Ticket.objects.select_related("user").get(pk=ticket_id)
        except Ticket.DoesNotExist:
            return Response({"error": "Ticket not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"data": {"ticket": _serialize_detail(ticket)}})

    def _patch_update_ticket(self, request, **kwargs):
        """
        Update ticket status and/or append a staff message; enqueue resolution email once.

        Body: ``ticket_id``, ``status`` (required valid choice), optional ``message``.

        Returns:
            Updated ticket detail dict; 400 on validation errors, 404 if not found.
        """
        ticket_id = request.data.get("ticket_id")
        new_status = (request.data.get("status") or "").strip()
        message = (request.data.get("message") or "").strip()

        if not ticket_id:
            return Response(
                {"error": "ticket_id required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        valid_statuses = {c[0] for c in Ticket.STATUS_CHOICES}
        if new_status not in valid_statuses:
            return Response(
                {"error": "Invalid or missing status"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                ticket = (
                    Ticket.objects.select_for_update()
                    .select_related("user")
                    .get(pk=ticket_id)
                )
                old_status = ticket.status
                ticket.status = new_status

                if old_status != new_status:
                    # Status transition: record timeline row with target status.
                    TicketUpdate.objects.create(
                        ticket=ticket,
                        kind="status_change",
                        status_to=new_status,
                        message=message or "",
                    )
                elif message:
                    # Same status but staff note — store as reply without changing status.
                    TicketUpdate.objects.create(
                        ticket=ticket,
                        kind="reply",
                        message=message,
                    )

                # First move into resolved/closed: email customer once (idempotent via sent_at).
                should_send_resolution = (
                    new_status in TERMINAL_STATUSES
                    and old_status not in TERMINAL_STATUSES
                    and ticket.resolution_email_sent_at is None
                )
                user_email = (getattr(ticket.user, "email", None) or "").strip()
                if should_send_resolution and user_email:
                    try:
                        send_ticket_resolved_email.delay(
                            user_email,
                            getattr(ticket.user, "name", "") or "",
                            ticket.ticket_code,
                            message,
                        )
                    except Exception as exc:
                        logger.warning("Enqueue send_ticket_resolved_email failed: %s", exc)
                    ticket.resolution_email_sent_at = timezone.now()

                ticket.save()
        except Ticket.DoesNotExist:
            return Response({"error": "Ticket not found"}, status=status.HTTP_404_NOT_FOUND)

        ticket = Ticket.objects.select_related("user").get(pk=ticket_id)
        return Response({"data": {"ticket": _serialize_detail(ticket)}})
