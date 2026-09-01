export type PartnerDashboardResponse = {
  partner: {
    id: string;
    business_name: string;
    referral_code: string;
  };
  referral_metrics: {
    total_referred: number;
    active: number;
    inactive: number;
    churned: number;
    conversion_rate: number;
    vehicles_registered: number;
  };
  activity_metrics: {
    total_bookings: number;
    completed: number;
    cancelled: number;
    revenue_total: number;
    revenue_this_month: number;
    revenue_last_month: number;
  };
  commission: {
    total_earned: number;
    pending: number;
    paid: number;
    monthly_breakdown: { month: string; total: number }[];
    commission_rate: number;
  };
  vehicle_insights: {
    total_vehicles: number;
    no_booking_activity: number;
  };
};

export type PartnerPayoutDetails = {
  pending_commission: number;
  bank_account: {
    account_holder_name?: string;
    sort_code_masked?: string;
    account_number_last4?: string;
    iban_masked?: string | null;
    has_bank_account: boolean;
  } | null;
};

export type PartnerPayoutHistoryItem = {
  id: string;
  amount_requested: number;
  status: string;
  requested_at: string | null;
  paid_at: string | null;
};
