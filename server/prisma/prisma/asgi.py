# client/server/prisma/prisma/asgi.py
import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "prisma.settings")

django_asgi_app = get_asgi_application()

from main.ws_auth import JwtAuthMiddleware
from .routing import websocket_urlpatterns

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": JwtAuthMiddleware(URLRouter(websocket_urlpatterns)),
})
