"""
Redis GEO read helper for detailer location.
Uses the same Redis instance and key as the detailer server (detailers:geo).
"""
from typing import Optional, Tuple

from main.utils.redis_streams import get_redis

REDIS_KEY_DETAILERS_GEO = "detailers:geo"


def get_detailer_location(detailer_id: int) -> Optional[Tuple[float, float]]:
    """
    Get a detailer's (latitude, longitude) from Redis GEO set.
    detailer_id is the detailer app's Detailer id (stored as BookedAppointment.detailer.external_id).
    Returns None if not found or on error.
    """
    try:
        r = get_redis(decode_responses=True)
        try:
            pos = r.geopos(REDIS_KEY_DETAILERS_GEO, str(detailer_id))
            if not pos or pos[0] is None:
                return None
            lon, lat = pos[0]
            return (float(lat), float(lon))
        finally:
            r.close()
    except Exception:
        return None
