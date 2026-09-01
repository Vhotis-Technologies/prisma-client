export type BranchSpend = {
  branch_id: string;
  spend_limit: number | null;
  spend_limit_period: "weekly" | "monthly" | null;
  spent: number;
  remaining: number | null;
};

export type BranchVehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  registration_number: string;
  country?: string;
  body_style?: string | null;
  current_owner?: string | null;
  branch_id: string;
  branch_name: string;
};

export type BranchVehiclesResponse = {
  branch: {
    id: string;
    name: string;
  };
  vehicles: BranchVehicle[];
};

export type FleetBranch = {
  id: string;
  name: string;
  address?: string;
  postcode?: string;
  city?: string;
  country?: string;
  vehicle_count?: number;
  booking_count?: number;
  admin_count?: number;
  spend_limit?: number | null;
  spend_limit_period?: "weekly" | "monthly" | null;
  spent?: number;
  remaining?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type FleetAdmin = {
  id: string;
  name: string;
  email: string;
  phone: string;
  joined_at?: string;
  branch_id: string;
  branch_name: string;
  invite_pending?: boolean;
};

export type BranchPerformance = {
  branch_id: string;
  branch_name: string;
  total_spend: number;
  booking_count: number;
  avg_booking_value: number;
};

export type SpendTrendPoint = {
  date: string;
  value: number;
};

export type SpendTrends = Record<
  string,
  {
    branch_name: string;
    data: SpendTrendPoint[];
  }
>;

export type BookingActivity = Record<
  string,
  {
    branch_name: string;
    by_status: Record<string, number>;
    by_service_type: Record<string, number>;
    total: number;
  }
>;

export type FleetDashboardAnalytics = {
  branch_performance?: BranchPerformance[] | [];
  spend_trends?: SpendTrends | [];
  booking_activity?: BookingActivity | [];
};

export type FleetRecentBooking = {
  id: string;
  booking_reference: string;
  vehicle_reg: string | null;
  service_type: string | null;
  status: string;
  appointment_date: string;
  total_amount: number;
};

export type FleetDashboardResponse = {
  fleet: {
    id: string;
    name: string;
  };
  stats: {
    total_vehicles: number;
    total_bookings: number;
    total_branches: number;
  };
  referral_code?: string | null;
  branches: FleetBranch[];
  recent_bookings: FleetRecentBooking[];
  analytics?: FleetDashboardAnalytics;
  date_range?: {
    start_date: string;
    end_date: string;
  };
};

export type ChartBar = {
  label: string;
  value: number;
  color?: string;
};

export type ChartSeries = {
  label: string;
  color: string;
  data: Array<{ label: string; value: number }>;
};
