from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from .routing import websocket_urlpatterns
from main.views.legal_pages import LegalPrivacyView, LegalTermsView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/', include('main.urls')),
    path('legal/privacy/', LegalPrivacyView.as_view(), name='legal_privacy'),
    path('legal/terms/', LegalTermsView.as_view(), name='legal_terms'),
]

# Dev-only static (WHITENOISE serves collected files when DEBUG=False).
# User uploads use GCS — do not serve MEDIA_URL from disk here.
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
