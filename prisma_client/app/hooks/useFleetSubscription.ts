/**
 * Fleet subscription hook: plans, create/cancel subscription, billing, setup intent, update payment method. Uses Stripe.
 */
import { useMemo, useState, useCallback } from "react";
import { router } from "expo-router";
import { useGetCurrentSubscriptionQuery } from "@/app/store/api/subscriptionApi";
import {
  useGetSubscriptionPlansQuery,
  useCreateSubscriptionMutation,
  useCancelSubscriptionMutation,
  useUpdatePaymentMethodMutation,
  useLazyGetSetupIntentQuery,
} from "@/app/store/api/subscriptionApi";
import { useAppSelector, RootState } from "@/app/store/main_store";
import { useStripe } from "@stripe/stripe-react-native";
import { useSnackbar } from "@/app/contexts/SnackbarContext";
import { useAddresses } from "@/app/app-hooks/useAddresses";
import usePayment from "@/app/app-hooks/usePayment";
import { CreateSubscriptionResponse, CurrentSubscriptionView } from "@/app/interfaces/SubscriptionInterfaces";

/**
 * Hook for fleet subscription: status, plans, and subscription actions (subscribe, cancel, update payment).
 * Use in SubscriptionPlanScreen and anywhere subscription logic is needed.
 */
