/**
 * Dashboard API: user stats, upcoming appointments, recent services, cancel, submit review, detailer location.
 */
import { createApi } from "@reduxjs/toolkit/query/react";
import axiosBaseQuery from "@/app/store/baseQuery";
import UpcomingAppointmentProps, {
  PerksSummaryResponse,
  RecentServicesProps,
  UserStatsResponse,
} from "@/app/interfaces/DashboardInterfaces";

/** Optional scope for GET get_upcoming_appointments (e.g. fleet owner’s own bookings only). */
export type FetchOngoingAppointmentsArg = void | { scope: "my_bookings" };

export const dashboardApi = createApi({
  reducerPath: "dashboardApi",
  baseQuery: axiosBaseQuery(),
  endpoints: (builder) => ({
    /**
     * Fetch the user's stats
     * @returns {UserStatsResponse}
     */
    fetchUserStats: builder.query<UserStatsResponse, void>({
      query: () => ({
        url: "/api/v1/dashboard/get_user_stats/",
        method: "GET",
      }),
    }),
    /**
     * Upcoming appointments. Pass { scope: "my_bookings" } so branch admins / fleet users only see
     * bookings tied to their own account (not branch-wide manager bookings).
     */
    fetchOngoingAppointments: builder.query<
      UpcomingAppointmentProps[],
      FetchOngoingAppointmentsArg
    >({
      query: (arg) => ({
        url: "/api/v1/dashboard/get_upcoming_appointments/",
        method: "GET",
        params:
          arg && typeof arg === "object" && arg.scope === "my_bookings"
            ? { scope: "my_bookings" }
            : undefined,
      }),
      transformResponse: (response: UpcomingAppointmentProps[]) => response,
    }),

    /**
     * Cancel the appointment
     * @param {appointmentId} - The id of the appointment to cancel
     * @returns {message:string}
     */
    cancelAppointment: builder.mutation<
      { message: string },
      { appointmentId: string }
    >({
      query: ({ appointmentId }) => ({
        url: `/api/v1/dashboard/cancel_appointment/`,
        method: "PATCH",
        data: { appointment_id: appointmentId },
      }),
    }),

    /**
     * Fetch the recent services. Returns null when there is no recent service.
     */
    fetchRecentServices: builder.query<RecentServicesProps | null, void>({
      query: () => ({
        url: "/api/v1/dashboard/get_recent_services/",
        method: "GET",
      }),
      transformResponse: (response: RecentServicesProps | null) => response,
    }),

    submitReview: builder.mutation<
      { message?: string; booking_reference?: string },
      {
        booking_reference: string;
        rating: number;
        /** Optional customer comment (server max 2000 chars). */
        comment?: string;
      }
    >({
      query: (data) => ({
        url: "/api/v1/dashboard/submit_review/",
        method: "PATCH",
        data,
      }),
    }),

    /**
     * Fetch detailer's current location for an appointment (for map view when within ~30 min).
     * Returns nulls when detailer has not reported location or Redis unavailable.
     */
    fetchDetailerLocation: builder.query<
      { latitude: number | null; longitude: number | null },
      string
    >({
      query: (bookingReference) => ({
        url: "/api/v1/dashboard/get_detailer_location/",
        method: "GET",
        params: { booking_reference: bookingReference },
      }),
    }),

    /**
     * Loyalty progress + complimentary subscription wash allowance for the authenticated user.
     * Server returns `loyalty.is_b2c: false` for fleet/branch/partner users so the UI can hide.
     */
    fetchPerksSummary: builder.query<PerksSummaryResponse, void>({
      query: () => ({
        url: "/api/v1/dashboard/get_perks_summary/",
        method: "GET",
      }),
    }),
  }),
});

export const {
  useFetchOngoingAppointmentsQuery,
  useCancelAppointmentMutation,
  useFetchRecentServicesQuery,
  useFetchUserStatsQuery,
  useSubmitReviewMutation,
  useFetchDetailerLocationQuery,
  useLazyFetchDetailerLocationQuery,
  useFetchPerksSummaryQuery,
} = dashboardApi;
export default dashboardApi;
