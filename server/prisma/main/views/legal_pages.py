"""Public HTML pages for privacy policy and terms (email links and browsers)."""
from django.http import Http404
from django.shortcuts import render
from django.views import View

from main.models import PrivacyPolicy, TermsAndConditions


class LegalPrivacyView(View):
    def get(self, request):
        try:
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
    def get(self, request):
        try:
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
