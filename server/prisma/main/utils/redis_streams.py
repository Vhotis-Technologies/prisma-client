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


def get_redis(decode_responses=True):
    """
    Return a new Redis connection using environment host/port/db.

    Args:
        decode_responses: When True, stream field values are str; False for bytes.

    Returns:
        redis.Redis: Connected client (caller should ``close()`` when done).
    """
    return redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        decode_responses=decode_responses,
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
    r = get_redis(decode_responses=True)
    try:
        reply = r.xreadgroup(
            groupname=group_name,
            consumername=consumer_name,
            streams={stream_key: ">"},
            block=block_ms,
            count=100,
        )
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
