from celery import shared_task
from exponent_server_sdk import PushClient, PushMessage


@shared_task
def send_push_notification(user_id, title, message, type):
    """Send a push notification to the user."""
    try:
        from main.models import User
        user = User.objects.get(id=user_id)

        if not user.notification_token:
            return f"Push notification not sent: User {user_id} has no notification token"

        if not user.allow_push_notifications:
            return f"Push notification not sent: User {user_id} has disabled push notifications"

        push_client = PushClient()
        response = push_client.publish(
            PushMessage(
                to=user.notification_token,
                title=title,
                body=message,
                data={
                    "type": type,
                    "title": title,
                    "body": message
                }
            )
        )

        if response and hasattr(response, 'data') and response.data:
            return f"Push notification sent successfully to user {user_id}"
        else:
            return f"Push notification failed for user {user_id}: Invalid response"

    except Exception as e:
        error_msg = f"Failed to send push notification to user {user_id}: {str(e)}"
        return error_msg
