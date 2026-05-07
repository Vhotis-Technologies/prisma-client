/**
 * B2C (consumer) subscription API: mirrors fleet subscription endpoints under /api/v1/b2c-subscription/.
 */
import { createApi } from "@reduxjs/toolkit/query/react";
import axiosBaseQuery from "@/app/store/baseQuery";
import {
  SubscriptionTierProps,
  FleetSubscriptionProps,
  SubscriptionBillingProps,
  CreateSubscriptionRequest,
  CreateSubscriptionResponse,
  GetPlansResponse,
  GetBillingHistoryResponse,
} from "@/app/interfaces/SubscriptionInterfaces";

/** Backend shape for GET b2c-subscription/get_current_subscription/ */
export interface GetB2cCurrentSubscriptionResponse {
  subscription: FleetSubscriptionProps | null;
}

const b2cSubscriptionApi = createApi({
  reducerPath: "b2cSubscriptionApi",
  baseQuery: axiosBaseQuery(),
  tagTypes: ["B2cSubscription", "B2cPlans", "B2cBilling"],
  endpoints: (builder) => ({
    getB2cSubscriptionPlans: builder.query<SubscriptionTierProps[], void>({
      query: () => ({
        url: "/api/v1/b2c-subscription/get_plans/",
        method: "GET",
      }),
      providesTags: ["B2cPlans"],
      transformResponse: (response: GetPlansResponse) => response.plans,
    }),

    getB2cCurrentSubscription: builder.query<GetB2cCurrentSubscriptionResponse, void>({
      query: () => ({
        url: "/api/v1/b2c-subscription/get_current_subscription/",
        method: "GET",
      }),
      providesTags: ["B2cSubscription"],
    }),

    createB2cSubscription: builder.mutation<
      CreateSubscriptionResponse,
      CreateSubscriptionRequest
    >({
      query: (data) => ({
        url: "/api/v1/b2c-subscription/create_subscription/",
        method: "POST",
        data,
      }),
      invalidatesTags: ["B2cSubscription", "B2cBilling"],
    }),

    getB2cBillingHistory: builder.query<SubscriptionBillingProps[], void>({
      query: () => ({
        url: "/api/v1/b2c-subscription/get_subscription_billing_history/",
        method: "GET",
      }),
      providesTags: ["B2cBilling"],
      transformResponse: (response: GetBillingHistoryResponse) =>
        response.billing_history,
    }),

    cancelB2cSubscription: builder.mutation<
      { message: string },
      { cancel_at_period_end?: boolean; cancellationReason?: string }
    >({
      query: (data) => ({
        url: "/api/v1/b2c-subscription/cancel_subscription/",
        method: "POST",
        data,
      }),
      invalidatesTags: ["B2cSubscription"],
    }),

    updateB2cPaymentMethod: builder.mutation<
      { message: string },
      { payment_method_id: string }
    >({
      query: (data) => ({
        url: "/api/v1/b2c-subscription/update_payment_method/",
        method: "POST",
        data,
      }),
      invalidatesTags: ["B2cSubscription"],
    }),

    getB2cSetupIntent: builder.query<
      { setupIntent: string; ephemeralKey: string; customer: string },
      void
    >({
      query: () => ({
        url: "/api/v1/b2c-subscription/get_setup_intent/",
        method: "GET",
      }),
    }),
  }),
});

export const {
  useGetB2cSubscriptionPlansQuery,
  useGetB2cCurrentSubscriptionQuery,
  useCreateB2cSubscriptionMutation,
  useGetB2cBillingHistoryQuery,
  useCancelB2cSubscriptionMutation,
  useUpdateB2cPaymentMethodMutation,
  useGetB2cSetupIntentQuery,
  useLazyGetB2cSetupIntentQuery,
} = b2cSubscriptionApi;

export default b2cSubscriptionApi;
