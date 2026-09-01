export type InvoicePaymentStatus =
  | "invoice_later"
  | "succeeded"
  | "paid"
  | "failed"
  | "cancelled"
  | string;

export interface InvoiceCreator {
  id: string | null;
  name: string | null;
  email: string | null;
}

export interface InvoiceBranch {
  id: string | null;
  name: string | null;
}

export interface InvoiceListItem {
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
}

export interface InvoiceListResponse {
  invoices: InvoiceListItem[];
}

export type InvoiceLaterEligibility = {
  allowed: boolean;
  code: "FLEET_SUBSCRIPTION_REQUIRED" | "OVERDUE_INVOICE" | null;
  message: string;
  has_subscription: boolean;
  is_trialing: boolean;
  gated: boolean;
};
