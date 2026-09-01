/**
 * Fleet / B2C subscription types: tiers, plans, current subscription, billing history.
 */
export type B2cVehicleCategory = "sedan" | "suv_mpv";

export interface SubscriptionCategoryPrices {
  monthlyPrice: number;
  yearlyPrice: number;
}

export interface SubscriptionTierProps {
  id: string;
  name: string;
  tagLine?: string;
  monthlyPrice: number;
  yearlyPrice: number;
  yearlyBillingText?: string;
  badge?: string;
  features: string[];
  serviceDiscountPercent?: number;
  maxComplimentaryWashes?: number;
  pricesByVehicleCategory?: {
    sedan: SubscriptionCategoryPrices;
    suv_mpv: SubscriptionCategoryPrices;
  };
}

export interface SubscriptionPlanProps {
  id: string;
  tier: SubscriptionTierProps;
  billing_cycle: "monthly" | "yearly";
  vehicle_category?: B2cVehicleCategory;
  name: string;
  price: number;
  is_active: boolean;
}

export interface PaymentFailureStatus {
  hasFailure: boolean;
  retryDate: string | null;
  gracePeriodUntil: string | null;
  failureCount: number;
}

export interface FleetSubscriptionProps {
  id?: string;
  currentPlan: string | null;
  status:
    | "active"
    | "pending"
    | "trialing"
    | "past_due"
    | "canceled"
    | "expired";
  renewsOn: string | null;
  billingCycle: "monthly" | "yearly";
  vehicleCategory?: B2cVehicleCategory;
  trialDaysRemaining?: number | null;
  trialEndDate?: string | null;
  isTrialing?: boolean;
  lastPaidOn?: string | null;
  canStartTrial?: boolean;
  isEarlyAdopter?: boolean;
  paymentFailureStatus?: PaymentFailureStatus | null;
  nextBillingDate?: string | null;
}

export interface SubscriptionBillingProps {
  id: string;
  subscription: {
    id: string;
    plan: {
      id: string;
      name: string;
      tier: {
        id: string;
        name: string;
      };
      billing_cycle: "monthly" | "yearly";
      vehicle_category?: B2cVehicleCategory;
    };
  };
  amount: number;
  billing_date: string;
  status: "paid" | "pending" | "failed" | "refunded";
  transaction_id?: string;
  created_at: string;
}

export interface PaymentSheetProps {
  paymentIntent: string;
  ephemeralKey: string;
  customer: string;
}

export interface CreateSubscriptionRequest {
  tierId: string;
  billingCycle: "monthly" | "yearly";
  /** Defaults to suv_mpv on the server when omitted. */
  vehicleCategory?: B2cVehicleCategory;
}

export interface CreateSubscriptionResponse {
  message: string;
  subscription: FleetSubscriptionProps;
  paymentSheet?: PaymentSheetProps;
  billing?: SubscriptionBillingProps;
}

export interface GetPlansResponse {
  plans: SubscriptionTierProps[];
}

export interface GetCurrentSubscriptionResponse {
  subscription: FleetSubscriptionProps | null;
  canStartTrial?: boolean;
  isEarlyAdopter?: boolean;
}

/** View type for subscription or trial-only state (no subscription yet). */
export type CurrentSubscriptionView = Partial<FleetSubscriptionProps> & {
  canStartTrial?: boolean;
  isEarlyAdopter?: boolean;
};

export interface GetBillingHistoryResponse {
  billing_history: SubscriptionBillingProps[];
}
