/**
 * Fleet subscription API: plans, current subscription, create/cancel, billing history, setup intent, update payment method.
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
  GetCurrentSubscriptionResponse,
  GetBillingHistoryResponse,
} from "@/app/interfaces/SubscriptionInterfaces";

const subscriptionApi = createApi({
  reducerPath: "subscriptionApi",
  baseQuery: axiosBaseQuery(),
  tagTypes: ["Subscription", "Plans", "Billing"],
  endpoints: (builder) => ({
    /**
     * Get all active subscription tiers/plans
     */
    getSubscriptionPlans: builder.query<SubscriptionTierProps[], void>({
      query: () => ({
        url: "/api/v1/subscription/get_plans/",
        method: "GET",
      }),
      providesTags: ["Plans"],
      transformResponse: (response: GetPlansResponse) => response.plans,
    }),

    /**
     * Get current subscription for the fleet owner's fleet
     */
    getCurrentSubscription: builder.query<GetCurrentSubscriptionResponse, void>({
      query: () => ({
        url: "/api/v1/subscription/get_current_subscription/",
        method: "GET",
      }),
      providesTags: ["Subscription"],
    }),

    /**
     * Create a new subscription for the fleet
     */
    createSubscription: builder.mutation<
      CreateSubscriptionResponse,
      CreateSubscriptionRequest
    >({
      query: (data) => ({
        url: "/api/v1/subscription/create_subscription/",
        method: "POST",
        data,
      }),
      invalidatesTags: ["Subscription", "Billing"],
    }),

    /**
     * Get billing history for the fleet
     */
    getSubscriptionBillingHistory: builder.query<
      SubscriptionBillingProps[],
      void
    >({
      query: () => ({
        url: "/api/v1/subscription/get_subscription_billing_history/",
        method: "GET",
      }),
      providesTags: ["Billing"],
      transformResponse: (response: GetBillingHistoryResponse) =>
        response.billing_history,
    }),

    /**
     * Cancel subscription
     */
    cancelSubscription: builder.mutation<
      { message: string; cancel_at_period_end: boolean },
      { cancel_at_period_end?: boolean }
    >({
      query: (data) => ({
        url: "/api/v1/subscription/cancel_subscription/",
        method: "POST",
        data,
      }),
      invalidatesTags: ["Subscription"],
    }),

    /**
     * Update payment method
     */
    updatePaymentMethod: builder.mutation<
      { message: string },
      { payment_method_id: string }
    >({
      query: (data) => ({
        url: "/api/v1/subscription/update_payment_method/",
        method: "POST",
        data,
      }),
      invalidatesTags: ["Subscription"],
    }),

    /**
     * Get SetupIntent for updating payment method
     */
    getSetupIntent: builder.query<
      { setupIntent: string; ephemeralKey: string; customer: string },
      void
    >({
      query: () => ({
        url: "/api/v1/subscription/get_setup_intent/",
        method: "GET",
      }),
    }),
  }),
});

export const {
  useGetSubscriptionPlansQuery,
  useGetCurrentSubscriptionQuery,
  useCreateSubscriptionMutation,
  useGetSubscriptionBillingHistoryQuery,
  useCancelSubscriptionMutation,
  useUpdatePaymentMethodMutation,
  useGetSetupIntentQuery,
  useLazyGetSetupIntentQuery,
} = subscriptionApi;

export default subscriptionApi;
