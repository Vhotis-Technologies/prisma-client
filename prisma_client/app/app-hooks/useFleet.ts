/**
 * Fleet management hook: branches CRUD, branch admins, fleet dashboard, vehicles, spend, bulk orders, capacity.
 */
import { useState, useCallback } from "react";
import { useAlertContext } from "@/app/contexts/AlertContext";
import type { AlertState } from "@/app/contexts/AlertContext";
import {
  useGetBranchesQuery,
  useCreateBranchMutation,
  useUpdateBranchMutation,
  useDeleteBranchMutation,
  useGetBranchVehiclesQuery,
  useGetBranchBulkOrdersQuery,
  useGetBranchAdminsQuery,
  useCancelBulkOrderMutation,
  useRescheduleBulkOrderMutation,
} from "@/app/store/api/fleetApi";
import { useSubscriptionLimits } from "@/app/hooks/useSubscriptionLimits";
import {
  canCancelOrRescheduleBulkOrder,
  checkBulkCapacityAvailability,
  type BulkCapacityOption,
} from "@/app/utils/fleetDashboardUtils";
import type { BranchProps } from "@/app/interfaces/FleetInterfaces";

const dismissAlert = (setAlertConfig: (config: AlertState) => void) =>
  setAlertConfig({ isVisible: false, title: "", message: "", type: "error" });

export interface RescheduleOrderState {
  id: string;
  booking_reference: string;
  order_data: Record<string, unknown>;
  number_of_vehicles: number;
}

export interface UseFleetOptions {
  selectedBranchId?: string | null;
}

