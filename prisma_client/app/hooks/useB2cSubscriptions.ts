/**
 * Consumer (B2C) subscription: plans, create/cancel, payment method via Stripe.
 * Use for non–fleet-owner users on SubscriptionPlanScreen and related UI.
 */
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
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
import useVehicles from "@/app/app-hooks/useVehicles";
import { APP_ENV } from "@/constants/Config";
import {
  B2cVehicleCategory,
  CreateSubscriptionResponse,
  CurrentSubscriptionView,
} from "@/app/interfaces/SubscriptionInterfaces";
import { vehicleBodyStyleRequiresSuvMpvSurcharge } from "@/app/utils/vehicleBodyStyle";

/** Skip B2C subscription queries when user is a fleet owner. */
const skipForFleetOwner = (isFleetOwner: boolean | undefined) => !!isFleetOwner;

/**
 * B2C subscription UI state and handlers: plans, subscribe, cancel, update payment.
 */
export const useB2cSubscriptions = () => {
  const user = useAppSelector((state: RootState) => state.auth.user);
  const isFleetOwner = user?.is_fleet_owner === true;
  const skip = skipForFleetOwner(isFleetOwner);

  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { showSnackbarWithConfig } = useSnackbar();
  const { addresses } = useAddresses();
  const { waitForPaymentConfirmation } = usePayment();
  const { vehicles } = useVehicles();

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
  const [selectedVehicleCategory, setSelectedVehicleCategory] =
    useState<B2cVehicleCategory>("sedan");
  const vehicleCategoryTouchedRef = useRef(false);
  /** After cancel-to-upgrade, keep the target class selected for the next subscribe. */
  const pendingVehicleClassAfterCancelRef = useRef<B2cVehicleCategory | null>(
    null,
  );
  const [cancelModalMode, setCancelModalMode] = useState<
    "standard" | "vehicle_class"
  >("standard");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);

  /** Default Sedan vs SUV/MPV from active plan, else garage body styles. */
  useEffect(() => {
    if (skip || vehicleCategoryTouchedRef.current) return;
    const fromSub = currentSubscription?.vehicleCategory;
    if (fromSub === "sedan" || fromSub === "suv_mpv") {
      setSelectedVehicleCategory(fromSub);
      return;
    }
    const needsSuv = vehicles.some((v) =>
      vehicleBodyStyleRequiresSuvMpvSurcharge(v.body_style),
    );
    setSelectedVehicleCategory(needsSuv ? "suv_mpv" : "sedan");
  }, [skip, currentSubscription?.vehicleCategory, vehicles]);

  const hasActiveB2cSubscription = useMemo(() => {
    if (skip) return false;
    return subscriptionPayload?.subscription?.status === "active";
  }, [skip, subscriptionPayload]);

  /** Configure Stripe Payment Sheet for a new B2C subscription charge. */
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
          merchantDisplayName: "Prisma Car Care",
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

  /** Tell server to drop incomplete subscription after canceled checkout. */
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

  /** Create B2C subscription and present Stripe payment sheet when required. */
  const handleSubscribe = useCallback(async () => {
    if (!selectedTierId) {
      showSnackbarWithConfig({
        message: "Please select a subscription plan",
        type: "warning",
        duration: 3000,
      });
      return;
    }

    const activeStatus = subscriptionPayload?.subscription?.status;
    if (
      activeStatus === "active" ||
      activeStatus === "pending" ||
      activeStatus === "past_due"
    ) {
      const currentCategory =
        subscriptionPayload?.subscription?.vehicleCategory ?? "suv_mpv";
      const switchingClass = currentCategory !== selectedVehicleCategory;
      showSnackbarWithConfig({
        message: switchingClass
          ? "Cancel your current plan first, then subscribe with the new vehicle class."
          : "You already have a subscription. Cancel it before starting a new one.",
        type: "warning",
        duration: 5000,
      });
      return;
    }

    setIsProcessingPayment(true);

    try {
      const response = (await createSubscription({
        tierId: selectedTierId,
        billingCycle: selectedBillingCycle,
        vehicleCategory: selectedVehicleCategory,
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
    selectedVehicleCategory,
    createSubscription,
    abandonIncompleteCheckout,
    initializeSubscriptionPaymentSheet,
    presentPaymentSheet,
    refetchSubscription,
    showSnackbarWithConfig,
    waitForPaymentConfirmation,
    subscriptionPayload?.subscription?.status,
    subscriptionPayload?.subscription?.vehicleCategory,
  ]);

  /** Cancel B2C subscription (end of period or immediately). */
  const handleCancelSubscription = useCallback(
    async (cancelAtPeriodEnd: boolean = true) => {
      setIsCanceling(true);
      try {
        await cancelSubscription({
          cancel_at_period_end: cancelAtPeriodEnd,
        }).unwrap();
        await refetchSubscription();
        setShowCancelModal(false);
        const pendingClass = pendingVehicleClassAfterCancelRef.current;
        if (pendingClass && !cancelAtPeriodEnd) {
          vehicleCategoryTouchedRef.current = true;
          setSelectedVehicleCategory(pendingClass);
          pendingVehicleClassAfterCancelRef.current = null;
          showSnackbarWithConfig({
            message: `Plan cancelled. Select a tier and subscribe to ${
              pendingClass === "sedan" ? "Sedan" : "SUV / MPV"
            }.`,
            type: "success",
            duration: 6000,
          });
        } else {
          pendingVehicleClassAfterCancelRef.current = null;
          showSnackbarWithConfig({
            message: cancelAtPeriodEnd
              ? "Subscription will be cancelled at the end of the billing period."
              : "Subscription cancelled successfully.",
            type: "success",
            duration: 5000,
          });
        }
        setCancelModalMode("standard");
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

  /** Update default card via SetupIntent and PATCH payment method. */
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
        merchantDisplayName: "Prisma Car Care",
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

  /** Select subscription tier in plan picker UI. */
  const handleTierSelect = useCallback((tierId: string) => {
    setSelectedTierId(tierId);
  }, []);

  /** Set monthly/yearly billing for the selected tier. */
  const handleBillingCycleChange = useCallback(
    (tierId: string, cycle: "monthly" | "yearly") => {
      if (selectedTierId === tierId) {
        setSelectedBillingCycle(cycle);
      }
    },
    [selectedTierId]
  );

  /** Sedan vs SUV/MPV — drives displayed prices and subscribe payload. */
  const handleVehicleCategoryChange = useCallback(
    (category: B2cVehicleCategory) => {
      vehicleCategoryTouchedRef.current = true;
      setSelectedVehicleCategory(category);
    },
    [],
  );

  /**
   * Cancel-first vehicle-class switch: lock target class, open cancel modal.
   * After immediate cancel, user can subscribe to the new class.
   */
  const handleStartVehicleClassChange = useCallback(
    (targetCategory: B2cVehicleCategory) => {
      pendingVehicleClassAfterCancelRef.current = targetCategory;
      vehicleCategoryTouchedRef.current = true;
      setSelectedVehicleCategory(targetCategory);
      setCancelModalMode("vehicle_class");
      setShowCancelModal(true);
    },
    [],
  );

  const openCancelModal = useCallback((mode: "standard" | "vehicle_class" = "standard") => {
    setCancelModalMode(mode);
    if (mode === "standard") {
      pendingVehicleClassAfterCancelRef.current = null;
    }
    setShowCancelModal(true);
  }, []);

  const closeCancelModal = useCallback(() => {
    setShowCancelModal(false);
    setCancelModalMode("standard");
    pendingVehicleClassAfterCancelRef.current = null;
  }, []);

  /** Boolean setter for shared SubscriptionPlanScreen (fleet-compatible). */
  const setShowCancelModalCompat = useCallback(
    (visible: boolean) => {
      if (visible) openCancelModal("standard");
      else closeCancelModal();
    },
    [openCancelModal, closeCancelModal],
  );

  const needsCancelBeforeSubscribe = useMemo(() => {
    const status = subscriptionPayload?.subscription?.status;
    return (
      status === "active" || status === "pending" || status === "past_due"
    );
  }, [subscriptionPayload?.subscription?.status]);

  const isSwitchingVehicleClass = useMemo(() => {
    if (!needsCancelBeforeSubscribe) return false;
    const current =
      subscriptionPayload?.subscription?.vehicleCategory ?? "suv_mpv";
    return current !== selectedVehicleCategory;
  }, [
    needsCancelBeforeSubscribe,
    subscriptionPayload?.subscription?.vehicleCategory,
    selectedVehicleCategory,
  ]);

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
    selectedVehicleCategory,
    setSelectedTierId,
    setSelectedBillingCycle,
    isProcessingPayment,
    isCreatingSubscription,
    isCanceling,
    isUpdatingPayment,
    showCancelModal,
    setShowCancelModal: setShowCancelModalCompat,
    closeCancelModal,
    cancelModalMode,
    needsCancelBeforeSubscribe,
    isSwitchingVehicleClass,
    handleTierSelect,
    handleBillingCycleChange,
    handleVehicleCategoryChange,
    handleStartVehicleClassChange,
    handleSubscribe,
    handleCancelSubscription,
    handleUpdatePaymentMethod,
  };
};
