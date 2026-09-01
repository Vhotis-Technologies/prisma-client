import type { SupportTicket, TicketDetail, TicketIssueType } from "../../types/account";
import { getData, postData } from "./client";

export function listTickets() {
  return getData<{ tickets: SupportTicket[] }>("/api/v1/tickets/list/");
}

export function getTicketDetail(ticketId: string) {
  return getData<TicketDetail>(`/api/v1/tickets/detail/${ticketId}/`);
}

export function createTicket(payload: {
  issue_type: TicketIssueType;
  description: string;
  booking_reference?: string;
}) {
  return postData<SupportTicket>("/api/v1/tickets/create/", payload);
}
