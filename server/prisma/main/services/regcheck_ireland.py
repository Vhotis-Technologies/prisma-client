"""
Ireland registration lookup via RegCheck HTTP GET (CheckIreland).
"""
from __future__ import annotations

import io
import json
import logging
import re
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import urlencode

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

REGCHECK_IE_URL = "https://www.regcheck.org.uk/api/reg.asmx/CheckIreland"
DEFAULT_TIMEOUT = 25
MAX_IMAGE_BYTES = 6 * 1024 * 1024


class RegcheckIrelandError(Exception):
    """
    RegCheck request failed or returned unusable payload.

    Attributes:
        code: Machine-readable error category (e.g. ``validation``, ``incomplete``).
    """

    def __init__(self, message: str, code: str = "lookup_failed"):
        """
        Args:
            message: Human-readable error for logs/API.
            code: Short category for clients (``validation``, ``incomplete``, etc.).
        """
        super().__init__(message)
        self.code = code


def _ctv(node: Any) -> str:
    """
    Extract display text from RegCheck JSON nodes (often ``CurrentTextValue`` dicts).

    Args:
        node: Raw JSON value from vehicle payload.

    Returns:
        str: Trimmed text or empty string.
    """
    if node is None:
        return ""
    if isinstance(node, dict):
        if "CurrentTextValue" in node:
            v = node["CurrentTextValue"]
            return "" if v is None else str(v).strip()
        return ""
    return str(node).strip() if node is not None else ""


def _parse_int_soft(val: Any) -> int | None:
    """
    Parse integers from messy RegCheck strings (strip non-digits, allow floats).

    Args:
        val: Raw field value.

    Returns:
        int | None: Parsed integer or None when not parseable.
    """
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    try:
        return int(float(re.sub(r"[^\d.]", "", s) or "nan"))
    except (ValueError, TypeError):
        return None


def _find_vehicle_json_text(xml_content: str) -> str:
    """
    Parse RegCheck XML response and return the ``vehicleJson`` inner JSON string.

    Args:
        xml_content: Raw HTTP response body from RegCheck.

    Returns:
        str: JSON text embedded in ``vehicleJson`` element.

    Raises:
        RegcheckIrelandError: On invalid XML, missing node, or truncated payload.
    """
    try:
        root = ET.fromstring(xml_content.encode("utf-8") if isinstance(xml_content, str) else xml_content)
    except ET.ParseError as e:
        raise RegcheckIrelandError(f"Invalid XML from RegCheck: {e}", "invalid_response") from e

    ns = "{http://regcheck.org.uk}"
    elem = root.find(f".//{ns}vehicleJson")
    if elem is None:
        for el in root.iter():
            tag = el.tag.split("}")[-1] if "}" in el.tag else el.tag
            if tag == "vehicleJson" and el.text:
                elem = el
                break
    if elem is None or not (elem.text and elem.text.strip()):
        raise RegcheckIrelandError("No vehicleJson in RegCheck response", "no_data")

    js = elem.text.strip()
    if js.endswith("</vehicleJson"):
        raise RegcheckIrelandError("Truncated vehicleJson", "invalid_response")
    return js


def _parse_vehicle_json(js: str) -> dict[str, Any]:
    """
    Parse the embedded vehicle JSON string into a Python dict.

    Args:
        js: JSON text from ``vehicleJson`` XML node.

    Returns:
        dict: Decoded vehicle fields.

    Raises:
        RegcheckIrelandError: When JSON is invalid.
    """
    js = js.replace("\ufeff", "")
    try:
        return json.loads(js)
    except json.JSONDecodeError as e:
        logger.warning("vehicleJson strict parse failed: %s", e)
        raise RegcheckIrelandError("Could not parse vehicle data", "parse_error") from e


