"""Celery tasks: vehicle transfer request / approved / rejected emails."""
from celery import shared_task
from django.conf import settings
from django.template.loader import render_to_string
from main.util.graph_mail import send_mail as graph_send_mail


@shared_task
def send_transfer_request_email(transfer_id, owner_email, requester_name, vehicle_registration):
    """
    Email the current owner to approve or reject a vehicle transfer.

    Args:
        transfer_id: ``VehicleTransfer`` primary key.
        owner_email: Recipient (from_owner) address.
        requester_name: Display name of the requester.
        vehicle_registration: Plate string for subject line.

    Returns:
        str: Success or failure message.
    """
    from main.models import VehicleTransfer

    try:
        transfer = VehicleTransfer.objects.get(id=transfer_id)

        subject = f"Vehicle Transfer Request - {vehicle_registration}"
        html_message = render_to_string('vehicle_transfer_request.html', {
            'owner_name': transfer.from_owner.name,
            'requester_name': requester_name,
            'vehicle_registration': vehicle_registration,
            'vehicle_make': transfer.vehicle.make,
            'vehicle_model': transfer.vehicle.model,
            'vehicle_year': transfer.vehicle.year,
            'expires_at': transfer.expires_at.strftime('%B %d, %Y at %I:%M %p'),
        })

        graph_send_mail(subject, html_message, owner_email)
        return f"Transfer request email sent successfully to {owner_email}"
    except VehicleTransfer.DoesNotExist:
        return f"Transfer {transfer_id} not found"
    except Exception as e:
        return f"Failed to send transfer request email: {str(e)}"


@shared_task
def send_transfer_approved_email(transfer_id, requester_email, owner_name, vehicle_registration):
    """
    Email the requester when the owner approves the transfer.

    Args:
        transfer_id: ``VehicleTransfer`` primary key.
        requester_email: Recipient (to_owner) address.
        owner_name: Approving owner's display name.
        vehicle_registration: Plate string for subject line.

    Returns:
        str: Success or failure message.
    """
    from main.models import VehicleTransfer

    try:
        transfer = VehicleTransfer.objects.get(id=transfer_id)

        subject = f"Vehicle Transfer Approved - {vehicle_registration}"
        html_message = render_to_string('vehicle_transfer_approved.html', {
            'requester_name': transfer.to_owner.name,
            'owner_name': owner_name,
            'vehicle_registration': vehicle_registration,
            'vehicle_make': transfer.vehicle.make,
            'vehicle_model': transfer.vehicle.model,
            'vehicle_year': transfer.vehicle.year,
            'transfer_date': transfer.responded_at.strftime('%B %d, %Y at %I:%M %p') if transfer.responded_at else '',
        })

        graph_send_mail(subject, html_message, requester_email)
        return f"Transfer approved email sent successfully to {requester_email}"
    except VehicleTransfer.DoesNotExist:
        return f"Transfer {transfer_id} not found"
    except Exception as e:
        return f"Failed to send transfer approved email: {str(e)}"


@shared_task
def send_transfer_rejected_email(transfer_id, requester_email, owner_name, vehicle_registration):
    """
    Email the requester when the owner rejects the transfer.

    Args:
        transfer_id: ``VehicleTransfer`` primary key.
        requester_email: Recipient (to_owner) address.
        owner_name: Rejecting owner's display name.
        vehicle_registration: Plate string for subject line.

    Returns:
        str: Success or failure message.
    """
    from main.models import VehicleTransfer

    try:
        transfer = VehicleTransfer.objects.get(id=transfer_id)

        subject = f"Vehicle Transfer Request Rejected - {vehicle_registration}"
        html_message = render_to_string('vehicle_transfer_rejected.html', {
            'requester_name': transfer.to_owner.name,
            'owner_name': owner_name,
            'vehicle_registration': vehicle_registration,
            'vehicle_make': transfer.vehicle.make,
            'vehicle_model': transfer.vehicle.model,
            'vehicle_year': transfer.vehicle.year,
        })

        graph_send_mail(subject, html_message, requester_email)
        return f"Transfer rejected email sent successfully to {requester_email}"
    except VehicleTransfer.DoesNotExist:
        return f"Transfer {transfer_id} not found"
    except Exception as e:
        return f"Failed to send transfer rejected email: {str(e)}"
