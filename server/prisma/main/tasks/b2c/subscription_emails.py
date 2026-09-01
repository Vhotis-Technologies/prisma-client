"""
B2C (consumer) subscription emails sent via Microsoft Graph — distinct copy from fleet subscription emails.

Triggered from Stripe webhooks (payment.py), optional API paths, and Celery Beat (expiry reminders).
"""

from celery import shared_task
from django.template.loader import render_to_string
from django.utils.dateparse import parse_datetime
from django.utils import timezone as dj_timezone

from main.utils.graph_mail import send_mail as graph_send_mail

# Stable Celery task names (preserve previous module path after move from main.tasks.emails).
_B2C_EMAIL_TASK = 'main.tasks.emails.b2c_subscription_emails.{}'


@shared_task(
    name=_B2C_EMAIL_TASK.format('send_b2c_subscription_payment_confirmation_email'),
)
def send_b2c_subscription_payment_confirmation_email(
    user_email,
    user_name,
    plan_name,
    amount_paid,
    currency,
    is_renewal,
    membership_valid_until_iso,
):
    """
    Invoice paid successfully — first cycle or renewal (invoice.payment_succeeded).

    Args:
        user_email: Recipient address.
        user_name: Display name.
        plan_name: Tier/plan label.
        amount_paid: Numeric amount charged.
        currency: ISO currency code (e.g. EUR).
        is_renewal: True for renewal template; False for welcome template.
        membership_valid_until_iso: ISO datetime string for access end display.

    Returns:
        str: Celery result message.
    """
    try:
        if isinstance(membership_valid_until_iso, str):
            until = parse_datetime(membership_valid_until_iso)
        else:
            until = membership_valid_until_iso
        until_display = until.strftime('%B %d, %Y') if until else 'your plan settings in the app'

        if is_renewal:
            subject = f'Payment received — {plan_name} renewed'
            template = 'b2c_subscription_renewed.html'
        else:
            subject = f'You are subscribed — welcome to {plan_name}'
            template = 'b2c_subscription_welcome.html'

        html_message = render_to_string(
            template,
            {
                'user_name': user_name or 'there',
                'plan_name': plan_name,
                'amount_paid': f'{float(amount_paid):.2f}',
                'currency': (currency or 'EUR').upper(),
                'membership_valid_until': until_display,
                'current_year': dj_timezone.now().year,
            },
        )
        graph_send_mail(subject, html_message, user_email)
        return f'B2C subscription confirmation sent to {user_email}'
    except Exception as e:
        return f'Failed B2C subscription confirmation email: {e}'


@shared_task(name=_B2C_EMAIL_TASK.format('send_b2c_subscription_payment_due_reminder_email'))
def send_b2c_subscription_payment_due_reminder_email(
    user_email,
    user_name,
    plan_name,
    renewal_date_display,
    amount_due,
    currency,
    hosted_invoice_url=None,
):
    """
    Stripe ``invoice.upcoming`` — next charge is coming soon.

    Args:
        user_email: Recipient address.
        user_name: Display name.
        plan_name: Plan label.
        renewal_date_display: Human-readable renewal date.
        amount_due: Upcoming charge amount.
        currency: ISO currency code.
        hosted_invoice_url: Optional Stripe hosted invoice URL.

    Returns:
        str: Celery result message.
    """
    try:
        subject = f'Upcoming charge — {plan_name}'
        html_message = render_to_string(
            'b2c_subscription_payment_due.html',
            {
                'user_name': user_name or 'there',
                'plan_name': plan_name,
                'renewal_date': renewal_date_display,
                'amount_due': f'{float(amount_due):.2f}',
                'currency': (currency or 'EUR').upper(),
                'hosted_invoice_url': hosted_invoice_url,
                'current_year': dj_timezone.now().year,
            },
        )
        graph_send_mail(subject, html_message, user_email)
        return f'B2C payment due reminder sent to {user_email}'
    except Exception as e:
        return f'Failed B2C payment due email: {e}'


@shared_task(name=_B2C_EMAIL_TASK.format('send_b2c_subscription_payment_failed_email'))
def send_b2c_subscription_payment_failed_email(
    user_email,
    user_name,
    plan_name,
    failed_amount,
    currency,
    retry_date_display,
    update_payment_url,
    grace_period_until_display,
):
    """
    ``invoice.payment_failed`` for B2C subscriptions.

    ``update_payment_url`` is accepted for API compatibility but not rendered in the template.

    Returns:
        str: Celery result message.
    """
    try:
        subject = 'Action needed — subscription payment failed'
        html_message = render_to_string(
            'b2c_subscription_payment_failed.html',
            {
                'user_name': user_name or 'there',
                'plan_name': plan_name,
                'failed_amount': f'{float(failed_amount):.2f}',
                'currency': (currency or 'EUR').upper(),
                'retry_date': retry_date_display or 'Stripe will retry automatically',
                'grace_period_until': grace_period_until_display or 'See app for details',
                'current_year': dj_timezone.now().year,
            },
        )
        graph_send_mail(subject, html_message, user_email)
        return f'B2C payment failed email sent to {user_email}'
    except Exception as e:
        return f'Failed B2C payment failed email: {e}'


