/**
 * Service history API: get service history, get booking images.
 */
import { createApi } from "@reduxjs/toolkit/query/react";
import axiosBaseQuery from "@/app/store/baseQuery";
import { MyServiceHistoryProps } from "@/app/interfaces/ProfileInterfaces";

const serviceHistoryApi = createApi({
  reducerPath: "serviceHistoryApi",
  baseQuery: axiosBaseQuery(),
  tagTypes: ["ServiceHistory"],
  endpoints: (builder) => ({
    /**
     * Fetch all service history for the authenticated user.
     * Returns completed and cancelled bookings ordered by appointment date (most recent first).
     * @returns MyServiceHistoryProps[] - Array of service history items
     */
    getServiceHistory: builder.query<MyServiceHistoryProps[], void>({
      query: () => ({
        url: "/api/v1/service-history/get_service_history/",
        method: "GET",
      }),
      providesTags: ["ServiceHistory"],
      transformResponse: (response: {
        service_history: MyServiceHistoryProps[];
      }) => response.service_history,
    }),

    /**
     * Fetch all before/after images for a specific booking
     * ARGS : { booking_id: string }
     * RESPONSE : {
     *   booking_reference: string
     *   before_images_interior: Array<{ id: number; image_url: string; created_at: string }>
     *   before_images_exterior: Array<{ id: number; image_url: string; created_at: string }>
     *   after_images_interior: Array<{ id: number; image_url: string; created_at: string }>
     *   after_images_exterior: Array<{ id: number; image_url: string; created_at: string }>
     *   event_data_management: object | null
     *   access_denied?: boolean
     *   message?: string
     * }
     */
    fetchBookingImages: builder.query<
      {
        booking_reference: string;
        before_images_interior: Array<{
          id: number;
          image_url: string;
          created_at: string;
        }>;
        before_images_exterior: Array<{
          id: number;
          image_url: string;
          created_at: string;
        }>;
        after_images_interior: Array<{
          id: number;
          image_url: string;
          created_at: string;
        }>;
        after_images_exterior: Array<{
          id: number;
          image_url: string;
          created_at: string;
        }>;
        event_data_management?: any;
        access_denied?: boolean;
        message?: string;
      },
      { booking_id: string }
    >({
      query: ({ booking_id }) => ({
        url: `/api/v1/service-history/get_booking_images/`,
        method: "GET",
        params: { booking_id },
      }),
    }),
  }),
});

export const { useGetServiceHistoryQuery, useFetchBookingImagesQuery } = serviceHistoryApi;
export default serviceHistoryApi;
