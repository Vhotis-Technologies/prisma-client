export type InvoicePaymentStatus =
  | "invoice_later"
  | "succeeded"
  | "paid"
  | "failed"
  | "cancelled"
  | string;

export type InvoiceCreator = {
  id: string | null;
  name: string | null;
  email: string | null;
};

export type InvoiceBranch = {
  id: string | null;
  name: string | null;
};

export type InvoiceListItem = {
  id: string;
  booking_reference: string;
  invoice_id: string | null;
  payment_status: InvoicePaymentStatus;
  total_amount: number | null;
  currency: string;
  number_of_vehicles: number;
  created_at: string | null;
  created_by: InvoiceCreator;
  branch: InvoiceBranch;
};

export type InvoiceListResponse = {
  invoices: InvoiceListItem[];
};

export type InvoiceLaterEligibility = {
  allowed: boolean;
  code: "FLEET_SUBSCRIPTION_REQUIRED" | "OVERDUE_INVOICE" | null;
  message: string;
  has_subscription: boolean;
  is_trialing: boolean;
  gated: boolean;
};

export type InvoiceCheckoutResponse = {
  bulk_order_id: string;
  booking_reference: string;
  number_of_vehicles: number;
  total_amount: number;
  currency: string;
  payment_status: InvoicePaymentStatus;
  already_paid: boolean;
  hosted_invoice_url: string | null;
  invoice_status?: string | null;
  amount_due_cents: number;
};

export type ComplimentaryAvailability = {
  available: boolean;
  quota: number;
  used: number;
  remaining: number;
  period_start: string | null;
  period_end: string | null;
  has_subscription: boolean;
  branch_usage?: {
    branch_id: string;
    branch_name: string;
    used_this_period: number;
  } | null;
};
