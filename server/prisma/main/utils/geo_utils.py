"""
Geographic utilities for service area calculation.

Uses the Spire of Dublin as the epicenter for determining if a client
location is serviceable and whether travel surcharge applies.
"""
import math
from decimal import Decimal
from typing import Optional, Tuple

# Earth's radius in kilometers
EARTH_RADIUS_KM = 6371.0

# Spire of Dublin service area epicenter
SPIRE_LAT = 53.3498
SPIRE_LNG = -6.2603

# Service area zones (distance from Spire)
FREE_ZONE_RADIUS_KM = 25.0
MAX_SERVICE_RADIUS_KM = 35.0
TRAVEL_SURCHARGE_EUR = Decimal("15.00")


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Compute the great-circle distance between two points on Earth using the Haversine formula.

    Args:
        lat1: Latitude of first point (degrees)
        lon1: Longitude of first point (degrees)
        lat2: Latitude of second point (degrees)
        lon2: Longitude of second point (degrees)

    Returns:
        Distance in kilometers
    """
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)

    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.asin(math.sqrt(a))
    return EARTH_RADIUS_KM * c


def distance_from_spire_km(lat: float, lng: float) -> float:
    """
    Compute distance from client location to the Spire of Dublin.

    Args:
        lat: Client latitude (degrees)
        lng: Client longitude (degrees)

    Returns:
        Distance in kilometers from the Spire
    """
    return haversine_distance_km(SPIRE_LAT, SPIRE_LNG, lat, lng)


def classify_service_area(lat: float, lng: float) -> Tuple[str, float, Optional[Decimal]]:
    """
    Classify a client location relative to the Spire service area.

    Service area rules:
    - ≤ 25 km from Spire: in_zone (no surcharge)
    - > 25 km and ≤ 35 km from Spire: surcharge (€10 travel fee for B2C)
    - > 35 km from Spire: out_of_area (no service)

    Args:
        lat: Client latitude (degrees)
        lng: Client longitude (degrees)

    Returns:
        Tuple of (zone, distance_km, surcharge_eur):
        - zone: "in_zone" | "surcharge" | "out_of_area"
        - distance_km: Actual distance from Spire in kilometers
        - surcharge_eur: Travel surcharge amount (None for out_of_area)
    """
    distance = distance_from_spire_km(lat, lng)

    if distance <= FREE_ZONE_RADIUS_KM:
        return "in_zone", distance, Decimal("0")
    elif distance <= MAX_SERVICE_RADIUS_KM:
        return "surcharge", distance, TRAVEL_SURCHARGE_EUR
    else:
        return "out_of_area", distance, None


def is_b2c_user(user) -> bool:
    """
    Check if a user is a B2C customer (eligible for travel surcharge).

    B2B users (fleet owners, branch admins, partners) are NOT charged travel surcharge
    because their bulk orders cover travel costs.

    Args:
        user: User instance or None (None = guest, treated as B2C)

    Returns:
        True if B2C customer, False if B2B
    """
    from main.models import Partner

    if user is None:
        return True  # Guest = B2C
    if getattr(user, "is_guest", False):
        return True  # Guest user = B2C
    if getattr(user, "is_fleet_owner", False):
        return False  # Fleet owner = B2B
    if getattr(user, "is_branch_admin", False):
        return False  # Branch admin = B2B
    if hasattr(user, "is_fleet_admin_or_manager") and user.is_fleet_admin_or_manager():
        return False  # Fleet manager = B2B
    if Partner.objects.filter(user=user).exists():
        return False  # Partner = B2B
    return True  # Regular customer = B2C


def travel_surcharge_for_location(
    user, latitude: Optional[float], longitude: Optional[float]
) -> Decimal:
    """
    Calculate travel surcharge for a booking location.

    B2C users in the 25-35km zone from Spire pay €10 travel surcharge.
    B2B users (fleet/partner) never pay travel surcharge.

    Args:
        user: User instance or None (guest)
        latitude: Client location latitude
        longitude: Client location longitude

    Returns:
        Decimal travel surcharge amount (0 if not applicable)
    """
    if latitude is None or longitude is None:
        return Decimal("0")

    if not is_b2c_user(user):
        return Decimal("0")  # B2B never pays surcharge

    zone, _distance, surcharge = classify_service_area(latitude, longitude)
    if zone == "surcharge" and surcharge is not None:
        return surcharge

    return Decimal("0")