@shared_task(name=_B2C_EMAIL_TASK.format('send_b2c_subscription_expiring_soon_email'))
def send_b2c_subscription_expiring_soon_email(
    user_email,
    user_name,
    plan_name,
    access_until_display,
):
    """
    Celery Beat: active subscription ``end_date`` within the reminder window.

    Returns:
        str: Celery result message.
    """
    try:
        subject = f'Your {plan_name} benefits end soon'
        html_message = render_to_string(
            'b2c_subscription_expiring.html',
            {
                'user_name': user_name or 'there',
                'plan_name': plan_name,
                'access_until': access_until_display,
                'current_year': dj_timezone.now().year,
            },
        )
        graph_send_mail(subject, html_message, user_email)
        return f'B2C expiring notice sent to {user_email}'
    except Exception as e:
        return f'Failed B2C expiring email: {e}'


@shared_task(name=_B2C_EMAIL_TASK.format('send_b2c_subscription_cancelled_email'))
def send_b2c_subscription_cancelled_email(
    user_email,
    user_name,
    plan_name,
    cancellation_date_display,
    access_until_display,
):
    """
    Subscription ended or cancelled (webhook deleted / immediate cancel).

    Returns:
        str: Celery result message.
    """
    try:
        subject = 'Your Prisma Car Care subscription has ended'
        html_message = render_to_string(
            'b2c_subscription_cancelled.html',
            {
                'user_name': user_name or 'there',
                'plan_name': plan_name,
                'cancellation_date': cancellation_date_display,
                'access_until_date': access_until_display,
                'current_year': dj_timezone.now().year,
            },
        )
        graph_send_mail(subject, html_message, user_email)
        return f'B2C cancelled email sent to {user_email}'
    except Exception as e:
        return f'Failed B2C cancelled email: {e}'


@shared_task(name=_B2C_EMAIL_TASK.format('send_b2c_subscription_scheduled_cancel_email'))
def send_b2c_subscription_scheduled_cancel_email(
    user_email,
    user_name,
    plan_name,
    access_until_display,
):
    """
    User chose cancel-at-period-end; Stripe ``subscription.updated``.

    Returns:
        str: Celery result message.
    """
    try:
        subject = f'{plan_name} — cancellation scheduled'
        html_message = render_to_string(
            'b2c_subscription_scheduled_cancel.html',
            {
                'user_name': user_name or 'there',
                'plan_name': plan_name,
                'access_until': access_until_display,
                'current_year': dj_timezone.now().year,
            },
        )
        graph_send_mail(subject, html_message, user_email)
        return f'B2C scheduled cancel email sent to {user_email}'
    except Exception as e:
        return f'Failed B2C scheduled cancel email: {e}'


@shared_task(name=_B2C_EMAIL_TASK.format('send_b2c_subscription_notice_email'))
def send_b2c_subscription_notice_email(user_email, user_name, subject, headline, body_html_paragraph):
    """
    Generic notice (manual tasks, rare webhook edge cases).

    ``body_html_paragraph`` must be trusted server-rendered HTML (no raw user HTML).

    Returns:
        str: Celery result message.
    """
    try:
        html_message = render_to_string(
            'b2c_subscription_notice.html',
            {
                'user_name': user_name or 'there',
                'headline': headline,
                'body_paragraph_html': body_html_paragraph,
                'current_year': dj_timezone.now().year,
            },
        )
        graph_send_mail(subject, html_message, user_email)
        return f'B2C notice email sent to {user_email}'
    except Exception as e:
        return f'Failed B2C notice email: {e}'


@shared_task(
    name=_B2C_EMAIL_TASK.format('send_b2c_subscription_payment_method_updated_email'),
)
def send_b2c_subscription_payment_method_updated_email(user_email, user_name):
    """
    Confirmation after updating card in the app.

    Returns:
        str: Celery result message.
    """
    try:
        subject = 'Payment method saved'
        html_message = render_to_string(
            'b2c_payment_method_updated.html',
            {'user_name': user_name or 'there', 'current_year': dj_timezone.now().year},
        )
        graph_send_mail(subject, html_message, user_email)
        return f'B2C payment method email sent to {user_email}'
    except Exception as e:
        return f'Failed B2C payment method email: {e}'

