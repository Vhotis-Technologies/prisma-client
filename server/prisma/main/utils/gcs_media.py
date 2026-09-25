"""
Fetch booking photos from GCS without relying on expired signed URLs.

Stored ``BookedAppointmentImage.image_url`` values often include a V4 signature
that expires (~24h). The image proxy parses the stable object path and downloads
with the Django service-account credentials instead.
"""
from __future__ import annotations

import logging
from typing import Optional, Tuple
from urllib.parse import unquote, urlparse

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

IMAGE_FETCH_TIMEOUT = 10  # seconds


def parse_gcs_object_ref(url: str) -> Optional[Tuple[str, str]]:
    """
    Extract ``(bucket, object_name)`` from a GCS URL or path.

    Strips query strings (expired signatures). Supports:
    - ``https://storage.googleapis.com/<bucket>/<object>``
    - ``https://storage.cloud.google.com/<bucket>/<object>``
    - ``https://<bucket>.storage.googleapis.com/<object>``
    - relative ``detailer-app/...`` / ``main-app/...`` (uses configured default bucket)

    Args:
        url: Stored image URL or object path.

    Returns:
        ``(bucket, object_name)`` or ``None`` when the value is not a GCS object.
    """
    raw = (url or "").strip()
    if not raw:
        return None

    parsed = urlparse(raw)
    host = (parsed.netloc or "").lower()
    path = unquote(parsed.path or "").lstrip("/")

    default_bucket = (
        getattr(settings, "GS_BUCKET_NAME", None)
        or getattr(settings, "GS_BUCKET_NAME_STAGING", None)
        or ""
    )

    if not parsed.scheme:
        # Relative / path-only storage key.
        object_name = unquote(raw.split("?", 1)[0]).lstrip("/")
        if not object_name or not default_bucket:
            return None
        return default_bucket, object_name

    if host in ("storage.googleapis.com", "storage.cloud.google.com"):
        if "/" not in path:
            return None
        bucket, object_name = path.split("/", 1)
        if not bucket or not object_name:
            return None
        return bucket, object_name

    if host.endswith(".storage.googleapis.com"):
        bucket = host[: -len(".storage.googleapis.com")]
        if not bucket or not path:
            return None
        return bucket, path

    return None


def _gcs_credentials():
    """Return the active GCS service-account credentials, if configured."""
    return getattr(settings, "GS_CREDENTIALS", None) or getattr(
        settings, "GS_CREDENTIALS_STAGING", None
    )


def download_gcs_object(bucket_name: str, object_name: str) -> bytes:
    """
    Download object bytes from GCS using the Django service account.

    Args:
        bucket_name: GCS bucket id.
        object_name: Object key (e.g. ``detailer-app/jobs/images/...``).

    Returns:
        Raw file bytes.

    Raises:
        Exception: When credentials are missing or the download fails.
    """
    credentials = _gcs_credentials()
    if credentials is None:
        raise RuntimeError("GCS credentials are not configured on this server.")

    from google.cloud import storage

    client = storage.Client(credentials=credentials, project=getattr(credentials, "project_id", None))
    blob = client.bucket(bucket_name).blob(object_name)
    return blob.download_as_bytes()


def fetch_image_bytes(url: str) -> bytes:
    """
    Load image bytes for the proxy.

    Prefer credentialed GCS download for Google Storage URLs/paths so expired
    signed query strings do not matter. Fall back to HTTP GET for other hosts.

    Args:
        url: Stored ``image_url`` value.

    Returns:
        Raw image bytes.

    Raises:
        Exception: When neither GCS nor HTTP fetch succeeds.
    """
    gcs_ref = parse_gcs_object_ref(url)
    if gcs_ref is not None:
        bucket_name, object_name = gcs_ref
        try:
            return download_gcs_object(bucket_name, object_name)
        except Exception as exc:
            logger.warning(
                "GCS credentialed download failed for gs://%s/%s (%s); falling back to HTTP",
                bucket_name,
                object_name,
                exc,
            )

    # Non-GCS URLs, or GCS fallback (may still fail if the signature expired).
    clean = (url or "").strip()
    if not clean.startswith("http://") and not clean.startswith("https://"):
        raise ValueError("Image URL is not absolute and is not a known GCS object path.")

    response = requests.get(clean, timeout=IMAGE_FETCH_TIMEOUT)
    response.raise_for_status()
    return response.content
