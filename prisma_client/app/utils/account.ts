import type { UserProfileProps } from "@/app/interfaces/ProfileInterfaces";

export function isFleetOperator(user: UserProfileProps | null | undefined): boolean {
  return user?.is_fleet_owner === true || user?.is_branch_admin === true;
}

/** Personal garage is for B2C and partners. Fleet owners and branch admins book in bulk. */
export function canUsePersonalGarage(user: UserProfileProps | null | undefined): boolean {
  return Boolean(user) && !isFleetOperator(user);
}
