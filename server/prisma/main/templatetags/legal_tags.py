"""
Django template tags for legal document URLs (privacy policy, terms of service).

Used in HTML email templates and server-rendered pages so links stay consistent with
:mod:`main.utils.legal_urls` (environment-specific base URLs).
"""
from django import template

from main.utils.legal_urls import privacy_policy_url, terms_of_service_url

register = template.Library()


@register.simple_tag
def legal_privacy_url():
    """Return the absolute URL for the current privacy policy page."""
    return privacy_policy_url()


@register.simple_tag
def legal_terms_url():
    """Return the absolute URL for the current terms of service page."""
    return terms_of_service_url()
