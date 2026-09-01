"""
Redis Streams helper for ``job_events`` stream.

Uses consumer groups for at-least-once delivery and recovery after restarts.
"""
import os
import redis

REDIS_HOST = os.environ.get("REDIS_HOST", "prisma_redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
REDIS_DB = int(os.environ.get("REDIS_DB", "0"))

STREAM_JOB_EVENTS = "job_events"
MAXLEN_DEFAULT = 10000


def get_redis(decode_responses=True, socket_timeout=None):
    """
    Return a new Redis connection using environment host/port/db.

    Args:
        decode_responses: When True, stream field values are str; False for bytes.
        socket_timeout: Socket read timeout in seconds. ``None`` waits indefinitely.
            Blocking stream reads must use a value greater than ``block_ms``.

    Returns:
        redis.Redis: Connected client (caller should ``close()`` when done).
    """
    return redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        decode_responses=decode_responses,
        socket_connect_timeout=5,
        socket_timeout=socket_timeout,
        health_check_interval=0,
    )


def stream_add(stream_key, data_dict, maxlen=MAXLEN_DEFAULT):
    """
    Append a message to a stream with approximate maxlen trimming.

    Flattens dict values to strings (JSON for dict/list) for Redis XADD field pairs.

    Args:
        stream_key: Redis stream name.
        data_dict: Field names to values (mixed types coerced to str).
        maxlen: Approximate max stream length passed to XADD.

    Returns:
        str: Redis message id for the new entry.
    """
    r = get_redis(decode_responses=False)
    import json
    flat = {}
    for k, v in data_dict.items():
        if isinstance(v, str):
            flat[k] = v
        elif isinstance(v, (dict, list)):
            flat[k] = json.dumps(v)
        else:
            flat[k] = str(v) if v is not None else ""
    try:
        msg_id = r.xadd(stream_key, flat, maxlen=maxlen, approximate=True)
        return msg_id.decode("utf-8") if isinstance(msg_id, bytes) else msg_id
    finally:
        r.close()


def ensure_consumer_group(stream_key, group_name):
    """
    Create a consumer group if it does not exist (idempotent).

    Uses start id ``0`` and ``MKSTREAM`` so a missing stream is created. Ignores
    ``BUSYGROUP`` when the group already exists.

    Args:
        stream_key: Redis stream name.
        group_name: Consumer group name (e.g. per deployable service).
    """
    r = get_redis(decode_responses=True)
    try:
        r.xgroup_create(stream_key, group_name, id="0", mkstream=True)
    except redis.exceptions.ResponseError as e:
        if "BUSYGROUP" not in str(e):
            raise
    finally:
        r.close()


def read_group_blocking(stream_key, group_name, consumer_name, block_ms=5000):
    """
    Block until new messages arrive for this consumer group member.

    Reads only entries never delivered to the group (stream id ``>``).

    Args:
        stream_key: Redis stream name.
        group_name: Consumer group name.
        consumer_name: Unique consumer name within the group.
        block_ms: Max block time in milliseconds.

    Returns:
        list[tuple[str, dict]]: ``(message_id, fields_dict)`` with string keys/values.
    """
    # Socket timeout must exceed BLOCK, otherwise an empty stream raises
    # TimeoutError instead of returning nil (common on WSL2/Docker).
    socket_timeout = (block_ms / 1000.0) + 5.0 if block_ms else None
    r = get_redis(decode_responses=True, socket_timeout=socket_timeout)
    try:
        reply = r.xreadgroup(
            groupname=group_name,
            consumername=consumer_name,
            streams={stream_key: ">"},
            block=block_ms,
            count=100,
        )
    except redis.exceptions.TimeoutError:
        return []
    finally:
        r.close()
    if not reply:
        return []
    entries = reply[0][1] if reply else []
    return [(eid, dict(fields)) for eid, fields in entries]


def read_pending(stream_key, group_name, consumer_name):
    """
    Read pending (unacked) messages for this consumer on startup.

    Uses stream id ``0`` to claim historical pending entries for the consumer.

    Args:
        stream_key: Redis stream name.
        group_name: Consumer group name.
        consumer_name: Consumer name to recover pending work for.

    Returns:
        list[tuple[str, dict]]: ``(message_id, fields_dict)`` pending entries.
    """
    r = get_redis(decode_responses=True)
    try:
        reply = r.xreadgroup(
            groupname=group_name,
            consumername=consumer_name,
            streams={stream_key: "0"},
            count=100,
        )
    finally:
        r.close()
    if not reply:
        return []
    entries = reply[0][1] if reply else []
    return [(eid, dict(fields)) for eid, fields in entries]


def ack(stream_key, group_name, message_id):
    """
    Acknowledge a message so it is not redelivered to the consumer group.

    Args:
        stream_key: Redis stream name.
        group_name: Consumer group name.
        message_id: Id returned from ``read_group_blocking`` / ``read_pending``.
    """
    r = get_redis(decode_responses=True)
    try:
        r.xack(stream_key, group_name, message_id)
    finally:
        r.close()


class RedisStreamConsumer:
    """
    Long-lived Redis client for a subscriber loop (one connection, reused).

    Module-level ``read_group_blocking`` / ``ack`` open and close per call; this
    class keeps the socket open for the process lifetime.
    """

    def __init__(self, block_ms=5000):
        socket_timeout = (block_ms / 1000.0) + 5.0 if block_ms else None
        self.block_ms = block_ms
        self._r = get_redis(decode_responses=True, socket_timeout=socket_timeout)

    def read_group_blocking(self, stream_key, group_name, consumer_name, block_ms=None):
        """Block-read new group entries on the reused connection."""
        block = self.block_ms if block_ms is None else block_ms
        try:
            reply = self._r.xreadgroup(
                groupname=group_name,
                consumername=consumer_name,
                streams={stream_key: ">"},
                block=block,
                count=100,
            )
        except redis.exceptions.TimeoutError:
            return []
        if not reply:
            return []
        entries = reply[0][1] if reply else []
        return [(eid, dict(fields)) for eid, fields in entries]

    def read_pending(self, stream_key, group_name, consumer_name):
        """Read this consumer's pending entries on the reused connection."""
        reply = self._r.xreadgroup(
            groupname=group_name,
            consumername=consumer_name,
            streams={stream_key: "0"},
            count=100,
        )
        if not reply:
            return []
        entries = reply[0][1] if reply else []
        return [(eid, dict(fields)) for eid, fields in entries]

    def ack(self, stream_key, group_name, message_id):
        """Acknowledge one message on the reused connection."""
        self._r.xack(stream_key, group_name, message_id)

    def pending_count(self, stream_key, group_name):
        """Return the group's pending (unacked) entry count."""
        info = self._r.xpending(stream_key, group_name)
        if not info:
            return 0
        if isinstance(info, dict):
            return int(info.get("pending") or 0)
        return int(info[0] or 0)

    def close(self):
        """Close the reused Redis connection."""
        try:
            self._r.close()
        except Exception:
            pass
