"""
Partner attribution utilities for commission and referral tracking.
"""
from django.utils import timezone

from main.models import ReferralAttribution


def get_partner_for_user(user):
    """
    Get the Partner who referred this user, if any.
    Returns Partner from ReferralAttribution where expires_at is None or in the future.
    """
    attr = ReferralAttribution.objects.filter(referred_user=user).first()
    if attr is None:
        return None
    if attr.expires_at is not None and attr.expires_at < timezone.now():
        return None
    return attr.partner
