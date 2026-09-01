import { TICKET_ISSUE_TYPES, type TicketStatus } from "../types/account";
import type { UserProfile } from "../types/user";

export function canEditProfile(user: UserProfile | null): boolean {
  return Boolean(user && !user.is_branch_admin);
}

export function isBulkBookingEligible(user: UserProfile | null): boolean {
  return Boolean(
    user?.is_fleet_owner ||
      user?.is_branch_admin ||
      user?.is_dealership ||
      user?.partner_referral_code,
  );
}

export function showsBusinessName(user: UserProfile | null): boolean {
  return Boolean(user?.is_fleet_owner || user?.is_dealership || user?.partner_referral_code);
}

export function issueTypeLabel(value?: string | null): string {
  const match = TICKET_ISSUE_TYPES.find((item) => item.value === value);
  return match?.label || "Ticket";
}

export function ticketPillClass(status?: TicketStatus | string | null): string {
  if (status === "resolved") return "pill-ok";
  if (status === "closed") return "pill-muted";
  return "pill-pending";
}
