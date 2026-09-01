import { getApiBaseUrl } from "./api";

/** API path for an authenticated booking image proxy. */
export function bookingImageApiPath(imageId: string | number): string {
  return `/api/v1/images/${imageId}/`;
}

/**
 * Resolve a booking image URL for axios (uses VITE_API_URL, not server BASE_URL).
 */
export function resolveBookingImageRequestUrl(
  imageId: string | number,
  imageUrl?: string | null,
): string {
  if (imageId !== undefined && imageId !== null && String(imageId).length > 0) {
    return bookingImageApiPath(imageId);
  }

  const raw = (imageUrl || "").trim();
  if (!raw) return "";

  const apiBase = getApiBaseUrl().replace(/\/$/, "");
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.pathname.includes("/api/v1/images/")) {
        return `${parsed.pathname}${parsed.search}`;
      }
      if (parsed.origin === new URL(apiBase).origin) {
        return `${parsed.pathname}${parsed.search}`;
      }
    } catch {
      return raw;
    }
    return raw;
  }

  return raw.startsWith("/") ? raw : `/${raw}`;
}
