/**
 * Fleet dashboard data processing: branch performance, spend trends, health scores, booking activity, common issues.
 * Also getBulkOrderJobStart and API fetch helpers for fleet dashboard.
 */
import {
  FleetDashboardStats,
  BranchPerformanceData,
  SpendTrendsData,
  VehicleHealthScoresData,
  BookingActivityData,
  CommonIssueData,
} from "@/app/interfaces/FleetInterfaces";
import { API_CONFIG } from "@/constants/Config";

export const BULK_CUTOFF_HOURS = 12;

/** Compute job start datetime from bulk order order_data. Returns null if not parseable. */
export function getBulkOrderJobStart(order: {
  order_data?: Record<string, unknown> | null;
}): Date | null {
  const d = order?.order_data ?? undefined;
  if (!d || typeof d !== "object") return null;
  const dateVal =
    typeof d.date === "string" ? d.date : (d.appointment_date as string);
  const startVal =
    typeof d.start_time === "string"
      ? d.start_time
      : (d.best_start_time as string) || "06:00";
  if (!dateVal || dateVal.length < 10) return null;
  const dateStr = String(dateVal).slice(0, 10);
  const timeStr =
    String(startVal).length === 5
      ? `${startVal}:00`
      : String(startVal).slice(0, 8);
  try {
    const combined = `${dateStr}T${timeStr}`;
    const dt = new Date(combined);
    return isNaN(dt.getTime()) ? null : dt;
  } catch {
    return null;
  }
}

/** True if cancel/reschedule are allowed (>=12h before job start). */
export function canCancelOrRescheduleBulkOrder(order: {
  order_data?: Record<string, unknown> | null;
  payment_status?: string;
}): boolean {
  if (order.payment_status === "cancelled") return false;
  const jobStart = getBulkOrderJobStart(order);
  if (!jobStart) return true;
  const now = new Date();
  const hoursLeft =
    (jobStart.getTime() - now.getTime()) / (1000 * 60 * 60);
  return hoursLeft >= BULK_CUTOFF_HOURS;
}

export interface BulkCapacityOption {
  window: string;
  best_start_time: string;
  estimated_finish_time: string;
  suggested_team_size: number;
}

export interface CheckBulkCapacityParams {
  date: string;
  workload_minutes: number;
  service_duration: number;
  country: string;
  city: string;
  latitude?: number;
  longitude?: number;
}

/** Check bulk capacity via detailer app availability API. */
export async function checkBulkCapacityAvailability(
  params: CheckBulkCapacityParams
): Promise<{
  available: boolean;
  options?: BulkCapacityOption[];
  error?: string;
}> {
  try {
    const url = new URL(
      `${API_CONFIG.detailerAppUrl}/api/v1/availability/check_bulk_capacity/`
    );
    url.searchParams.append("date", params.date.slice(0, 10));
    url.searchParams.append("workload_minutes", String(params.workload_minutes));
    url.searchParams.append("service_duration", String(params.service_duration));
    url.searchParams.append("country", params.country);
    url.searchParams.append("city", params.city);
    if (
      params.latitude != null &&
      params.longitude != null
    ) {
      url.searchParams.append("latitude", String(params.latitude));
      url.searchParams.append("longitude", String(params.longitude));
    }
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json();
    if (data.error || !data.available) {
      return {
        available: false,
        error: data.error || "No availability for this date.",
      };
    }
    return {
      available: true,
      options: data.options ?? undefined,
    };
  } catch {
    return { available: false, error: "Unable to check availability." };
  }
}


export const processBranchPerformanceData = (
  analytics: FleetDashboardStats["analytics"]
): Array<{ label: string; value: number; color?: string }> => {
  if (!analytics?.branch_performance) return [];
  
  const data = analytics.branch_performance
    .filter((item) => item.total_spend > 0 || item.booking_count > 0)
    .map((item) => ({
      label: item.branch_name,
      value: item.total_spend,
    }));
  
  // Only return if there's at least one non-zero value
  return data.some((item) => item.value > 0) ? data : [];
};

