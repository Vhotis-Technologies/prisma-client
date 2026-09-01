export type BillingCycle = "monthly" | "yearly";

export type SubscriptionStatus =
  | "active"
  | "pending"
  | "trialing"
  | "past_due"
  | "canceled"
  | "cancelled"
  | "expired";

export type VehicleCategory = "sedan" | "suv_mpv";

export type VehicleCategoryPrices = {
  monthlyPrice: number;
  yearlyPrice: number;
};

export type SubscriptionTier = {
  id: string;
  name: string;
  tagLine?: string;
  /** Legacy fields: SUV/MPV prices (kept for backwards compatibility). */
  monthlyPrice: number;
  yearlyPrice: number;
  yearlyBillingText?: string;
  badge?: string;
  features: string[];
  serviceDiscountPercent?: number;
  maxComplimentaryWashes?: number;
  pricesByVehicleCategory?: Record<VehicleCategory, VehicleCategoryPrices>;
};

export type PaymentFailureStatus = {
  hasFailure: boolean;
  retryDate: string | null;
  gracePeriodUntil: string | null;
  failureCount: number;
};

export type CurrentSubscription = {
  id?: string;
  currentPlan: string | null;
  status: SubscriptionStatus;
  renewsOn: string | null;
  billingCycle: BillingCycle;
  trialDaysRemaining?: number | null;
  trialEndDate?: string | null;
  isTrialing?: boolean;
  lastPaidOn?: string | null;
  canStartTrial?: boolean;
  isEarlyAdopter?: boolean;
  paymentFailureStatus?: PaymentFailureStatus | null;
  vehicleCategory?: VehicleCategory | null;
};

export type CurrentSubscriptionResponse = {
  subscription: CurrentSubscription | null;
  canStartTrial?: boolean;
  isEarlyAdopter?: boolean;
};

export type SubscriptionPaymentSheet = {
  paymentIntent?: string;
  setupIntent?: string;
  ephemeralKey: string;
  customer: string;
};

export type CreateSubscriptionResponse = {
  message: string;
  subscription: CurrentSubscription;
  paymentSheet?: SubscriptionPaymentSheet;
  isTrial?: boolean;
  billing?: { transaction_id?: string };
};

export type SubscriptionBillingRow = {
  id: string;
  amount?: number | string;
  billing_date?: string;
  status?: string;
  subscription?: {
    plan?: {
      name?: string;
      billing_cycle?: string;
      tier?: { name?: string };
    };
  };
};

export type SetupIntentResponse = {
  setupIntent: string;
  ephemeralKey: string;
  customer: string;
};
