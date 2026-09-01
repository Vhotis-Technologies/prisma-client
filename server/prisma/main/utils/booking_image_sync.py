"""
Helpers for syncing detailer job photos onto ``BookedAppointmentImage`` rows.

Duplicate detection uses a normalized storage path so relative and absolute URLs
for the same file are treated as one image (fixes double-sync on after interior).
"""
from __future__ import annotations

from urllib.parse import unquote, urlparse

from main.models import BookedAppointment, BookedAppointmentImage

_VALID_SEGMENTS = frozenset({"interior", "exterior"})


def normalize_booking_image_url(url: str) -> str:
    """
    Return a canonical storage path for duplicate detection.

    Strips scheme/host, optional ``detailer/`` and ``media/`` prefixes, and
    lowercases the result so ``/media/jobs/...`` and
    ``https://host/detailer/media/jobs/...`` match.
    """
    url = (url or "").strip()
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
        exact.add(row.image_url)
        norm = normalize_booking_image_url(row.image_url)
        if norm:
            normalized.add(norm)
    return exact, normalized


def sync_booking_images(booking: BookedAppointment, images, image_type: str) -> int:
    """
    Persist job images from a Redis payload; skip empty URLs and duplicates.

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
        url = (img_data.get("image_url") or "").strip()
        if not url:
            continue

        norm = normalize_booking_image_url(url)
        if url in seen_exact or (norm and norm in seen_normalized):
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
