import { useEffect, useState } from "react";
import { authErrorMessage } from "../auth/AuthProvider";
import type { BookingImages } from "../types/history";
import * as serviceHistoryApi from "../store/api/serviceHistoryApi";

export function useBookingImages(bookingId: string | undefined) {
  const [images, setImages] = useState<BookingImages | null>(null);
  const [loading, setLoading] = useState(Boolean(bookingId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await serviceHistoryApi.getBookingImages(bookingId);
        if (!cancelled) setImages(data);
      } catch (err) {
        if (!cancelled) setError(authErrorMessage(err, "Could not load booking photos."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  return { images, loading, error };
}
