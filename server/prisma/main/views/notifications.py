"""
Notifications API: list notifications, mark read, mark all read, delete, save FCM token.

Actions: get_notifications, mark_notification_as_read, mark_all_notifications_as_read,
delete_notification, save_notification_token.
"""
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from main.models import Notification


class NotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    action_handlers = {
        'get_notifications': '_get_notifications',
        'mark_notification_as_read': '_mark_notification_as_read',
        'mark_all_notifications_as_read': '_mark_all_notifications_as_read',
        'delete_notification': '_delete_notification',
        'save_notification_token': '_save_notification_token',
    }

    def get(self, request, *args, **kwargs):
        """Route GET by action (e.g. get_notifications). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)
    
    def patch(self, request, *args, **kwargs):
        """Route PATCH by action (e.g. mark_notification_as_read, mark_all_notifications_as_read). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)
    
    def delete(self, request, *args, **kwargs):
        """Route DELETE by action (e.g. delete_notification). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handlers[action])
        return handler(request)


    
    def _get_notifications(self, request):
        """Return all notifications for the authenticated user. Each with id, title, message, type, status, timestamp, is_read."""
        try:
            notifications = Notification.objects.filter(user=request.user)
            notifications_data = []
            
            for notification in notifications:
                notifications_data.append({
                    'id': notification.id,
                    'title': notification.title,
                    'message': notification.message,
                    'type': notification.type,
                    'status': notification.status,
                    'timestamp': notification.timestamp,
                    'is_read': notification.is_read,
                })
            return Response(notifications_data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        
    def _mark_notification_as_read(self, request):
        """Mark one notification as read. Expects request.data.id (notification id). User must own the notification."""
        try:
            notification_id = request.data.get('id')
            notification = Notification.objects.get(id=notification_id, user=request.user)
            notification.is_read = True
            notification.save()
            return Response({'success': True}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _mark_all_notifications_as_read(self, request):
        """Mark multiple notifications as read. Expects request.data.ids (list of notification ids). Only user's notifications updated."""
        try:
            notification_ids = request.data.get('ids', [])
            
            if not notification_ids:
                return Response({'success': True}, status=status.HTTP_200_OK)
            
            # Update all notifications for the current user
            updated_count = Notification.objects.filter(
                id__in=notification_ids,
                user=request.user,
                is_read=False
            ).update(is_read=True)
            
            return Response({'success': True}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        

    def _delete_notification(self, request):
        """Delete one notification. Expects request.data.id. User must own the notification."""
        try:
            notification = Notification.objects.get(id=request.data['id'], user=request.user)
            notification.delete()
            return Response({'success': True}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    def _save_notification_token(self, request):
        """Save FCM/push token to user.notification_token. Expects request.data.token."""
        try:
            token = request.data.get('token')
            request.user.notification_token = token
            request.user.save()
            return Response({'success': True}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
