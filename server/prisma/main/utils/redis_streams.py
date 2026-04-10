"""
Redis Streams helper for job_events stream.
Uses consumer groups for at-least-once delivery and no message loss during restarts.
"""
import os
import redis

REDIS_HOST = os.environ.get("REDIS_HOST", "prisma_redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
REDIS_DB = int(os.environ.get("REDIS_DB", "0"))

STREAM_JOB_EVENTS = "job_events"
MAXLEN_DEFAULT = 10000


def get_redis(decode_responses=True):
    """Return Redis connection using environment/settings."""
    return redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        decode_responses=decode_responses,
    )


def stream_add(stream_key, data_dict, maxlen=MAXLEN_DEFAULT):
    """
    Append a message to a stream. Flattens dict to Redis field/value (strings).
    Returns message id.
    """
    r = get_redis(decode_responses=False)
    # Redis XADD expects field-value pairs; values must be strings
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
    Create consumer group if it does not exist. Idempotent: catches BUSYGROUP.
    Uses 0 as start id so new group reads from beginning; MKSTREAM creates stream if missing.
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
    Block until new messages arrive. Returns list of (message_id, fields_dict).
    fields_dict has string keys and string values (decode_responses=True).
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
    # reply is [(stream_key, [(id, {k:v}), ...])]
    entries = reply[0][1] if reply else []
    return [(eid, dict(fields)) for eid, fields in entries]


def read_pending(stream_key, group_name, consumer_name):
    """
    Read pending messages for this consumer (e.g. on startup). Returns list of (message_id, fields_dict).
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
    """Acknowledge a message so it is not redelivered."""
    r = get_redis(decode_responses=True)
    try:
        r.xack(stream_key, group_name, message_id)
    finally:
        r.close()
