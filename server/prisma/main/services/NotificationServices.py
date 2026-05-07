"""
Notification service: send booking confirmation and other notifications via Expo push and/or email.

NotificationService: send_booking_confirmation (push + optional email). Uses exponent_server_sdk and Django send_mail.
"""
from exponent_server_sdk import PushClient, PushMessage
from django.core.mail import send_mail
from django.conf import settings
from django.template.loader import render_to_string
from main.models import User, BookedAppointment
import logging
from django.utils import timezone
from main.models import Notification

logger = logging.getLogger(__name__)

class NotificationService:
    def __init__(self):
        self.push_client = PushClient()
    
    def send_booking_confirmation(self, user, booking):
        """Send booking confirmation via push notification and email"""
        results = {
            'push_notification': None,
            'email_notification': None,
            'errors': []
        }

        title = "Booking Confirmed! ��"
        message = f"Your valet service is confirmed for {booking.appointment_date} at {booking.start_time}"
        notification_type = "booking_confirmation"

        # Create an inapp notification in the database
        self._create_notification(
            user, title, message, notification_type, status="success"
        )
        
        # Send push notification if enabled
        if user.allow_push_notifications and user.notification_token:
            try:
                push_result = self._send_push_notification(
                    user=user,
                    title=title,
                    body=message,
                    data={
                        "type": "booking_confirmation",
                        "booking_id": str(booking.id),
                        "screen": "booking_details"
                    }
                )
                results['push_notification'] = push_result
                logger.info(f"Push notification sent to user {user.id} for booking {booking.id}")
            except Exception as e:
                results['errors'].append(f"Push notification failed: {str(e)}")
                logger.error(f"Push notification error for user {user.id}: {str(e)}")
        
        # Send email notification if enabled
        if user.allow_email_notifications:
            try:
                email_result = self._send_email_notification(
                    user=user,
                    subject="Booking Confirmation - Prisma Car Care",
                    template="booking_confirmation.html",
                    context={
                        'user': user,
                        'booking': booking,
                        'booking_reference': booking.booking_reference
                    }
                )
                results['email_notification'] = email_result
                logger.info(f"Email notification sent to user {user.id} for booking {booking.id}")
            except Exception as e:
                results['errors'].append(f"Email notification failed: {str(e)}")
                logger.error(f"Email notification error for user {user.id}: {str(e)}")
        
        return results
    
    def send_service_reminder(self, user, booking):
        """Send service reminder via push notification and email"""
        results = {
            'push_notification': None,
            'errors': []
        }
        
        # Send push notification if enabled
        if user.allow_push_notifications and user.notification_token:
            try:
                push_result = self._send_push_notification(
                    user=user,
                    title="Service Reminder ⏰",
                    body=f"Your valet service starts in 30 minutes at {booking.start_time}",
                    data={
                        "type": "service_reminder",
                        "booking_id": str(booking.id),
                        "screen": "booking_details"
                    }
                )
                results['push_notification'] = push_result
            except Exception as e:
                results['errors'].append(f"Push notification failed: {str(e)}")
        return results



    
    def send_service_completed(self, user, booking):
        """Send service completed notification via push notification and email"""
        results = {
            'push_notification': None,
            'email_notification': None,
            'errors': []
        }
        
        # Send push notification if enabled
        if user.allow_push_notifications and user.notification_token:
            try:
                push_result = self._send_push_notification(
                    user=user,
                    title="Service Completed! ✨",
                    body=f"Your valet service has been completed. Thank you for choosing PRISMA VALET!",
                    data={
                        "type": "service_completed",
                        "booking_id": str(booking.id),
                        "screen": "service_history"
                    }
                )
                results['push_notification'] = push_result
            except Exception as e:
                results['errors'].append(f"Push notification failed: {str(e)}")
        
        # Send email notification if enabled
        if user.allow_email_notifications:
            try:
                email_result = self._send_email_notification(
                    user=user,
                    subject="Service Completed - Prisma Car Care",
                    template="service_completed.html",
                    context={
                        'user': user,
                        'booking': booking,
                        'booking_reference': booking.booking_reference
                    }
                )
                results['email_notification'] = email_result
            except Exception as e:
                results['errors'].append(f"Email notification failed: {str(e)}")
        
        return results
    
    """ Send a booking cancellation notification to users. Send emails if they have email notification enabled, and then send a in app notification too."""
    def send_booking_cancelled(self, user, booking, message=None):
        """Send booking cancellation notification"""
        results = {
            'push_notification': None,
            'email_notification': None,
            'errors': []
        }

        title = "Booking Cancelled"
        if message is None:
            message = f"Your valet service for {booking.appointment_date} at {booking.start_time} has been cancelled. You will be refunded within 3-5 business days."
        notification_type = "booking_cancelled"

        # Create an inapp notification in the database
        self._create_notification(user, title, message, notification_type, status="info")

        # Send push notification if enabled
        if user.allow_push_notifications and user.notification_token:
            try:
                push_result = self._send_push_notification(
                    user=user,
                    title=title,
                    body=message,
                    data={
                        "type": "booking_cancelled",
                        "booking_id": str(booking.id),
                        "booking_reference": booking.booking_reference,
                        "screen": "booking_details",
                    },
                )
                results["push_notification"] = push_result
            except Exception as e:
                results['errors'].append(f"Push notification failed: {str(e)}")
        
        # Send email notification if enabled
        if user.allow_email_notifications:
            try:
                email_result = self._send_email_notification(
                    user=user,
                    subject=title,
                    template="booking_cancelled.html",
                    context={
                        'user': user,
                        'booking': booking,
                        'booking_reference': booking.booking_reference
                    }
                )
                results['email_notification'] = email_result
            except Exception as e:
                results['errors'].append(f"Email notification failed: {str(e)}")
        
        return results

    def send_booking_rescheduled(self, user, booking, message=None):
        """Send booking reschedule notification: in-app, push (if enabled), email (if enabled)."""
        results = {
            "push_notification": None,
            "email_notification": None,
            "errors": [],
        }
        title = "Booking Rescheduled!"
        if message is None:
            message = f"Your valet service has been rescheduled for {booking.appointment_date} at {booking.start_time}."
        notification_type = "booking_rescheduled"

        self._create_notification(
            user, title, message, notification_type, status="success"
        )

        if user.allow_push_notifications and user.notification_token:
            try:
                push_result = self._send_push_notification(
                    user=user,
                    title=title,
                    body=message,
                    data={
                        "type": "booking_rescheduled",
                        "booking_id": str(booking.id),
                        "booking_reference": booking.booking_reference,
                        "screen": "booking_details",
                    },
                )
                results["push_notification"] = push_result
            except Exception as e:
                results["errors"].append(f"Push notification failed: {str(e)}")

        if user.allow_email_notifications:
            try:
                email_result = self._send_email_notification(
                    user=user,
                    subject="Booking Rescheduled - Prisma Car Care",
                    template="booking_rescheduled.html",
                    context={
                        "user": user,
                        "booking": booking,
                        "booking_reference": booking.booking_reference,
                    },
                )
                results["email_notification"] = email_result
            except Exception as e:
                results["errors"].append(f"Email notification failed: {str(e)}")

        return results

    def send_marketing_notification(self, users, subject, message, data=None):
        """Send marketing notification to multiple users"""
        results = {
            'push_notifications': [],
            'email_notifications': [],
            'errors': []
        }
        
        for user in users:
            # Only send to users who have marketing emails enabled
            if not user.allow_marketing_emails:
                continue
            
            # Send push notification if enabled
            if user.allow_push_notifications and user.notification_token:
                try:
                    push_result = self._send_push_notification(
                        user=user,
                        title=subject,
                        body=message,
                        data=data or {}
                    )
                    results['push_notifications'].append({
                        'user_id': user.id,
                        'result': push_result
                    })
                except Exception as e:
                    results['errors'].append(f"Push notification failed for user {user.id}: {str(e)}")
            
            # Send email notification if enabled
            if user.allow_email_notifications:
                try:
                    email_result = self._send_email_notification(
                        user=user,
                        subject=subject,
                        template="marketing_email.html",
                        context={
                            'user': user,
                            'message': message,
                            'subject': subject
                        }
                    )
                    results['email_notifications'].append({
                        'user_id': user.id,
                        'result': email_result
                    })
                except Exception as e:
                    results['errors'].append(f"Email notification failed for user {user.id}: {str(e)}")
        
        return results
    


    def _send_push_notification(self, user, title, body, data=None):
        """Internal method to send push notification"""
        if not user.notification_token or not user.notification_token.strip():
            raise ValueError("No valid notification token")
        
        message = PushMessage(
            to=user.notification_token,
            title=title,
            body=body,
            data=data or {}
        )
        
        response = self.push_client.publish(message)
        response.validate_response()
        return response


    
    def _send_email_notification(self, user, subject, template, context=None):
        """Internal method to send email notification"""
        if not user.email:
            raise ValueError("No email address")
        
        # Render email template
        html_message = render_to_string(f'emails/{template}', context or {})
        
        # Send email
        result = send_mail(
            subject=subject,
            message='',  # Plain text version (optional)
            html_message=html_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False
        )
        
        return result

    
    # This method create a notification in the database
    def _create_notification(
        self, user, title, message, notification_type, status="info"
    ) -> bool:
        """Create a notification in the database"""
        try:
            Notification.objects.create(
                user=user,
                title=title,
                message=message,
                type=notification_type,
                status=status,
            )
            return True
        except Exception as e:
            logger.error(f"Failed to create notification: {e}")
            return False