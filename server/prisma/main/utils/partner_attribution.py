"""
Partner attribution utilities for commission and referral tracking.

Resolves which ``Partner`` referred a user via ``ReferralAttribution``, respecting expiry.
"""
from django.utils import timezone

from main.models import ReferralAttribution


def get_partner_for_user(user):
    """
    Get the Partner who referred this user, if attribution is still active.

    Args:
        user: ``User`` instance (referred party).

    Returns:
        Partner | None: The referring partner when ``ReferralAttribution`` exists and
        ``expires_at`` is null or in the future; otherwise None.
    """
    attr = ReferralAttribution.objects.filter(referred_user=user).first()
    if attr is None:
        return None
    # Expired attributions no longer count for commission or offers.
    if attr.expires_at is not None and attr.expires_at < timezone.now():
        return None
    return attr.partner
