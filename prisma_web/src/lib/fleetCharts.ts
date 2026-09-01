import type {
  BookingActivity,
  ChartBar,
  ChartSeries,
  FleetDashboardAnalytics,
  SpendTrends,
} from "../types/fleet";

const SERIES_COLORS = ["#0074d4", "#6a0dad", "#4caf50", "#ff9800", "#7d3cff"];

const STATUS_COLORS: Record<string, string> = {
  completed: "#4caf50",
  in_progress: "#ff9800",
  scheduled: "#6a0dad",
  confirmed: "#0074d4",
  pending: "#757575",
  cancelled: "#d32f2f",
  accepted: "#0074d4",
};

function isRecord<T>(value: unknown): value is Record<string, T> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function branchSpendBars(analytics?: FleetDashboardAnalytics): ChartBar[] {
  const rows = analytics?.branch_performance;
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const bars = rows
    .filter((row) => row.total_spend > 0 || row.booking_count > 0)
    .map((row) => ({ label: row.branch_name, value: row.total_spend }));
  return bars.some((bar) => bar.value > 0) ? bars : [];
}

export function spendTrendSeries(analytics?: FleetDashboardAnalytics): ChartSeries[] {
  const trends = analytics?.spend_trends;
  if (!isRecord<SpendTrends[string]>(trends)) return [];
  const branchIds = Object.keys(trends);
  if (branchIds.length === 0) return [];

  const dates = new Set<string>();
  for (const id of branchIds) {
    for (const point of trends[id]?.data || []) dates.add(point.date);
  }
  const sorted = [...dates].sort();
  if (sorted.length === 0) return [];

  const series = branchIds.map((id, index) => {
    const branch = trends[id];
    const byDate = new Map((branch?.data || []).map((point) => [point.date, point.value]));
    return {
      label: branch?.branch_name || "Branch",
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      data: sorted.map((date) => ({
        label: formatChartDay(date),
        value: byDate.get(date) || 0,
      })),
    };
  });

  return series.filter((item) => item.data.some((point) => point.value > 0));
}

export function bookingActivityBars(analytics?: FleetDashboardAnalytics): ChartBar[] {
  const activity = analytics?.booking_activity;
  if (!isRecord<BookingActivity[string]>(activity)) return [];

  const counts: Record<string, number> = {};
  for (const branch of Object.values(activity)) {
    for (const [status, count] of Object.entries(branch.by_status || {})) {
      counts[status] = (counts[status] || 0) + count;
    }
  }

  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([status, value]) => ({
      label: status.replace(/_/g, " "),
      value,
      color: STATUS_COLORS[status] || "#757575",
    }));
}

export function formatChartDay(iso: string): string {
  const day = iso.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return day;
  return new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short" }).format(parsed);
}

export function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoDay(date);
}