export const processSpendTrendsData = (
  analytics: FleetDashboardStats["analytics"]
): Array<{ label: string; data: Array<{ label: string; value: number }>; color?: string }> => {
  if (!analytics?.spend_trends) return [];
  
  const trends = analytics.spend_trends;
  const branchIds = Object.keys(trends);
  
  if (branchIds.length === 0) return [];
  
  // Get all unique dates
  const allDates = new Set<string>();
  branchIds.forEach((branchId) => {
    trends[branchId].data.forEach((point) => {
      allDates.add(point.date);
    });
  });
  
  const sortedDates = Array.from(allDates).sort();
  
  // Create series for each branch
  const colors = ["#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#3B82F6"];
  
  const series = branchIds.map((branchId, index) => {
    const branchData = trends[branchId];
    const dataMap = new Map(
      branchData.data.map((point) => [point.date, point.value])
    );
    
    const data = sortedDates.map((date) => ({
      label: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: dataMap.get(date) || 0,
    }));
    
    return {
      label: branchData.branch_name,
      data,
      color: colors[index % colors.length],
    };
  });
  
  // Filter out series with no data (all values are 0)
  const filteredSeries = series.filter((s) => s.data.some((d) => d.value > 0));
  
  // Only return if there's at least one series with data
  return filteredSeries.length > 0 ? filteredSeries : [];
};

export const processHealthScoresData = (
  analytics: FleetDashboardStats["analytics"]
): Array<{ label: string; value: number; color?: string }> => {
  if (!analytics?.vehicle_health_scores?.by_branch) return [];
  
  const byBranch = analytics.vehicle_health_scores.by_branch;
  const branchIds = Object.keys(byBranch);
  
  const data = branchIds
    .map((branchId) => {
      const branchData = byBranch[branchId];
      if (branchData.avg_score === null || branchData.inspection_count === 0) return null;
      
      return {
        label: branchData.branch_name,
        value: branchData.avg_score,
      };
    })
    .filter((item): item is { label: string; value: number } => item !== null);
  
  // Only return if there's at least one valid score
  return data.length > 0 ? data : [];
};

export const processBookingActivityData = (
  analytics: FleetDashboardStats["analytics"]
): Array<{ label: string; value: number; color: string }> => {
  if (!analytics?.booking_activity) return [];
  
  const activity = analytics.booking_activity;
  const statusCounts: { [key: string]: number } = {};
  
  Object.values(activity).forEach((branchData) => {
    Object.entries(branchData.by_status).forEach(([status, count]) => {
      statusCounts[status] = (statusCounts[status] || 0) + count;
    });
  });
  
  const colors: { [key: string]: string } = {
    completed: "#10B981",
    in_progress: "#F59E0B",
    scheduled: "#3B82F6",
    confirmed: "#8B5CF6",
    pending: "#6B7280",
    cancelled: "#EF4444",
  };
  
  const data = Object.entries(statusCounts)
    .filter(([_, count]) => count > 0)
    .map(([status, count]) => ({
      label: status.charAt(0).toUpperCase() + status.slice(1).replace("_", " "),
      value: count,
      color: colors[status] || "#6B7280",
    }));
  
  // Only return if there's at least one booking with a status
  return data.length > 0 ? data : [];
};

export const processCommonIssuesData = (
  analytics: FleetDashboardStats["analytics"]
): Array<{ label: string; value: number; color?: string }> => {
  if (!analytics?.common_issues) return [];
  
  const colors = ["#EF4444", "#F59E0B", "#3B82F6", "#8B5CF6", "#10B981"];
  
  const data = analytics.common_issues
    .filter((issue) => issue.count > 0)
    .map((issue, index) => ({
      label: issue.type,
      value: issue.count,
      color: colors[index % colors.length],
    }));
  
  // Only return if there's at least one issue
  return data.length > 0 ? data : [];
};
