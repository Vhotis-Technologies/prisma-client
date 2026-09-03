"""Celery task: email a GDPR subject-access PDF export to a customer."""
from celery import shared_task
from django.template.loader import render_to_string

from main.services.user_data_export import (
    collect_entity_data_export,
    export_pdf_filename,
    export_recipient_email,
    build_export_pdf,
    resolve_export_entity,
)
from main.utils.graph_mail import send_mail_with_attachments
from main.utils.legal_urls import email_legal_context


@shared_task
def send_user_data_export_email(
    entity_type: str,
    entity_id: str,
    recipient_email: str | None = None,
):
    """
    Build a personal-data PDF for an entity and email it to the customer.

    Args:
        entity_type: ``b2c``, ``fleet``, or ``partner``.
        entity_id: UUID string of the entity.
        recipient_email: Optional override when the account email is missing.

    Returns:
        str: Success or failure message for Celery result backend.
    """
    try:
        etype, entity, recipient_user = resolve_export_entity(entity_type, entity_id)
    except ValueError as exc:
        return str(exc)
    except LookupError as exc:
        return str(exc)

    try:
        to_address = export_recipient_email(recipient_user, recipient_email)
    except ValueError as exc:
        return str(exc)

    export_data = collect_entity_data_export(etype, entity)
    pdf_bytes = build_export_pdf(export_data)
    filename = export_pdf_filename(etype, entity_id)

    subject = "Your Prisma Car Care personal data export"
    html_message = render_to_string(
        "user_data_export_email.html",
        email_legal_context(
            user_name=(recipient_user.name if recipient_user else None) or "there"
        ),
    )

    try:
        send_mail_with_attachments(
            subject,
            html_message,
            to_address,
            attachments=[
                {
                    "name": filename,
                    "content_type": "application/pdf",
                    "content_bytes": pdf_bytes,
                }
            ],
        )
        return f"User data export emailed to {to_address}"
    except Exception as exc:
        return f"Failed to send user data export email: {exc}"
