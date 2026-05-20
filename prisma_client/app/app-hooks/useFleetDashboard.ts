/**
 * Fleet dashboard data hook: branch performance, spend trends, health scores, booking activity, common issues.
 */
import { useState, useMemo } from "react";
import { useGetFleetDashboardQuery, useGetBranchesQuery } from "@/app/store/api/fleetApi";
import { StatCard } from "@/app/interfaces/DashboardInterfaces";
import {
  processBranchPerformanceData,
  processSpendTrendsData,
  processHealthScoresData,
  processBookingActivityData,
  processCommonIssuesData,
} from "@/app/utils/fleetDashboardUtils";

/**
 * Format a Date as YYYY-MM-DD for fleet dashboard API queries.
 *
 * @param date - Date to format
 * @returns ISO date string (date portion only)
 */
function formatDateForAPI(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Fleet dashboard analytics hook: date range, chart data, and summary stats.
 *
 * @param primaryColor - Theme color for stat cards (default purple)
 * @returns Dashboard query state, processed chart data, and date range setters
 */
export function useFleetDashboard(primaryColor: string = "#8B5CF6") {
  const [endDate, setEndDate] = useState(new Date());
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date;
  });

  const {
    data: dashboardData,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useGetFleetDashboardQuery({
    start_date: formatDateForAPI(startDate),
    end_date: formatDateForAPI(endDate),
  });
  const { data: branchesData } = useGetBranchesQuery();

  const branchPerformanceData = useMemo(
    () => processBranchPerformanceData(dashboardData?.analytics),
    [dashboardData?.analytics]
  );
  const spendTrendsData = useMemo(
    () => processSpendTrendsData(dashboardData?.analytics),
    [dashboardData?.analytics]
  );
  const healthScoresData = useMemo(
    () => processHealthScoresData(dashboardData?.analytics),
    [dashboardData?.analytics]
  );
  const bookingActivityData = useMemo(
    () => processBookingActivityData(dashboardData?.analytics),
    [dashboardData?.analytics]
  );
  const commonIssuesData = useMemo(
    () => processCommonIssuesData(dashboardData?.analytics),
    [dashboardData?.analytics]
  );

  const stats: StatCard[] = dashboardData
    ? [
        {
          icon: "car",
          value: dashboardData.stats.total_vehicles.toString(),
          label: "Vehicles",
          color: primaryColor,
        },
        {
          icon: "calendar",
          value: dashboardData.stats.total_bookings.toString(),
          label: "Bookings",
          color: primaryColor,
        },
        {
          icon: "business",
          value: dashboardData.stats.total_branches.toString(),
          label: "Branches",
          color: primaryColor,
        },
      ]
    : [];

  return {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    dashboardData,
    isLoading,
    error,
    refetch,
    isFetching,
    branchesData,
    branchPerformanceData,
    spendTrendsData,
    healthScoresData,
    bookingActivityData,
    commonIssuesData,
    stats,
  };
}
