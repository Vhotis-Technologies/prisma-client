"""
Helpers for syncing detailer job photos onto ``BookedAppointmentImage`` rows.

Duplicate detection uses a normalized storage path so relative and absolute URLs
for the same file are treated as one image (fixes double-sync on after interior).

Ingest strips GCS V4 query signatures so ``image_url`` stays a stable object URL;
the image proxy re-authenticates at request time.
"""
from __future__ import annotations

from urllib.parse import unquote, urlparse, urlunparse

from main.models import BookedAppointment, BookedAppointmentImage

_VALID_SEGMENTS = frozenset({"interior", "exterior"})


def canonicalize_booking_image_url(url: str) -> str:
    """
    Return a stable URL/path suitable for long-term storage.

    Removes query strings and fragments (expired GCS signatures). Absolute
    ``http(s)`` URLs keep scheme/host/path; relative paths are returned without
    query params.

    Args:
        url: Raw image URL from Redis / detailer payload.

    Returns:
        str: Canonical URL or path, or empty string when input is blank.
    """
    raw = (url or "").strip()
    if not raw:
        return ""

    parsed = urlparse(raw)
    if parsed.scheme in ("http", "https") and parsed.netloc:
        path = unquote(parsed.path or "")
        return urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))

    # Relative path or non-http value: drop query/fragment if present.
    return unquote(raw.split("?", 1)[0].split("#", 1)[0]).strip()


def normalize_booking_image_url(url: str) -> str:
    """
    Return a canonical storage path for duplicate detection.

    Strips scheme/host, optional ``detailer/`` and ``media/`` prefixes, and
    lowercases the result so ``/media/jobs/...`` and
    ``https://host/detailer/media/jobs/...`` match.
    """
    url = canonicalize_booking_image_url(url)
    if not url:
        return ""

    parsed = urlparse(url)
    path = unquote(parsed.path if parsed.scheme else url)
    path = path.lstrip("/").lower()

    for prefix in ("detailer/", "media/"):
        if path.startswith(prefix):
            path = path[len(prefix) :]

    return path


def _parse_segment(segment) -> str:
    if segment in _VALID_SEGMENTS:
        return segment
    return "exterior"


def _existing_url_keys(
    booking: BookedAppointment, image_type: str
) -> tuple[set[str], set[str]]:
    """Exact and normalized URL sets already stored for a booking image type."""
    exact: set[str] = set()
    normalized: set[str] = set()
    for row in BookedAppointmentImage.objects.filter(
        booking=booking, image_type=image_type
    ).only("image_url"):
        stored = canonicalize_booking_image_url(row.image_url) or row.image_url
        exact.add(stored)
        # Also keep raw for matches against older signed rows still in the DB.
        exact.add(row.image_url)
        norm = normalize_booking_image_url(row.image_url)
        if norm:
            normalized.add(norm)
    return exact, normalized


def sync_booking_images(booking: BookedAppointment, images, image_type: str) -> int:
    """
    Persist job images from a Redis payload; skip empty URLs and duplicates.

    Stores a signature-free URL (no ``?X-Goog-…``) so later proxy fetches do not
    depend on expired signed links.

    Args:
        booking: Target ``BookedAppointment``.
        images: List of dicts with ``image_url`` and optional ``segment``.
        image_type: ``before`` or ``after``.

    Returns:
        int: Count of newly created ``BookedAppointmentImage`` rows.
    """
    if not images:
        return 0

    seen_exact, seen_normalized = _existing_url_keys(booking, image_type)
    created = 0

    for img_data in images:
        if not isinstance(img_data, dict):
            continue
        raw_url = (img_data.get("image_url") or "").strip()
        url = canonicalize_booking_image_url(raw_url)
        if not url:
            continue

        norm = normalize_booking_image_url(url)
        if url in seen_exact or raw_url in seen_exact or (norm and norm in seen_normalized):
            continue

        segment = _parse_segment(img_data.get("segment"))
        try:
            BookedAppointmentImage.objects.create(
                booking=booking,
                image_type=image_type,
                image_url=url,
                segment=segment,
            )
        except Exception:
            continue
        seen_exact.add(url)
        if norm:
            seen_normalized.add(norm)
        created += 1

    return created


def dedupe_booking_images_for_booking(booking: BookedAppointment) -> int:
    """
    Remove duplicate ``BookedAppointmentImage`` rows for one booking.

    Duplicates share the same ``image_type``, ``segment``, and normalized URL.
    Keeps the oldest row (first sync) and deletes the rest.

    Returns:
        int: Number of rows deleted.
    """
    rows = list(
        BookedAppointmentImage.objects.filter(booking=booking).order_by("created_at")
    )
    keep_ids: set = set()
    groups: dict[tuple[str, str, str], list[BookedAppointmentImage]] = {}

    for row in rows:
        norm = normalize_booking_image_url(row.image_url)
        if not norm:
            keep_ids.add(row.id)
            continue
        key = (row.image_type, row.segment or "exterior", norm)
        groups.setdefault(key, []).append(row)

    delete_ids: list = []
    for group in groups.values():
        keep_ids.add(group[0].id)
        delete_ids.extend(row.id for row in group[1:])

    if not delete_ids:
        return 0

    deleted, _ = BookedAppointmentImage.objects.filter(id__in=delete_ids).delete()
    return deleted
