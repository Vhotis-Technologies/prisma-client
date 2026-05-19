from django import template

from main.utils.legal_urls import privacy_policy_url, terms_of_service_url

register = template.Library()


@register.simple_tag
def legal_privacy_url():
    return privacy_policy_url()


@register.simple_tag
def legal_terms_url():
    return terms_of_service_url()
