"""
Subscription entitlement checks for feature gating.

Determines if a user has access to premium features like unwatermarked images
based on their B2C or B2B (fleet) subscription status.
"""
from __future__ import annotations

from django.utils import timezone


def has_active_subscription(user) -> bool:
    """
    Check if user has an active paid subscription (B2C or B2B).

    B2B (fleet owners/branch admins): requires active FleetSubscription.
    B2C (consumers): requires active B2CSubcription.

    Subscription is only granted after successful payment.

    Args:
        user: Authenticated User instance.

    Returns:
        bool: True if user has premium access, False otherwise.
    """
    if not user or not user.is_authenticated:
        return False

    # B2B: Fleet owners and branch admins
    if user.is_fleet_owner or user.is_branch_admin:
        return _has_active_fleet_subscription(user)

    # B2C: Regular consumers
    return _has_active_b2c_subscription(user)


def _has_active_fleet_subscription(user) -> bool:
    """
    Check if a fleet user has an active paid fleet subscription.

    Args:
        user: Fleet owner or branch admin user.

    Returns:
        bool: True if fleet has active subscription.
    """
    from main.models import Fleet, FleetMember, FleetSubscription

    fleet = None
    if user.is_fleet_owner:
        fleet = Fleet.objects.filter(owner=user).first()
    elif user.is_branch_admin:
        membership = FleetMember.objects.filter(user=user).select_related('fleet').first()
        fleet = membership.fleet if membership else None

    if not fleet:
        return False

    # Only 'active' status counts - user must have paid
    return FleetSubscription.objects.filter(
        fleet=fleet,
        status='active',
        end_date__gte=timezone.now()
    ).exists()


def _has_active_b2c_subscription(user) -> bool:
    """
    Check if a consumer has an active paid B2C subscription.

    Args:
        user: B2C consumer user.

    Returns:
        bool: True if user has active subscription.
    """
    from main.models import B2CSubcription

    # Only 'active' status counts - user must have paid
    return B2CSubcription.objects.filter(
        user=user,
        status='active',
        end_date__gte=timezone.now()
    ).exists()


def should_watermark_images(user) -> bool:
    """
    Determine if images should be watermarked for this user.

    Images are watermarked for users without an active paid subscription.
    Partners/dealerships are treated as non-subscribers unless they
    have a separate subscription.

    Args:
        user: Authenticated User instance.

    Returns:
        bool: True if images should be watermarked, False for clean images.
    """
    return not has_active_subscription(user)
