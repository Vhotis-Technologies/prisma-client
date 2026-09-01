import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { resolveBookingImageRequestUrl } from "../lib/bookingImages";

type AuthenticatedImageProps = {
  imageId: string | number;
  imageUrl?: string | null;
  alt?: string;
  className?: string;
};

/**
 * Load a booking photo through the authenticated image proxy (JWT via axios).
 * Plain <img src> cannot send Bearer tokens, so we fetch as blob first.
 */
export default function AuthenticatedImage({
  imageId,
  imageUrl,
  alt = "",
  className,
}: AuthenticatedImageProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setFailed(false);
    setSrc(null);

    const path = resolveBookingImageRequestUrl(imageId, imageUrl);
    if (!path) {
      setFailed(true);
      return;
    }

    void api
      .get(path, { responseType: "blob" })
      .then((response) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(response.data);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId, imageUrl]);

  if (failed) {
    return <span className="authenticated-image authenticated-image--error" aria-hidden />;
  }

  if (!src) {
    return <span className="authenticated-image authenticated-image--loading" aria-hidden />;
  }

  return <img src={src} alt={alt} className={className} />;
}