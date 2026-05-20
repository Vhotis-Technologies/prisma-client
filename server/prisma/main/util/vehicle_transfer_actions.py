"""
Approve/reject vehicle transfers — shared by web flow and support API.

Encapsulates ownership rollover, competing pending transfer cleanup, and notification emails.
"""
from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from main.models import VehicleOwnership, VehicleTransfer
from main.tasks import send_transfer_approved_email, send_transfer_rejected_email


def apply_vehicle_transfer_approval(transfer: VehicleTransfer) -> str | None:
    """
    Run the same steps as the email web approval flow.

    Ends the seller's active ownership, creates private ownership for the buyer,
    marks the transfer approved, rejects other pending transfers on the vehicle,
    increments ``owner_count``, and queues the approval email.

    Args:
        transfer: Pending ``VehicleTransfer`` to approve.

    Returns:
        str | None: User-facing error message on failure; None on success.
    """
    if transfer.status != "pending":
        return f"This transfer request is {transfer.status} and cannot be processed"
    if transfer.is_expired():
        transfer.status = "expired"
        transfer.save()
        return "This transfer request has expired"

    active_ownership = transfer.vehicle.get_active_ownership()
    if not active_ownership or active_ownership.owner != transfer.from_owner:
        return "Vehicle ownership has changed. Transfer cannot be completed."

    with transaction.atomic():
        active_ownership.end_date = timezone.now().date()
        active_ownership.save()

        VehicleOwnership.objects.create(
            vehicle=transfer.vehicle,
            owner=transfer.to_owner,
            ownership_type="private",
            start_date=timezone.now().date(),
        )

        transfer.status = "approved"
        transfer.responded_at = timezone.now()
        transfer.save()

        # Only one approved transfer per vehicle; cancel other pending requests.
        VehicleTransfer.objects.filter(
            vehicle=transfer.vehicle,
            status="pending",
        ).exclude(id=transfer.id).update(
            status="rejected",
            responded_at=timezone.now(),
        )

        transfer.vehicle.owner_count += 1
        transfer.vehicle.save()

    send_transfer_approved_email.delay(
        transfer.id,
        transfer.to_owner.email,
        transfer.from_owner.name,
        transfer.vehicle.registration_number,
    )
    return None


def apply_vehicle_transfer_rejection(transfer: VehicleTransfer) -> str | None:
    """
    Run the same steps as the web rejection flow (including expired edge case).

    Args:
        transfer: ``VehicleTransfer`` to reject.

    Returns:
        str | None: User-facing error when not rejectable; None on success (email queued
        unless the request was already expired).
    """
    if transfer.status != "pending":
        return f"This transfer request is {transfer.status} and cannot be processed"

    if transfer.is_expired():
        transfer.status = "expired"
        transfer.responded_at = timezone.now()
        transfer.save()
        return "This transfer request had already expired."

    transfer.status = "rejected"
    transfer.responded_at = timezone.now()
    transfer.save()

    send_transfer_rejected_email.delay(
        transfer.id,
        transfer.to_owner.email,
        transfer.from_owner.name,
        transfer.vehicle.registration_number,
    )
    return None
