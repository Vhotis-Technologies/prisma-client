/**
 * Fleet API: branches, branch admins, fleet dashboard, branch vehicles/spend, vehicle bookings, bulk orders.
 */
import { createApi } from "@reduxjs/toolkit/query/react";
import axiosBaseQuery from "../baseQuery";
import {
  BranchProps,
  FleetDashboardStats,
  BranchAdminCreateProps,
  BranchVehiclesResponse,
  BranchSpendResponse,
  VehicleBookingsResponse,
  BranchAdminsResponse,
  BranchBulkOrdersResponse,
  FleetAdminsResponse,
  FleetAdmin,
  UpdateBranchAdminProps,
} from "@/app/interfaces/FleetInterfaces";
import { InvoiceListResponse } from "@/app/interfaces/InvoiceInterfaces";

const fleetApi = createApi({
  reducerPath: "fleetApi",
  baseQuery: axiosBaseQuery(),
  tagTypes: ["FleetAdmins", "BranchAdmins"],
  endpoints: (builder) => ({
    /**
     * Create a new branch for the fleet
     * ARGS: { name: string, address?: string, postcode?: string, city?: string, country?: string }
     * RESPONSE: { message: string, branch: BranchProps }
     */
    createBranch: builder.mutation<
      { message: string; branch: BranchProps },
      { name: string; address?: string; postcode?: string; city?: string; country?: string; latitude?: number; longitude?: number }
    >({
      query: (data) => ({
        url: "/api/v1/fleet/create_branch/",
        method: "POST",
        data,
      }),
    }),

    /**
     * Get all branches for the fleet
     * ARGS: void
     * RESPONSE: { branches: BranchProps[] }
     */
    getBranches: builder.query<{ branches: BranchProps[] }, void>({
      query: () => ({
        url: "/api/v1/fleet/get_branches/",
        method: "GET",
      }),
    }),

    /**
     * Invite a branch admin (they set their own password via email link).
     * ARGS: BranchAdminCreateProps (no password)
     * RESPONSE: { message, email_sent, invite_pending, admin }
     */
    createBranchAdmin: builder.mutation<
      {
        message: string;
        email_sent: boolean;
        invite_pending: boolean;
        admin: {
          id: string;
          name: string;
          email: string;
          phone: string;
          branch_id: string;
          branch_name: string;
          invite_pending: boolean;
        };
      },
      BranchAdminCreateProps
    >({
      query: (data) => ({
        url: "/api/v1/fleet/create_branch_admin/",
        method: "POST",
        data,
      }),
      invalidatesTags: ["FleetAdmins", "BranchAdmins"],
    }),

    /**
     * Get fleet dashboard data
     * ARGS: { start_date?: string, end_date?: string } | void
     * RESPONSE: FleetDashboardStats
     */
    getFleetDashboard: builder.query<
      FleetDashboardStats,
      { start_date?: string; end_date?: string } | void
    >({
      query: (params) => {
        const queryParams: Record<string, string> = {};
        if (params && typeof params === "object") {
          if (params.start_date) {
            queryParams.start_date = params.start_date;
          }
          if (params.end_date) {
            queryParams.end_date = params.end_date;
          }
        }
        return {
          url: "/api/v1/fleet/get_fleet_dashboard/",
          method: "GET",
          params: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        };
      },
      transformResponse: (response: FleetDashboardStats) => response,
    }),

    /**
     * Get vehicles for a specific branch
     * ARGS: { branch_id: string }
     * RESPONSE: BranchVehiclesResponse
     */
    getBranchVehicles: builder.query<
      BranchVehiclesResponse,
      { branch_id: string }
    >({
      query: ({ branch_id }) => ({
        url: `/api/v1/fleet/get_branch_vehicles/${branch_id}/`,
        method: "GET",
      }),
    }),

    /**
     * Update a branch
     * ARGS: { branch_id: string, name?: string, address?: string, postcode?: string, city?: string, country?: string, spend_limit?: number, spend_limit_period?: 'weekly'|'monthly' }
     * RESPONSE: { message: string, branch: BranchProps }
     */
    updateBranch: builder.mutation<
      { message: string; branch: BranchProps },
      {
        branch_id: string;
        name?: string;
        address?: string;
        postcode?: string;
        city?: string;
        country?: string;
        latitude?: number;
        longitude?: number;
        spend_limit?: number;
        spend_limit_period?: "weekly" | "monthly";
      }
    >({
      query: (data) => ({
        url: `/api/v1/fleet/update_branch/${data.branch_id}/`,
        method: "PATCH",
        data,
      }),
    }),

    /**
     * Get branch spend (limit, spent, remaining). Fleet owner: pass branch_id. Branch admin: no args.
     * RESPONSE: BranchSpendResponse
     */
    getBranchSpend: builder.query<
      BranchSpendResponse,
      { branch_id?: string } | void
    >({
      query: (arg) => ({
        url: "/api/v1/fleet/get_branch_spend/",
        method: "GET",
        params: arg && typeof arg === "object" && arg.branch_id
          ? { branch_id: arg.branch_id }
          : undefined,
      }),
    }),

    /**
     * Delete a branch
     * ARGS: { branch_id: string }
     * RESPONSE: { message: string }
     */
    deleteBranch: builder.mutation<
      { message: string },
      { branch_id: string }
    >({
      query: ({ branch_id }) => ({
        url: `/api/v1/fleet/delete_branch/${branch_id}/`,
        method: "DELETE",
      }),
    }),

    /**
     * Get bookings for a specific vehicle (last 90 days)
     * ARGS: { vehicle_id: string }
     * RESPONSE: VehicleBookingsResponse
     */
    getVehicleBookings: builder.query<
      VehicleBookingsResponse,
      { vehicle_id: string }
    >({
      query: ({ vehicle_id }) => ({
        url: `/api/v1/fleet/get_vehicle_bookings/${vehicle_id}/`,
        method: "GET",
      }),
    }),

    /**
     * Get branch admins for a specific branch
     * ARGS: { branch_id: string }
     * RESPONSE: BranchAdminsResponse
     */
    getBranchAdmins: builder.query<
      BranchAdminsResponse,
      { branch_id: string }
    >({
      query: ({ branch_id }) => ({
        url: `/api/v1/fleet/get_branch_admins/${branch_id}/`,
        method: "GET",
      }),
      providesTags: (_result, _error, arg) => [
        { type: "BranchAdmins", id: arg.branch_id },
      ],
    }),

    /**
     * Get bulk orders for a specific branch
     * ARGS: { branch_id: string }
     * RESPONSE: BranchBulkOrdersResponse
     */
    getBranchBulkOrders: builder.query<
      BranchBulkOrdersResponse,
      { branch_id: string }
    >({
      query: ({ branch_id }) => ({
        url: `/api/v1/fleet/get_branch_bulk_orders/${branch_id}/`,
        method: "GET",
      }),
    }),

    /**
     * Get invoice list for the authenticated fleet owner.
     * Includes paid/unpaid invoice states and creator metadata.
     */
    getFleetInvoices: builder.query<InvoiceListResponse, void>({
      query: () => ({
        url: "/api/v1/fleet/get_invoices/",
        method: "GET",
      }),
    }),

    /**
     * Get all branch admins for the fleet (fleet owner only)
     * RESPONSE: FleetAdminsResponse
     */
    getFleetAdmins: builder.query<FleetAdminsResponse, void>({
      query: () => ({
        url: "/api/v1/fleet/get_fleet_admins/",
        method: "GET",
      }),
      providesTags: ["FleetAdmins"],
    }),

    /**
     * Update a branch admin (name, phone, optional branch_id). Fleet owner only.
     * ARGS: UpdateBranchAdminProps
     */
    updateBranchAdmin: builder.mutation<
      { message: string; admin: FleetAdmin },
      UpdateBranchAdminProps
    >({
      query: (data) => ({
        url: "/api/v1/fleet/update_branch_admin/",
        method: "PATCH",
        data,
      }),
      invalidatesTags: ["FleetAdmins", "BranchAdmins"],
    }),

    /**
     * Remove a branch admin from the fleet. Fleet owner only.
     * ARGS: { admin_id: string }
     */
    removeBranchAdmin: builder.mutation<
      { message: string },
      { admin_id: string }
    >({
      query: ({ admin_id }) => ({
        url: "/api/v1/fleet/remove_branch_admin/",
        method: "DELETE",
        data: { admin_id },
      }),
      invalidatesTags: ["FleetAdmins", "BranchAdmins"],
    }),

    /**
     * Resend the set-password invite for a pending branch admin. Fleet owner only.
     * ARGS: { admin_id: string }
     */
    resendInvite: builder.mutation<
      { message: string; email_sent: boolean; admin_id: string },
      { admin_id: string }
    >({
      query: (data) => ({
        url: "/api/v1/fleet/resend_invite/",
        method: "POST",
        data,
      }),
      invalidatesTags: ["FleetAdmins", "BranchAdmins"],
    }),

    /**
     * Cancel a bulk order (full refund when >=12h before job start).
     * ARGS: { bulk_order_id?: string, booking_reference?: string }
     */
    cancelBulkOrder: builder.mutation<
      { message: string; refund_amount?: number },
      { bulk_order_id?: string; booking_reference?: string }
    >({
      query: (data) => ({
        url: "/api/v1/fleet/cancel_bulk_order/",
        method: "POST",
        data,
      }),
    }),

    /**
     * Reschedule a bulk order to a new date/window (only when >=12h before current job start).
     * ARGS: { bulk_order_id?: string, booking_reference?: string, new_date: string, start_time?: string, end_time?: string, number_of_vehicles?: number, suggested_team_size?: number }
     */
    rescheduleBulkOrder: builder.mutation<
      { message: string; new_slots?: Array<{ booking_reference: string; appointment_date: string; appointment_time: string; detailer_id: string }> },
      {
        bulk_order_id?: string;
        booking_reference?: string;
        new_date: string;
        start_time?: string;
        end_time?: string;
        number_of_vehicles?: number;
        suggested_team_size?: number;
      }
    >({
      query: (data) => ({
        url: "/api/v1/fleet/reschedule_bulk_order/",
        method: "POST",
        data,
      }),
    }),
  }),
});

export const {
  useCreateBranchMutation,
  useGetBranchesQuery,
  useCreateBranchAdminMutation,
  useGetFleetDashboardQuery,
  useGetBranchVehiclesQuery,
  useGetBranchSpendQuery,
  useUpdateBranchMutation,
  useDeleteBranchMutation,
  useGetVehicleBookingsQuery,
  useGetBranchAdminsQuery,
  useGetBranchBulkOrdersQuery,
  useGetFleetInvoicesQuery,
  useGetFleetAdminsQuery,
  useUpdateBranchAdminMutation,
  useRemoveBranchAdminMutation,
  useResendInviteMutation,
  useCancelBulkOrderMutation,
  useRescheduleBulkOrderMutation,
} = fleetApi;

export default fleetApi;
