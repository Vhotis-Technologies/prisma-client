/**
 * Stripe payment hook: payment sheet init, booking/reschedule/gift voucher flows, webhook polling.
 */
import { useCallback } from "react";
import { useStripe } from "@stripe/stripe-react-native";
import {
  useFetchPaymentSheetDetailsMutation,
  useConfirmPaymentIntentMutation,
  useCreateRescheduleFeePaymentSheetMutation,
  useCreateGiftVoucherPaymentSheetMutation,
} from "@/app/store/api/eventApi";
import { useAlertContext } from "@/app/contexts/AlertContext";
import { PaymentSheetResponse } from "@/app/interfaces/BookingInterfaces";
import { RootState, useAppSelector } from "../store/main_store";
import { useAddresses } from "./useAddresses";
import { useSnackbar } from "../contexts/SnackbarContext";
import { APP_ENV } from "@/constants/Config";

/**
 * Custom hook for managing payment functionality using Stripe
 *
 * This hook provides a comprehensive interface for handling payment operations,
 * including payment sheet initialization, payment processing, and error handling.
 * It can be used across the application for various payment scenarios like
 * booking payments, subscriptions, etc.
 *
 * Features:
 * - Payment sheet initialization with Stripe
 * - Payment processing with error handling
 * - Support for different currencies and countries
 * - Comprehensive error handling for various payment scenarios
 *
 * @returns Object containing payment methods and utilities
 */
