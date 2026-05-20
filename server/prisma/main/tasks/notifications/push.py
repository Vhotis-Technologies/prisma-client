"""
Celery task for Expo push notifications to mobile clients.

``send_push_notification`` loads the user, respects opt-out and token presence,
normalizes payload values to strings (Expo requirement), and publishes via
``exponent_server_sdk``.
"""
from celery import shared_task
from exponent_server_sdk import PushClient, PushMessage


def _normalize_push_data(type_or_data, title, message):
    """
    Build Expo-compatible push ``data`` dict with string values only.

    Args:
        type_or_data: Either a notification type string or a dict of custom fields.
        title: Push title (also copied into data when missing).
        message: Push body (also copied into data when missing).

    Returns:
        dict: String-keyed payload for ``PushMessage.data``.
    """
    if isinstance(type_or_data, dict):
        data = {str(k): "" if v is None else str(v) for k, v in type_or_data.items()}
    else:
        data = {"type": str(type_or_data)}
    data.setdefault("title", str(title))
    data.setdefault("body", str(message))
    return data


@shared_task
def send_push_notification(user_id, title, message, type):
    """
    Send a single Expo push notification to one user asynchronously.

    Args:
        user_id: Primary key of ``User``.
        title: Notification title shown on device.
        message: Notification body text.
        type: Either a type string or dict merged into push data.

    Returns:
        str: Human-readable success or failure reason (Celery result).
    """
    try:
        from main.models import User
        user = User.objects.get(id=user_id)

        if not user.notification_token:
            return f"Push notification not sent: User {user_id} has no notification token"

        if not user.allow_push_notifications:
            return f"Push notification not sent: User {user_id} has disabled push notifications"

        push_data = _normalize_push_data(type, title, message)
        push_client = PushClient()
        response = push_client.publish(
            PushMessage(
                to=user.notification_token,
                title=title,
                body=message,
                data=push_data,
            )
        )

        # Validate ticket when the SDK exposes validate_response.
        if response is not None:
            validate = getattr(response, "validate_response", None)
            if callable(validate):
                validate()

        if response and hasattr(response, "data") and response.data:
            return f"Push notification sent successfully to user {user_id}"
        return f"Push notification failed for user {user_id}: Invalid response"

    except Exception as e:
        error_msg = f"Failed to send push notification to user {user_id}: {str(e)}"
        return error_msg
