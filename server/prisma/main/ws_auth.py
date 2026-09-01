"""JWT query-string auth for Django Channels WebSockets."""
import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.db import close_old_connections
from rest_framework_simplejwt.tokens import AccessToken

logger = logging.getLogger(__name__)


@database_sync_to_async
def get_user_from_token(token):
    """Resolve a user from a SimpleJWT access token, or AnonymousUser."""
    close_old_connections()
    try:
        access = AccessToken(token)
        return get_user_model().objects.get(id=access["user_id"])
    except Exception as exc:
        logger.warning("websocket jwt auth failed: %s", type(exc).__name__)
        return AnonymousUser()


class JwtAuthMiddleware:
    """Set ``scope['user']`` from ``?token=`` on the WebSocket URL."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        scope = dict(scope)
        query = parse_qs((scope.get("query_string") or b"").decode())
        token = (query.get("token") or [None])[0]
        scope["user"] = await get_user_from_token(token) if token else AnonymousUser()
        return await self.inner(scope, receive, send)
