/**
 * Booking-related types and interfaces for the Prisma Valet client app.
 *
 * Used by: BookingScreen, useBooking, usePayment, eventApi, confirmation/cancel modals.
 * See docs/BOOKING_FLOW.md for the full booking flow.
 */
import DetailerProfileProps from "./OtherInterfaces";
import { MyAddressProps } from "./ProfileInterfaces";
import { MyVehiclesProps } from "./GarageInterface";
import dayjs from "dayjs";

/* Service type (e.g. The Quick Sparkle, full detail). Rendered on booking step 2. */
export interface ServiceTypeProps {
  id?: string;
  name: string;
  description: string[];
  price: number;
  fleet_price?: number | null;
  user_price?: number; // Price for current user (fleet_price if fleet user, else price)
  duration: number;
}

export interface ValetTypeProps {
  id?: string;
  name: string;
  description: string;
}

export interface AddOnsProps {
  id?: string;
  name: string;
  price: number;
  description: string;
  extra_duration: number;
}

/** Server-aligned price breakdown for booking summary (amounts VAT-inclusive until ex-VAT subtotal elsewhere). */
export interface BookingPriceSummaryBreakdown {
  stickerSubtotalIncVat: number;
  loyaltyDiscountIncVat: number;
  promotionDiscountIncVat: number;
  partnerReferralDiscountIncVat: number;
  complimentaryStickerSavingsIncVat: number;
  totalIncVat: number;
  loyaltyDiscountPercent?: number;
  partnerReferralDiscountPercent?: number;
}

export interface BookingScreenProps {
  vehicle?: MyVehiclesProps;
  service_type: ServiceTypeProps;
  valet_type: ValetTypeProps;
  address: MyAddressProps;
}
export interface BookedAppointmentProps {
  appointment_id?: string;
  booking_reference?: string;
  booking_date?: string;
  date: string;
  vehicle: MyVehiclesProps;
  valet_type: ValetTypeProps;
  service_type: ServiceTypeProps;
  detailer?: DetailerProfileProps;
  address: MyAddressProps;
  status?: string;
  total_amount: number;
  subtotal_amount?: number;
  vat_amount?: number;
  vat_rate?: number;
  addons?: AddOnsProps[];
  start_time?: string;
  duration?: number;
  special_instructions?: string;
  applied_free_quick_sparkle?: boolean;
  apply_partner_booking_discount?: boolean;
}
export default interface BookingState {
  selected_service_type: ServiceTypeProps | null;
  selected_valet_type: ValetTypeProps | null;
  selected_vehicle: MyVehiclesProps | null;
  selected_address: MyAddressProps | null;
  service_type: ServiceTypeProps[] | null;
  valet_type: ValetTypeProps[] | null;
  selected_date: Date | null;
  special_instructions: string | null;
  isSuv: boolean;
  isExpressService: boolean;
}

/** Payload sent to the detailer app when creating a job (flat structure). */
export interface CreateBookingProps {
  booking_reference: string;
  service_type: string;
  client_name: string;
  client_phone: string;
  vehicle_registration: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: string;
  vehicle_color: string;
  address: string;
  city: string;
  postcode: string;
  country: string;
  latitude?: number;
  longitude?: number;
  valet_type: string;
  addons?: string[];
  special_instructions?: string;
  total_amount: number;
  subtotal_amount?: number;
  vat_amount?: number;
  vat_rate?: number;
  status: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  // Only these two fields for detailer
  loyalty_tier?: string;
  loyalty_benefits?: string[]; // Array of free services
  is_express_service?: boolean; // Express service flag for dual detailer assignment
}

/**
 * Interface for a time slot
 */
export interface TimeSlot {
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  isSelected: boolean;
}

/**
 * Interface for calendar day
 */
export interface CalendarDay {
  date: dayjs.Dayjs;
  isCurrentMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
  isDisabled: boolean;
}

/**
 * Response from create_payment_sheet: client secret and keys for Stripe Payment Sheet.
 */
export interface PaymentSheetResponse {
  paymentIntent: string;
  ephemeralKey: string;
  customer: string;
}

/** Payment sheet response plus IDs and optional free_booking (Quick Sparkle). */
export type PaymentSheetResponseWithMeta = PaymentSheetResponse & {
  paymentIntentId: string;
  booking_reference: string;
  free_booking?: boolean;
};
