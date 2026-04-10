"""
Re-export email Celery tasks: welcome, booking confirmation, promotional, refund, auth, transfer, subscription, branch admin.
"""
from main.tasks.emails.welcome import send_welcome_email
from main.tasks.emails.booking import send_booking_confirmation_email, send_bulk_booking_confirmation_email
from main.tasks.emails.promotional import send_promotional_email
from main.tasks.emails.refund import send_refund_success_email, send_refund_failed_email
from main.tasks.emails.auth import send_password_reset_email
from main.tasks.emails.transfer import (
    send_transfer_request_email,
    send_transfer_approved_email,
    send_transfer_rejected_email,
)
from main.tasks.emails.subscription import (
    send_trial_ending_soon_email,
    send_trial_ended_email,
    send_subscription_cancelled_email,
    send_payment_failed_email,
    send_payment_method_updated_email,
    send_trial_subscription_welcome_email,
    send_subscription_renewal_reminder_email,
)
from main.tasks.emails.branch_admin import send_branch_admin_credentials_email

__all__ = [
    'send_welcome_email',
    'send_booking_confirmation_email',
    'send_bulk_booking_confirmation_email',
    'send_promotional_email',
    'send_refund_success_email',
    'send_refund_failed_email',
    'send_password_reset_email',
    'send_transfer_request_email',
    'send_transfer_approved_email',
    'send_transfer_rejected_email',
    'send_trial_ending_soon_email',
    'send_trial_ended_email',
    'send_subscription_cancelled_email',
    'send_payment_failed_email',
    'send_payment_method_updated_email',
    'send_trial_subscription_welcome_email',
    'send_subscription_renewal_reminder_email',
    'send_branch_admin_credentials_email',
]
