"""
Redis GEO read helper for detailer live location.

Uses the same Redis instance and key as the detailer server (``detailers:geo``).
"""
from typing import Optional, Tuple

from main.utils.redis_streams import get_redis

REDIS_KEY_DETAILERS_GEO = "detailers:geo"


def get_detailer_location(detailer_id: int) -> Optional[Tuple[float, float]]:
    """
    Get a detailer's (latitude, longitude) from the shared Redis GEO set.

    Args:
        detailer_id: Detailer app id (stored as ``BookedAppointment.detailer.external_id``).

    Returns:
        tuple[float, float] | None: ``(lat, lon)`` when found; None on miss or Redis error.
    """
    try:
        r = get_redis(decode_responses=True)
        try:
            pos = r.geopos(REDIS_KEY_DETAILERS_GEO, str(detailer_id))
            if not pos or pos[0] is None:
                return None
            # geopos returns (longitude, latitude); callers expect lat-first.
            lon, lat = pos[0]
            return (float(lat), float(lon))
        finally:
            r.close()
    except Exception:
        return None
