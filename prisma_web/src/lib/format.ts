import type { UserProfile } from "../types/user";

export function usesBranchAddresses(user: UserProfile | null): boolean {
  return Boolean(user?.is_fleet_owner || user?.is_branch_admin);
}

export function isDealershipPartner(user: UserProfile | null): boolean {
  return Boolean(user?.is_dealership || user?.partner_referral_code);
}

export function isBusinessAccount(user: UserProfile | null): boolean {
  return Boolean(
    user?.is_fleet_owner ||
      user?.is_branch_admin ||
      isDealershipPartner(user),
  );
}

export function roleLabel(user: UserProfile | null): string {
  if (!user) return "Account";
  if (user.is_dealership || user.partner_referral_code) return "Dealership partner";
  if (user.is_fleet_owner) return "Fleet owner";
  if (user.is_branch_admin) return "Branch admin";
  return "Personal account";
}

export function firstName(user: UserProfile | null): string {
  const name = user?.name?.trim();
  if (!name) return "";
  return name.split(" ")[0] ?? "";
}

export function formatMoney(amount: number, country?: string | null): string {
  const currency = country === "United Kingdom" ? "GBP" : "EUR";
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-IE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export function formatClock(hhmm: string): string {
  const [hours, minutes] = hhmm.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return hhmm;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat("en-IE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

export function formatDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

export function formatStatus(status?: string | null): string {
  if (!status) return "";
  return status.replace(/_/g, " ");
}

export function vehicleLabel(vehicle: {
  make?: string | null;
  model?: string | null;
  licence?: string | null;
}): string {
  const name = [vehicle.make, vehicle.model].filter(Boolean).join(" ").trim();
  if (name && vehicle.licence) return `${name} · ${vehicle.licence}`;
  return name || vehicle.licence || "Vehicle";
}
