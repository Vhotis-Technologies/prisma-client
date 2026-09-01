import type { BookingImages, HistoryItem } from "../../types/history";
import { getData } from "./client";

export function getServiceHistory() {
  return getData<{ service_history: HistoryItem[] }>("/api/v1/service-history/get_service_history/");
}

export function getBookingImages(bookingId: string) {
  return getData<BookingImages>("/api/v1/service-history/get_booking_images/", {
    params: { booking_id: bookingId },
  });
}
