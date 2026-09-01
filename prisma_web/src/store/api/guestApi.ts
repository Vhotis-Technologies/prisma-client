import type { AddOn, BookingQuote, PaymentConfirmResponse, PaymentSheetResponse, ServiceType, ValetType } from "../../types/booking";
import type { LookupPreview } from "../../types/garage";
import type { LoginResponse } from "../../types/user";
import { getApiBaseUrl, getData, postData } from "./client";

export type GuestVoucherApplyResponse = {
  voucher_id: string;
  amount_due: number;
  discount_applied: number;
  pre_voucher_total: number;
};

/** Plate-ownership policy returned with Ireland lookup. */
export type GuestPlateInfo = {
  status: string;
  can_book: boolean;
  message?: string | null;
};

/** Ireland lookup plus a short-lived token used at payment to persist the vehicle. */
export type GuestLookupResponse = {
  preview: LookupPreview;
  lookup_token: string;
  expires_in_seconds: number;
  plate: GuestPlateInfo;
};

/** Public catalog: B2C prices only (no fleet_price). */
export type GuestCatalogResponse = {
  services: ServiceType[];
  valets: ValetType[];
  add_ons: AddOn[];
};

/** Public service, valet, and add-on lists for guest checkout. No auth. */
export function fetchGuestCatalog() {
  return getData<GuestCatalogResponse>("/api/v1/guest/catalog/");
}

/**
 * Ireland registration lookup for guest checkout.
 * @param licence - Plate as typed by the guest.
 */
export function lookupGuestVehicle(licence: string) {
  return postData<GuestLookupResponse>("/api/v1/guest/lookup_vehicle/", {
    licence,
    registration_number: licence,
    country: "Ireland",
  });
}

/**
 * Anonymous B2C quote (no loyalty, complimentary washes, or promos).
 * @param body.service_type_id - Catalog service id.
 * @param body.addon_ids - Selected add-on ids.
 * @param body.is_suv - SUV/MPV surcharge flag.
 * @param body.is_express - Express surcharge flag.
 * @param body.body_style - Optional; server may infer SUV from this.
 */
export function quoteGuestBooking(body: {
  service_type_id: string;
  addon_ids: string[];
  is_suv: boolean;
  is_express: boolean;
  body_style?: string | null;
}) {
  return postData<BookingQuote>("/api/v1/guest/quote_booking/", body);
}

type GuestVoucherApplyBody = {
  code: string;
  pre_voucher_total_amount: number;
  name: string;
  email: string;
  phone: string;
};

/** Validate a winner voucher for guest checkout (email must match voucher recipient). */
export function applyGuestWinnerVoucher(body: GuestVoucherApplyBody) {
  return postData<GuestVoucherApplyResponse>("/api/v1/guest/apply_winner_voucher/", body);
}

/** Validate a gift voucher for guest checkout (email must match voucher recipient). */
export function applyGuestGiftVoucher(body: GuestVoucherApplyBody) {
  return postData<GuestVoucherApplyResponse>("/api/v1/guest/apply_gift_voucher/", body);
}

/**
 * Crew availability for the guest address and date (same matcher as signed-in booking).
 * @param params - date, country, city, optional coords and duration.
 */
export function fetchGuestTimeslots(params: Record<string, string | number>) {
  return getData<{ slots?: { start_time?: string; end_time?: string; is_available?: boolean }[]; error?: string }>(
    "/api/v1/guest/get_timeslots/",
    { params },
  );
}

/**
 * Create a guest user + PaymentIntent. Contact details and lookup_token are required.
 * @param body - name, email, phone, lookup_token, booking_data, amount.
 */
export function createGuestPaymentSheet(body: Record<string, unknown>) {
  return postData<PaymentSheetResponse>("/api/v1/guest/create_payment_sheet/", body);
}

/**
 * Poll webhook fulfillment for a guest PaymentIntent.
 * Member intents are treated as unconfirmed on this public endpoint.
 */
export function confirmGuestPaymentIntent(paymentIntentId: string) {
  return postData<PaymentConfirmResponse>("/api/v1/guest/confirm_payment_intent/", {
    payment_intent_id: paymentIntentId,
  });
}

/** Photo metadata from the results API; bytes are fetched via {@link guestImageUrl}. */
export type GuestResultsPhoto = {
  id: string;
  created_at: string;
};

export type GuestHealthCheckItem = {
  label: string;
  value: string;
};

/** Public results payload: status, photo buckets, optional health-check notes. */
export type GuestResultsResponse = {
  booking_reference: string;
  status: string;
  appointment_date: string;
  start_time: string;
  service_name: string;
  valet_name: string;
  vehicle_line: string;
  address_line: string;
  detailer_name: string;
  photos_ready: boolean;
  photo_count: number;
  photos: {
    before_interior: GuestResultsPhoto[];
    before_exterior: GuestResultsPhoto[];
    after_interior: GuestResultsPhoto[];
    after_exterior: GuestResultsPhoto[];
  };
  health_check_ready: boolean;
  health_check: { items: GuestHealthCheckItem[]; inspected_at: string | null } | null;
  link_expires_at: string | null;
  cancelled: boolean;
  can_claim?: boolean;
};

/**
 * Load booking status, photos, and health-check notes for an emailed results token.
 * @param token - Raw secret from `/guest/b/:token`.
 */
export function fetchGuestResults(token: string) {
  return getData<GuestResultsResponse>("/api/v1/guest/results/", {
    params: { token },
  });
}

/**
 * Authenticated-by-token image URL (clean, no watermark).
 * @param imageId - Booking image UUID.
 * @param token - Same raw token as the results page.
 * @param download - When true, the proxy sets Content-Disposition: attachment.
 */
export function guestImageUrl(imageId: string, token: string, download = false): string {
  const base = getApiBaseUrl().replace(/\/$/, "");
  const query = new URLSearchParams({ token });
  if (download) query.set("download", "1");
  return `${base}/api/v1/guest/images/${imageId}/?${query.toString()}`;
}

/**
 * Prefill for the claim form (same token as the results page).
 * @param token - Raw secret from `/guest/claim/:token`.
 */
export function fetchGuestClaimPreview(token: string) {
  return getData<GuestClaimPreviewResponse>("/api/v1/guest/claim/", {
    params: { token },
  });
}

/**
 * Set a password on the guest user and return a JWT session.
 * Same User row: garage vehicles and booking history stay attached.
 */
export function claimGuestAccount(body: {
  token: string;
  password: string;
  allow_marketing?: boolean;
}) {
  return postData<LoginResponse>("/api/v1/guest/claim_account/", body);
}

/** Claim-form prefill: email, booking, and whether a password already exists. */
export type GuestClaimPreviewResponse = {
  email: string;
  name: string;
  already_registered: boolean;
  booking_reference: string;
  vehicle_line: string;
  link_expires_at: string | null;
};
