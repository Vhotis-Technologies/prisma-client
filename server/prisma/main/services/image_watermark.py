"""
Image watermarking service for Prisma Car Care.

Applies a semi-transparent tiled "Prisma Car Care" watermark to images
for non-subscribed users. Watermarked images are cached to avoid
repeated processing.
"""
from __future__ import annotations

import hashlib
import io
import logging
import math
from typing import Optional, Tuple

from PIL import Image, ImageDraw, ImageFont
from django.core.cache import cache

logger = logging.getLogger(__name__)

WATERMARK_TEXT = "Prisma Car Care"
WATERMARK_OPACITY = 80  # 0-255, lower = more transparent
WATERMARK_ANGLE = -30  # Degrees
WATERMARK_SPACING = 200  # Pixels between watermark repetitions
WATERMARK_FONT_SIZE = 18
WATERMARK_CACHE_TTL = 60 * 60 * 24  # 24 hours


def _get_font(size: int) -> ImageFont.FreeTypeFont:
    """
    Get a font for watermarking. Falls back to default if custom font unavailable.

    Args:
        size: Font size in pixels.

    Returns:
        ImageFont instance.
    """
    try:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", size)
    except OSError:
        try:
            return ImageFont.truetype("arial.ttf", size)
        except OSError:
            return ImageFont.load_default()


def _create_watermark_overlay(
    width: int,
    height: int,
    text: str = WATERMARK_TEXT,
    opacity: int = WATERMARK_OPACITY,
    angle: float = WATERMARK_ANGLE,
    spacing: int = WATERMARK_SPACING,
    font_size: int = WATERMARK_FONT_SIZE,
) -> Image.Image:
    """
    Create a transparent overlay with tiled diagonal watermark text.

    Args:
        width: Target image width.
        height: Target image height.
        text: Watermark text to display.
        opacity: Text opacity (0-255).
        angle: Rotation angle in degrees.
        spacing: Space between text repetitions.
        font_size: Size of watermark text.

    Returns:
        RGBA Image with watermark overlay.
    """
    diagonal = int(math.sqrt(width ** 2 + height ** 2))
    overlay = Image.new('RGBA', (diagonal * 2, diagonal * 2), (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)
    font = _get_font(font_size)

    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
    except AttributeError:
        text_width, text_height = draw.textsize(text, font=font)

    y = 0
    row = 0
    while y < diagonal * 2:
        x = -spacing // 2 if row % 2 else 0
        while x < diagonal * 2:
            draw.text(
                (x, y),
                text,
                font=font,
                fill=(128, 128, 128, opacity)
            )
            x += text_width + spacing
        y += text_height + spacing
        row += 1

    rotated = overlay.rotate(angle, expand=False, resample=Image.BICUBIC)

    center_x = rotated.width // 2
    center_y = rotated.height // 2
    left = center_x - width // 2
    top = center_y - height // 2
    right = left + width
    bottom = top + height

    return rotated.crop((left, top, right, bottom))


def apply_watermark(
    image_data: bytes,
    output_format: str = 'JPEG',
    quality: int = 85,
) -> bytes:
    """
    Apply the Prisma Car Care watermark to an image.

    Args:
        image_data: Raw image bytes.
        output_format: Output format (JPEG, PNG, etc.).
        quality: JPEG quality (1-100).

    Returns:
        Watermarked image as bytes.

    Raises:
        ValueError: If image cannot be processed.
    """
    try:
        image = Image.open(io.BytesIO(image_data))

        if image.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', image.size, (255, 255, 255))
            if image.mode == 'P':
                image = image.convert('RGBA')
            background.paste(image, mask=image.split()[-1] if image.mode == 'RGBA' else None)
            image = background
        elif image.mode != 'RGB':
            image = image.convert('RGB')

        image_rgba = image.convert('RGBA')

        watermark = _create_watermark_overlay(image.width, image.height)

        watermarked = Image.alpha_composite(image_rgba, watermark)

        final = watermarked.convert('RGB')

        output = io.BytesIO()
        final.save(output, format=output_format, quality=quality, optimize=True)
        output.seek(0)

        return output.read()

    except Exception as e:
        logger.error(f"Failed to apply watermark: {e}")
        raise ValueError(f"Could not process image: {e}")


def get_watermark_cache_key(image_url: str) -> str:
    """
    Generate a cache key for a watermarked image.

    Args:
        image_url: Original image URL.

    Returns:
        Cache key string.
    """
    url_hash = hashlib.sha256(image_url.encode()).hexdigest()[:16]
    return f"watermarked_image:{url_hash}"


def get_cached_watermark(image_url: str) -> Optional[bytes]:
    """
    Retrieve a cached watermarked image.

    Args:
        image_url: Original image URL.

    Returns:
        Cached image bytes or None if not cached.
    """
    cache_key = get_watermark_cache_key(image_url)
    return cache.get(cache_key)


def cache_watermarked_image(image_url: str, image_data: bytes) -> None:
    """
    Cache a watermarked image.

    Args:
        image_url: Original image URL.
        image_data: Watermarked image bytes.
    """
    cache_key = get_watermark_cache_key(image_url)
    cache.set(cache_key, image_data, WATERMARK_CACHE_TTL)
