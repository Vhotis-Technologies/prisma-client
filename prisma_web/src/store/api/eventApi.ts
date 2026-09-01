import type { SavedCard } from "../../types/payment";
import type {
  AddOn,
  BookingQuote,
  BulkCapacityResponse,
  FreeWashCheck,
  Promotion,
  ServiceType,
  ValetType,
} from "../../types/booking";
import { deleteData, getData, postData } from "./client";

export type TimeSlot = {
  startTime: string;
  endTime: string;
};

type CrewTimeSlot = {
  start_time?: string;
  end_time?: string;
  is_available?: boolean;
};

export function fetchServiceType() {
  return getData<ServiceType[]>("/api/v1/events/get_service_type/");
}

export function fetchValetType() {
  return getData<ValetType[]>("/api/v1/events/get_valet_type/");
}

export function fetchAddOns() {
  return getData<AddOn[]>("/api/v1/events/get_add_ons/");
}

export function fetchPromotions() {
  return getData<Promotion | null>("/api/v1/events/get_promotions/");
}

export function checkFreeWash() {
  return getData<FreeWashCheck>("/api/v1/events/check_free_wash/");
}

export function quoteBooking(body: {
  service_type_id: string;
  addon_ids: string[];
  is_suv: boolean;
  is_express: boolean;
  apply_partner_booking_discount: boolean;
}) {
  return postData<BookingQuote>("/api/v1/events/quote_booking/", body);
}

export function fetchTimeslots(params: Record<string, string | number>) {
  return getData<{ slots?: CrewTimeSlot[]; available_slots?: CrewTimeSlot[]; error?: string }>(
    "/api/v1/events/get_timeslots/",
    { params },
  );
}

export function parseCrewSlots(data: {
  slots?: CrewTimeSlot[];
  available_slots?: CrewTimeSlot[];
}): TimeSlot[] {
  const raw = Array.isArray(data.slots)
    ? data.slots
    : Array.isArray(data.available_slots)
      ? data.available_slots
      : [];
  const slots: TimeSlot[] = [];
  for (const slot of raw) {
    if (!slot?.is_available || !slot.start_time) continue;
    slots.push({
      startTime: (slot.start_time || "").slice(0, 5),
      endTime: (slot.end_time || "").slice(0, 5),
    });
  }
  return slots;
}

export function checkBulkCapacity(params: Record<string, string | number>) {
  return getData<BulkCapacityResponse>("/api/v1/events/check_bulk_capacity/", { params });
}

export function fetchPaymentMethods() {
  return getData<{ payment_methods: SavedCard[] }>("/api/v1/events/get_payment_methods/");
}

export function deletePaymentMethod(paymentMethodId: string) {
  return deleteData("/api/v1/events/delete_payment_method/", {
    data: { payment_method_id: paymentMethodId },
  });
}

export function markPromotionUsed(promotionId: string, bookingReference: string) {
  return postData("/api/v1/events/mark_promotion_used/", {
    promotion_id: promotionId,
    booking_reference: bookingReference,
  });
}
