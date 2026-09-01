export type ServiceType = {
  id: string | number;
  name: string;
  description: string | string[];
  price: number;
  duration: number;
  fleet_price?: number | null;
  user_price?: number;
};

export type ValetType = {
  id: string | number;
  name: string;
  description: string;
};

export type AddOn = {
  id: string | number;
  name: string;
  price: number;
  description: string;
  extra_duration: number;
};

export type Promotion = {
  id: string;
  title: string;
  discount_percentage: number;
  valid_until: string;
  is_active: boolean;
  terms_conditions?: string;
};

export type FreeWashCheck = {
  can_use_free_wash: boolean;
  remaining_quick_sparkles: number;
  total_monthly_limit: number;
  resets_in_days: number;
  free_wash_source?: "loyalty" | "partner" | "subscription" | null;
  partner_free_wash?: boolean;
  eligible_loyalty?: boolean;
  eligible_partner?: boolean;
  eligible_subscription?: boolean;
  remaining_subscription?: number;
  max_subscription?: number;
  subscription_period_label?: string;
};

export type BookingQuoteAmounts = {
  subtotal: number;
  vat: number;
  total: number;
};

export type BookingQuotePricingLines = {
  sticker_total_inc_vat: number;
  loyalty_discount_inc_vat: number;
  promotion_discount_inc_vat: number;
  partner_referral_discount_inc_vat: number;
  subscription_discount_inc_vat: number;
  subscription_discount_percent: number;
};

export type ComplimentarySparkleSource = "loyalty" | "subscription" | "partner";

export type BookingQuickSparkleEntitlements = {
  is_quick_sparkle: boolean;
  eligible_loyalty: boolean;
  remaining_loyalty: number;
  total_monthly_limit: number;
  resets_in_days: number;
  eligible_partner: boolean;
  eligible_subscription: boolean;
  remaining_subscription: number;
  max_subscription: number;
  period_start: string | null;
  period_end: string | null;
  period_label: string;
  partner_free_wash?: boolean;
};

export type BookingQuote = {
  issued_at: string;
  quick_sparkle: BookingQuickSparkleEntitlements;
  payable_full: BookingQuoteAmounts;
  payable_if_complimentary: {
    loyalty: BookingQuoteAmounts | null;
    partner: BookingQuoteAmounts | null;
    subscription: BookingQuoteAmounts | null;
  };
  pricing_lines_full: BookingQuotePricingLines;
  pricing_lines_if_complimentary: {
    loyalty: BookingQuotePricingLines | null;
    partner: BookingQuotePricingLines | null;
    subscription: BookingQuotePricingLines | null;
  };
  partner_booking_offer: {
    eligible: boolean;
    percent: number;
    expires_at: string | null;
  } | null;
  vat_rate_percent: number;
};

export type PriceSummaryBreakdown = {
  stickerSubtotalIncVat: number;
  loyaltyDiscountIncVat: number;
  promotionDiscountIncVat: number;
  partnerReferralDiscountIncVat: number;
  subscriptionDiscountIncVat: number;
  complimentaryStickerSavingsIncVat: number;
  totalIncVat: number;
  loyaltyDiscountPercent?: number;
  partnerReferralDiscountPercent?: number;
  subscriptionDiscountPercent?: number;
};

export type AppliedVoucher = {
  kind: "winner" | "gift";
  voucherId: string;
  amountDue: number;
  discountApplied: number;
  preTotal: number;
};

export type PaymentSheetResponse = {
  paymentIntent?: string;
  paymentIntentId?: string;
  ephemeralKey?: string;
  customer?: string;
  booking_reference: string;
  free_booking?: boolean;
  success?: boolean;
  appointment_id?: string;
};

export type PaymentConfirmResponse = {
  confirmed: boolean;
  assigned?: boolean;
  assigning?: boolean;
  payment_intent_id: string;
  transaction_id?: string;
  booking_reference?: string;
  status?: string;
  message?: string;
};

export type BookingConfirmationSnapshot = {
  bookingReference: string;
  serviceName: string;
  valetName: string;
  dateIso: string;
  timeSlot: string;
  vehicleLine: string;
  addressLine: string;
  total: number;
  free: boolean;
  invoiceLater?: boolean;
  numberOfVehicles?: number;
  endTime?: string;
};

export type BulkCapacityOption = {
  window: "morning" | "afternoon" | "fullday" | string;
  best_start_time: string;
  estimated_finish_time: string;
  suggested_team_size: number;
};

export type BulkCapacityResponse = {
  available?: boolean;
  options?: BulkCapacityOption[];
  error?: string;
};
