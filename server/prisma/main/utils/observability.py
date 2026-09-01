"""Request IDs and timing logs for client↔crew booking hops."""
import logging
import time
import uuid

logger = logging.getLogger("main.observability")


def new_request_id():
    """Return a new hex request id for a booking hop."""
    return uuid.uuid4().hex


def stream_lag_ms(msg_id):
    """
    Milliseconds between a Redis stream id timestamp and now.

    Args:
        msg_id: Stream id such as ``1710000000000-0``.

    Returns:
        int | None: Lag in ms, or None when the id is not a millisecond timestamp.
    """
    try:
        ts_ms = int(str(msg_id).split("-", 1)[0])
        return max(0, int(time.time() * 1000) - ts_ms)
    except (TypeError, ValueError, IndexError):
        return None


def log_timed(name, started, **fields):
    """
    Log ``name`` with elapsed milliseconds and structured fields.

    Args:
        name: Event name (e.g. ``detailer.create_booking``).
        started: ``time.monotonic()`` captured before the work.
        **fields: Extra key=value fields (booking_reference, request_id, ...).
    """
    ms = (time.monotonic() - started) * 1000.0
    parts = " ".join(f"{key}={value}" for key, value in fields.items() if value not in (None, ""))
    logger.info("%s duration_ms=%.1f %s", name, ms, parts)
