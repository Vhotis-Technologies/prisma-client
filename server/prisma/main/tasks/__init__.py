"""
Celery task re-exports for main app.

Notifications: send_push_notification, send_service_reminders, send_promotion_expiration,
check_loyalty_decay, cleanup_expired_pending_bookings, expire_old_transfers,
send_b2c_subscription_expiry_reminders (implementation in main.tasks.b2c.subscription_tasks).
Bookings: publish_booking_cancelled, publish_booking_rescheduled, publish_review_to_detailer.
Emails: welcome, booking confirmation, promotional, refund, password reset, transfer, subscription, branch admin.
Fleet: send_trial_subscription_welcome_email, send_branch_admin_invite_email, etc.
"""
# Re-export all tasks so "from main.tasks import send_welcome_email" etc. still work.

# Notifications
from main.tasks.notifications.push import send_push_notification
from main.tasks.b2c.subscription_tasks import send_b2c_subscription_expiry_reminders
from main.tasks.notifications.scheduled import (
    send_service_reminders,
    send_six_hour_booking_reminder_emails,
    send_promotion_expiration,
    check_loyalty_decay,
    cleanup_expired_pending_bookings,
    expire_old_transfers,
)

# Bookings / events
from main.tasks.bookings.events import (
    fulfill_paid_booking_on_detailer,
    publish_booking_cancelled,
    publish_booking_reassigned,
    publish_booking_rescheduled,
    publish_review_to_detailer,
)

# Emails
from main.tasks.emails.welcome import send_welcome_email
from main.tasks.emails.booking import (
    send_booking_confirmation_email,
    send_bulk_booking_confirmation_email,
    send_guest_photos_ready_email,
)
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
from main.tasks.emails.branch_admin import send_branch_admin_invite_email
from main.tasks.emails.ticket import send_ticket_created_email, send_ticket_resolved_email
from main.tasks.emails.bulk_invoice import send_bulk_invoice_payment_reminder_email
from main.tasks.emails.user_data_export import send_user_data_export_email

__all__ = [
    'send_push_notification',
    'send_service_reminders',
    'send_six_hour_booking_reminder_emails',
    'send_promotion_expiration',
    'check_loyalty_decay',
    'cleanup_expired_pending_bookings',
    'expire_old_transfers',
    'send_b2c_subscription_expiry_reminders',
    'fulfill_paid_booking_on_detailer',
    'publish_booking_cancelled',
    'publish_booking_reassigned',
    'publish_booking_rescheduled',
    'publish_review_to_detailer',
    'send_welcome_email',
    'send_booking_confirmation_email',
    'send_bulk_booking_confirmation_email',
    'send_guest_photos_ready_email',
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
    'send_branch_admin_invite_email',
    'send_ticket_created_email',
    'send_ticket_resolved_email',
    'send_bulk_invoice_payment_reminder_email',
    'send_user_data_export_email',
]
