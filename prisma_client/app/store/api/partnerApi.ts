/**
 * Partner API: dashboard metrics, bank account, payout requests, commission earnings.
 */
import { createApi } from "@reduxjs/toolkit/query/react";
import axiosBaseQuery from "../baseQuery";
import { InvoiceListResponse } from "@/app/interfaces/InvoiceInterfaces";

export interface PartnerDashboardResponse {
  partner: {
    id: string;
    business_name: string;
    referral_code: string;
  };
  referral_metrics: {
    total_referred: number;
    active: number;
    inactive: number;
    churned: number;
    conversion_rate: number;
    vehicles_registered: number;
  };
  activity_metrics: {
    total_bookings: number;
    completed: number;
    cancelled: number;
    revenue_total: number;
    revenue_this_month: number;
    revenue_last_month: number;
  };
  commission: {
    total_earned: number;
    pending: number;
    paid: number;
    monthly_breakdown: { month: string; total: number }[];
    commission_rate: number;
  };
  vehicle_insights: {
    total_vehicles: number;
    no_booking_activity: number;
  };
}

export interface PartnerPayoutDetailsBankAccount {
  account_holder_name?: string;
  sort_code_masked?: string;
  account_number_last4?: string;
  iban_masked?: string | null;
  has_bank_account: boolean;
}

export interface PartnerPayoutDetails {
  pending_commission: number;
  stripe_connect_account_id: string | null;
  bank_account: PartnerPayoutDetailsBankAccount | null;
}

export interface PartnerPayoutUpdateRequest {
  stripe_connect_account_id?: string;
  account_holder_name?: string;
  sort_code?: string;
  account_number?: string;
  iban?: string;
}

export interface CreatePayoutRequestResponse {
  message: string;
  amount_requested: number;
}

export interface PartnerPayoutHistoryItem {
  id: string;
  amount_requested: number;
  status: string;
  requested_at: string;
  paid_at: string | null;
}

export interface PartnerPayoutHistoryResponse {
  payout_requests: PartnerPayoutHistoryItem[];
}

const partnerApi = createApi({
  reducerPath: "partnerApi",
  baseQuery: axiosBaseQuery(),
  endpoints: (builder) => ({
    getPartnerDashboard: builder.query<PartnerDashboardResponse, void>({
      query: () => ({
        url: "/api/v1/partner/get_dashboard/",
        method: "GET",
      }),
    }),
    getPartnerInvoices: builder.query<InvoiceListResponse, void>({
      query: () => ({
        url: "/api/v1/partner/get_invoices/",
        method: "GET",
      }),
    }),
    getPartnerPayoutDetails: builder.query<PartnerPayoutDetails, void>({
      query: () => ({
        url: "/api/v1/partner/get_payout_details/",
        method: "GET",
      }),
      providesTags: [{ type: "PartnerPayoutDetails", id: "PARTNER_PAYOUT" }],
    }),
    getPartnerPayoutHistory: builder.query<PartnerPayoutHistoryResponse, void>({
      query: () => ({
        url: "/api/v1/partner/get_payout_history/",
        method: "GET",
      }),
      providesTags: [{ type: "PartnerPayoutHistory", id: "PARTNER_PAYOUT_HISTORY" }],
    }),
    updatePartnerPayoutDetails: builder.mutation<
      PartnerPayoutDetails,
      PartnerPayoutUpdateRequest
    >({
      query: (data) => ({
        url: "/api/v1/partner/update_payout_details/",
        method: "PATCH",
        data,
      }),
      invalidatesTags: [{ type: "PartnerPayoutDetails", id: "PARTNER_PAYOUT" }],
    }),
    createPayoutRequest: builder.mutation<
      CreatePayoutRequestResponse,
      void
    >({
      query: () => ({
        url: "/api/v1/partner/create_payout_request/",
        method: "POST",
      }),
      invalidatesTags: [
        { type: "PartnerPayoutDetails", id: "PARTNER_PAYOUT" },
        { type: "PartnerPayoutHistory", id: "PARTNER_PAYOUT_HISTORY" },
      ],
    }),
  }),
  tagTypes: ["PartnerPayoutDetails", "PartnerPayoutHistory"],
});

export const {
  useGetPartnerDashboardQuery,
  useGetPartnerInvoicesQuery,
  useGetPartnerPayoutDetailsQuery,
  useGetPartnerPayoutHistoryQuery,
  useUpdatePartnerPayoutDetailsMutation,
  useCreatePayoutRequestMutation,
} = partnerApi;
export default partnerApi;
