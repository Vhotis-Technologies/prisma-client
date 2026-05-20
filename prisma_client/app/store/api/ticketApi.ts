/**
 * Support tickets API: create ticket, list tickets, get ticket detail.
 */
import { createApi } from "@reduxjs/toolkit/query/react";
import axiosBaseQuery from "../baseQuery";
import type {
  Ticket,
  TicketDetail,
  CreateTicketPayload,
} from "@/app/interfaces/SupportInterfaces";

const ticketApi = createApi({
  reducerPath: "ticketApi",
  baseQuery: axiosBaseQuery(),
  tagTypes: ["Tickets", "TicketDetail"],
  endpoints: (builder) => ({
    /** Open a new support ticket with issue type and description. */
    createTicket: builder.mutation<Ticket, CreateTicketPayload>({
      query: (payload) => ({
        url: "/api/v1/tickets/create/",
        method: "POST",
        data: {
          issue_type: payload.issueType,
          booking_reference: payload.bookingReference || undefined,
          description: payload.description,
        },
      }),
      invalidatesTags: [{ type: "Tickets", id: "LIST" }],
    }),

    /** List support tickets for the authenticated user. */
    fetchTickets: builder.query<Ticket[], void>({
      query: () => ({
        url: "/api/v1/tickets/list/",
        method: "GET",
      }),
      transformResponse: (response: { tickets?: Ticket[] }): Ticket[] => {
        const list = response.tickets ?? (Array.isArray(response) ? response : []);
        return list.map((t: any) => ({
          id: t.id,
          ticket_code: t.ticket_code,
          subject: t.subject ?? t.summary,
          summary: t.summary ?? t.subject,
          status: t.status,
          created_at: t.created_at,
          issue_type: t.issue_type,
          booking_reference: t.booking_reference,
        }));
      },
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "Tickets" as const, id })),
              { type: "Tickets", id: "LIST" },
            ]
          : [{ type: "Tickets", id: "LIST" }],
    }),

    /** Ticket detail with description and status updates. */
    fetchTicketDetail: builder.query<TicketDetail, string>({
      query: (id) => ({
        url: `/api/v1/tickets/detail/${id}/`,
        method: "GET",
      }),
      transformResponse: (response: any): TicketDetail => ({
        id: response.id,
        ticket_code: response.ticket_code,
        subject: response.subject ?? response.summary,
        summary: response.summary ?? response.subject,
        status: response.status,
        created_at: response.created_at,
        issue_type: response.issue_type,
        booking_reference: response.booking_reference,
        description: response.description ?? "",
        updates: response.updates ?? [],
      }),
      providesTags: (result, error, id) => [{ type: "TicketDetail", id }],
    }),
  }),
});

export const {
  useCreateTicketMutation,
  useFetchTicketsQuery,
  useFetchTicketDetailQuery,
} = ticketApi;
export default ticketApi;
