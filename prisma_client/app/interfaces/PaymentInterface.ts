/**
 * Payment and checkout types: owner details, billing address, checkout context.
 */
export interface OwnerDetails {
  address: string;
  postcode: string;
  city: string;
  country: string;
  phone: string;
}

export default interface CheckoutContextType {
    fetchPaymentSheetDetails: (amount: number) => Promise<void>;
    initializePaymentSheet: () => Promise<void>;
    openPaymentSheet: () => Promise<void>;  
}

export interface BillingAddress {
  fullName: string;
  address: string;
  postcode: string;
  city: string;
  country: string;
  phone: string;
}

export interface CardType {
  id: string;
  last4: string;
  brand: string;
  isDefault: boolean;
}

export interface PaymentDetails {
  cardNumber: string;
  expiryDate: string;
  cvv: string;
  name: string;
  email: string;
}

export interface BillingDetails {
  numberOfEmployees: number;
  billingPeriod: string;
  ratePerEmployee: number;
  totalAmount: number;
}

export interface SubscriptionPlanTiers {
  id: string;
  name: string;
  description: string;
  features: string[];
  isPopular: boolean;
  numberOfEmployees: number;
  rate: number;
  overageFee?: number;
  is_custom?: boolean;
  employeeCount?: number;
  overage_rate: number;
  minimum_employees?: number;
}

export interface CurrentPlanDetails {
  plan_name: string;
  current_employees: number;
  plan_limit: number;
  overage_count: number;
  overage_fees: number;
  renewal_date: string;
  overage_duration?: number;
  billing_cycle: "monthly" | "yearly";
  status: boolean;
}

export interface SubscriptionHistoryInterface {
  id: string;
  tier: string;
  start_date: string;
  renewal_date: string;
  status: "active" | "expiring" | "overdue";
  billing_cycle?: string;
}
