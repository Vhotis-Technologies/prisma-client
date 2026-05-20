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
    /** Active consumer subscription tiers/plans. */
    getB2cSubscriptionPlans: builder.query<SubscriptionTierProps[], void>({
      query: () => ({
        url: "/api/v1/b2c-subscription/get_plans/",
        method: "GET",
      }),
      providesTags: ["B2cPlans"],
      transformResponse: (response: GetPlansResponse) => response.plans,
    }),

    /** Current B2C subscription for the authenticated user (or null). */
    getB2cCurrentSubscription: builder.query<GetB2cCurrentSubscriptionResponse, void>({
      query: () => ({
        url: "/api/v1/b2c-subscription/get_current_subscription/",
        method: "GET",
      }),
      providesTags: ["B2cSubscription"],
    }),

    /** Start or upgrade a B2C subscription (returns Stripe payment sheet when due). */
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

    /** Past B2C subscription invoices/charges. */
    getB2cBillingHistory: builder.query<SubscriptionBillingProps[], void>({
      query: () => ({
        url: "/api/v1/b2c-subscription/get_subscription_billing_history/",
        method: "GET",
      }),
      providesTags: ["B2cBilling"],
      transformResponse: (response: GetBillingHistoryResponse) =>
        response.billing_history,
    }),

    /** Cancel B2C subscription (immediate or at period end). */
    cancelB2cSubscription: builder.mutation<
      { message: string },
      { cancel_at_period_end?: boolean; cancellationReason?: string }
    >({
      query: (data) => ({
        url: "/api/v1/b2c-subscription/cancel_subscription/",
        method: "POST",
        data,
      }),
      invalidatesTags: ["B2cSubscription", "B2cBilling"],
    }),

    /** Discard incomplete checkout subscription after canceled payment. */
    abandonIncompleteB2cSubscription: builder.mutation<
      { message: string },
      { subscriptionId?: string } | void
    >({
      query: (data) => ({
        url: "/api/v1/b2c-subscription/abandon_incomplete_subscription/",
        method: "POST",
        data: data && typeof data === "object" ? data : {},
      }),
      invalidatesTags: ["B2cSubscription", "B2cBilling"],
    }),

    /** Attach a new default payment method to the B2C subscription. */
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

    /** Stripe SetupIntent for updating B2C subscription payment method. */
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
  useAbandonIncompleteB2cSubscriptionMutation,
  useUpdateB2cPaymentMethodMutation,
  useGetB2cSetupIntentQuery,
  useLazyGetB2cSetupIntentQuery,
} = b2cSubscriptionApi;

export default b2cSubscriptionApi;
