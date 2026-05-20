"""Celery task: activity-bonus promotional email via Microsoft Graph."""
from celery import shared_task
from django.template.loader import render_to_string
from main.util.graph_mail import send_mail as graph_send_mail


@shared_task
def send_promotional_email(user_email, customer_name):
    """
    Send the 10% activity-bonus promotional email (3 washes in 30 days).

    Args:
        user_email: Recipient address.
        customer_name: Name interpolated into the template.

    Returns:
        str: Success or failure message.
    """
    subject = f'Promotional Email - 5% Off Your Next Washes'
    html_message = render_to_string('promotional_email.html', {
        'customer_name': customer_name,
    })
    try:
        graph_send_mail(subject, html_message, user_email)
        return f"Promotional email sent successfully to {user_email}"
    except Exception as e:
        return f"Failed to send promotional email: {str(e)}"
