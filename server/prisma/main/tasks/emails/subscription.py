from celery import shared_task
from datetime import timedelta
from django.template.loader import render_to_string
from django.utils.dateparse import parse_datetime
from main.util.graph_mail import send_mail as graph_send_mail


@shared_task
def send_subscription_renewal_reminder_email(
    user_email,
    fleet_name,
    plan_name,
    renewal_date_iso,
    amount_due,
    currency,
):
    """
    Sent when Stripe emits invoice.upcoming for a fleet subscription — backup if Stripe
    customer invoice emails are disabled.
    """
    try:
        if isinstance(renewal_date_iso, str):
            renewal_dt = parse_datetime(renewal_date_iso)
        else:
            renewal_dt = renewal_date_iso

        subject = f"Upcoming subscription renewal – {fleet_name}"
        html_message = render_to_string('subscription_renewal_reminder.html', {
            'fleet_name': fleet_name,
            'plan_name': plan_name,
            'renewal_date': renewal_dt.strftime('%B %d, %Y') if renewal_dt else 'your next billing date',
            'amount_due': amount_due,
            'currency': (currency or 'EUR').upper(),
        })

        graph_send_mail(subject, html_message, user_email)
        return f"Subscription renewal reminder sent to {user_email}"
    except Exception as e:
        return f"Failed to send subscription renewal reminder: {str(e)}"


@shared_task
def send_trial_ending_soon_email(user_email, fleet_name, trial_end_date, plan_name, billing_amount):
    """Send email notification 7 days before trial ends."""
    try:
        if isinstance(trial_end_date, str):
            trial_end_dt = parse_datetime(trial_end_date)
        else:
            trial_end_dt = trial_end_date

        if trial_end_dt:
            billing_start_date = trial_end_dt + timedelta(days=1)
        else:
            billing_start_date = None

        subject = "Your trial ends in 7 days - Prisma Fleet Subscription"
        html_message = render_to_string('trial_ending_soon.html', {
            'fleet_name': fleet_name,
            'trial_end_date': trial_end_dt.strftime('%B %d, %Y') if trial_end_dt else 'N/A',
            'billing_start_date': billing_start_date.strftime('%B %d, %Y') if billing_start_date else 'N/A',
            'plan_name': plan_name,
            'billing_amount': billing_amount,
        })

        graph_send_mail(subject, html_message, user_email)
        return f"Trial ending soon email sent successfully to {user_email}"
    except Exception as e:
        return f"Failed to send trial ending soon email: {str(e)}"


@shared_task
def send_trial_ended_email(user_email, fleet_name, plan_name, billing_amount, next_billing_date):
    """Send email notification when trial ends and billing starts."""
    try:
        if isinstance(next_billing_date, str):
            next_billing_dt = parse_datetime(next_billing_date)
        else:
            next_billing_dt = next_billing_date

        subject = "Trial ended - Your subscription is now active"
        html_message = render_to_string('trial_ended.html', {
            'fleet_name': fleet_name,
            'plan_name': plan_name,
            'billing_amount': billing_amount,
            'next_billing_date': next_billing_dt.strftime('%B %d, %Y') if next_billing_dt else 'N/A',
        })

        graph_send_mail(subject, html_message, user_email)
        return f"Trial ended email sent successfully to {user_email}"
    except Exception as e:
        return f"Failed to send trial ended email: {str(e)}"


@shared_task
def send_subscription_cancelled_email(user_email, fleet_name, plan_name, cancellation_date, access_until_date):
    """Send email notification when subscription is cancelled."""
    try:
        if isinstance(cancellation_date, str):
            cancellation_dt = parse_datetime(cancellation_date)
        else:
            cancellation_dt = cancellation_date

        if isinstance(access_until_date, str):
            access_until_dt = parse_datetime(access_until_date)
        else:
            access_until_dt = access_until_date

        subject = "Subscription cancelled - Prisma Fleet"
        html_message = render_to_string('subscription_cancelled.html', {
            'fleet_name': fleet_name,
            'plan_name': plan_name,
            'cancellation_date': cancellation_dt.strftime('%B %d, %Y') if cancellation_dt else 'N/A',
            'access_until_date': access_until_dt.strftime('%B %d, %Y') if access_until_dt else 'N/A',
        })

        graph_send_mail(subject, html_message, user_email)
        return f"Subscription cancelled email sent successfully to {user_email}"
    except Exception as e:
        return f"Failed to send subscription cancelled email: {str(e)}"


@shared_task
def send_payment_failed_email(user_email, fleet_name, plan_name, failed_amount, retry_date, update_payment_url, grace_period_until):
    """Send email notification when subscription payment fails."""
    try:
        if isinstance(retry_date, str):
            retry_dt = parse_datetime(retry_date)
        else:
            retry_dt = retry_date

        if isinstance(grace_period_until, str):
            grace_period_dt = parse_datetime(grace_period_until)
        else:
            grace_period_dt = grace_period_until

        subject = "Payment failed - Update your payment method"
        html_message = render_to_string('payment_failed.html', {
            'fleet_name': fleet_name,
            'plan_name': plan_name,
            'failed_amount': failed_amount,
            'retry_date': retry_dt.strftime('%B %d, %Y at %I:%M %p') if retry_dt else 'N/A',
            'update_payment_url': update_payment_url,
            'grace_period_until': grace_period_dt.strftime('%B %d, %Y') if grace_period_dt else 'N/A',
        })

        graph_send_mail(subject, html_message, user_email)
        return f"Payment failed email sent successfully to {user_email}"
    except Exception as e:
        return f"Failed to send payment failed email: {str(e)}"


@shared_task
def send_payment_method_updated_email(user_email, fleet_name):
    """Send email notification when payment method is updated."""
    try:
        subject = "Payment method updated successfully"
        html_message = render_to_string('payment_method_updated.html', {
            'fleet_name': fleet_name,
        })

        graph_send_mail(subject, html_message, user_email)
        return f"Payment method updated email sent successfully to {user_email}"
    except Exception as e:
        return f"Failed to send payment method updated email: {str(e)}"


@shared_task
def send_trial_subscription_welcome_email(user_email, fleet_name, plan_name, trial_days, trial_end_date):
    """Send welcome email when trial subscription is activated."""
    try:
        if isinstance(trial_end_date, str):
            trial_end_dt = parse_datetime(trial_end_date)
        else:
            trial_end_dt = trial_end_date

        subject = f"Welcome to {plan_name} – your trial has started"
        html_message = render_to_string('trial_subscription_welcome.html', {
            'fleet_name': fleet_name,
            'plan_name': plan_name,
            'trial_days': trial_days,
            'trial_end_date': trial_end_dt.strftime('%B %d, %Y') if trial_end_dt else 'N/A',
        })

        graph_send_mail(subject, html_message, user_email)
        return f"Trial subscription welcome email sent successfully to {user_email}"
    except Exception as e:
        return f"Failed to send trial subscription welcome email: {str(e)}"
