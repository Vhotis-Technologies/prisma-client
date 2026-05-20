"""
DRF permission for **client** routes under ``/api/v1/support/...``.

These endpoints are not called by end users directly. They are reached by:

- The **support server**, which forwards support-app requests using
  ``X-Support-Internal-Key`` matching ``SUPPORT_INTERNAL_API_KEY`` on both sides.
Apply ``SupportPermissionAccess`` to any APIView that must stay internal-only.
"""
from rest_framework.permissions import BasePermission
from main.utils.has_support_permission import has_support_permission


class SupportPermissionAccess(BasePermission):
    """
    Grants access when ``has_support_permission(request)`` is true (shared internal key).
    """

    message = 'Support permission access denied.'

    def has_permission(self, request, view):
        """Allow only requests that present a valid internal support API key."""
        return has_support_permission(request)
