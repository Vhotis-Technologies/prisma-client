/**
 * Fleet subscription usage. Seat/branch/vehicle caps were removed; invoice later
 * and job photos are gated by an active or trialing subscription on the server.
 */
import { useMemo } from "react";
import { useGetCurrentSubscriptionQuery } from "@/app/store/api/subscriptionApi";
import { useGetFleetDashboardQuery } from "@/app/store/api/fleetApi";
import { useAppSelector, RootState } from "@/app/store/main_store";

/**
 * Custom hook to calculate subscription limits and current usage
 * Returns boolean flags indicating if limits are reached
 */
export const useSubscriptionLimits = () => {
  const isFleetOwner = useAppSelector(
    (state: RootState) => state.auth.user?.is_fleet_owner === true,
  );

  const { data: subscriptionResponse } = useGetCurrentSubscriptionQuery(
    undefined,
    { skip: !isFleetOwner },
  );

  const subscription = subscriptionResponse?.subscription ?? undefined;

  const { data: dashboardStats } = useGetFleetDashboardQuery(undefined, {
    skip: !isFleetOwner,
  });

  const limitsReached = useMemo(
    () => ({ admins: false, branches: false, vehicles: false }),
    [],
  );

  return {
    limitsReached,
    subscription,
    dashboardStats,
  };
};
