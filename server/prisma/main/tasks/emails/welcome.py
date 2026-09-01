"""Celery task: new-user welcome email via Microsoft Graph."""
from celery import shared_task
from django.template.loader import render_to_string
from main.utils.graph_mail import send_mail as graph_send_mail


@shared_task
def send_welcome_email(user_email):
    """
    Send the standard onboarding welcome email after registration.

    Args:
        user_email: Recipient address.

    Returns:
        str: Success or failure message.
    """
    subject = "Welcome to Prisma Car Care - Let's Get Started! 🎉"
    html_message = render_to_string('welcome_email.html')
    try:
        graph_send_mail(subject, html_message, user_email)
        return f"Welcome email sent successfully to {user_email}"
    except Exception as e:
        return f"Failed to send welcome email: {str(e)}"
