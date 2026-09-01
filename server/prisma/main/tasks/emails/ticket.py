"""Celery tasks: support ticket created / resolved customer emails."""
from celery import shared_task
from django.template.loader import render_to_string

from main.utils.graph_mail import send_mail as graph_send_mail


@shared_task
def send_ticket_created_email(
    user_email,
    customer_name,
    ticket_code,
    issue_type,
    booking_reference,
    description_preview,
):
    """
    Notify customer when a support ticket is opened.

    Subject is the 8-digit ticket code for easy inbox search.

    Returns:
        str: Success or failure message.
    """
    subject = ticket_code
    html_message = render_to_string(
        "ticket_created_email.html",
        {
            "customer_name": customer_name or "there",
            "ticket_code": ticket_code,
            "issue_type": issue_type or "—",
            "booking_reference": booking_reference or "",
            "description_preview": description_preview or "",
        },
    )
    try:
        graph_send_mail(subject, html_message, user_email)
        return f"Ticket created email sent to {user_email}"
    except Exception as e:
        return f"Failed to send ticket created email: {e!s}"


@shared_task
def send_ticket_resolved_email(
    user_email,
    customer_name,
    ticket_code,
    resolution_message="",
):
    """
    Notify customer when support marks the ticket resolved or closed.

    Returns:
        str: Success or failure message.
    """
    subject = f"Ticket {ticket_code} resolved"
    html_message = render_to_string(
        "ticket_resolved_email.html",
        {
            "customer_name": customer_name or "there",
            "ticket_code": ticket_code,
            "resolution_message": (resolution_message or "").strip(),
        },
    )
    try:
        graph_send_mail(subject, html_message, user_email)
        return f"Ticket resolved email sent to {user_email}"
    except Exception as e:
        return f"Failed to send ticket resolved email: {e!s}"
