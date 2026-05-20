/**
 * Partner dashboard hook: dashboard metrics, payout details/history, create payout request, update bank details.
 */
import { useCallback, useState } from "react";
import { useAppSelector, RootState } from "@/app/store/main_store";
import {
  useGetPartnerDashboardQuery,
  useGetPartnerPayoutDetailsQuery,
  useGetPartnerPayoutHistoryQuery,
  useUpdatePartnerPayoutDetailsMutation,
  useCreatePayoutRequestMutation,
} from "@/app/store/api/partnerApi";
import { useSnackbar } from "@/app/contexts/SnackbarContext";

export type UsePartnerOptions = {
  /** When true, skips payout detail and history queries. */
  skipPayout?: boolean;
};

/**
 * Partner dashboard hook: metrics, payout details/history, bank details, payout requests.
 *
 * @param options - Optional flags to skip payout queries
 * @returns Partner dashboard, payout, and form state with action handlers
 */
export const usePartner = (options?: UsePartnerOptions) => {
  const { showSnackbarWithConfig } = useSnackbar();
  const user = useAppSelector((state: RootState) => state.auth.user);
  const isPartner = Boolean(user?.is_dealership || user?.partner_referral_code);

  const [editingBank, setEditingBank] = useState(false);
  const [accountHolder, setAccountHolder] = useState("");
  const [iban, setIban] = useState("");

  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard,
    isFetching: dashboardFetching,
  } = useGetPartnerDashboardQuery(undefined, { skip: !isPartner });

  const {
    data: payoutData,
    isLoading: payoutLoading,
    error: payoutError,
    refetch: refetchPayout,
  } = useGetPartnerPayoutDetailsQuery(undefined, {
    skip: !isPartner || options?.skipPayout === true,
  });

  const {
    data: payoutHistoryData,
    isLoading: payoutHistoryLoading,
    error: payoutHistoryError,
    refetch: refetchPayoutHistory,
  } = useGetPartnerPayoutHistoryQuery(undefined, {
    skip: !isPartner || options?.skipPayout === true,
  });

  const [updatePayout, { isLoading: isUpdating }] = useUpdatePartnerPayoutDetailsMutation();
  const [createPayoutRequest, { isLoading: isRequesting }] = useCreatePayoutRequestMutation();

  const pendingCommission = payoutData?.pending_commission ?? 0;
  const hasBank = payoutData?.bank_account?.has_bank_account ?? false;
  const userCountry = user?.address?.country;

  /**
   * Persist partner bank account (holder name + IBAN) to the server.
   */
  const saveBank = useCallback(async () => {
    const holder = (accountHolder || "").trim();
    const ibanVal = (iban || "").trim().replace(/\s/g, "");
    if (!holder || !ibanVal) {
      showSnackbarWithConfig({
        message: "Fill in account holder name and IBAN",
        type: "error",
        duration: 3000,
      });
      return;
    }
    try {
      await updatePayout({
        account_holder_name: holder,
        iban: ibanVal,
      }).unwrap();
      setEditingBank(false);
      setAccountHolder("");
      setIban("");
      showSnackbarWithConfig({
        message: "Bank account saved",
        type: "success",
        duration: 3000,
      });
    } catch (err: unknown) {
      const e = err as { data?: { error?: string } };
      showSnackbarWithConfig({
        message: e?.data?.error || "Failed to save bank details",
        type: "error",
        duration: 4000,
      });
    }
  }, [accountHolder, iban, updatePayout, showSnackbarWithConfig]);

  /**
   * Submit a payout request for pending partner commission.
   */
  const requestPayment = useCallback(async () => {
    try {
      const res = await createPayoutRequest().unwrap();
      showSnackbarWithConfig({
        message: res.message,
        type: "success",
        duration: 5000,
      });
    } catch (err: unknown) {
      const e = err as { data?: { error?: string } };
      showSnackbarWithConfig({
        message: e?.data?.error || "Failed to submit payment request",
        type: "error",
        duration: 4000,
      });
    }
  }, [createPayoutRequest, showSnackbarWithConfig]);

  /** Reset bank edit form and close editing mode. */
  const clearBankForm = useCallback(() => {
    setEditingBank(false);
    setAccountHolder("");
    setIban("");
  }, []);

  return {
    user,
    isPartner,
    userCountry,

    dashboard: {
      data: dashboardData,
      isLoading: dashboardLoading,
      error: dashboardError,
      refetch: refetchDashboard,
      isFetching: dashboardFetching,
    },

    payout: {
      data: payoutData,
      isLoading: payoutLoading,
      error: payoutError,
      refetch: refetchPayout,
      pendingCommission,
      hasBank,
    },

    payoutHistory: {
      data: payoutHistoryData?.payout_requests ?? [],
      isLoading: payoutHistoryLoading,
      error: payoutHistoryError,
      refetch: refetchPayoutHistory,
    },

    payoutForm: {
      editingBank,
      setEditingBank,
      accountHolder,
      setAccountHolder,
      iban,
      setIban,
      clearBankForm,
    },

    saveBank,
    requestPayment,
    isUpdating,
    isRequesting,
  };
};

export type UsePartnerReturn = ReturnType<typeof usePartner>;
export default usePartner;
