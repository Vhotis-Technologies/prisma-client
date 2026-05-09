from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from .routing import websocket_urlpatterns

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/', include('main.urls')),
]

# Dev-only static (WHITENOISE serves collected files when DEBUG=False).
# User uploads use GCS — do not serve MEDIA_URL from disk here.
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
