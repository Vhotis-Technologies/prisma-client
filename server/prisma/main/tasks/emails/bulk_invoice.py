"""Celery tasks for bulk-order Stripe invoice reminders (webhook-driven)."""
from celery import shared_task
from django.template.loader import render_to_string
from django.utils import timezone

from main.models.vehicle import BulkOrder
from main.util.graph_mail import send_mail as graph_send_mail


@shared_task
def send_bulk_invoice_payment_reminder_email(
    bulk_order_id,
    user_email,
    booking_reference,
    hosted_invoice_url,
    amount_due_display,
    currency,
    due_date_display,
    reminder_kind,
):
    """
    Send app-owned reminder for a fleet/partner bulk Stripe invoice with hosted payment link.

    Sets ``invoice_due_soon_email_sent_at`` or ``invoice_overdue_email_sent_at`` on success.

    Args:
        bulk_order_id: ``BulkOrder`` primary key.
        user_email: Recipient address.
        booking_reference: Reference for subject/body.
        hosted_invoice_url: Stripe hosted invoice URL.
        amount_due_display: Formatted amount string.
        currency: ISO currency code.
        due_date_display: Human-readable due date.
        reminder_kind: ``'due_soon'`` or ``'overdue'``.

    Returns:
        str: Success, skip, or error message.
    """
    try:
        bulk_order = BulkOrder.objects.get(pk=bulk_order_id)
        if reminder_kind == "overdue":
            if bulk_order.invoice_overdue_email_sent_at:
                return "skipped (overdue reminder already sent)"
        else:
            if bulk_order.invoice_due_soon_email_sent_at:
                return "skipped (due soon reminder already sent)"

        if reminder_kind == "overdue":
            subject = f"Invoice overdue – payment needed ({booking_reference})"
        else:
            subject = f"Invoice due soon – {booking_reference}"

        html_message = render_to_string(
            "bulk_invoice_payment_reminder.html",
            {
                "booking_reference": booking_reference,
                "hosted_invoice_url": hosted_invoice_url,
                "amount_due_display": amount_due_display,
                "currency": (currency or "EUR").upper(),
                "due_date_display": due_date_display or "",
                "reminder_kind": reminder_kind,
            },
        )

        graph_send_mail(subject, html_message, user_email)

        now = timezone.now()
        if reminder_kind == "overdue":
            BulkOrder.objects.filter(pk=bulk_order_id).update(invoice_overdue_email_sent_at=now)
        else:
            BulkOrder.objects.filter(pk=bulk_order_id).update(invoice_due_soon_email_sent_at=now)

        return f"Bulk invoice reminder ({reminder_kind}) sent to {user_email}"
    except BulkOrder.DoesNotExist:
        return "bulk order not found"
    except Exception as e:
        return f"Failed to send bulk invoice reminder: {str(e)}"
