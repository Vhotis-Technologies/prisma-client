import { useMemo } from "react";
import { useGetCurrentSubscriptionQuery } from "@/app/store/api/subscriptionApi";
import { useGetFleetDashboardQuery } from "@/app/store/api/fleetApi";

/**
 * Custom hook to calculate subscription limits and current usage
 * Returns boolean flags indicating if limits are reached
 */
export const useSubscriptionLimits = () => {
  const { data: subscription } = useGetCurrentSubscriptionQuery();
  const { data: dashboardStats } = useGetFleetDashboardQuery();

  const limitsReached = useMemo(() => {
    if (!subscription || !dashboardStats) {
      return { admins: false, branches: false, vehicles: false };
    }

    // Get tier name from currentPlan (it should be the tier name like "Basic", "Pro", "Enterprise")
    const tierName = subscription.currentPlan?.toLowerCase() || "";

    let limits: { admins?: number | null; branches?: number | null; vehicles?: number | null } = {};

    // Determine limits based on tier name
    if (tierName.includes("basic")) {
      limits = { admins: 3, branches: 3, vehicles: 50 };
    } else if (tierName.includes("pro")) {
      limits = { admins: 10, branches: 10, vehicles: 200 };
    } else if (tierName.includes("enterprise")) {
      limits = { admins: null, branches: null, vehicles: null }; // unlimited
    } else {
      // No subscription or unknown tier - no limits (handled by backend)
      return { admins: false, branches: false, vehicles: false };
    }

    // Get current counts
    const currentBranches = dashboardStats.stats?.total_branches || 0;
    const currentVehicles = dashboardStats.stats?.total_vehicles || 0;
    
    // Calculate admin count from branches (sum of admin_count from each branch)
    // If admin_count is not in branch data, we'll need to fetch it separately or update backend
    // For now, we'll use a placeholder - the backend should provide this in dashboard stats
    const currentAdmins = dashboardStats.branches?.reduce(
      (sum, branch) => sum + (branch.admin_count || 0),
      0
    ) || 0;

    return {
      admins: limits.admins !== null && limits.admins !== undefined ? currentAdmins >= limits.admins : false,
      branches: limits.branches !== null && limits.branches !== undefined ? currentBranches >= limits.branches : false,
      vehicles: limits.vehicles !== null && limits.vehicles !== undefined ? currentVehicles >= limits.vehicles : false,
    };
  }, [subscription, dashboardStats]);

  return {
    limitsReached,
    subscription,
    dashboardStats,
  };
};
