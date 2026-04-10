/**
 * Fleet and branch types: branches, fleet dashboard, vehicles, spend, admins, capacity options.
 */
export interface BranchProps {
  id: string;
  name: string;
  address?: string;
  postcode?: string;
  city?: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  fleet: string; // fleet id
  vehicle_count?: number;
  booking_count?: number;
  admin_count?: number;
  spend_limit?: number | null;
  spend_limit_period?: "weekly" | "monthly" | null;
  spent?: number;
  remaining?: number | null;
  created_at?: string;
}

export interface BranchSpendResponse {
  branch_id: string;
  spend_limit: number | null;
  spend_limit_period: "weekly" | "monthly" | null;
  spent: number;
  remaining: number | null;
}

export interface FleetProps {
  id: string;
  name: string;
  owner: string; // user id
  branches: BranchProps[];
}

export interface BranchAdminCreateProps {
  name: string;
  email: string;
  phone: string;
  password: string;
  branch_id: string;
}

export interface BranchPerformanceData {
  branch_id: string;
  branch_name: string;
  total_spend: number;
  booking_count: number;
  avg_booking_value: number;
}

export interface SpendTrendDataPoint {
  date: string;
  value: number;
}

export interface SpendTrendsData {
  [branchId: string]: {
    branch_name: string;
    data: SpendTrendDataPoint[];
  };
}

export interface VehicleHealthScoresData {
  by_branch: {
    [branchId: string]: {
      branch_name: string;
      avg_score: number | null;
      inspection_count: number;
    };
  };
  by_vehicle: {
    [vehicleId: string]: {
      avg_score: number | null;
      inspection_count: number;
    };
  };
}

export interface BookingActivityData {
  [branchId: string]: {
    branch_name: string;
    by_status: { [status: string]: number };
    by_service_type: { [serviceType: string]: number };
    total: number;
  };
}

export interface CommonIssueData {
  type: string;
  count: number;
}

export interface FleetDashboardAnalytics {
  branch_performance: BranchPerformanceData[];
  spend_trends: SpendTrendsData;
  vehicle_health_scores: VehicleHealthScoresData;
  booking_activity: BookingActivityData;
  common_issues: CommonIssueData[];
}

export interface FleetDashboardStats {
  fleet: {
    id: string;
    name: string;
  };
  stats: {
    total_vehicles: number;
    total_bookings: number;
    total_branches: number;
  };
  referral_code: string;
  branches: BranchProps[];
  recent_bookings: Array<{
    id: string;
    booking_reference: string;
    vehicle_reg: string | null;
    service_type: string;
    status: string;
    appointment_date: string;
    total_amount: number;
  }>;
  analytics?: FleetDashboardAnalytics;
  date_range?: {
    start_date: string;
    end_date: string;
  };
}

export interface BranchVehiclesResponse {
  branch: {
    id: string;
    name: string;
  };
  vehicles: Array<{
    id: string;
    make: string;
    model: string;
    year: number;
    color: string;
    registration_number: string;
    country: string;
    vin: string;
    current_owner: string | null;
    branch_id: string;
    branch_name: string;
  }>;
}

export interface VehicleBooking {
  id: string;
  booking_reference: string;
  created_at: string;
  appointment_date: string;
  status: string;
  service_type: string;
  total_amount: number;
}

export interface VehicleBookingsResponse {
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    registration_number: string;
  };
  bookings: VehicleBooking[];
}

export interface BranchAdmin {
  id: string;
  name: string;
  email: string;
  phone: string;
  joined_at: string;
}

export interface FleetAdmin extends BranchAdmin {
  branch_id: string;
  branch_name: string;
}

export interface FleetAdminsResponse {
  admins: FleetAdmin[];
}

export interface UpdateBranchAdminProps {
  admin_id: string;
  name?: string;
  phone?: string;
  branch_id?: string;
}

export interface BranchAdminsResponse {
  admins: BranchAdmin[];
}

export interface BranchBulkOrderItem {
  id: string;
  booking_reference: string;
  number_of_vehicles: number;
  total_amount: number | null;
  created_at: string | null;
  payment_status: string;
  order_data: Record<string, unknown> | null;
}

export interface BranchBulkOrdersResponse {
  branch_id: string;
  bulk_orders: BranchBulkOrderItem[];
}