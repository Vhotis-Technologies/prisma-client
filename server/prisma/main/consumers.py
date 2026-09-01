"""WebSocket consumers for live booking status on the client app."""
import json

from channels.generic.websocket import AsyncWebsocketConsumer


class BookingUpdatesConsumer(AsyncWebsocketConsumer):
    """Fan-out booking lifecycle events to the authenticated user's group."""

    async def connect(self):
        user = self.scope.get("user")
        if not user or getattr(user, "is_anonymous", True):
            await self.close(code=4401)
            return
        self.group_name = f"user_{user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        group_name = getattr(self, "group_name", None)
        if group_name:
            await self.channel_layer.group_discard(group_name, self.channel_name)

    async def booking_update(self, event):
        """Forward a channel-layer booking.update to the socket."""
        await self.send(
            text_data=json.dumps(
                {
                    "event": event.get("event"),
                    "booking_reference": event.get("booking_reference"),
                    "status": event.get("status"),
                }
            )
        )
