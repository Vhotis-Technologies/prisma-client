import { plateOf, type GarageVehicle } from "../types/garage";
import type { SavedAddress } from "../types/address";
import type { UserProfile } from "../types/user";
import type {
  AddOn,
  AppliedVoucher,
  BookingConfirmationSnapshot,
  ComplimentarySparkleSource,
  ServiceType,
  ValetType,
} from "../types/booking";

export { waitForPaymentConfirmation } from "../store/api/paymentApi";

export const CONFIRMATION_STORAGE_KEY = "prisma.bookingConfirmation";
const VAT_RATE = 0.23;

export function formatLocalTime(hhmm: string): string {
  return `${hhmm}:00.000`;
}

export function addMinutesClock(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function newBookingReference(): string {
  return `APT${Date.now()}`;
}

export function saveConfirmationSnapshot(snapshot: BookingConfirmationSnapshot): void {
  sessionStorage.setItem(CONFIRMATION_STORAGE_KEY, JSON.stringify(snapshot));
}

export function readConfirmationSnapshot(): BookingConfirmationSnapshot | null {
  try {
    const raw = sessionStorage.getItem(CONFIRMATION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BookingConfirmationSnapshot;
  } catch {
    return null;
  }
}

type PayloadInput = {
  user: UserProfile | null;
  vehicle: GarageVehicle;
  service: ServiceType;
  valet: ValetType;
  address: SavedAddress;
  addons: AddOn[];
  dateIso: string;
  timeSlot: string;
  durationMinutes: number;
  instructions: string;
  isSuv: boolean;
  isExpress: boolean;
  applyPartnerDiscount: boolean;
  amountDue: number;
  subtotal: number;
  vat: number;
  stickerTotal: number;
  appliedFreeQuickSparkle: boolean;
  complimentarySource: ComplimentarySparkleSource | null;
  voucher: AppliedVoucher | null;
  bookingReference: string;
};

export function buildCheckoutPayloads(input: PayloadInput): {
  bookingData: Record<string, unknown>;
  detailerData: Record<string, unknown>;
} {
  const startTime = formatLocalTime(input.timeSlot);
  const endTime = formatLocalTime(addMinutesClock(input.timeSlot, input.durationMinutes));
  const plate = plateOf(input.vehicle);
  const useVoucher = Boolean(input.voucher) && !input.appliedFreeQuickSparkle;

  const bookingData: Record<string, unknown> = {
    date: input.dateIso,
    vehicle: input.vehicle,
    valet_type: input.valet,
    service_type: input.service,
    address: input.address,
    status: "accepted",
    total_amount:
      useVoucher && input.voucher?.kind === "gift" ? input.voucher.preTotal : input.amountDue,
    subtotal_amount: input.subtotal,
    vat_amount: input.vat,
    vat_rate: VAT_RATE * 100,
    addons: input.addons,
    start_time: startTime,
    duration: input.durationMinutes,
    special_instructions: input.instructions,
    booking_reference: input.bookingReference,
    applied_free_quick_sparkle: input.appliedFreeQuickSparkle,
    is_express_service: input.isExpress,
    booking_is_suv: input.isSuv,
    apply_partner_booking_discount: input.applyPartnerDiscount,
  };

  if (input.appliedFreeQuickSparkle && input.complimentarySource) {
    bookingData.complimentary_quick_sparkle_source = input.complimentarySource;
  }
  if (useVoucher && input.voucher) {
    bookingData.pre_voucher_total_amount = input.voucher.preTotal;
    if (input.voucher.kind === "winner") bookingData.winner_voucher_id = input.voucher.voucherId;
    if (input.voucher.kind === "gift") bookingData.gift_voucher_id = input.voucher.voucherId;
  }

  const detailerData: Record<string, unknown> = {
    client_name: input.user?.name || "",
    client_phone: input.user?.phone || "",
    vehicle_registration: plate,
    vehicle_make: input.vehicle.make,
    vehicle_model: input.vehicle.model,
    vehicle_year: String(input.vehicle.year),
    vehicle_color: input.vehicle.color,
    address: input.address.address,
    city: input.address.city,
    postcode: input.address.post_code,
    country: input.address.country,
    latitude: input.address.latitude ?? 0,
    longitude: input.address.longitude ?? 0,
    valet_type: input.valet.name,
    addons: input.addons.map((addon) => addon.name),
    special_instructions: input.instructions,
    total_amount: input.stickerTotal,
    status: "accepted",
    booking_reference: input.bookingReference,
    service_type: input.service.name,
    booking_date: input.dateIso,
    start_time: startTime,
    end_time: endTime,
    loyalty_tier: input.user?.loyalty_tier || "",
    loyalty_benefits: input.user?.loyalty_benefits?.free_service || [],
    is_express_service: input.isExpress,
  };

  return { bookingData, detailerData };
}
