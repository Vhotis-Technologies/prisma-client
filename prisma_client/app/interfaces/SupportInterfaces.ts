/**
 * Support / Help & tickets interfaces and constants.
 */

export interface CreateTicketPayload {
  issueType: string;
  bookingReference?: string;
  description: string;
}

export interface Ticket {
  id: string;
  ticket_code?: string;
  subject?: string;
  summary?: string;
  status: TicketStatus;
  created_at: string;
  issue_type?: string;
  booking_reference?: string;
}

export type TicketStatus = "pending" | "in_progress" | "resolved" | "closed";

export interface TicketUpdate {
  kind: "status_change" | "reply";
  status_to?: string;
  message?: string;
  created_at: string;
}

export interface TicketDetail extends Ticket {
  description: string;
  updates: TicketUpdate[];
}

export const TICKET_ISSUE_TYPES: Array<{ value: string; label: string }> = [
  { value: "booking", label: "Booking issue" },
  { value: "payment_refund", label: "Payment / Refund" },
  { value: "subscription", label: "Subscription" },
  { value: "account", label: "Account" },
  { value: "bulk_order", label: "Bulk order" },
  { value: "other", label: "Other" },
];
