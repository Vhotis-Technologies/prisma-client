export const TICKET_ISSUE_TYPES = [
  { value: "booking", label: "Booking issue" },
  { value: "payment_refund", label: "Payment / Refund" },
  { value: "subscription", label: "Subscription" },
  { value: "account", label: "Account" },
  { value: "bulk_order", label: "Bulk order" },
  { value: "other", label: "Other" },
] as const;

export type TicketIssueType = (typeof TICKET_ISSUE_TYPES)[number]["value"];

export type TicketStatus = "pending" | "in_progress" | "resolved" | "closed";

export type SupportTicket = {
  id: string;
  ticket_code?: string;
  subject?: string;
  summary?: string;
  status: TicketStatus;
  created_at: string;
  issue_type?: string;
  booking_reference?: string | null;
};

export type TicketUpdate = {
  kind: "status_change" | "reply";
  status_to?: string | null;
  message?: string | null;
  created_at: string;
};

export type TicketDetail = SupportTicket & {
  description: string;
  updates: TicketUpdate[];
};

export type InboxNotification = {
  id: string;
  title: string;
  message: string;
  type?: string;
  status?: string;
  timestamp: string;
  is_read: boolean;
  isRead?: boolean;
};
