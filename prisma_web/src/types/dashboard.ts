export type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum";

export type DashboardVehicle = {
  id: string | null;
  model: string | null;
  make: string | null;
  year: number | string | null;
  color: string | null;
  licence: string | null;
  image: string | null;
};

export type DashboardAddress = {
  address: string | null;
  post_code: string | null;
  city: string | null;
  country: string | null;
};

export type DashboardDetailer = {
  id: string | null;
  name: string | null;
  rating: number;
  image?: string | null;
  phone?: string | null;
};

export type UpcomingAppointment = {
  booking_reference: string;
  detailer?: DashboardDetailer | Record<string, never>;
  detailers?: DashboardDetailer[];
  vehicle: DashboardVehicle;
  address: DashboardAddress;
  service_type: { id: string | null; name: string | null; description?: string | null };
  valet_type: { id: string | null; name: string | null; description?: string | null };
  booking_date: string;
  total_amount: number;
  estimated_duration: string;
  special_instructions?: string | null;
  status?: string;
  start_time?: string | null;
  end_time?: string | null;
  add_ons?: { id: string; name: string }[];
  is_bulk?: boolean;
  number_of_vehicles?: number;
};

export type RecentService = {
  date: string;
  vehicle_name: string;
  status: string;
  cost: number;
  detailer: DashboardDetailer;
  valet_type: string | null;
  service_type: string | null;
  rating: number;
  is_reviewed: boolean;
  booking_reference: string;
};

export type UserStats = {
  services_this_month: number;
  services_this_year: number;
};

export type LoyaltyProgress = {
  is_b2c: boolean;
  current_tier: LoyaltyTier | null;
  completed_bookings: number;
  next_tier: LoyaltyTier | null;
  current_threshold: number;
  next_threshold: number | null;
  washes_to_next: number;
  benefits: { discount: number; free_service: string[] };
};

export type SubscriptionComplimentary = {
  eligible_subscription: boolean;
  remaining_subscription: number;
  max_subscription: number;
  period_label: string;
};

export type PerksSummary = {
  loyalty: LoyaltyProgress;
  subscription_complimentary: SubscriptionComplimentary;
};