export function useFleet(options: UseFleetOptions = {}) {
  const { selectedBranchId = null } = options;
  const { setAlertConfig } = useAlertContext();
  const { limitsReached } = useSubscriptionLimits();

  const {
    data: branchesData,
    refetch: refetchBranches,
    isLoading: isBranchesLoading,
  } = useGetBranchesQuery();
  const branches = branchesData?.branches ?? [];
  const selectedBranch =
    branches.find((b) => b.id === selectedBranchId) ?? null;

  // Import the alert context

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<string | null>(null);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchAddress, setNewBranchAddress] = useState("");
  const [newBranchPostcode, setNewBranchPostcode] = useState("");
  const [newBranchCity, setNewBranchCity] = useState("");
  const [newBranchCountry, setNewBranchCountry] = useState("");
  const [newBranchLatitude, setNewBranchLatitude] = useState<
    number | undefined
  >();
  const [newBranchLongitude, setNewBranchLongitude] = useState<
    number | undefined
  >();

  const [capPeriod, setCapPeriod] = useState<"weekly" | "monthly">("monthly");
  const [capAmount, setCapAmount] = useState("");
  const [isSavingCap, setIsSavingCap] = useState(false);

  const [bulkOrdersExpanded, setBulkOrdersExpanded] = useState(false);
  const [expandedBulkOrderId, setExpandedBulkOrderId] = useState<string | null>(
    null,
  );

  const [rescheduleOrder, setRescheduleOrder] =
    useState<RescheduleOrderState | null>(null);
  const [rescheduleNewDate, setRescheduleNewDate] = useState("");
  const [rescheduleOptions, setRescheduleOptions] = useState<
    BulkCapacityOption[] | null
  >(null);
  const [rescheduleSelectedOption, setRescheduleSelectedOption] =
    useState<BulkCapacityOption | null>(null);
  const [rescheduleSelectedIndex, setRescheduleSelectedIndex] = useState(0);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);

  /** When set, show BulkOrderConfirmationModal (reschedule success). */
  const [rescheduleConfirmationPayload, setRescheduleConfirmationPayload] =
    useState<{
      order: RescheduleOrderState;
      newDate: string;
      newStartTime: string;
      newEndTime: string;
    } | null>(null);

  const [createBranch, { isLoading: isCreating }] = useCreateBranchMutation();
  const [updateBranch, { isLoading: isUpdating }] = useUpdateBranchMutation();
  const [deleteBranch, { isLoading: isDeleting }] = useDeleteBranchMutation();
  const [cancelBulkOrder, { isLoading: isCancelling }] =
    useCancelBulkOrderMutation();
  const [rescheduleBulkOrder, { isLoading: isRescheduling }] =
    useRescheduleBulkOrderMutation();

  const { data: branchVehiclesData } = useGetBranchVehiclesQuery(
    { branch_id: selectedBranchId ?? "" },
    { skip: !selectedBranchId },
  );
  const { data: branchBulkOrdersData, refetch: refetchBulkOrders } =
    useGetBranchBulkOrdersQuery(
      { branch_id: selectedBranchId ?? "" },
      { skip: !selectedBranchId },
    );
  const { data: branchAdminsData } = useGetBranchAdminsQuery(
    { branch_id: selectedBranchId ?? "" },
    { skip: !selectedBranchId },
  );

  const clearBranchForm = useCallback(() => {
    setNewBranchName("");
    setNewBranchAddress("");
    setNewBranchPostcode("");
    setNewBranchCity("");
    setNewBranchCountry("");
    setNewBranchLatitude(undefined);
    setNewBranchLongitude(undefined);
  }, []);

  const handleBranchAddressSelect = useCallback(
    (result: {
      address: string;
      post_code: string;
      city: string;
      country: string;
      latitude: number;
      longitude: number;
    }) => {
      setNewBranchAddress(result.address);
      setNewBranchPostcode(result.post_code);
      setNewBranchCity(result.city);
      setNewBranchCountry(result.country);
      setNewBranchLatitude(result.latitude);
      setNewBranchLongitude(result.longitude);
    },
    [],
  );

  const handleCreateBranch = useCallback(async () => {
    if (!newBranchName.trim()) {
      setAlertConfig({
        isVisible: true,
        title: "Error",
        message: "Branch name is required",
        type: "error",
        onConfirm: () => dismissAlert(setAlertConfig),
      });
      return;
    }
    try {
      await createBranch({
        name: newBranchName.trim(),
        address: newBranchAddress.trim() || undefined,
        postcode: newBranchPostcode.trim() || undefined,
        city: newBranchCity.trim() || undefined,
        country: newBranchCountry.trim() || undefined,
        latitude: newBranchLatitude,
        longitude: newBranchLongitude,
      }).unwrap();
      setShowCreateForm(false);
      clearBranchForm();
      refetchBranches();
      setAlertConfig({
        isVisible: true,
        title: "Success",
        message: "Branch created successfully",
        type: "success",
        onConfirm: () => dismissAlert(setAlertConfig),
      });
    } catch (error: unknown) {
      const err = error as { data?: { error?: string } };
      setAlertConfig({
        isVisible: true,
        title: "Error",
        message: err?.data?.error ?? "Failed to create branch",
        type: "error",
        onConfirm: () => dismissAlert(setAlertConfig),
      });
    }
  }, [
    newBranchName,
    newBranchAddress,
    newBranchPostcode,
    newBranchCity,
    newBranchCountry,
    newBranchLatitude,
    newBranchLongitude,
    createBranch,
    clearBranchForm,
    refetchBranches,
    setAlertConfig,
  ]);

  const handleUpdateBranch = useCallback(
    async (branchId: string) => {
      const branch = branches.find((b) => b.id === branchId);
      if (!branch) return;
      try {
        await updateBranch({
          branch_id: branchId,
          name: newBranchName.trim() || branch.name,
          address: newBranchAddress.trim() || branch.address,
          postcode: newBranchPostcode.trim() || branch.postcode,
          city: newBranchCity.trim() || branch.city,
          country: newBranchCountry.trim() || branch.country,
          latitude: newBranchLatitude,
          longitude: newBranchLongitude,
        }).unwrap();
        setEditingBranch(null);
        clearBranchForm();
        refetchBranches();
        setAlertConfig({
          isVisible: true,
          title: "Success",
          message: "Branch updated successfully",
          type: "success",
          onConfirm: () => dismissAlert(setAlertConfig),
        });
      } catch (error: unknown) {
        const err = error as { data?: { error?: string } };
        setAlertConfig({
          isVisible: true,
          title: "Error",
          message: err?.data?.error ?? "Failed to update branch",
          type: "error",
          onConfirm: () => dismissAlert(setAlertConfig),
        });
      }
    },
    [
      branches,
      newBranchName,
      newBranchAddress,
      newBranchPostcode,
      newBranchCity,
      newBranchCountry,
      newBranchLatitude,
      newBranchLongitude,
      updateBranch,
      clearBranchForm,
      refetchBranches,
      setAlertConfig,
    ],
  );

  const handleDeleteBranch = useCallback(
    (branchId: string, branchName: string) => {
      setAlertConfig({
        isVisible: true,
        title: "Delete Branch",
        message: `Are you sure you want to delete ${branchName}? This action cannot be undone.`,
        type: "warning",
        onClose: () => dismissAlert(setAlertConfig),
        onConfirm: async () => {
          try {
            await deleteBranch({ branch_id: branchId }).unwrap();
            refetchBranches();
            dismissAlert(setAlertConfig);
            setAlertConfig({
              isVisible: true,
              title: "Success",
              message: "Branch deleted successfully",
              type: "success",
              onConfirm: () => dismissAlert(setAlertConfig),
            });
          } catch (error: unknown) {
            const err = error as { data?: { error?: string } };
            dismissAlert(setAlertConfig);
            setAlertConfig({
              isVisible: true,
              title: "Error",
              message: err?.data?.error ?? "Failed to delete branch",
              type: "error",
              onConfirm: () => dismissAlert(setAlertConfig),
            });
          }
        },
      });
    },
    [deleteBranch, refetchBranches, setAlertConfig],
  );

  const startEditing = useCallback((branch: BranchProps) => {
    setEditingBranch(branch.id);
    setNewBranchName(branch.name ?? "");
    setNewBranchAddress(branch.address ?? "");
    setNewBranchPostcode(branch.postcode ?? "");
    setNewBranchCity(branch.city ?? "");
    setNewBranchCountry(branch.country ?? "");
    setNewBranchLatitude(branch.latitude ?? undefined);
    setNewBranchLongitude(branch.longitude ?? undefined);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingBranch(null);
    clearBranchForm();
  }, [clearBranchForm]);

  const handleSaveCap = useCallback(
    async (branchId: string) => {
      const parsed = parseFloat(capAmount);
      if (isNaN(parsed) || parsed < 0) {
        setAlertConfig({
          isVisible: true,
          title: "Error",
          message: "Enter a valid spend limit (0 or greater).",
          type: "error",
          onConfirm: () => dismissAlert(setAlertConfig),
        });
        return;
      }
      setIsSavingCap(true);
      try {
        await updateBranch({
          branch_id: branchId,
          spend_limit: parsed,
          spend_limit_period: capPeriod,
        }).unwrap();
        setCapAmount("");
        refetchBranches();
        setAlertConfig({
          isVisible: true,
          title: "Success",
          message: "Spending cap updated.",
          type: "success",
          onConfirm: () => dismissAlert(setAlertConfig),
        });
      } catch (error: unknown) {
        const err = error as { data?: { error?: string } };
        setAlertConfig({
          isVisible: true,
          title: "Error",
          message: err?.data?.error ?? "Failed to update cap",
          type: "error",
          onConfirm: () => dismissAlert(setAlertConfig),
        });
      } finally {
        setIsSavingCap(false);
      }
    },
    [capAmount, capPeriod, updateBranch, refetchBranches, setAlertConfig],
  );

  const handleRevertCap = useCallback(
    async (branchId: string) => {
      setIsSavingCap(true);
      try {
        await updateBranch({
          branch_id: branchId,
          spend_limit: 0,
        }).unwrap();
        setCapAmount("");
        refetchBranches();
        setAlertConfig({
          isVisible: true,
          title: "Success",
          message: "Spending limit removed.",
          type: "success",
          onConfirm: () => dismissAlert(setAlertConfig),
        });
      } catch (error: unknown) {
        const err = error as { data?: { error?: string } };
        setAlertConfig({
          isVisible: true,
          title: "Error",
          message: err?.data?.error ?? "Failed to remove limit",
          type: "error",
          onConfirm: () => dismissAlert(setAlertConfig),
        });
      } finally {
        setIsSavingCap(false);
      }
    },
    [updateBranch, refetchBranches, setAlertConfig],
  );

  const handleCancelBulkOrder = useCallback(
    (order: {
      id: string;
      booking_reference?: string;
      order_data?: Record<string, unknown> | null;
      payment_status?: string;
    }) => {
      if (!canCancelOrRescheduleBulkOrder(order)) return;

      setAlertConfig({
        isVisible: true,
        title: "Cancel bulk order",
        message:
          "Do you want to cancel this bulk order? \nYou will receive a full refund.",
        type: "warning",
        confirmLabel: "Yes, cancel",
        onClose: () => dismissAlert(setAlertConfig),
        onConfirm: () => {
          dismissAlert(setAlertConfig);
          (async () => {
            try {
              const res = await cancelBulkOrder({
                bulk_order_id: order.id,
                booking_reference: order.booking_reference,
              }).unwrap();
              refetchBulkOrders();
              setAlertConfig({
                isVisible: true,
                title: "Order cancelled",
                message: res.message ?? "Full refund will be processed.",
                type: "success",
                onConfirm: () => dismissAlert(setAlertConfig),
              });
            } catch (err: unknown) {
              const e = err as { data?: { error?: string } };
              setAlertConfig({
                isVisible: true,
                title: "Error",
                message: e?.data?.error ?? "Failed to cancel order",
                type: "error",
                onConfirm: () => dismissAlert(setAlertConfig),
              });
            }
          })();
        },
      });
    },
    [cancelBulkOrder, refetchBulkOrders, setAlertConfig],
  );

  const openRescheduleModal = useCallback(
    (order: {
      id: string;
      booking_reference?: string;
      order_data?: Record<string, unknown> | null;
      number_of_vehicles?: number;
    }) => {
      setRescheduleOrder({
        id: order.id,
        booking_reference: order.booking_reference ?? "",
        order_data: (order.order_data as Record<string, unknown>) ?? {},
        number_of_vehicles: order.number_of_vehicles ?? 0,
      });
      setRescheduleNewDate("");
      setRescheduleOptions(null);
      setRescheduleSelectedOption(null);
      setRescheduleSelectedIndex(0);
    },
    [],
  );

  const closeRescheduleModal = useCallback(() => {
    setRescheduleOrder(null);
    setRescheduleConfirmationPayload(null);
  }, []);

  const clearRescheduleOptions = useCallback(() => {
    setRescheduleOptions(null);
    setRescheduleSelectedOption(null);
  }, []);

  const clearRescheduleConfirmation = useCallback(() => {
    setRescheduleConfirmationPayload(null);
  }, []);

  const checkRescheduleCapacity = useCallback(async () => {
    if (!rescheduleOrder || !rescheduleNewDate.trim()) {
      setAlertConfig({
        isVisible: true,
        title: "Error",
        message: "Please select a date.",
        type: "error",
        onConfirm: () => dismissAlert(setAlertConfig),
      });
      return;
    }
    const d = rescheduleOrder.order_data;
    const address = d?.address as
      | {
          city?: string;
          country?: string;
          latitude?: number;
          longitude?: number;
        }
      | undefined;
    const service = d?.service_type as { duration?: number } | undefined;
    const duration = service?.duration ?? 60;
    const workloadMinutes = rescheduleOrder.number_of_vehicles * duration;
    const city = address?.city ?? "";
    const country = address?.country ?? "Ireland";
    setRescheduleLoading(true);
    setRescheduleOptions(null);
    try {
      const result = await checkBulkCapacityAvailability({
        date: rescheduleNewDate.trim().slice(0, 10),
        workload_minutes: workloadMinutes,
        service_duration: duration,
        country,
        city,
        latitude: address?.latitude,
        longitude: address?.longitude,
      });
      if (!result.available) {
        setAlertConfig({
          isVisible: true,
          title: "No capacity",
          message:
            result.error ?? "No availability for this date. Try another.",
          type: "error",
          onConfirm: () => dismissAlert(setAlertConfig),
        });
        return;
      }
      if (result.options && result.options.length > 0) {
        setRescheduleOptions(result.options);
        setRescheduleSelectedOption(result.options[0]);
        setRescheduleSelectedIndex(0);
      } else {
        setAlertConfig({
          isVisible: true,
          title: "No capacity",
          message: "No time options for this date.",
          type: "error",
          onConfirm: () => dismissAlert(setAlertConfig),
        });
      }
    } catch {
      setAlertConfig({
        isVisible: true,
        title: "Error",
        message: "Unable to check availability.",
        type: "error",
        onConfirm: () => dismissAlert(setAlertConfig),
      });
    } finally {
      setRescheduleLoading(false);
    }
  }, [rescheduleOrder, rescheduleNewDate, setAlertConfig]);

  const confirmReschedule = useCallback(async () => {
    const selected =
      rescheduleOptions?.[rescheduleSelectedIndex] ?? rescheduleSelectedOption;
    if (!rescheduleOrder || !rescheduleNewDate.trim() || !selected) return;
    try {
      await rescheduleBulkOrder({
        bulk_order_id: rescheduleOrder.id,
        booking_reference: rescheduleOrder.booking_reference || undefined,
        new_date: rescheduleNewDate.trim().slice(0, 10),
        start_time: selected.best_start_time,
        end_time: selected.estimated_finish_time,
        number_of_vehicles: rescheduleOrder.number_of_vehicles,
        suggested_team_size: selected.suggested_team_size,
      }).unwrap();
      setRescheduleConfirmationPayload({
        order: rescheduleOrder,
        newDate: rescheduleNewDate.trim().slice(0, 10),
        newStartTime: selected.best_start_time,
        newEndTime: selected.estimated_finish_time,
      });
      setRescheduleOrder(null);
      refetchBulkOrders();
    } catch (err: unknown) {
      const e = err as { data?: { error?: string } };
      setAlertConfig({
        isVisible: true,
        title: "Error",
        message: e?.data?.error ?? "Failed to reschedule",
        type: "error",
        onConfirm: () => dismissAlert(setAlertConfig),
      });
    }
  }, [
    rescheduleOrder,
    rescheduleNewDate,
    rescheduleOptions,
    rescheduleSelectedIndex,
    rescheduleSelectedOption,
    rescheduleBulkOrder,
    refetchBulkOrders,
    setAlertConfig,
  ]);

  return {
    branches,
    selectedBranch,
    branchVehiclesData,
    branchBulkOrdersData,
    branchAdminsData,
    refetchBranches,
    refetchBulkOrders,
    showCreateForm,
    setShowCreateForm,
    editingBranch,
    setEditingBranch,
    newBranchName,
    setNewBranchName,
    newBranchAddress,
    setNewBranchAddress,
    newBranchPostcode,
    setNewBranchPostcode,
    newBranchCity,
    setNewBranchCity,
    newBranchCountry,
    setNewBranchCountry,
    newBranchLatitude,
    setNewBranchLatitude,
    newBranchLongitude,
    setNewBranchLongitude,
    capPeriod,
    setCapPeriod,
    capAmount,
    setCapAmount,
    isSavingCap,
    bulkOrdersExpanded,
    setBulkOrdersExpanded,
    expandedBulkOrderId,
    setExpandedBulkOrderId,
    rescheduleOrder,
    rescheduleNewDate,
    setRescheduleNewDate,
    rescheduleOptions,
    rescheduleSelectedOption,
    rescheduleSelectedIndex,
    setRescheduleSelectedIndex,
    setRescheduleSelectedOption,
    rescheduleLoading,
    handleBranchAddressSelect,
    clearBranchForm,
    handleCreateBranch,
    handleUpdateBranch,
    handleDeleteBranch,
    startEditing,
    cancelEditing,
    handleSaveCap,
    handleRevertCap,
    handleCancelBulkOrder,
    openRescheduleModal,
    closeRescheduleModal,
    clearRescheduleOptions,
    checkRescheduleCapacity,
    confirmReschedule,
    rescheduleConfirmationPayload,
    clearRescheduleConfirmation,
    canCancelOrRescheduleBulkOrder,
    isCreating,
    isUpdating,
    isDeleting,
    isCancelling,
    isRescheduling,
    limitsReached,
    isBranchesLoading,
  };
}