def lookup_ireland(registration_number: str, *, username: str | None = None) -> dict[str, Any]:
    """
    Look up an Irish registration via RegCheck and return normalized vehicle fields.

    Args:
        registration_number: Plate string (spaces stripped, uppercased).
        username: RegCheck account username; defaults to ``settings.CAR_REG_USERNAME``.

    Returns:
        dict: Normalized make/model/year and metadata plus ``registration_provider_payload``.

    Raises:
        RegcheckIrelandError: On config, validation, upstream, parse, or incomplete data errors.
    """
    username = username or getattr(settings, "CAR_REG_USERNAME", None)
    if not username:
        raise RegcheckIrelandError(
            "CAR_REG_USERNAME is not configured",
            "config_error",
        )

    reg = (registration_number or "").strip().upper().replace(" ", "")
    if not reg:
        raise RegcheckIrelandError("Registration number is required", "validation")

    qs = urlencode({"RegistrationNumber": reg, "username": username})
    url = f"{REGCHECK_IE_URL}?{qs}"
    try:
        r = requests.get(url, timeout=DEFAULT_TIMEOUT)
    except requests.RequestException as e:
        raise RegcheckIrelandError(f"RegCheck request failed: {e}", "upstream_error") from e

    if r.status_code >= 400:
        raise RegcheckIrelandError(
            f"RegCheck HTTP {r.status_code}",
            "upstream_error",
        )

    xml_text = r.text or ""
    if "faultstring" in xml_text.lower() and "fault" in xml_text.lower():
        if "credit" in xml_text.lower():
            raise RegcheckIrelandError("RegCheck account or credits issue", "credits")

    js_raw = _find_vehicle_json_text(xml_text)
    data = _parse_vehicle_json(js_raw)
    for _k in ('VehicleIdentificationNumber', 'VechileIdentificationNumber', 'VIN'):
        data.pop(_k, None)

    year = _parse_int_soft(data.get("RegistrationYear"))

    normalized: dict[str, Any] = {
        "registration_number": reg,
        "country": "Ireland",
        "make": _ctv(data.get("CarMake")) or _ctv(data.get("MakeDescription")) or "",
        "model": _ctv(data.get("CarModel")) or _ctv(data.get("ModelDescription")) or "",
        "year": year,
        "color": (str(data.get("Colour") or data.get("Color") or "").strip()),
        "abi_code": (str(data.get("ABICode") or "").strip() or None),
        "body_style": _ctv(data.get("BodyStyle")) or None,
        "transmission_type": _ctv(data.get("Transmission")) or None,
        "fuel_type": _ctv(data.get("FuelType")) or None,
        "number_of_doors": _parse_int_soft(_ctv(data.get("NumberOfDoors"))),
        "number_of_seats": _parse_int_soft(_ctv(data.get("NumberOfSeats"))),
        "engine_size": _parse_int_soft(_ctv(data.get("EngineSize"))),
        "driver_side": _ctv(data.get("DriverSide")) or None,
        "wheel_pan": _parse_int_soft(_ctv(data.get("WheelPlan"))),
        "weight": _parse_int_soft(_ctv(data.get("Weight"))),
        "county": (str(data.get("County") or "").strip() or None),
        "registration_provider_payload": data,
        "provider_image_url": (str(data.get("ImageUrl") or "").strip() or None),
        "description": (str(data.get("Description") or "").strip() or None),
    }

    if not normalized["make"] and not normalized["model"]:
        desc = normalized.get("description") or ""
        if desc:
            parts = desc.split(None, 1)
            normalized["make"] = parts[0][:100] if parts else "Unknown"
            normalized["model"] = (parts[1][:100] if len(parts) > 1 else "Unknown")

    missing_core = []
    if not normalized["make"]:
        missing_core.append("make")
    if not normalized["model"]:
        missing_core.append("model")
    if not normalized["year"]:
        missing_core.append("year")

    if missing_core:
        raise RegcheckIrelandError(
            f"Incomplete lookup data: missing {','.join(missing_core)}",
            "incomplete",
        )

    return normalized


def download_provider_image(image_url: str) -> tuple[bytes, str]:
    """
    Stream-download a vehicle image from RegCheck (size-capped).

    Args:
        image_url: HTTP(S) URL from lookup payload.

    Returns:
        tuple: ``(raw_bytes, content_type)`` without parameters suffix.

    Raises:
        RegcheckIrelandError: On invalid URL, network failure, empty body, or oversize file.
    """
    if not image_url or not image_url.startswith(("http://", "https://")):
        raise RegcheckIrelandError("Invalid image URL", "image_error")

    try:
        r = requests.get(image_url, timeout=DEFAULT_TIMEOUT, stream=True)
        r.raise_for_status()
    except requests.RequestException as e:
        raise RegcheckIrelandError(f"Image download failed: {e}", "image_error") from e

    ctype = r.headers.get("Content-Type") or "image/jpeg"
    buf = io.BytesIO()
    total = 0
    for chunk in r.iter_content(chunk_size=65536):
        if not chunk:
            continue
        total += len(chunk)
        if total > MAX_IMAGE_BYTES:
            raise RegcheckIrelandError("Image too large", "image_error")
        buf.write(chunk)
    raw = buf.getvalue()
    if not raw:
        raise RegcheckIrelandError("Empty image response", "image_error")
    return raw, ctype.split(";")[0].strip()


def ireland_payload_for_cache(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Strip non-cacheable keys before storing lookup result in Django cache.

    Args:
        payload: Normalized lookup dict (may include transient keys).

    Returns:
        dict: Copy safe for JSON serialization.
    """
    out = dict(payload)
    out.pop("_image_download_error", None)
    out.pop("vin_plain", None)
    return out
