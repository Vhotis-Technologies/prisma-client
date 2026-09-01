/**
 * Normalize free-text body style from RegCheck/manual entry for surcharge and
 * B2C subscription vehicle-category rules.
 */
import type { B2cVehicleCategory } from "@/app/interfaces/SubscriptionInterfaces";

const SUV_MPV_NEEDLES = [
  "suv",
  "mpv",
  "sport utility",
  "people carrier",
  "multi-purpose",
  "4x4",
  "four wheel",
  "4 wheel",
  "crossover",
];

export function vehicleBodyStyleRequiresSuvMpvSurcharge(
  bodyStyle: string | null | undefined
): boolean {
  if (bodyStyle == null || typeof bodyStyle !== "string") return false;
  const n = bodyStyle.trim().toLowerCase();
  if (!n) return false;
  return SUV_MPV_NEEDLES.some((kw) => n.includes(kw));
}

/** Map body style to B2C subscription category. */
export function vehicleBodyStyleToSubscriptionCategory(
  bodyStyle: string | null | undefined
): B2cVehicleCategory {
  return vehicleBodyStyleRequiresSuvMpvSurcharge(bodyStyle)
    ? "suv_mpv"
    : "sedan";
}

/** Label for UI (Sedan vs SUV / MPV). */
export function formatB2cVehicleCategoryLabel(
  category: B2cVehicleCategory | string | null | undefined
): string {
  if (category === "sedan") return "Sedan";
  if (category === "suv_mpv") return "SUV / MPV";
  return "SUV / MPV";
}
