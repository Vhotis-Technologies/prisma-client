import type { SavedAddress } from "../types/address";
import type { AddOn, BulkCapacityOption, ServiceType, ValetType } from "../types/booking";

export const BULK_DISCOUNT_THRESHOLD = 10;
export const BULK_DISCOUNT_PERCENT = 10;
export const MIN_BULK_VEHICLES = 2;

export function money(amount: number): number {
  return Number((Math.round((amount + Number.EPSILON) * 100) / 100).toFixed(2));
}

export function fleetUnitPrice(service: ServiceType): number {
  if (service.user_price != null) return Number(service.user_price);
  if (service.fleet_price != null) return Number(service.fleet_price);
  return Number(service.price);
}

export function isQuickSparkleService(service: ServiceType | null): boolean {
  return Boolean(service?.name && /quick\s*sparkle/i.test(service.name));
}

export function complimentaryVehiclesApplied(
  remaining: number,
  vehicleCount: number,
  useComplimentary: boolean,
): number {
  if (!useComplimentary) return 0;
  return Math.min(Math.max(0, Math.floor(remaining) || 0), Math.max(0, vehicleCount));
}

/** Complimentary covers the wash only. Add-ons stay due for every vehicle. */
export function bulkPayableAfterComplimentary(
  pricing: ReturnType<typeof bulkPricing>,
  applied: number,
  isSuv: boolean,
) {
  const used = Math.min(Math.max(0, applied), pricing.count);
  const paidWashes = Math.max(0, pricing.count - used);
  const washCharge = money(pricing.unit * paidWashes);
  const addonCharge = pricing.addonSubtotal;
  const combined = money(washCharge + addonCharge);
  const discountPercent = pricing.count > BULK_DISCOUNT_THRESHOLD ? BULK_DISCOUNT_PERCENT : 0;
  const discountAmount = money((combined * discountPercent) / 100);
  const afterDiscount = money(Math.max(0, combined - discountAmount));
  const suvSurcharge = isSuv ? money(afterDiscount * 0.20) : 0;
  const payable = money(afterDiscount + suvSurcharge);
  const credit = money(Math.max(0, pricing.total - payable));
  return { payable, credit, paidWashes, washCharge, addonCharge };
}

export function newBulkBookingReference(): string {
  return `BULK${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function windowLabel(window: string): string {
  if (window === "morning") return "Morning";
  if (window === "afternoon") return "Afternoon";
  if (window === "fullday") return "Full day";
  return window;
}

export function bulkPricing(input: {
  service: ServiceType | null;
  addons: AddOn[];
  numberOfVehicles: number;
  isSuv: boolean;
}) {
  const count = Math.max(0, Math.floor(input.numberOfVehicles) || 0);
  const unit = input.service ? fleetUnitPrice(input.service) : 0;
  const addonPerVehicle = money(input.addons.reduce((sum, item) => sum + Number(item.price || 0), 0));
  const addonMinutes = input.addons.reduce((sum, item) => sum + Number(item.extra_duration || 0), 0);
  const subtotal = money(unit * count);
  const addonSubtotal = money(addonPerVehicle * count);
  const subtotalWithAddons = money(subtotal + addonSubtotal);
  const discountPercent = count > BULK_DISCOUNT_THRESHOLD ? BULK_DISCOUNT_PERCENT : 0;
  const discountAmount = money((subtotalWithAddons * discountPercent) / 100);
  const afterDiscount = money(Math.max(0, subtotalWithAddons - discountAmount));
  const suvSurcharge = input.isSuv ? money(afterDiscount * 0.20) : 0;
  const total = money(afterDiscount + suvSurcharge);
  const duration = (input.service?.duration || 60) + addonMinutes;
  return {
    count,
    unit,
    addonPerVehicle,
    addonMinutes,
    subtotal,
    addonSubtotal,
    subtotalWithAddons,
    discountPercent,
    discountAmount,
    suvSurcharge,
    total,
    duration,
    workloadMinutes: count * duration,
  };
}

export function buildBulkBookingData(input: {
  bookingReference: string;
  service: ServiceType;
  valet: ValetType;
  addons: AddOn[];
  address: SavedAddress;
  dateIso: string;
  option: BulkCapacityOption;
  numberOfVehicles: number;
  isSuv: boolean;
  instructions: string;
  pricing: ReturnType<typeof bulkPricing>;
}): Record<string, unknown> {
  return {
    is_bulk: true,
    booking_reference: input.bookingReference,
    service_type: {
      id: input.service.id,
      name: input.service.name,
      duration: input.service.duration,
      fleet_price: input.service.fleet_price,
      price: input.service.price,
    },
    valet_type: {
      id: input.valet.id,
      name: input.valet.name,
      description: input.valet.description,
    },
    address_id: input.address.id,
    address: { ...input.address },
    date: input.dateIso,
    best_start_time: input.option.best_start_time || "06:00",
    estimated_finish_time: input.option.estimated_finish_time || "21:00",
    start_time: input.option.best_start_time || "06:00",
    end_time: input.option.estimated_finish_time || "21:00",
    window: input.option.window || "fullday",
    suggested_team_size: input.option.suggested_team_size ?? 1,
    number_of_vehicles: input.pricing.count,
    is_suv: input.isSuv,
    subtotal_amount: input.pricing.subtotalWithAddons,
    discount_applied: input.pricing.discountAmount,
    total_amount: input.pricing.total,
    special_instructions: input.instructions.trim(),
    addons: input.addons.map((addon) => ({
      id: addon.id,
      name: addon.name,
      price: addon.price,
      extra_duration: addon.extra_duration,
      description: addon.description,
    })),
  };
}
