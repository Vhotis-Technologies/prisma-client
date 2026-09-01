"""Celery task: password reset email via Microsoft Graph."""
from celery import shared_task
from django.template.loader import render_to_string
from main.utils.graph_mail import send_mail as graph_send_mail
from main.utils.legal_urls import email_legal_context, password_reset_url


@shared_task
def send_password_reset_email(user_email, user_name, reset_token):
    """
    Send a password reset link email with a one-hour expiry notice.

    Args:
        user_email: Recipient address.
        user_name: Display name for the template.
        reset_token: Opaque token appended to the web reset URL.

    Returns:
        str: Success or failure message for Celery result backend.
    """
    subject = "Reset Your Prisma Car Care Password"
    web_reset_url = password_reset_url(reset_token)

    html_message = render_to_string(
        "password_reset_email.html",
        email_legal_context(
            user_name=user_name,
            web_reset_url=web_reset_url,
            expires_in="1 hour",
        ),
    )

    try:
        graph_send_mail(subject, html_message, user_email)
        return f"Password reset email sent successfully to {user_email}"
    except Exception as e:
        return f"Failed to send password reset email: {str(e)}"
