"""
Server-side Google Places proxy.

Keeps the API key on the server; web and mobile clients call these helpers via
``PlacesView`` instead of hitting Google directly.
"""
from __future__ import annotations

import logging
from typing import Any

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

AUTOCOMPLETE_URL = "https://maps.googleapis.com/maps/api/place/autocomplete/json"
DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"
DETAILS_FIELDS = "place_id,formatted_address,geometry,name,address_components"
REQUEST_TIMEOUT = 10


def places_configured() -> bool:
    """True when ``GOOGLE_PLACES_API_KEY`` is set in Django settings."""
    return bool((getattr(settings, "GOOGLE_PLACES_API_KEY", "") or "").strip())


def _api_key() -> str:
    key = (getattr(settings, "GOOGLE_PLACES_API_KEY", "") or "").strip()
    if not key:
        raise ValueError("Google Places API key is not configured on the server.")
    return key


def _get_json(url: str, params: dict[str, Any]) -> dict[str, Any]:
    params = {**params, "key": _api_key()}
    try:
        response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        logger.warning("Google Places request failed: %s", exc)
        raise ValueError("Address search is temporarily unavailable.") from exc


def autocomplete(
    input_text: str,
    *,
    latitude: float | None = None,
    longitude: float | None = None,
    radius: int = 50_000,
) -> dict[str, Any]:
    """
    Proxy Places Autocomplete.

    Returns:
        Google JSON payload with ``predictions`` and ``status``.
    """
    cleaned = (input_text or "").strip()
    if len(cleaned) < 2:
        return {"predictions": [], "status": "ZERO_RESULTS"}

    params: dict[str, Any] = {"input": cleaned}
    if latitude is not None and longitude is not None:
        params["location"] = f"{latitude},{longitude}"
        params["radius"] = max(1, min(int(radius), 200_000))

    data = _get_json(AUTOCOMPLETE_URL, params)
    status = data.get("status") or "UNKNOWN_ERROR"
    if status not in ("OK", "ZERO_RESULTS"):
        logger.warning("Google Places autocomplete status=%s", status)
        return {"predictions": [], "status": status}
    return {
        "predictions": data.get("predictions") or [],
        "status": status,
    }


def place_details(place_id: str) -> dict[str, Any]:
    """
    Proxy Place Details.

    Returns:
        Google JSON payload with ``result`` and ``status``.
    """
    cleaned = (place_id or "").strip()
    if not cleaned:
        raise ValueError("place_id is required.")

    data = _get_json(
        DETAILS_URL,
        {"place_id": cleaned, "fields": DETAILS_FIELDS},
    )
    status = data.get("status") or "UNKNOWN_ERROR"
    if status != "OK":
        logger.warning("Google Places details status=%s place_id=%s", status, cleaned)
        return {"result": None, "status": status}
    return {"result": data.get("result"), "status": status}
