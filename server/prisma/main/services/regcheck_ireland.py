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
REGCHECK_IMAGE_ORIGIN = "https://www.regcheck.org.uk"
DEFAULT_TIMEOUT = 25
MAX_IMAGE_BYTES = 6 * 1024 * 1024
_IMAGE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; PrismaValet/1.0)",
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Referer": "https://www.regcheck.org.uk/",
}


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
        dict: Minimised make/model/year/colour/body style plus a one-shot image URL.

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

    year = _parse_int_soft(data.get("RegistrationYear"))
    make = _ctv(data.get("CarMake")) or _ctv(data.get("MakeDescription")) or ""
    model = _ctv(data.get("CarModel")) or _ctv(data.get("ModelDescription")) or ""
    if not make and not model:
        desc = str(data.get("Description") or "").strip()
        if desc:
            parts = desc.split(None, 1)
            make = parts[0][:100] if parts else "Unknown"
            model = (parts[1][:100] if len(parts) > 1 else "Unknown")

    # GDPR minimisation: keep only fields the garage uses. Do not retain the raw
    # RegCheck dump (keepers, tax, VIN, ABI, county, engine spec, etc.).
    normalized: dict[str, Any] = {
        "registration_number": reg,
        "country": "Ireland",
        "make": make,
        "model": model,
        "year": year,
        "color": (str(data.get("Colour") or data.get("Color") or "").strip()),
        "body_style": _ctv(data.get("BodyStyle")) or None,
        "provider_image_url": normalize_provider_image_url(
            data.get("ImageUrl") or data.get("VehicleImageUrl") or data.get("imageUrl")
        ),
    }

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


def normalize_provider_image_url(raw: Any) -> str | None:
    """
    Turn a RegCheck image field into an absolute http(s) URL.

    ImageUrl is sometimes a plain string, sometimes a ``CurrentTextValue`` object,
    and sometimes a path relative to regcheck.org.uk.
    """
    if isinstance(raw, dict):
        text = _ctv(raw)
    else:
        text = str(raw or "").strip()
    if not text or text.lower() in {"none", "null", "n/a"}:
        return None
    if text.startswith("//"):
        return "https:" + text
    if text.startswith("/"):
        return REGCHECK_IMAGE_ORIGIN + text
    if text.startswith(("http://", "https://")):
        return text
    return None


def _image_extension(raw: bytes, content_type: str) -> str:
    """Pick a file extension from magic bytes, then Content-Type."""
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if raw.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if raw.startswith((b"GIF87a", b"GIF89a")):
        return "gif"
    if raw.startswith(b"RIFF") and raw[8:12] == b"WEBP":
        return "webp"
    head = raw[:256].lstrip().lower()
    if head.startswith(b"<") or b"<html" in head or b"<!doctype" in head:
        raise RegcheckIrelandError("Provider returned a page, not an image", "image_error")
    ctype = (content_type or "").lower()
    if "png" in ctype:
        return "png"
    if "webp" in ctype:
        return "webp"
    if "gif" in ctype:
        return "gif"
    return "jpg"


def download_provider_image(image_url: str) -> tuple[bytes, str]:
    """
    Stream-download a vehicle image from RegCheck (size-capped).

    Args:
        image_url: HTTP(S) URL, protocol-relative URL, or site-relative path.

    Returns:
        tuple: ``(raw_bytes, content_type)`` without parameters suffix.

    Raises:
        RegcheckIrelandError: On invalid URL, network failure, empty body, HTML, or oversize file.
    """
    url = normalize_provider_image_url(image_url)
    if not url:
        raise RegcheckIrelandError("Invalid image URL", "image_error")

    try:
        response = requests.get(
            url,
            timeout=DEFAULT_TIMEOUT,
            stream=True,
            headers=_IMAGE_HEADERS,
        )
        response.raise_for_status()
    except requests.RequestException as e:
        raise RegcheckIrelandError(f"Image download failed: {e}", "image_error") from e

    ctype = (response.headers.get("Content-Type") or "image/jpeg").split(";")[0].strip()
    if ctype.lower().startswith("text/"):
        raise RegcheckIrelandError("Provider returned a page, not an image", "image_error")

    buf = io.BytesIO()
    total = 0
    for chunk in response.iter_content(chunk_size=65536):
        if not chunk:
            continue
        total += len(chunk)
        if total > MAX_IMAGE_BYTES:
            raise RegcheckIrelandError("Image too large", "image_error")
        buf.write(chunk)
    raw = buf.getvalue()
    if not raw:
        raise RegcheckIrelandError("Empty image response", "image_error")
    _image_extension(raw, ctype)
    return raw, ctype


def store_lookup_vehicle_image(vehicle, image_url: str | None) -> bool:
    """
    Download a lookup photo and save it on ``vehicle.image`` (GCS in production).

    Args:
        vehicle: ``Vehicle`` whose image field is still empty.
        image_url: Provider URL from the lookup cache.

    Returns:
        bool: True when a file was stored.

    Raises:
        Exception: Storage errors propagate so a broken bucket is not hidden.
    """
    from django.core.files.base import ContentFile

    if getattr(vehicle, "image", None):
        return False
    reg = getattr(vehicle, "registration_number", None) or "vehicle"
    url = normalize_provider_image_url(image_url)
    if not url:
        logger.info("Lookup for %s had no provider image URL", reg)
        return False
    try:
        raw, ctype = download_provider_image(url)
    except RegcheckIrelandError as exc:
        logger.warning("Lookup image not stored for %s: %s", reg, exc)
        return False
    ext = _image_extension(raw, ctype)
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", str(reg)).strip("_") or "vehicle"
    vehicle.image.save(f"{safe}.{ext}", ContentFile(raw), save=True)
    return True


# Cached only long enough to confirm add-vehicle (LOOKUP_TTL_SECONDS). Image URL
# is used once to download the photo and is not written to the vehicle row.
_LOOKUP_CACHE_KEYS = (
    "registration_number",
    "country",
    "make",
    "model",
    "year",
    "color",
    "body_style",
    "provider_image_url",
)


def ireland_payload_for_cache(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Keep only garage fields before storing a lookup result in Django cache.

    Args:
        payload: Normalized lookup dict.

    Returns:
        dict: Minimised copy (no keeper/tax/VIN/raw provider dump).
    """
    return {key: payload.get(key) for key in _LOOKUP_CACHE_KEYS}
