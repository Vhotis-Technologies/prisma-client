from celery import shared_task
from django.conf import settings
from django.template.loader import render_to_string
from main.util.graph_mail import send_mail as graph_send_mail


@shared_task
def send_transfer_request_email(transfer_id, owner_email, requester_name, vehicle_registration):
    """Send email to current owner requesting vehicle transfer consent."""
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
    """Send email to requester when transfer is approved."""
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
    """Send email to requester when transfer is rejected."""
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
