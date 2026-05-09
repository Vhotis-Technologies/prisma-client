/**
 * Consumer (B2C) subscription: plans, create/cancel, payment method via Stripe.
 * Use for non–fleet-owner users on SubscriptionPlanScreen and related UI.
 */
import { useMemo, useState, useCallback } from "react";
import { router } from "expo-router";
import {
  useGetB2cCurrentSubscriptionQuery,
  useGetB2cSubscriptionPlansQuery,
  useCreateB2cSubscriptionMutation,
  useCancelB2cSubscriptionMutation,
  useAbandonIncompleteB2cSubscriptionMutation,
  useUpdateB2cPaymentMethodMutation,
  useLazyGetB2cSetupIntentQuery,
} from "@/app/store/api/b2cSubscriptionApi";
import { useAppSelector, RootState } from "@/app/store/main_store";
import { useStripe } from "@stripe/stripe-react-native";
import { useSnackbar } from "@/app/contexts/SnackbarContext";
import { useAddresses } from "@/app/app-hooks/useAddresses";
import usePayment from "@/app/app-hooks/usePayment";
import { APP_ENV } from "@/constants/Config";
import {
  CreateSubscriptionResponse,
  CurrentSubscriptionView,
} from "@/app/interfaces/SubscriptionInterfaces";

const skipForFleetOwner = (isFleetOwner: boolean | undefined) => !!isFleetOwner;

