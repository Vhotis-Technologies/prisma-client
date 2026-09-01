# client/server/prisma/prisma/routing.py
from django.urls import re_path

from main.consumers import BookingUpdatesConsumer

websocket_urlpatterns = [
    re_path(r"ws/client/$", BookingUpdatesConsumer.as_asgi()),
]
