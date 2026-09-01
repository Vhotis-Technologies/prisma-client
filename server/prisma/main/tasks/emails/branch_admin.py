"""Celery task: branch admin invite email (set-password link, no credentials)."""
import logging

from celery import shared_task
from django.template.loader import render_to_string
from main.utils.graph_mail import send_mail as graph_send_mail
from main.utils.legal_urls import email_legal_context

logger = logging.getLogger(__name__)


@shared_task
def send_branch_admin_invite_email(
    recipient_email,
    recipient_name,
    branch_name,
    branch_address,
    invite_url,
    expires_in="48 hours",
    role_label="Branch Admin",
):
    """
    Email a set-password invite link (no password in the message).

    Args:
        recipient_email: Login email (also shown in the template).
        recipient_name: Greeting name.
        branch_name: Branch label.
        branch_address: Optional address text.
        invite_url: Absolute accept-invite URL with raw token.
        expires_in: Human-readable expiry (e.g. ``48 hours``).
        role_label: Role string for the template.

    Returns:
        str: Success or failure message.
    """
    try:
        subject = "You're invited to Prisma Car Care – set your password"
        html_message = render_to_string(
            "branch_admin_invite.html",
            email_legal_context(
                recipient_name=recipient_name,
                recipient_email=recipient_email,
                branch_name=branch_name or "—",
                branch_address=branch_address or "—",
                invite_url=invite_url,
                expires_in=expires_in,
                role_label=role_label,
            ),
        )
        graph_send_mail(subject, html_message, recipient_email)
        return f"Branch admin invite email sent successfully to {recipient_email}"
    except Exception as e:
        logger.exception("Failed to send branch admin invite email to %s", recipient_email)
        return f"Failed to send branch admin invite email: {str(e)}"