export const useB2cSubscriptions = () => {
  const user = useAppSelector((state: RootState) => state.auth.user);
  const isFleetOwner = user?.is_fleet_owner === true;
  const skip = skipForFleetOwner(isFleetOwner);

  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { showSnackbarWithConfig } = useSnackbar();
  const { addresses } = useAddresses();
  const { waitForPaymentConfirmation } = usePayment();

  const {
    data: subscriptionPayload,
    isLoading: isLoadingSubscription,
    refetch: refetchSubscription,
  } = useGetB2cCurrentSubscriptionQuery(undefined, { skip });

  const currentSubscription = useMemo((): CurrentSubscriptionView | null => {
    if (!subscriptionPayload) return null;
    const sub = subscriptionPayload.subscription;
    if (!sub) {
      return {
        canStartTrial: false,
        isEarlyAdopter: false,
      };
    }
    return {
      ...sub,
      isTrialing: sub.isTrialing ?? false,
      canStartTrial: false,
      isEarlyAdopter: false,
    };
  }, [subscriptionPayload]);

  const {
    data: plans,
    isLoading: isLoadingPlans,
    error: plansError,
  } = useGetB2cSubscriptionPlansQuery(undefined, { skip });

  const [createSubscription, { isLoading: isCreatingSubscription }] =
    useCreateB2cSubscriptionMutation();
  const [cancelSubscription] = useCancelB2cSubscriptionMutation();
  const [abandonIncompleteSubscription] =
    useAbandonIncompleteB2cSubscriptionMutation();
  const [updatePaymentMethod] = useUpdateB2cPaymentMethodMutation();
  const [getSetupIntent] = useLazyGetB2cSetupIntentQuery();

  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<
    "monthly" | "yearly"
  >("monthly");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);

  const hasActiveB2cSubscription = useMemo(() => {
    if (skip) return false;
    return subscriptionPayload?.subscription?.status === "active";
  }, [skip, subscriptionPayload]);

  const initializeSubscriptionPaymentSheet = useCallback(
    async (
      paymentIntentClientSecret: string,
      ephemeralKey: string,
      customer: string
    ): Promise<boolean> => {
      try {
        const address = addresses?.[0];
        const country = (address?.country ?? "").trim();
        const isUK =
          country === "United Kingdom" ||
          country === "UK" ||
          country === "Great Britain";
        const countryCode = isUK ? "GB" : "IE";
        const currencyCode = isUK ? "GBP" : "EUR";

        const paymentSheetParams = {
          merchantDisplayName: "Prisma Valet",
          customerEphemeralKeySecret: ephemeralKey,
          customerId: customer,
          returnURL: "prismaclient://payment-success",
          applePay: { merchantCountryCode: countryCode },
          googlePay: {
            merchantCountryCode: countryCode,
            testEnv: __DEV__,
            currencyCode: currencyCode,
          },
          allowsDelayedPaymentMethods: true,
          paymentIntentClientSecret,
        };

        const { error } = await initPaymentSheet(
          paymentSheetParams as Parameters<typeof initPaymentSheet>[0]
        );

        if (error) {
          showSnackbarWithConfig({
            message: `Payment initialization failed: ${error.message}`,
            type: "error",
            duration: 5000,
          });
          return false;
        }
        return true;
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to initialize payment. Please try again.";
        showSnackbarWithConfig({
          message,
          type: "error",
          duration: 5000,
        });
        return false;
      }
    },
    [initPaymentSheet, addresses, showSnackbarWithConfig]
  );

  const abandonIncompleteCheckout = useCallback(
    async (subscriptionId?: string) => {
      try {
        await abandonIncompleteSubscription(
          subscriptionId ? { subscriptionId } : {},
        ).unwrap();
      } catch {
        /* non-fatal: user may clear via Cancel in UI */
      }
      await refetchSubscription();
    },
    [abandonIncompleteSubscription, refetchSubscription],
  );

  /* This method is used to create the subscription for the B2C user */
  const handleSubscribe = useCallback(async () => {
    if (!selectedTierId) {
      showSnackbarWithConfig({
        message: "Please select a subscription plan",
        type: "warning",
        duration: 3000,
      });
      return;
    }

    setIsProcessingPayment(true);

    try {
      const response = (await createSubscription({
        tierId: selectedTierId,
        billingCycle: selectedBillingCycle,
      }).unwrap()) as CreateSubscriptionResponse;

      if (response.paymentSheet) {
        const createdSubId = response.subscription?.id;
        const paymentSecret = response.paymentSheet.paymentIntent;
        if (!paymentSecret) {
          await abandonIncompleteCheckout(createdSubId);
          showSnackbarWithConfig({
            message: "Payment details not available",
            type: "error",
            duration: 5000,
          });
          setIsProcessingPayment(false);
          return;
        }

        const initialized = await initializeSubscriptionPaymentSheet(
          paymentSecret,
          response.paymentSheet.ephemeralKey,
          response.paymentSheet.customer
        );

        if (!initialized) {
          await abandonIncompleteCheckout(createdSubId);
          setIsProcessingPayment(false);
          return;
        }

        const { error } = await presentPaymentSheet();

        if (error) {
          const err = error as { code?: string; message?: string };
          if (err.code === "Canceled") {
            await abandonIncompleteCheckout(createdSubId);
            showSnackbarWithConfig({
              message: "Payment was canceled",
              type: "info",
              duration: 3000,
            });
          } else {
            showSnackbarWithConfig({
              message: `Payment failed: ${err.message}`,
              type: "error",
              duration: 5000,
            });
          }
          setIsProcessingPayment(false);
          return;
        }

        const paymentIntentId =
          response.billing?.transaction_id ?? paymentSecret.split("_secret_")[0];

        showSnackbarWithConfig({
          message: "Payment successful! Activating subscription...",
          type: "success",
          duration: 3000,
        });

        try {
          const confirmation = await waitForPaymentConfirmation(
            paymentIntentId,
            60000,
            2500
          );

          if (confirmation.confirmed) {
            await refetchSubscription();
            showSnackbarWithConfig({
              message: "Subscription activated successfully!",
              type: "success",
              duration: 3000,
            });
            router.back();
          }
        } catch (err: unknown) {
          const msg =
            err instanceof Error
              ? err.message
              : "Payment received. Subscription is being activated. Please check back shortly.";
          showSnackbarWithConfig({
            message: msg,
            type: "info",
            duration: 5000,
          });
          await refetchSubscription();
          router.back();
        }
      } else {
        showSnackbarWithConfig({
          message: response.message ?? "Subscription activated successfully!",
          type: "success",
          duration: 3000,
        });
        await refetchSubscription();
        setTimeout(() => router.back(), 1500);
      }
    } catch (error: unknown) {
      const err = error as { data?: { error?: string }; message?: string };
      showSnackbarWithConfig({
        message:
          err?.data?.error ??
          err?.message ??
          "Failed to create subscription. Please try again.",
        type: "error",
        duration: 5000,
      });
    } finally {
      setIsProcessingPayment(false);
    }
  }, [
    selectedTierId,
    selectedBillingCycle,
    createSubscription,
    abandonIncompleteCheckout,
    initializeSubscriptionPaymentSheet,
    presentPaymentSheet,
    refetchSubscription,
    showSnackbarWithConfig,
    waitForPaymentConfirmation,
  ]);

  /* This method is used to cancel the subscription for the B2C user */
  const handleCancelSubscription = useCallback(
    async (cancelAtPeriodEnd: boolean = true) => {
      setIsCanceling(true);
      try {
        await cancelSubscription({
          cancel_at_period_end: cancelAtPeriodEnd,
        }).unwrap();
        await refetchSubscription();
        setShowCancelModal(false);
        showSnackbarWithConfig({
          message: cancelAtPeriodEnd
            ? "Subscription will be cancelled at the end of the billing period."
            : "Subscription cancelled successfully.",
          type: "success",
          duration: 5000,
        });
      } catch (error: unknown) {
        const err = error as { data?: { error?: string }; message?: string };
        showSnackbarWithConfig({
          message:
            err?.data?.error ?? err?.message ?? "Failed to cancel subscription.",
          type: "error",
          duration: 5000,
        });
      } finally {
        setIsCanceling(false);
      }
    },
    [cancelSubscription, refetchSubscription, showSnackbarWithConfig]
  );

  /* Method to update the payment method for the B2C user. the method triggers the server to update the payment method on stripe*/
  const handleUpdatePaymentMethod = useCallback(async () => {
    setIsUpdatingPayment(true);
    try {
      const result = await getSetupIntent();
      if (result.error) throw result.error;
      const { setupIntent, ephemeralKey, customer } = result.data!;

      const address = addresses?.[0];
      const country = (address?.country ?? "").trim();
      const isUK =
        country === "United Kingdom" ||
        country === "UK" ||
        country === "Great Britain";
      const countryCode = isUK ? "GB" : "IE";
      const currencyCode = isUK ? "GBP" : "EUR";

      const { error: initError } = await initPaymentSheet({
        setupIntentClientSecret: setupIntent,
        merchantDisplayName: "Prisma Valet",
        customerEphemeralKeySecret: ephemeralKey,
        customerId: customer,
        returnURL: "prismaclient://payment-success",
        applePay: { merchantCountryCode: countryCode },
        googlePay: {
          merchantCountryCode: countryCode,
          testEnv: APP_ENV !== "production",
          currencyCode: currencyCode,
        },
        allowsDelayedPaymentMethods: true,
      });

      if (initError) {
        throw new Error(initError.message);
      }

      const presentResult = await presentPaymentSheet();
      const presentError = presentResult.error as
        | { code?: string; message?: string }
        | undefined;
      const resultSetupIntent =
        "setupIntent" in presentResult
          ? (
              presentResult as {
                setupIntent?: {
                  paymentMethodId?: string;
                  paymentMethod?: { id: string };
                };
              }
            ).setupIntent
          : undefined;
      const paymentMethodId =
        resultSetupIntent?.paymentMethodId ??
        resultSetupIntent?.paymentMethod?.id;

      if (presentError) {
        if (presentError.code === "Canceled") {
          showSnackbarWithConfig({
            message: "Payment method setup was canceled",
            type: "info",
            duration: 3000,
          });
          return;
        }
        throw new Error(presentError.message ?? "Payment sheet failed");
      }

      if (paymentMethodId) {
        await updatePaymentMethod({ payment_method_id: paymentMethodId }).unwrap();
        await refetchSubscription();
        showSnackbarWithConfig({
          message: "Payment method updated successfully!",
          type: "success",
          duration: 5000,
        });
      } else {
        throw new Error("Payment method ID not found");
      }
    } catch (error: unknown) {
      const err = error as { data?: { error?: string }; message?: string };
      showSnackbarWithConfig({
        message:
          err?.data?.error ?? err?.message ?? "Failed to update payment method.",
        type: "error",
        duration: 5000,
      });
    } finally {
      setIsUpdatingPayment(false);
    }
  }, [
    addresses,
    showSnackbarWithConfig,
    initPaymentSheet,
    presentPaymentSheet,
    updatePaymentMethod,
    refetchSubscription,
    getSetupIntent,
  ]);

  const handleTierSelect = useCallback((tierId: string) => {
    setSelectedTierId(tierId);
  }, []);

  const handleBillingCycleChange = useCallback(
    (tierId: string, cycle: "monthly" | "yearly") => {
      if (selectedTierId === tierId) {
        setSelectedBillingCycle(cycle);
      }
    },
    [selectedTierId]
  );

  return {
    isFleetOwner,
    hasActiveB2cSubscription,
    subscription: subscriptionPayload,
    plans,
    currentSubscription,
    isLoadingPlans,
    isLoadingSubscription,
    plansError,
    refetchSubscription,
    selectedTierId,
    selectedBillingCycle,
    setSelectedTierId,
    setSelectedBillingCycle,
    isProcessingPayment,
    isCreatingSubscription,
    isCanceling,
    isUpdatingPayment,
    showCancelModal,
    setShowCancelModal,
    handleTierSelect,
    handleBillingCycleChange,
    handleSubscribe,
    handleCancelSubscription,
    handleUpdatePaymentMethod,
  };
};
