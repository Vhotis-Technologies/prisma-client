"""Celery tasks: refund succeeded / failed notification emails."""
from celery import shared_task
from django.template.loader import render_to_string
from django.utils import timezone
from main.utils.graph_mail import send_mail as graph_send_mail


@shared_task
def send_refund_success_email(user_email, customer_name, booking_reference, original_date, vehicle_make, vehicle_model, service_type_name, refund_amount, refund_date):
    """
    Notify the customer that a refund was processed successfully.

    Args:
        user_email: Recipient address.
        customer_name: Display name.
        booking_reference: Booking ref for subject.
        original_date: Original appointment date.
        vehicle_make: Vehicle make for template.
        vehicle_model: Vehicle model for template.
        service_type_name: Service label.
        refund_amount: Amount refunded (display string/number).
        refund_date: When refund completed (defaults to now in template).

    Returns:
        str: Success or failure message.
    """
    subject = f'Refund Processed Successfully - #{booking_reference}'
    html_message = render_to_string('refund_success_email.html', {
        'customer_name': customer_name,
        'booking_reference': booking_reference,
        'original_date': original_date.strftime('%B %d, %Y') if original_date else '',
        'vehicle_make': vehicle_make,
        'vehicle_model': vehicle_model,
        'service_type_name': service_type_name,
        'refund_amount': refund_amount,
        'refund_date': refund_date.strftime('%B %d, %Y at %I:%M %p') if refund_date else timezone.now().strftime('%B %d, %Y at %I:%M %p')
    })
    try:
        graph_send_mail(subject, html_message, user_email)
        return f"Refund success email sent successfully to {user_email}"
    except Exception as e:
        return f"Failed to send refund success email: {str(e)}"


@shared_task
def send_refund_failed_email(user_email, customer_name, booking_reference, original_date, vehicle_make, vehicle_model, service_type_name, refund_amount, failure_reason):
    """
    Notify the customer that refund processing failed (action may be required).

    Args:
        user_email: Recipient address.
        customer_name: Display name.
        booking_reference: Booking ref for subject.
        original_date: Original appointment date.
        vehicle_make: Vehicle make for template.
        vehicle_model: Vehicle model for template.
        service_type_name: Service label.
        refund_amount: Attempted refund amount.
        failure_reason: Unused in template but kept for API compatibility.

    Returns:
        str: Success or failure message.
    """
    subject = f'Refund Issue - Action Required - #{booking_reference}'
    html_message = render_to_string('refund_failed_email.html', {
        'customer_name': customer_name,
        'booking_reference': booking_reference,
        'original_date': original_date.strftime('%B %d, %Y') if original_date else '',
        'vehicle_make': vehicle_make,
        'vehicle_model': vehicle_model,
        'service_type_name': service_type_name,
        'refund_amount': refund_amount,
        'issue_date': timezone.now().strftime('%B %d, %Y at %I:%M %p')
    })
    try:
        graph_send_mail(subject, html_message, user_email)
        return f"Refund failed email sent successfully to {user_email}"
    except Exception as e:
        return f"Failed to send refund failed email: {str(e)}"
