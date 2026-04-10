"""
DRF permission for **client** routes under ``/api/v1/support/...``.

These endpoints are not called by end users directly. They are reached by:

- The **support server**, which forwards support-app requests using
  ``X-Support-Internal-Key`` matching ``SUPPORT_INTERNAL_API_KEY`` on both sides.
- Local **DEBUG** tooling: staff users may call without the header when ``DEBUG`` is on
  (see ``main.utils.has_support_permission``).

Apply ``SupportPermissionAccess`` to any APIView that must stay internal-only.
"""
from rest_framework.permissions import BasePermission
from main.utils.has_support_permission import has_support_permission


class SupportPermissionAccess(BasePermission):
    """
    Grants access when ``has_support_permission(request)`` is true (shared secret or DEBUG staff).
    """

    message = 'Support permission access denied.'

    def has_permission(self, request, view):
        return has_support_permission(request)