const usePayment = () => {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [fetchPaymentSheetDetails] = useFetchPaymentSheetDetailsMutation();
  const [confirmPaymentIntentMutation] = useConfirmPaymentIntentMutation();
  const [createRescheduleFeePaymentSheet] =
    useCreateRescheduleFeePaymentSheetMutation();
  const [createGiftVoucherPaymentSheet] =
    useCreateGiftVoucherPaymentSheetMutation();
  const { setAlertConfig, setIsVisible } = useAlertContext();
  const { showSnackbarWithConfig } = useSnackbar();
  const { addresses } = useAddresses();

  /**
   * Fetches payment sheet details from the server
   *
   * @param finalPrice - The total price in euros
   * @param bookingReference - The booking reference
   * @param bookingData - Full booking data for client app
   * @param detailerBookingData - Optional formatted data for detailer app
   * @returns Promise that resolves to payment sheet details
   */
  const fetchPaymentSheetDetailsFromServer = useCallback(
    async (
      finalPrice: number,
      bookingReference: string,
      bookingData?: any,
      detailerBookingData?: any
    ): Promise<
      PaymentSheetResponse & {
        paymentIntentId: string;
        booking_reference: string;
        free_booking?: boolean;
      }
    > => {
      try {
        const amountInCents = Math.round(finalPrice * 100);
        const response = await fetchPaymentSheetDetails({
          amount: amountInCents,
          booking_reference: bookingReference,
          booking_data: bookingData,
          detailer_booking_data: detailerBookingData,
        }).unwrap();
        return response;
      } catch (error) {
        console.error("Error fetching payment sheet details:", error);
        throw error;
      }
    },
    [fetchPaymentSheetDetails]
  );

  /**
   * Initializes the payment sheet when the checkout page is opened.
   * Calls the fetchPaymentSheetDetails method to fetch the payment sheet details from the server.
   * Then calls the initPaymentSheet method to initialize the payment sheet.
   *
   * @param finalPrice - The total price to charge
   * @param bookingReference - The booking reference
   * @param merchantDisplayName - Optional custom merchant display name (defaults to "Prisma Car Care")
   * @param bookingData - Optional full booking data for client app
   * @param detailerBookingData - Optional formatted data for detailer app
   */
  const initializePaymentSheet = useCallback(
    async (
      finalPrice: number,
      bookingReference: string,
      merchantDisplayName: string = "Prisma Car Care",
      bookingData?: any,
      detailerBookingData?: any
    ): Promise<{
      paymentIntentId: string;
      freeBooking?: boolean;
      booking_reference?: string;
    }> => {
      const address = bookingData?.address ?? addresses[0];
      const country = (address?.country ?? "").trim();
      const isUK =
        country === "United Kingdom" ||
        country === "UK" ||
        country === "Great Britain";
      let countryCode = isUK ? "GB" : "IE";
      let currencyCode = isUK ? "GBP" : "EUR";

      try {
        const response = await fetchPaymentSheetDetailsFromServer(
          finalPrice,
          bookingReference,
          bookingData,
          detailerBookingData
        );

        // Free Quick Sparkle - booking already created on server
        if (response?.free_booking) {
          return {
            paymentIntentId: "FREE_BOOKING",
            freeBooking: true,
            booking_reference: response.booking_reference,
          };
        }

        const { paymentIntent, paymentIntentId, ephemeralKey, customer } =
          response;

        const { error } = await initPaymentSheet({
          paymentIntentClientSecret: paymentIntent,
          merchantDisplayName: merchantDisplayName,
          customerEphemeralKeySecret: ephemeralKey,
          customerId: customer,
          returnURL: "prismaclient://payment-success",
          applePay: {
            merchantCountryCode: countryCode,
          },
          googlePay: {
            merchantCountryCode: countryCode,
            testEnv: APP_ENV !== "production",
            currencyCode: currencyCode,
          },
          // Enable saving payment methods for future use
          allowsDelayedPaymentMethods: true,
        });

        if (error) {
          throw error;
        }

        return { paymentIntentId };
      } catch (error: any) {
        throw error;
      }
    },
    [addresses, fetchPaymentSheetDetailsFromServer, initPaymentSheet]
  );

  /**
   * Opens the payment sheet when clicked on the checkout page.
   * Calls the initializePaymentSheet method to initialize the payment sheet first on the server.
   * Then calls the presentPaymentSheet method to present the payment sheet to the user.
   *
   * @param finalPrice - The total price to charge
   * @param merchantDisplayName - Optional custom merchant display name
   * @param bookingReference - The booking reference
   * @param bookingData - Optional full booking data for client app
   * @param detailerBookingData - Optional formatted data for detailer app
   * @returns Promise that resolves to true if payment successful, false if cancelled, throws error if failed
   */
  const openPaymentSheet = useCallback(
    async (
      finalPrice: number,
      merchantDisplayName: string = "Prisma Car Care",
      bookingReference: string,
      bookingData?: any,
      detailerBookingData?: any
    ): Promise<{
      success: boolean;
      paymentIntentId?: string;
      freeBooking?: boolean;
    }> => {
      try {
        // Initialize payment sheet first
        const initResult = await initializePaymentSheet(
          finalPrice,
          bookingReference,
          merchantDisplayName,
          bookingData,
          detailerBookingData
        );

        // Free booking - already created on server
        if (initResult.freeBooking) {
          return {
            success: true,
            paymentIntentId: initResult.paymentIntentId,
            freeBooking: true,
          };
        }

        const { paymentIntentId } = initResult;

        // Present payment sheet
        const { error } = await presentPaymentSheet();

        if (error) {
          // Handle specific error cases
          if (error.code === "Canceled") {
            return { success: false };
          }

          // Handle other errors
          let errorMessage = "Payment failed. Please try again.";
          let errorTitle = "Payment Error";

          if (error.message?.includes("card_declined")) {
            errorMessage =
              "Your card was declined. Please try a different payment method.";
            errorTitle = "Card Declined";
          } else if (error.message?.includes("insufficient_funds")) {
            errorMessage =
              "Insufficient funds. Please try a different payment method.";
            errorTitle = "Insufficient Funds";
          } else if (error.message?.includes("expired_card")) {
            errorMessage =
              "Your card has expired. Please use a different payment method.";
            errorTitle = "Expired Card";
          }
          showSnackbarWithConfig({
            message: errorMessage,
            type: "error",
            duration: 3000,
          });
          return { success: false };
        }

        return { success: true, paymentIntentId };
      } catch (error: any) {
        console.error("Error in payment process:", error);

        // Branch spend limit exceeded (fleet admin only)
        const status = error?.status ?? error?.originalStatus;
        const code = error?.data?.code;
        if (status === 403 && code === "BRANCH_SPEND_LIMIT_EXCEEDED") {
          setAlertConfig({
            isVisible: true,
            title: "Spending limit exceeded",
            message:
              "Your branch's spending limit for this period has been reached. Payment was not taken. Contact your fleet owner if you need the limit increased.",
            type: "warning",
            onClose: () => {
              setAlertConfig({
                isVisible: false,
                title: "",
                message: "",
                type: "error",
              });
            },
          });
          return { success: false };
        }

        // Handle network or initialization errors
        let errorMessage =
          error?.data?.error ||
          error?.data?.message ||
          error?.message ||
          "An error occurred during payment";

        if (errorMessage === "An error occurred during payment") {
          if (error?.message?.includes("network")) {
            errorMessage =
              "Network error. Please check your connection and try again.";
          } else if (error?.message?.includes("timeout")) {
            errorMessage = "Request timed out. Please try again.";
          }
        }

        showSnackbarWithConfig({
          message: errorMessage,
          type: "error",
          duration: 3000,
        });
        return { success: false };
      }
    },
    [initializePaymentSheet, presentPaymentSheet, showSnackbarWithConfig, setAlertConfig]
  );

  /**
   * Late reschedule (<12h before start): payment sheet for reschedule fee. Webhook applies new slot.
   */
  const openRescheduleFeePaymentSheet = useCallback(
    async (
      bookingReference: string,
      newDate: string,
      newTime: string
    ): Promise<{ success: boolean; paymentIntentId?: string }> => {
      const address = addresses[0];
      const country = (address?.country ?? "").trim();
      const isUK =
        country === "United Kingdom" ||
        country === "UK" ||
        country === "Great Britain";
      const countryCode = isUK ? "GB" : "IE";
      const currencyCode = isUK ? "GBP" : "EUR";

      try {
        const response = await createRescheduleFeePaymentSheet({
          booking_reference: bookingReference,
          new_date: newDate,
          new_time: newTime,
        }).unwrap();

        const { paymentIntent, paymentIntentId, ephemeralKey, customer } =
          response;

        const { error } = await initPaymentSheet({
          paymentIntentClientSecret: paymentIntent,
          merchantDisplayName: "Prisma Car Care",
          customerEphemeralKeySecret: ephemeralKey,
          customerId: customer,
          returnURL: "prismaclient://payment-success",
          applePay: {
            merchantCountryCode: countryCode,
          },
          googlePay: {
            merchantCountryCode: countryCode,
            testEnv: APP_ENV !== "production",
            currencyCode: currencyCode,
          },
          allowsDelayedPaymentMethods: true,
        });

        if (error) {
          throw error;
        }

        const { error: presentError } = await presentPaymentSheet();
        if (presentError) {
          if (presentError.code === "Canceled") {
            return { success: false };
          }
          showSnackbarWithConfig({
            message: presentError.message || "Payment failed",
            type: "error",
            duration: 3000,
          });
          return { success: false };
        }

        return { success: true, paymentIntentId };
      } catch (error: any) {
        const status = error?.status ?? error?.originalStatus;
        const code = error?.data?.code;
        if (status === 403 && code === "BRANCH_SPEND_LIMIT_EXCEEDED") {
          setAlertConfig({
            isVisible: true,
            title: "Spending limit exceeded",
            message:
              "Your branch's spending limit for this period has been reached.",
            type: "warning",
            onClose: () => {
              setAlertConfig({
                isVisible: false,
                title: "",
                message: "",
                type: "error",
              });
            },
          });
          return { success: false };
        }
        const msg =
          error?.data?.error ||
          error?.message ||
          "Could not start reschedule payment";
        showSnackbarWithConfig({
          message: msg,
          type: "error",
          duration: 3000,
        });
        return { success: false };
      }
    },
    [
      addresses,
      createRescheduleFeePaymentSheet,
      initPaymentSheet,
      presentPaymentSheet,
      showSnackbarWithConfig,
      setAlertConfig,
    ]
  );

  /**
   * Purchase a gift voucher. Stripe webhook fulfills the voucher and emails the recipient.
   */
  const openGiftVoucherPaymentSheet = useCallback(
    async (
      recipientEmail: string,
      creditAmount: number,
      validityDays: number,
    ): Promise<{ success: boolean; paymentIntentId?: string }> => {
      const address = addresses[0];
      const country = (address?.country ?? "").trim();
      const isUK =
        country === "United Kingdom" ||
        country === "UK" ||
        country === "Great Britain";
      const countryCode = isUK ? "GB" : "IE";

      try {
        const response = await createGiftVoucherPaymentSheet({
          recipient_email: recipientEmail.trim(),
          credit_amount: creditAmount,
          validity_days: validityDays,
        }).unwrap();

        const { paymentIntent, paymentIntentId, ephemeralKey, customer } =
          response;
        const cur = (response.currency || (isUK ? "gbp" : "eur")).toLowerCase();
        const currencyDisplay = cur === "gbp" ? "GBP" : "EUR";

        const { error } = await initPaymentSheet({
          paymentIntentClientSecret: paymentIntent,
          merchantDisplayName: "Prisma Car Care",
          customerEphemeralKeySecret: ephemeralKey,
          customerId: customer,
          returnURL: "prismaclient://payment-success",
          applePay: {
            merchantCountryCode: countryCode,
          },
          googlePay: {
            merchantCountryCode: countryCode,
            testEnv: APP_ENV !== "production",
            currencyCode: currencyDisplay,
          },
          allowsDelayedPaymentMethods: true,
        });

        if (error) {
          throw error;
        }

        const { error: presentError } = await presentPaymentSheet();
        if (presentError) {
          if (presentError.code === "Canceled") {
            return { success: false };
          }
          showSnackbarWithConfig({
            message: presentError.message || "Payment failed",
            type: "error",
            duration: 3000,
          });
          return { success: false };
        }

        return { success: true, paymentIntentId };
      } catch (error: unknown) {
        const err = error as {
          data?: { error?: string; message?: string };
          message?: string;
        };
        const msg =
          err?.data?.error ||
          err?.message ||
          "Could not start gift voucher payment.";
        showSnackbarWithConfig({
          message: msg,
          type: "error",
          duration: 3000,
        });
        return { success: false };
      }
    },
    [
      addresses,
      createGiftVoucherPaymentSheet,
      initPaymentSheet,
      presentPaymentSheet,
      showSnackbarWithConfig,
    ],
  );

  /**
   * Confirms if a payment intent has been processed via webhook
   *
   * @param paymentIntentId - The Stripe payment intent ID
   * @returns Promise that resolves to confirmation status
   */
  const confirmPaymentIntent = useCallback(
    async (
      paymentIntentId: string
    ): Promise<{
      confirmed: boolean;
      assigned?: boolean;
      assigning?: boolean;
      payment_intent_id: string;
      transaction_id?: string;
      booking_reference?: string;
      status?: string;
      message?: string;
    }> => {
      try {
        const response = await confirmPaymentIntentMutation({
          payment_intent_id: paymentIntentId,
        }).unwrap();
        return response;
      } catch (error) {
        console.error("Error confirming payment intent:", error);
        throw error;
      }
    },
    [confirmPaymentIntentMutation]
  );

  /**
   * Waits for payment confirmation via webhook by polling
   *
   * @param paymentIntentId - The Stripe payment intent ID
   * @param maxWaitTime - Maximum time to wait in milliseconds (default: 60000ms = 60 seconds)
   * @param pollInterval - Interval between polls in milliseconds (default: 2500ms = 2.5 seconds)
   * @returns Promise that resolves when payment is confirmed or rejects on timeout
   */
  const waitForPaymentConfirmation = useCallback(
    async (
      paymentIntentId: string,
      maxWaitTime: number = 60000,
      pollInterval: number = 2500,
      onStatus?: (status: "confirming" | "assigning") => void
    ): Promise<{
      confirmed: boolean;
      assigned?: boolean;
      assigning?: boolean;
      payment_intent_id: string;
      transaction_id?: string;
      booking_reference?: string;
    }> => {
      const startTime = Date.now();
      let lastResult: {
        confirmed: boolean;
        assigned?: boolean;
        assigning?: boolean;
        payment_intent_id: string;
        transaction_id?: string;
        booking_reference?: string;
      } | null = null;

      return new Promise((resolve, reject) => {
        const poll = async () => {
          try {
            const result = await confirmPaymentIntent(paymentIntentId);
            lastResult = result;

            if ((result as { status?: string }).status === "refunded_slot_unavailable") {
              const msg =
                result.message ||
                "This time slot was no longer available. Your payment has been refunded. Please choose another slot.";
              reject(new Error(msg));
              return;
            }

            if (result.confirmed && result.assigned) {
              resolve(result);
              return;
            }

            if (result.confirmed && result.assigning) {
              onStatus?.("assigning");
            }

            if (Date.now() - startTime >= maxWaitTime) {
              if (lastResult?.confirmed) {
                resolve(lastResult);
                return;
              }
              reject(
                new Error(
                  "Payment confirmation timeout - webhook did not confirm payment within the expected time"
                )
              );
              return;
            }

            setTimeout(poll, pollInterval);
          } catch (error) {
            reject(error);
          }
        };

        poll();
      });
    },
    [confirmPaymentIntent]
  );

  return {
    // Core payment methods
    fetchPaymentSheetDetailsFromServer,
    initializePaymentSheet,
    openPaymentSheet,
    openRescheduleFeePaymentSheet,
    openGiftVoucherPaymentSheet,
    // Payment confirmation methods
    confirmPaymentIntent,
    waitForPaymentConfirmation,
  };
};

export default usePayment;
