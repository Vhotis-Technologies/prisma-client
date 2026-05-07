"""B2C-related Celery tasks."""

from main.tasks.b2c.subscription_tasks import (
    create_subscription,
    send_b2c_subscription_expiry_reminders,
)
from main.tasks.b2c.subscription_emails import (
    send_b2c_subscription_cancelled_email,
    send_b2c_subscription_expiring_soon_email,
    send_b2c_subscription_notice_email,
    send_b2c_subscription_payment_confirmation_email,
    send_b2c_subscription_payment_due_reminder_email,
    send_b2c_subscription_payment_failed_email,
    send_b2c_subscription_payment_method_updated_email,
    send_b2c_subscription_scheduled_cancel_email,
)

__all__ = [
    'create_subscription',
    'send_b2c_subscription_expiry_reminders',
    'send_b2c_subscription_cancelled_email',
    'send_b2c_subscription_expiring_soon_email',
    'send_b2c_subscription_notice_email',
    'send_b2c_subscription_payment_confirmation_email',
    'send_b2c_subscription_payment_due_reminder_email',
    'send_b2c_subscription_payment_failed_email',
    'send_b2c_subscription_payment_method_updated_email',
    'send_b2c_subscription_scheduled_cancel_email',
]
