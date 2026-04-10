/**
 * RTK Query API for booking, payment sheet, promotions, cancel/reschedule, and payment methods.
 *
 * Key endpoints: fetchPaymentSheetDetails (create_payment_sheet), confirmPaymentIntent (poll until webhook),
 * fetchServiceType, fetchValetType, fetchAddOns, cancelBooking, rescheduleBooking, checkFreeWash,
 * createBulkOrderInvoiceLater. See docs/BOOKING_FLOW.md for the booking and payment flow.
 */
import { createApi } from "@reduxjs/toolkit/query/react";
import axiosBaseQuery from "../baseQuery";
import {
  BookingScreenProps,
  ServiceTypeProps,
  ValetTypeProps,
  AddOnsProps,
  PaymentSheetResponse,
  CreateBookingProps,
  BookedAppointmentProps,
} from "@/app/interfaces/BookingInterfaces";
import { PromotionsProps } from "@/app/interfaces/GarageInterface";

// PaymentMethod interface for saved payment methods
export interface PaymentMethod {
  id: string;
  type: string;
  card: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };
}

const createBookingApi = createApi({
  reducerPath: "bookingApi",
  baseQuery: axiosBaseQuery(),
  endpoints: (builder) => ({
    /**
     * Fetch the service types defined by the admin on the server.
     * ARGS : void
     * RESPONSE : ServiceTypeProps[]
     * {
     *  id : string
     *  name : string
     *  description : string[]
     *  price : number
     *  duration : number
     * }
     */
    fetchServiceType: builder.query<ServiceTypeProps[], void>({
      query: () => ({
        url: "/api/v1/events/get_service_type/",
        method: "GET",
      }),
    }),
    /**
     * Fetch all vallet type which are the type of washes a user prefers to have
     * ARGS : void
     * RESPONSE : ValetTypeProps[]
     * {
     *  id : string
     *  name : string
     *  description : string
     * }
     * This would either be a steam wash, a regular water based wash or a no water wash
     */
    fetchValetType: builder.query<ValetTypeProps[], void>({
      query: () => ({
        url: "/api/v1/events/get_valet_type/",
        method: "GET",
      }),
    }),

    /**
     * Book the appointment for the client.
     * ARGS : BookedAppointmentProps
     * RESPONSE : {
     *  appointment_id: string
     *  success: boolean
     * }
     */
    bookAppointment: builder.mutation<
      { appointment_id: string },
      BookedAppointmentProps
    >({
      query: (data) => ({
        url: "/api/v1/events/book_appointment/",
        method: "POST",
        data: { booking_data: data },
      }),
    }),

    /**
     * Fetch the add ons for the user to choose from
     * ARGS : void
     * RESPONSE : AddOnsProps[]
     * {
     *  id : string
     *  name : string
     *  price : number
     *  description : string
     *  extra_duration : number
     * }
     */
    fetchAddOns: builder.query<AddOnsProps[], void>({
      query: () => ({
        url: "/api/v1/events/get_add_ons/",
        method: "GET",
      }),
      transformResponse: (response: AddOnsProps[]) => {
        return response;
      },
    }),

    /**
     * Cancel a booking for the user.
     * ARGS : void
     * RESPONSE : { message: string, booking_status: string, refund: any, hours_until_appointment: number } | string
     * QUERY_PARAMS : booking_id : string
     */
    cancelBooking: builder.mutation<
      | {
          message: string;
          booking_status: string;
          refund: any;
          hours_until_appointment: number;
        }
      | string,
      string
    >({
      query: (booking_reference) => ({
        url: `/api/v1/events/cancel_booking/`,
        method: "PATCH",
        data: { booking_reference },
      }),
    }),

    /**
     * Reschedule a booking for the user.
     * ARGS : void
     * RESPONSE : void
     * QUERY_PARAMS : booking_id : string
     * {
     *  service_type : string
     *  valet_type : string
     *  booking_date : string
     *  special_instructions : string
     * }
     */
    rescheduleBooking: builder.mutation<
      string,
      {
        new_date: string;
        new_time: string;
        booking_id: string;
      }
    >({
      query: (data) => ({
        url: `/api/v1/events/reschedule_booking/`,
        method: "PATCH",
        data: { data },
      }),
    }),

    /**
     * Fetch the payment sheet details from the server.
     * ARGS : { amount: number (in cents), booking_reference: string, booking_data: any, detailer_booking_data?: any }
     * RESPONSE : PaymentSheetResponse & { paymentIntentId: string, booking_reference: string }
     * {
     *  paymentIntent: string
     *  ephemeralKey: string
     *  customer: string
     *  paymentIntentId: string
     *  booking_reference: string
     * }
     */
    fetchPaymentSheetDetails: builder.mutation<
      (PaymentSheetResponse & {
        paymentIntentId: string;
        booking_reference: string;
      }) & {
        free_booking?: boolean;
        success?: boolean;
        appointment_id?: string;
      },
      {
        amount: number;
        booking_reference: string;
        booking_data: any; // Full booking data for client app
        detailer_booking_data?: any; // Formatted data for detailer app
      }
    >({
      query: (data) => ({
        url: "/api/v1/payment/create_payment_sheet/",
        method: "POST",
        data: {
          amount: data.amount,
          booking_reference: data.booking_reference,
          booking_data: data.booking_data,
          detailer_booking_data: data.detailer_booking_data,
        },
      }),
    }),

    /**
     * Confirm payment intent has been processed via webhook
     * ARGS : { payment_intent_id: string }
     * RESPONSE : { confirmed: boolean, payment_intent_id: string, transaction_id?: string, booking_reference?: string }
     */
    confirmPaymentIntent: builder.mutation<
      {
        confirmed: boolean;
        payment_intent_id: string;
        transaction_id?: string;
        booking_reference?: string;
      },
      { payment_intent_id: string }
    >({
      query: (data) => ({
        url: "/api/v1/payment/confirm_payment_intent/",
        method: "POST",
        data: {
          payment_intent_id: data.payment_intent_id,
        },
      }),
    }),

    /**
     * Validate winner / contest voucher code (must match account linked in admin).
     */
    applyWinnerVoucher: builder.mutation<
      {
        valid: boolean;
        voucher_id: string;
        credit_amount: number;
        discount_applied: number;
        pre_voucher_total: number;
        amount_due: number;
        amount_due_cents: number;
      },
      { code: string; pre_voucher_total_amount: number }
    >({
      query: (data) => ({
        url: "/api/v1/payment/apply_winner_voucher/",
        method: "POST",
        data: {
          code: data.code,
          pre_voucher_total_amount: data.pre_voucher_total_amount,
        },
      }),
    }),

    /* Get the promotions for the user */
    fetchPromotions: builder.query<PromotionsProps | null, void>({
      query: () => ({
        url: "/api/v1/events/get_promotions/",
        method: "GET",
      }),
      transformResponse: (response: PromotionsProps | null) => response,
    }),

    /**
     * Mark a promotion as used
     * ARGS : { promotion_id: string, booking_reference: string }
     * RESPONSE : { message: string }
     */
    markPromotionAsUsed: builder.mutation<
      { message: string },
      { promotion_id: string; booking_reference: string }
    >({
      query: (data) => ({
        url: "/api/v1/events/mark_promotion_used/",
        method: "POST",
        data: {
          promotion_id: data.promotion_id,
          booking_reference: data.booking_reference,
        },
      }),
    }),

    /**
     * Get saved payment methods for the user
     * ARGS : void
     * RESPONSE : PaymentMethod[]
     * {
     *  id: string
     *  type: string
     *  card: {
     *    brand: string
     *    last4: string
     *    exp_month: number
     *    exp_year: number
     *  }
     * }
     */
    getPaymentMethods: builder.query<PaymentMethod[], void>({
      query: () => ({
        url: "/api/v1/events/get_payment_methods/",
        method: "GET",
      }),
      transformResponse: (response: { payment_methods: PaymentMethod[] }) => {
        return response.payment_methods || [];
      },
    }),

    /**
     * Create bulk order with Stripe invoice sent to user email; booking is sent to detailer.
     * ARGS : { booking_data: object (is_bulk, service_type, address, date, number_of_vehicles, total_amount, etc.) }
     * RESPONSE : { success: boolean, booking_reference: string, bulk_order_id: number, message?: string }
     */
    createBulkOrderInvoiceLater: builder.mutation<
      { success: boolean; booking_reference: string; bulk_order_id: number; message?: string },
      { booking_data: Record<string, unknown>; booking_reference?: string }
    >({
      query: (data) => ({
        url: "/api/v1/payment/create_bulk_order_invoice_later/",
        method: "POST",
        data: {
          booking_data: data.booking_data,
          booking_reference: data.booking_reference,
        },
      }),
    }),

    /**
     * Delete a saved payment method
     * ARGS : { payment_method_id: string }
     * RESPONSE : { message: string }
     */
    deletePaymentMethod: builder.mutation<
      { message: string },
      { payment_method_id: string }
    >({
      query: (data) => ({
        url: "/api/v1/events/delete_payment_method/",
        method: "DELETE",
        data: { payment_method_id: data.payment_method_id },
      }),
    }),

    /**
     * Check if user can use a free Quick Sparkle (loyalty or partner referral)
     * ARGS : void
     * RESPONSE : {
     *   can_use_free_wash: boolean
     *   remaining_quick_sparkles: number
     *   total_monthly_limit: number
     *   resets_in_days: number
     *   free_wash_source?: 'loyalty' | 'partner'
     *   partner_free_wash?: boolean
     * }
     */
    checkFreeWash: builder.query<
      {
        can_use_free_wash: boolean;
        remaining_quick_sparkles: number;
        total_monthly_limit: number;
        resets_in_days: number;
        free_wash_source?: "loyalty" | "partner";
        partner_free_wash?: boolean;
      },
      void
    >({
      query: () => ({
        url: "/api/v1/events/check_free_wash/",
        method: "GET",
      }),
    }),

    /** Hosted Stripe invoice URL and payment sync for bulk (pay-later) orders. */
    getBulkInvoiceCheckout: builder.query<
      {
        bulk_order_id: string;
        booking_reference: string;
        number_of_vehicles: number;
        total_amount: number;
        currency: string;
        payment_status: string;
        already_paid: boolean;
        hosted_invoice_url: string | null;
        invoice_status: string | null;
        amount_due_cents: number;
        error?: string;
      },
      string
    >({
      query: (bulkOrderId) => ({
        url: "/api/v1/payment/get_bulk_invoice_checkout/",
        method: "GET",
        params: { bulk_order_id: bulkOrderId },
      }),
    }),
  }),
});
export const {
  useFetchServiceTypeQuery,
  useFetchValetTypeQuery,
  useBookAppointmentMutation,
  useCancelBookingMutation,
  useRescheduleBookingMutation,
  useFetchAddOnsQuery,
  useFetchPaymentSheetDetailsMutation,
  useFetchPromotionsQuery,
  useMarkPromotionAsUsedMutation,
  useGetPaymentMethodsQuery,
  useDeletePaymentMethodMutation,
  useCheckFreeWashQuery,
  useLazyCheckFreeWashQuery,
  useConfirmPaymentIntentMutation,
  useCreateBulkOrderInvoiceLaterMutation,
  useApplyWinnerVoucherMutation,
  useLazyGetBulkInvoiceCheckoutQuery,
} = createBookingApi;
export default createBookingApi;
