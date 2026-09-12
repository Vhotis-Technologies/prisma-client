import { api, getApiBaseUrl } from "./api";

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

/** Filename used when a booking photo is saved or shared. */
export function bookingImageFilename(
  imageId: string | number,
  bookingReference?: string | null,
): string {
  const ref = (bookingReference || "").trim().replace(/[^a-z0-9-]+/gi, "-");
  const suffix = String(imageId).slice(0, 8);
  return ref
    ? `prisma-car-care-${ref}-${suffix}.jpg`
    : `prisma-car-care-${suffix}.jpg`;
}

/**
 * Fetch a booking photo as a file through the authenticated proxy.
 * The `download` flag is what the server checks for subscription entitlement,
 * so an unsubscribed caller gets a 403 here even if the UI let them click.
 */
async function fetchBookingImageFile(
  imageId: string | number,
  imageUrl: string | null | undefined,
  filename: string,
): Promise<File> {
  const path = resolveBookingImageRequestUrl(imageId, imageUrl);
  if (!path) throw new Error("This photo is unavailable.");

  const response = await api.get(path, {
    responseType: "blob",
    params: { download: 1 },
  });
  const blob = response.data as Blob;
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

/** True when this browser can share image files through the native share sheet. */
export function canShareBookingImage(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function"
  );
}

/** Save a booking photo to the visitor's device. */
export async function downloadBookingImage(
  imageId: string | number,
  imageUrl: string | null | undefined,
  filename: string,
): Promise<void> {
  const file = await fetchBookingImageFile(imageId, imageUrl, filename);
  const objectUrl = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

/**
 * Open the native share sheet for a booking photo.
 * Returns false when the browser cannot share this file, so the caller can
 * fall back to a download.
 */
export async function shareBookingImage(
  imageId: string | number,
  imageUrl: string | null | undefined,
  filename: string,
  title: string,
): Promise<boolean> {
  const file = await fetchBookingImageFile(imageId, imageUrl, filename);
  if (!canShareBookingImage() || !navigator.canShare({ files: [file] })) {
    return false;
  }
  await navigator.share({ files: [file], title });
  return true;
}
