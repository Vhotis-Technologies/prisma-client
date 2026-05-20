"""
Public HTML legal documents for browsers and email deep links.

Rendered server-side (not JSON API). Latest row by ``last_updated`` from DB.
"""
from django.http import Http404
from django.shortcuts import render
from django.views import View

from main.models import PrivacyPolicy, TermsAndConditions


class LegalPrivacyView(View):
    """Serve the latest privacy policy as an HTML page (legal/document.html)."""

    def get(self, request):
        """Load newest PrivacyPolicy and render styled document template."""
        try:
            # Fetch most recently updated policy version
            doc = PrivacyPolicy.objects.latest("last_updated")
        except PrivacyPolicy.DoesNotExist:
            raise Http404("Privacy policy not found")
        return render(
            request,
            "legal/document.html",
            {
                "title": "Privacy Policy",
                "content": doc.content,
                "version": doc.version,
                "last_updated": doc.last_updated,
            },
        )


class LegalTermsView(View):
    """Serve the latest terms of service as an HTML page (legal/document.html)."""

    def get(self, request):
        """Load newest TermsAndConditions and render styled document template."""
        try:
            # Fetch most recently updated terms version
            doc = TermsAndConditions.objects.latest("last_updated")
        except TermsAndConditions.DoesNotExist:
            raise Http404("Terms of service not found")
        return render(
            request,
            "legal/document.html",
            {
                "title": "Terms of Service",
                "content": doc.content,
                "version": doc.version,
                "last_updated": doc.last_updated,
            },
        )
