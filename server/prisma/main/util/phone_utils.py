"""
Phone number normalization: strip non-digits except leading + for consistent storage and lookup.
"""
import re


def normalize_phone(phone):
    """
    Normalize phone number by removing all non-digit characters except leading +.

    Examples:
        "+1 234-567-8900" -> "+12345678900"
        "123 456 7890" -> "1234567890"
        "(123) 456-7890" -> "1234567890"
        "+44 20 1234 5678" -> "+442012345678"

    Args:
        phone: Phone number string (can be None or empty).

    Returns:
        str: Normalized phone number, or empty string if input is invalid.
    """
    if not phone:
        return ""

    phone_str = str(phone).strip()

    if not phone_str:
        return ""

    normalized = re.sub(r'[^\d+]', '', phone_str)

    # Preserve international prefix; strip stray + elsewhere.
    if normalized.startswith('+'):
        return normalized
    else:
        return normalized.replace('+', '')
