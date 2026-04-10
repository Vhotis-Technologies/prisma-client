/**
 * VIN lookup API: check VIN exists, get vehicle history, initiate/verify payment for history purchase.
 */
import { createApi } from "@reduxjs/toolkit/query/react";
import { axiosBaseQuery } from "../baseQuery";

export interface VehicleBasicInfo {
  make: string;
  model: string;
  year: number;
  vin: string;
  registration_number: string;
  country: string;
}

export interface VehicleHistoryEvent {
  id: string;
  event_type: "inspection" | "repair" | "service" | "obd_scan" | "damage";
  event_date: string;
  metadata: any;
  visibility: "public" | "private";
  performed_by?: {
    id: string;
    name: string;
  } | null;
}

export interface OwnershipRecord {
  owner_name: string;
  owner_email: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
}

export interface VehicleHistoryResponse {
  requires_payment: boolean;
  vehicle: VehicleBasicInfo & {
    color?: string;
  };
  ownership_history?: OwnershipRecord[];
  events?: VehicleHistoryEvent[];
  total_events?: number;
  purchase?: {
    purchase_reference: string;
    purchased_at: string;
    expires_at: string;
  };
  price?: number;
}

export interface VinExistsResponse {
  exists: boolean;
  vehicle?: VehicleBasicInfo;
  price?: number;
  currency?: string;
  error?: string;
}

export interface VinLookupPaymentResponse {
  paymentIntent: string;
  paymentIntentId: string;
  ephemeralKey: string;
  customer: string;
  purchase_reference: string;
  amount: number;
  currency: string;
}

export interface VinLookupPaymentVerifyResponse {
  status: "succeeded" | "pending" | "failed";
  purchase?: {
    purchase_reference: string;
    purchased_at: string;
    expires_at: string;
    is_valid: boolean;
  };
  vehicle?: {
    vin: string;
    make: string;
    model: string;
    year: number;
  };
  message?: string;
  error?: string;
}

const vinLookupApi = createApi({
  reducerPath: "vinLookupApi",
  baseQuery: axiosBaseQuery(),
  endpoints: (builder) => ({
    /**
     * Check if a VIN exists in the database.
     * Public endpoint - no authentication required.
     * @param vin - The Vehicle Identification Number
     * @returns Basic vehicle info if exists
     */
    checkVinExists: builder.query<VinExistsResponse, string>({
      query: (vin) => ({
        url: `/api/v1/vin-lookup/check_vin_exists/?vin=${encodeURIComponent(vin)}`,
        method: "GET",
      }),
    }),

    /**
     * Get complete vehicle history.
     * Requires valid purchase (payment verified).
     * Supports both registered and unregistered users.
     * @param params - Object with vin (required) and email (required for unregistered users)
     * @returns Vehicle history data or payment requirement
     */
    getVehicleHistory: builder.query<
      VehicleHistoryResponse,
      { vin: string; email?: string }
    >({
      query: ({ vin, email }) => {
        const params = new URLSearchParams({ vin });
        if (email) {
          params.append("email", email);
        }
        return {
          url: `/api/v1/vin-lookup/get_vehicle_history/?${params.toString()}`,
          method: "GET",
        };
      },
    }),

    /**
     * Initiate payment for VIN lookup.
     * Supports both registered and unregistered users.
     * @param params - Object with vin (required) and email (required)
     * @returns Stripe payment sheet details
     */
    initiateVinLookupPayment: builder.mutation<
      VinLookupPaymentResponse,
      { vin: string; email: string }
    >({
      query: ({ vin, email }) => ({
        url: "/api/v1/vin-lookup/initiate_vin_lookup_payment/",
        method: "POST",
        data: { vin, email },
      }),
    }),

    /**
     * Verify payment status for a VIN lookup purchase.
     * Used for polling after payment completion.
     * @param params - Object with purchase_reference (required) and email (required for unregistered users)
     * @returns Payment status and purchase details
     */
    verifyVinLookupPayment: builder.query<
      VinLookupPaymentVerifyResponse,
      { purchase_reference: string; email?: string }
    >({
      query: ({ purchase_reference, email }) => {
        const params = new URLSearchParams({ purchase_reference });
        if (email) {
          params.append("email", email);
        }
        return {
          url: `/api/v1/vin-lookup/verify_vin_lookup_payment/?${params.toString()}`,
          method: "GET",
        };
      },
    }),
  }),
});

export const {
  useCheckVinExistsQuery,
  useLazyCheckVinExistsQuery,
  useGetVehicleHistoryQuery,
  useLazyGetVehicleHistoryQuery,
  useInitiateVinLookupPaymentMutation,
  useVerifyVinLookupPaymentQuery,
  useLazyVerifyVinLookupPaymentQuery,
} = vinLookupApi;

export default vinLookupApi;
