/**
 * Bulk booking and invoice access rules by user role (fleet, branch, partner).
 */
import type { UserProfileProps } from "@/app/interfaces/ProfileInterfaces";

/** Same roles that can use bulk booking with pay-later. */
export function isBulkBookingEligible(
  user?: UserProfileProps | null,
): boolean {
  if (!user) return false;
  return Boolean(
    user.is_fleet_owner ||
      user.is_branch_admin ||
      user.is_dealership ||
      user.partner_referral_code,
  );
}

/** Whether the user may view bulk invoice lists in the app. */
export function canAccessBulkInvoices(
  user?: UserProfileProps | null,
): boolean {
  return isBulkBookingEligible(user);
}

export type BulkInvoiceApiSource = "fleet" | "partner" | "my";

/** RTK API source for bulk invoices: fleet, partner, or my (branch admin). */
export function getBulkInvoiceApiSource(
  user?: UserProfileProps | null,
): BulkInvoiceApiSource | null {
  if (!canAccessBulkInvoices(user)) return null;
  if (user?.is_fleet_owner) return "fleet";
  if (user?.is_dealership) return "partner";
  return "my";
}
