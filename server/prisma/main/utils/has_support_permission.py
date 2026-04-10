from django.conf import settings

def has_support_permission(request):
        expected = (getattr(settings, 'SUPPORT_INTERNAL_API_KEY', None) or '').strip()
        if expected:
            return request.headers.get('X-Support-Internal-Key', '') == expected
        if settings.DEBUG:
            return bool(
                request.user
                and request.user.is_authenticated
                and (request.user.is_staff or request.user.is_superuser)
            )
        return False