export const useFleetSubscription = () => {
  const user = useAppSelector((state: RootState) => state.auth.user);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { showSnackbarWithConfig } = useSnackbar();
  const { addresses } = useAddresses();
  const { waitForPaymentConfirmation } = usePayment();

  const {
    data: subscriptionData,
    isLoading: isLoadingSubscription,
    refetch: refetchSubscription,
  } = useGetCurrentSubscriptionQuery(undefined, {
    skip: !user?.is_fleet_owner,
  });

  const currentSubscription = useMemo((): CurrentSubscriptionView | null => {
    if (!subscriptionData) return null;
    if (subscriptionData.subscription != null) {
      return {
        ...subscriptionData.subscription,
        isEarlyAdopter: subscriptionData.subscription.isEarlyAdopter ?? false,
      };
    }
    return {
      canStartTrial: subscriptionData.canStartTrial ?? true,
      isEarlyAdopter: subscriptionData.isEarlyAdopter ?? false,
    };
  }, [subscriptionData]);

  const {
    data: plans,
    isLoading: isLoadingPlans,
    error: plansError,
  } = useGetSubscriptionPlansQuery();

  const [createSubscription, { isLoading: isCreatingSubscription }] =
    useCreateSubscriptionMutation();
  const [cancelSubscription] = useCancelSubscriptionMutation();
  const [updatePaymentMethod] = useUpdatePaymentMethodMutation();
  const [getSetupIntent] = useLazyGetSetupIntentQuery();

  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<
    "monthly" | "yearly"
  >("monthly");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);

  const isFleetUser = useMemo(
    () => user?.is_fleet_owner || user?.is_branch_admin || false,
    [user]
  );

  const hasActiveSubscription = useMemo(() => {
    if (!isFleetUser) return true;
    return subscriptionData?.subscription?.status === "active";
  }, [isFleetUser, subscriptionData]);

  const canDownloadImages = useMemo(() => {
    if (!isFleetUser) return true;
    return hasActiveSubscription;
  }, [isFleetUser, hasActiveSubscription]);

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

  const initializeSubscriptionPaymentSheet = useCallback(
    async (
      paymentIntentOrSetupIntent: string,
      ephemeralKey: string,
      customer: string,
      isTrial: boolean = false
    ): Promise<boolean> => {
      try {
        const address = addresses?.[0];
        const country = (address?.country ?? "").trim();
        const isUK =
          country === "United Kingdom" ||
          country === "UK" ||
          country === "Great Britain";
        let countryCode = isUK ? "GB" : "IE";
        let currencyCode = isUK ? "GBP" : "EUR";

        const paymentSheetParams: Record<string, unknown> = {
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
        };

        if (isTrial) {
          (paymentSheetParams as Record<string, string>).setupIntentClientSecret =
            paymentIntentOrSetupIntent;
        } else {
          (paymentSheetParams as Record<string, string>).paymentIntentClientSecret =
            paymentIntentOrSetupIntent;
        }

        const { error } = await initPaymentSheet(paymentSheetParams as Parameters<typeof initPaymentSheet>[0]);

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
        const message = error instanceof Error ? error.message : "Failed to initialize payment. Please try again.";
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
      }).unwrap()) as CreateSubscriptionResponse & {
        isTrial?: boolean;
        paymentSheet?: { setupIntent?: string; paymentIntent?: string; ephemeralKey: string; customer: string };
      };

      if (response.paymentSheet) {
        const isTrial = response.isTrial ?? false;
        const paymentSecret = isTrial
          ? response.paymentSheet.setupIntent
          : response.paymentSheet.paymentIntent;

        if (!paymentSecret) {
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
          response.paymentSheet.customer,
          isTrial
        );

        if (!initialized) {
          setIsProcessingPayment(false);
          return;
        }

        const { error } = await presentPaymentSheet();

        if (error) {
          const err = error as { code?: string; message?: string };
          if (err.code === "Canceled") {
            showSnackbarWithConfig({
              message: isTrial ? "Payment method setup was canceled" : "Payment was canceled",
              type: "info",
              duration: 3000,
            });
          } else {
            showSnackbarWithConfig({
              message: isTrial ? `Payment method setup failed: ${err.message}` : `Payment failed: ${err.message}`,
              type: "error",
              duration: 5000,
            });
          }
          setIsProcessingPayment(false);
          return;
        }

        if (isTrial) {
          await refetchSubscription();
          showSnackbarWithConfig({
            message: "Trial started successfully! Your subscription will begin after the trial period.",
            type: "success",
            duration: 5000,
          });
          router.back();
        } else {
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
            const msg = err instanceof Error ? err.message : "Payment received. Subscription is being activated. Please check back in a moment.";
            showSnackbarWithConfig({
              message: msg,
              type: "info",
              duration: 5000,
            });
            await refetchSubscription();
            router.back();
          }
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
    initializeSubscriptionPaymentSheet,
    presentPaymentSheet,
    refetchSubscription,
    showSnackbarWithConfig,
    waitForPaymentConfirmation,
  ]);

  const handleCancelSubscription = useCallback(
    async (cancelAtPeriodEnd: boolean = true) => {
      setIsCanceling(true);
      try {
        await cancelSubscription({ cancel_at_period_end: cancelAtPeriodEnd }).unwrap();
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
          message: err?.data?.error ?? err?.message ?? "Failed to cancel subscription.",
          type: "error",
          duration: 5000,
        });
      } finally {
        setIsCanceling(false);
      }
    },
    [cancelSubscription, refetchSubscription, showSnackbarWithConfig]
  );

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
      let countryCode = isUK ? "GB" : "IE";
      let currencyCode = isUK ? "GBP" : "EUR";

      const { error: initError } = await initPaymentSheet({
        setupIntentClientSecret: setupIntent,
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
      });

      if (initError) {
        throw new Error(initError.message);
      }

      const presentResult = await presentPaymentSheet();
      const presentError = presentResult.error as { code?: string; message?: string } | undefined;
      const resultSetupIntent =
        "setupIntent" in presentResult
          ? (presentResult as { setupIntent?: { paymentMethodId?: string; paymentMethod?: { id: string } } }).setupIntent
          : undefined;
      const paymentMethodId =
        resultSetupIntent?.paymentMethodId ?? resultSetupIntent?.paymentMethod?.id;

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
        message: err?.data?.error ?? err?.message ?? "Failed to update payment method.",
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

  return {
    // Status / feature access
    isFleetUser,
    hasActiveSubscription,
    canDownloadImages,
    subscription: subscriptionData,
    // Data
    plans,
    currentSubscription,
    isLoadingPlans,
    isLoadingSubscription,
    plansError,
    refetchSubscription,
    // Selection state
    selectedTierId,
    selectedBillingCycle,
    setSelectedTierId,
    setSelectedBillingCycle,
    // UI state
    isProcessingPayment,
    isCreatingSubscription,
    isCanceling,
    isUpdatingPayment,
    showCancelModal,
    setShowCancelModal,
    // Handlers
    handleTierSelect,
    handleBillingCycleChange,
    handleSubscribe,
    handleCancelSubscription,
    handleUpdatePaymentMethod,
  };
};
