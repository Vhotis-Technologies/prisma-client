import {
  ServiceTypeProps,
  ValetTypeProps,
  AddOnsProps,
  CreateBookingProps,
} from "@/app/interfaces/BookingInterfaces";
import React, { useEffect, useCallback, useState } from "react";
import { MyVehiclesProps } from "@/app/interfaces/GarageInterface";
import {
  MyAddressProps,
  UserProfileProps,
} from "@/app/interfaces/ProfileInterfaces";
import { setServiceType, setValetType } from "@/app/store/slices/bookingSlice";
import { useAppSelector, useAppDispatch, RootState } from "../store/main_store";
import {
  useFetchServiceTypeQuery,
  useFetchValetTypeQuery,
  useFetchAddOnsQuery,
  useBookAppointmentMutation,
  useCancelBookingMutation,
  useRescheduleBookingMutation,
  useFetchPromotionsQuery,
  useMarkPromotionAsUsedMutation,
  useLazyCheckFreeWashQuery,
  useApplyWinnerVoucherMutation,
} from "@/app/store/api/eventApi";
import * as SecureStore from "expo-secure-store";
import { useAlertContext } from "@/app/contexts/AlertContext";
import { useSnackbar } from "@/app/contexts/SnackbarContext";
import dayjs from "dayjs";
import { TimeSlot, CalendarDay } from "@/app/interfaces/BookingInterfaces";
import { formatCurrency } from "@/app/utils/methods";
import { Alert } from "react-native";
import { router } from "expo-router";
import { ReturnBookingProps } from "../interfaces/OtherInterfaces";
import useDashboard from "./useDashboard";
import usePayment from "./usePayment";
import { API_CONFIG } from "@/constants/Config";

/**
 * Formats a Date object to local time string in HH:mm:ss.SSS format
 * This prevents timezone conversion issues when sending time data to the server
 *
 * @param date - The Date object to format
 * @returns Formatted time string (e.g., "19:00:00.000" for 7:00 PM)
 */
const formatLocalTime = (date: Date): string => {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  const milliseconds = date.getMilliseconds().toString().padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
};

/** Calendar date in local timezone (matches get_timeslots ?date=). Do not use toISOString() for the date part. */
const formatLocalDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/**
 * Custom hook for managing the booking process state and logic.
 *
 * Provides the multi-step booking flow: vehicle → service → valet → details (address, date, time, add-ons) → summary → confirm.
 * On confirm: builds client + detailer payloads, opens Stripe payment sheet (or free Quick Sparkle path),
 * waits for webhook via confirm_payment_intent polling, then shows confirmation modal.
 *
 * See docs/BOOKING_FLOW.md for the full flow (frontend + backend + webhook).
 *
 * Features:
 * - Multi-step navigation with validation
 * - Date and time selection with detailer availability
 * - Price calculation (base, SUV, express, add-ons, loyalty)
 * - handleBookingConfirmation: payment sheet + waitForPaymentConfirmation + confirmation modal
 *
 * @returns Object containing all booking state, handlers, and utility methods
 */
const VAT_RATE = 0.23; // 23% VAT rate

const useBooking = () => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state: RootState) => state.auth.user);
  const userAddress = user?.address;
  const { refetchAppointments } = useDashboard();
  const { openPaymentSheet, waitForPaymentConfirmation } = usePayment();

  /* Api hooks */

  const { data: addOns, isLoading: isLoadingAddOns } = useFetchAddOnsQuery();
  const {
    data: promotions,
    isLoading: isLoadingPromotions,
    error: promotionsError,
  } = useFetchPromotionsQuery();

  const { data: serviceTypes, isLoading: isLoadingServiceTypes } =
    useFetchServiceTypeQuery();
  const { data: valetTypes, isLoading: isLoadingValetTypes } =
    useFetchValetTypeQuery();
  const [bookAppointment, { isLoading: isLoadingBooking }] =
    useBookAppointmentMutation();

  const [cancelBooking, { isLoading: isLoadingCancelBooking }] =
    useCancelBookingMutation();
  const [rescheduleBooking, { isLoading: isLoadingRescheduleBooking }] =
    useRescheduleBookingMutation();
  const [markPromotionAsUsed] = useMarkPromotionAsUsedMutation();

  // Lazy query for checking free wash - only runs when trigger is called
  const [checkFreeWash] = useLazyCheckFreeWashQuery();

  const { setAlertConfig, setIsVisible } = useAlertContext();
  const { showSnackbarWithConfig, showSnackbar } = useSnackbar();
  const [selectedVehicle, setSelectedVehicle] =
    useState<MyVehiclesProps | null>(null);
  const [selectedServiceType, setSelectedServiceType] =
    useState<ServiceTypeProps | null>(null);
  const [selectedValetType, setSelectedValetType] =
    useState<ValetTypeProps | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<MyAddressProps | null>(
    null
  );
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [specialInstructions, setSpecialInstructions] = useState<string>("");
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSUV, setIsSUV] = useState<boolean>(false);
  const [isExpressService, setIsExpressService] = useState<boolean>(false);
  const [isProcessingPayment, setIsProcessingPayment] =
    useState<boolean>(false);
  const [paymentConfirmationStatus, setPaymentConfirmationStatus] = useState<
    "pending" | "confirming" | "confirmed" | "failed"
  >("pending");

  const [winnerVoucherApplied, setWinnerVoucherApplied] = useState<{
    voucherId: string;
    amountDue: number;
    discountApplied: number;
    preTotal: number;
  } | null>(null);
  const [winnerVoucherCode, setWinnerVoucherCode] = useState("");
  const [applyWinnerVoucherMut] = useApplyWinnerVoucherMutation();

  // Addon management state
  const [selectedAddons, setSelectedAddons] = useState<AddOnsProps[]>([]);
  const [isAddonModalVisible, setIsAddonModalVisible] =
    useState<boolean>(false);

  // Booking confirmation modal state
  const [isConfirmationModalVisible, setIsConfirmationModalVisible] =
    useState<boolean>(false);
  const [confirmationBookingData, setConfirmationBookingData] =
    useState<ReturnBookingProps | null>(null);
  const [confirmationBookingReference, setConfirmationBookingReference] =
    useState<string>("");

  // Booking cancellation modal state
  const [isCancellationModalVisible, setIsCancellationModalVisible] =
    useState<boolean>(false);
  const [cancellationData, setCancellationData] = useState<{
    message: string;
    booking_status: string;
    refund: any;
    hours_until_appointment: number;
  } | null>(null);
  const [cancellationBookingReference, setCancellationBookingReference] =
    useState<string>("");

  // Time slot management state
  const [availableTimeSlots, setAvailableTimeSlots] = useState<TimeSlot[]>([]);
  const [selectedSlotAt, setSelectedSlotAt] = useState<number | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [currentMonth, setCurrentMonth] = useState<dayjs.Dayjs>(
    dayjs(selectedDate)
  );
  const [selectedDay, setSelectedDay] = useState<dayjs.Dayjs>(
    dayjs(selectedDate)
  );

  /**
   * Helper function to calculate total service duration including addons
   *
   * @param customAddons - Optional custom addon selection to use instead of current state
   * @returns Total service duration in minutes
   */
  const calculateTotalServiceDuration = useCallback(
    (customAddons?: AddOnsProps[]) => {
      const baseServiceDuration = selectedServiceType?.duration || 60;
      const addonsToUse = customAddons || selectedAddons;
      const addonExtraDuration = addonsToUse.reduce(
        (total, addon) => total + addon.extra_duration,
        0
      );
      const totalServiceDuration = baseServiceDuration + addonExtraDuration;

      return totalServiceDuration;
    },
    [selectedServiceType, selectedAddons]
  );

  /**
   * Fetches available time slots from the server for a specific date
   *
   * This method makes an API call to retrieve available booking time slots
   * for a given date, service duration, and location. It validates that
   * required address information is available before making the request.
   *
   * The API call includes:
   * - Date in YYYY-MM-DD format
   * - Service duration in minutes
   * - Country and city for location-based availability
   *
   * Expected response format from detailer server:
   * {
   *   slots: [
   *     {
   *       start_time: "13:00",
   *       end_time: "14:30",
   *       is_available: true
   *     },
   *     ...
   *   ]
   * }
   *
   * @param date - The date to check for available slots
   * @param customDuration - Optional custom duration to use instead of calculating from state
   * @type {dayjs.Dayjs}
   * @returns Promise that resolves to the API response data
   * @type {Promise<any>}
   *
   * @throws {Error} If address information is missing or API call fails
   *
   * @example
   * try {
   *   const slots = await fetchAvailableTimeSlots(dayjs('2024-01-15'));
   *   console.log('Available slots:', slots);
   * } catch (error) {
   *   console.error('Failed to fetch slots:', error);
   * }
   */
  const fetchAvailableTimeSlots = useCallback(
    async (date: dayjs.Dayjs): Promise<any> => {
      // Check if we have the required address information
      if (!selectedAddress?.country || !selectedAddress?.city) {
        const errorMessage =
          "Please select an address first to view available time slots";
        showSnackbarWithConfig({
          message: errorMessage,
          type: "warning",
          duration: 4000,
        });
        return;
      }

      setIsLoadingSlots(true);

      try {
        const url = new URL(
          `${API_CONFIG.detailerAppUrl}/api/v1/availability/get_timeslots/`
        );
        url.searchParams.append("date", date.format("YYYY-MM-DD"));
        // Calculate total service duration including addon extra time
        const totalServiceDuration = calculateTotalServiceDuration();

        url.searchParams.append(
          "service_duration",
          totalServiceDuration.toString()
        );
        url.searchParams.append("country", selectedAddress?.country || "");
        url.searchParams.append("city", selectedAddress?.city || "");
        url.searchParams.append("is_express_service", isExpressService.toString());
        // Pass lat/lng for geographic fallback (30km radius) when city match fails
        if (
          selectedAddress?.latitude != null &&
          selectedAddress?.longitude != null
        ) {
          url.searchParams.append(
            "latitude",
            selectedAddress.latitude.toString()
          );
          url.searchParams.append(
            "longitude",
            selectedAddress.longitude.toString()
          );
        }

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        const data = await response.json();

        // Check for error messages from the server first
        if (data.error) {
          setAlertConfig({
            title: "Availability Error",
            message: data.error,
            type: "warning",
            isVisible: true,
            onConfirm: () => {
              setIsVisible(false);
              resetBooking();
            },
          });
          setAvailableTimeSlots([]);
          return data;
        }

        // Transform the detailer server response format to our TimeSlot interface
        const transformedSlots: TimeSlot[] = [];

        // Check for the correct response format (slots array)
        if (data.slots && Array.isArray(data.slots)) {
          data.slots.forEach((slot: any, index: number) => {
            if (slot.is_available && slot.start_time && slot.end_time) {
              transformedSlots.push({
                startTime: slot.start_time,
                endTime: slot.end_time,
                isAvailable: slot.is_available,
                isSelected: false, // Reset selection when fetching new slots
              });
            }
          });
        } else if (
          data.available_slots &&
          Array.isArray(data.available_slots)
        ) {
          data.available_slots.forEach((slot: any, index: number) => {
            if (slot.is_available && slot.start_time && slot.end_time) {
              transformedSlots.push({
                startTime: slot.start_time,
                endTime: slot.end_time,
                isAvailable: slot.is_available,
                isSelected: false, // Reset selection when fetching new slots
              });
            }
          });
        }

        // If no slots were transformed, show a message to the user
        if (transformedSlots.length === 0) {
          showSnackbarWithConfig({
            message:
              "No available time slots found for the selected date. Please try a different date.",
            type: "warning",
            duration: 4000,
          });
        }

        // Update available time slots with the transformed response
        setAvailableTimeSlots(transformedSlots);

        return data;
      } catch (error) {
        console.error("Error fetching timeslots:", error);
        setAvailableTimeSlots([]);
        throw error;
      } finally {
        setIsLoadingSlots(false);
      }
    },
    [
      calculateTotalServiceDuration,
      selectedAddress,
      setAlertConfig,
      setIsVisible,
      showSnackbarWithConfig,
    ]
  );

  /**
   * Checks if a time slot has been selected by the user
   *
   * This method determines if the user has selected a specific time slot
   * by checking if the selected date has a time that matches one of the
   * available time slots.
   *
   * @returns True if a time slot is selected, false otherwise
   * @type {boolean}
   *
   * @example
   * const hasSelectedTime = hasSelectedTimeSlot(); // Returns true if user selected a time
   */
  const hasSelectedTimeSlot = useCallback((): boolean => {
    if (availableTimeSlots.length === 0) return false;

    return availableTimeSlots.some((slot) => slot.isSelected);
  }, [availableTimeSlots]);

  /**
   * Handles time slot selection
   *
   * This method updates the selected date and time when a user chooses
   * a specific time slot. It creates a new Date object with the selected
   * time while preserving the current date.
   *
   * @param slot - The time slot object that was selected
   * @type {TimeSlot}
   *
   * @example
   * const slot = { startTime: "14:30", endTime: "15:30", isAvailable: true, isSelected: false };
   * handleTimeSlotSelect(slot);
   * // Updates selectedDate to 2:30 PM on the current date
   */
  const handleTimeSlotSelect = useCallback(
    (slot: TimeSlot) => {
      if (!slot.isAvailable) return;

      const [hours, minutes] = slot.startTime.split(":").map(Number);
      const newDate = new Date(selectedDate);
      newDate.setHours(hours, minutes, 0, 0);
      setSelectedDate(newDate);
      setSelectedSlotAt(Date.now());

      // Update the availableTimeSlots to mark the selected slot
      setAvailableTimeSlots((prevSlots) =>
        prevSlots.map((s) => ({
          ...s,
          isSelected:
            s.startTime === slot.startTime && s.endTime === slot.endTime,
        }))
      );
    },
    [selectedDate]
  );

  /**
   * Clears the selected time slot (e.g. when slot hold countdown expires).
   */
  const clearTimeSlotSelection = useCallback(() => {
    setSelectedSlotAt(null);
    setAvailableTimeSlots((prevSlots) =>
      prevSlots.map((s) => ({ ...s, isSelected: false }))
    );
  }, []);

  /**
   * Called when the 1-minute slot hold countdown expires. Clears the selection
   * and re-fetches time slots from the detailer so the user sees current
   * availability and must choose again.
   */
  const handleSlotHoldExpired = useCallback(async () => {
    clearTimeSlotSelection();
    try {
      await fetchAvailableTimeSlots(selectedDay);
    } catch (error) {
      console.error("Failed to re-fetch time slots after hold expiry:", error);
      setAvailableTimeSlots([]);
    }
  }, [clearTimeSlotSelection, fetchAvailableTimeSlots, selectedDay]);

  /**
   * Generates calendar days for the current month
   *
   * This method creates an array of calendar day objects for display
   * in the calendar component. It includes information about each day's
   * status (current month, selected, today, disabled).
   *
   * @param currentMonth - The month to generate days for
   * @type {dayjs.Dayjs}
   * @param selectedDay - The currently selected day
   * @type {dayjs.Dayjs}
   * @param minimumDate - The minimum allowed date
   * @type {Date}
   * @returns Array of calendar day objects
   * @type {CalendarDay[]}
   *
   * @example
   * const calendarDays = generateCalendarDays(dayjs(), dayjs('2024-01-15'), new Date());
   * // Returns array of calendar days with status information
   */
  const generateCalendarDays = useCallback(
    (
      currentMonth: dayjs.Dayjs,
      selectedDay: dayjs.Dayjs,
      minimumDate: Date
    ): CalendarDay[] => {
      const days: CalendarDay[] = [];
      const startOfMonth = currentMonth.startOf("month");
      const endOfMonth = currentMonth.endOf("month");
      const startOfWeek = startOfMonth.startOf("week");
      const endOfWeek = endOfMonth.endOf("week");

      let currentDay = startOfWeek;

      while (
        currentDay.isBefore(endOfWeek) ||
        currentDay.isSame(endOfWeek, "day")
      ) {
        const isCurrentMonth = currentDay.month() === currentMonth.month();
        const isSelected = currentDay.isSame(selectedDay, "day");
        const isToday = currentDay.isSame(dayjs(), "day");
        const isDisabled = currentDay.isBefore(dayjs(minimumDate), "day");

        days.push({
          date: currentDay,
          isCurrentMonth,
          isSelected,
          isToday,
          isDisabled,
        });

        currentDay = currentDay.add(1, "day");
      }

      return days;
    },
    []
  );

  /**
   * Handles month navigation in the calendar
   *
   * This method updates the current month state when users navigate
   * between months in the calendar view.
   *
   * @param direction - The direction to navigate ('prev' or 'next')
   * @type {'prev' | 'next'}
   *
   * @example
   * handleMonthNavigation('next'); // Moves to next month
   * handleMonthNavigation('prev'); // Moves to previous month
   */
  const handleMonthNavigation = useCallback(
    (direction: "prev" | "next") => {
      if (direction === "prev") {
        setCurrentMonth(currentMonth.subtract(1, "month"));
      } else {
        setCurrentMonth(currentMonth.add(1, "month"));
      }
    },
    [currentMonth]
  );

  /**
   * Handles day selection in the calendar
   *
   * This method updates the selected day and fetches available time slots
   * for the newly selected date. It validates that the selected date is
   * not before the minimum allowed date.
   *
   * @param dateString - The selected date as a string (YYYY-MM-DD format)
   * @type {string}
   *
   * @example
   * handleDaySelection('2024-01-15'); // Selects January 15, 2024 and fetches slots
   */
  const handleDaySelection = useCallback(
    async (dateString: string) => {
      const day = dayjs(dateString);
      const minimumDate = new Date();

      if (day.isBefore(dayjs(minimumDate), "day")) return;

      setSelectedDay(day);
      setCurrentMonth(day);

      // Update selected date while preserving the current time
      const newDate = new Date(selectedDate);
      newDate.setFullYear(day.year(), day.month(), day.date());
      setSelectedDate(newDate);

      // Fetch available time slots for the selected date
      try {
        await fetchAvailableTimeSlots(day);
      } catch (error) {
        console.error("Failed to fetch time slots:", error);
        // Clear available slots if API fails
        setAvailableTimeSlots([]);
      }
    },
    [selectedDate, fetchAvailableTimeSlots, isExpressService]
  );

  // ============================================================================
  // SELECTION HANDLERS
  // ============================================================================

  /**
   * Handles vehicle selection in the booking process
   *
   * This method updates the selected vehicle state when a user chooses a vehicle
   * from their garage. The selected vehicle will be used for the booking.
   *
   * @param vehicle - The vehicle object selected by the user
   * @type {MyVehiclesProps}
   *
   * @example
   * const vehicle = { id: "1", model: "Civic", make: "Honda", ... };
   * handleVehicleSelection(vehicle);
   * // Updates selectedVehicle state to the provided vehicle
   */
  const handleVehicleSelection = useCallback((vehicle: MyVehiclesProps) => {
    setSelectedVehicle(vehicle);
  }, []);

  /**
   * Handles SUV surcharge toggle
   *
   * This method updates the SUV surcharge state. When a vehicle is marked as an SUV,
   * an additional surcharge is applied to the booking price.
   *
   * @param suv - Boolean indicating if the vehicle is an SUV
   * @type {boolean}
   *
   * @example
   * handleSUVChange(true);  // Enables SUV surcharge
   * handleSUVChange(false); // Disables SUV surcharge
   */
  const handleSUVChange = useCallback((suv: boolean) => {
    setIsSUV(suv);
  }, []);

  /**
   * Handles express service toggle
   *
   * This method updates the express service state. When express service is selected,
   * an additional €30 fee is applied and the system attempts to assign 2 detailers.
   *
   * @param expressService - Boolean indicating if express service is selected
   * @type {boolean}
   *
   * @example
   * handleExpressServiceChange(true);  // Enables express service
   * handleExpressServiceChange(false); // Disables express service
   */
  const handleExpressServiceChange = useCallback((expressService: boolean) => {
    setIsExpressService(expressService);
  }, []);

  /**
   * Handles service type selection in the booking process
   *
   * This method updates the selected service type state when a user chooses
   * a service from the available options. The service type determines the
   * base price and duration of the booking.
   *
   * @param serviceType - The service type object selected by the user
   * @type {ServiceTypeProps}
   *
   * @example
   * const serviceType = { id: "1", name: "Basic Wash", price: 25, duration: 30, ... };
   * handleServiceTypeSelection(serviceType);
   * // Updates selectedServiceType state to the provided service type
   */
  const handleServiceTypeSelection = useCallback(
    async (serviceType: ServiceTypeProps) => {
      setSelectedServiceType(serviceType);
      // Re-fetch time slots if we have a selected date and address
      if (selectedAddress?.country && selectedAddress?.city && selectedDay) {
        try {
          await fetchAvailableTimeSlots(selectedDay);
        } catch (error) {
          console.error(
            "Failed to re-fetch time slots after service type change:",
            error
          );
          setAvailableTimeSlots([]);
        }
      }
    },
    [selectedAddress, selectedDay, fetchAvailableTimeSlots]
  );

  /**
   * Handles valet type selection in the booking process
   *
   * This method updates the selected valet type state when a user chooses
   * a valet method from the available options. The valet type determines
   * the cleaning approach used. After selecting a valet type, the addon
   * selection modal is automatically shown.
   *
   * @param valetType - The valet type object selected by the user
   * @type {ValetTypeProps}
   *
   * @example
   * const valetType = { id: "1", name: "Traditional Wash", description: "Standard water-based cleaning" };
   * handleValetTypeSelection(valetType);
   * // Updates selectedValetType state and shows addon modal
   */
  const handleValetTypeSelection = useCallback(
    async (valetType: ValetTypeProps) => {
      setSelectedValetType(valetType);
      // Show addon selection modal after valet type selection
      setIsAddonModalVisible(true);
      // Re-fetch time slots if we have a selected date and address
      if (selectedAddress?.country && selectedAddress?.city && selectedDay) {
        try {
          await fetchAvailableTimeSlots(selectedDay);
        } catch (error) {
          console.error(
            "Failed to re-fetch time slots after valet type change:",
            error
          );
          setAvailableTimeSlots([]);
        }
      }
    },
    [selectedAddress, selectedDay, fetchAvailableTimeSlots]
  );

  /**
   * Handles address selection in the booking process
   *
   * This method updates the selected address state when a user chooses
   * a service location from their saved addresses.
   *
   * @param address - The address object selected by the user
   * @type {MyAddressProps}
   *
   * @example
   * const address = { address: "123 Main Street", post_code: "SW1A 1AA", ... };
   * handleAddressSelection(address);
   * // Updates selectedAddress state to the provided address
   */
  const handleAddressSelection = useCallback((address: MyAddressProps) => {
    setSelectedAddress(address);
  }, []);

  /**
   * Handles addon selection in the booking process
   *
   * This method toggles the selection state of an addon. If the addon is
   * already selected, it removes it from the selection. If it's not selected,
   * it adds it to the selection.
   *
   * @param addon - The addon object to toggle selection for
   * @type {AddOnsProps}
   *
   * @example
   * const addon = { id: "1", name: "Interior Protection", price: 15, extra_duration: 30 };
   * handleAddonSelection(addon);
   * // Toggles the addon selection state
   */
  const handleAddonSelection = useCallback((addon: AddOnsProps) => {
    setSelectedAddons((prevAddons) => {
      const isAlreadySelected = prevAddons.some(
        (selected) => selected.id === addon.id
      );

      if (isAlreadySelected) {
        // Remove addon if already selected
        return prevAddons.filter((selected) => selected.id !== addon.id);
      } else {
        // Add addon if not selected
        return [...prevAddons, addon];
      }
    });
  }, []);

  /**
   * Handles addon selection and re-fetches time slots with updated duration
   *
   * This method updates the selected addons and then re-fetches available time slots
   * for the currently selected date with the new total duration (including addon time).
   * This ensures that when users modify their addon selection, the available time slots
   * reflect the correct duration requirements.
   *
   * @param addon - The addon to toggle selection for
   * @type {AddOnsProps}
   *
   * @example
   * handleAddonSelectionWithRefresh(addon);
   * // Updates addon selection and re-fetches time slots
   */
  const handleAddonSelectionWithRefresh = useCallback(
    async (addon: AddOnsProps) => {
      // Calculate the new addon selection state
      const isAlreadySelected = selectedAddons.some(
        (selected) => selected.id === addon.id
      );

      let newSelectedAddons: AddOnsProps[];
      if (isAlreadySelected) {
        // Remove addon if already selected
        newSelectedAddons = selectedAddons.filter(
          (selected) => selected.id !== addon.id
        );
      } else {
        // Add addon if not selected
        newSelectedAddons = [...selectedAddons, addon];
      }

      // Update the state
      setSelectedAddons(newSelectedAddons);

      // Calculate the new total duration with the updated addons
      const totalServiceDuration =
        calculateTotalServiceDuration(newSelectedAddons);

      // Re-fetch time slots with the new duration
      if (selectedAddress?.country && selectedAddress?.city && selectedDay) {
        try {
          // Create URL with query parameters for GET request
          const url = new URL(
            `${API_CONFIG.detailerAppUrl}/api/v1/availability/get_timeslots/`
          );
          url.searchParams.append("date", selectedDay.format("YYYY-MM-DD"));
          url.searchParams.append(
            "service_duration",
            totalServiceDuration.toString()
          );
          url.searchParams.append("country", selectedAddress?.country || "");
          url.searchParams.append("city", selectedAddress?.city || "");
          // Pass lat/lng for geographic fallback (30km radius) when city match fails
          if (
            selectedAddress?.latitude != null &&
            selectedAddress?.longitude != null
          ) {
            url.searchParams.append(
              "latitude",
              selectedAddress.latitude.toString()
            );
            url.searchParams.append(
              "longitude",
              selectedAddress.longitude.toString()
            );
          }

          const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            return;
          }

          const data = await response.json();

          // Check for error messages from the server first
          if (data.error) {
            setAlertConfig({
              title: "Availability Error",
              message: data.error,
              type: "warning",
              isVisible: true,
              onConfirm: () => {
                setIsVisible(false);
              },
            });
            setAvailableTimeSlots([]);
            return;
          }

          // Transform the detailer server response format to our TimeSlot interface
          const transformedSlots: TimeSlot[] = [];

          // Check for the correct response format (slots array)
          if (data.slots && Array.isArray(data.slots)) {
            data.slots.forEach((slot: any, index: number) => {
              if (slot.is_available && slot.start_time && slot.end_time) {
                transformedSlots.push({
                  startTime: slot.start_time,
                  endTime: slot.end_time,
                  isAvailable: slot.is_available,
                  isSelected: false, // Reset selection when fetching new slots
                });
              }
            });
          } else if (
            data.available_slots &&
            Array.isArray(data.available_slots)
          ) {
            data.available_slots.forEach((slot: any, index: number) => {
              if (slot.is_available && slot.start_time && slot.end_time) {
                transformedSlots.push({
                  startTime: slot.start_time,
                  endTime: slot.end_time,
                  isAvailable: slot.is_available,
                  isSelected: false, // Reset selection when fetching new slots
                });
              }
            });
          }

          // If no slots were transformed, show a message to the user
          if (transformedSlots.length === 0) {
            setAlertConfig({
              title: "No Available Times",
              message:
                "No available time slots found for the selected date. Please try a different date.",
              type: "warning",
              isVisible: true,
              onConfirm: () => {
                setIsVisible(false);
              },
            });
          }

          // Update available time slots with the transformed response
          setAvailableTimeSlots(transformedSlots);
        } catch (error) {
          console.error(
            "Failed to re-fetch time slots after addon change:",
            error
          );
          setAvailableTimeSlots([]);
        }
      }
    },
    [
      selectedAddons,
      calculateTotalServiceDuration,
      selectedAddress,
      selectedDay,
      setAlertConfig,
      setIsVisible,
    ]
  );

  /**
   * Handles closing the addon selection modal
   *
   * This method closes the addon selection modal and allows the user
   * to continue with the booking process.
   *
   * @example
   * handleCloseAddonModal();
   * // Closes the addon selection modal
   */
  const handleCloseAddonModal = useCallback(() => {
    setIsAddonModalVisible(false);
  }, []);

  /**
   * Handles confirming addon selection
   *
   * This method closes the addon selection modal and allows the user
   * to proceed to the next step in the booking process.
   *
   * @example
   * handleConfirmAddons();
   * // Closes the modal and continues with booking
   */
  const handleConfirmAddons = useCallback(() => {
    setIsAddonModalVisible(false);
  }, []);

  /**
   * Handles date and time selection from the TimeSlotPicker component
   *
   * This method is called by the TimeSlotPicker when a user selects
   * a new date or time. The date parameter includes both date and time information.
   *
   * The method updates the selected date state and triggers time slot fetching
   * if the date has changed. It also validates that required address information
   * is available before making API calls.
   *
   * @param date - The selected date and time
   * @type {Date}
   *
   * @example
   * const selectedDateTime = new Date('2024-01-15T14:30:00');
   * handleDateChange(selectedDateTime);
   * // Updates selectedDate state and fetches available time slots
   */
  const handleDateChange = useCallback(
    async (date: Date) => {
      setSelectedDate(date);

      // Update selected day state
      const newSelectedDay = dayjs(date);
      setSelectedDay(newSelectedDay);

      // Only fetch time slots if we have address information
      if (selectedAddress?.country && selectedAddress?.city) {
        try {
          await fetchAvailableTimeSlots(newSelectedDay);
        } catch (error) {
          console.error("Failed to fetch time slots:", error);
          // Clear available slots if API fails
          setAvailableTimeSlots([]);
        }
      }
    },
    [selectedAddress, fetchAvailableTimeSlots]
  );

  /**
   * Handles special instructions text changes
   *
   * This method updates the special instructions state when a user enters
   * additional notes or requirements for their booking.
   *
   * @param instructions - The special instructions text entered by the user
   * @type {string}
   *
   * @example
   * handleSpecialInstructionsChange("Please pay extra attention to the interior");
   * // Updates specialInstructions state to the provided text
   */
  const handleSpecialInstructionsChange = useCallback(
    (instructions: string) => {
      setSpecialInstructions(instructions);
    },
    []
  );

  /**
   * Advances to the next step in the booking process
   *
   * This method moves the user to the next step in the multi-step booking flow.
   * It only advances if the current step is valid (all required fields are completed).
   *
   * The booking process has 5 steps:
   * 1. Vehicle Selection
   * 2. Service Type Selection
   * 3. Valet Type Selection
   * 4. Date, Time, and Location Selection
   * 5. Summary and Confirmation
   *
   * @example
   * handleNextStep();
   * // Advances from step 1 to step 2 if step 1 is valid
   */
  const handleNextStep = useCallback(() => {
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1);
    }
  }, [currentStep]);

  /**
   * Returns to the previous step in the booking process
   *
   * This method moves the user back to the previous step in the booking flow.
   * Users can always go back to previous steps to modify their selections.
   *
   * @example
   * handlePreviousStep();
   * // Moves from step 3 back to step 2
   */
  const handlePreviousStep = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  /**
   * Navigates to a specific step in the booking process
   *
   * This method allows direct navigation to any step in the booking flow.
   * Users can only navigate to steps that are valid (previous steps or current step).
   *
   * @param step - The step number to navigate to (1-5)
   * @type {number}
   *
   * @example
   * handleGoToStep(3); // Navigates directly to step 3 (Valet Type Selection)
   */
  const handleGoToStep = useCallback((step: number) => {
    if (step >= 1 && step <= 5) {
      setCurrentStep(step);
    }
  }, []);

  /**
   * Validates if a specific step is complete and valid
   *
   * This method checks if all required fields for a specific step are completed.
   * It's used to determine if users can proceed to the next step or navigate to a step.
   *
   * Validation rules for each step:
   * - Step 1 (Vehicle): Must have a selected vehicle
   * - Step 2 (Service): Must have a selected service type
   * - Step 3 (Valet): Must have a selected valet type
   * - Step 4 (Details): Must have a selected address and valid date (future date)
   * - Step 5 (Summary): Always valid (read-only)
   *
   * @param step - The step number to validate (1-5)
   * @type {number}
   * @returns True if the step is valid, false otherwise
   * @type {boolean}
   *
   * @example
   * const isValid = isStepValid(2); // Returns true if a service type is selected
   */
  const isStepValid = useCallback(
    (step: number): boolean => {
      switch (step) {
        case 1: // Vehicle selection
          return selectedVehicle !== null;
        case 2: // Service type selection
          return selectedServiceType !== null;
        case 3: // Valet type selection
          return selectedValetType !== null;
        case 4: // Date, time, and location
          return (
            selectedAddress !== null &&
            selectedDate > new Date() &&
            hasSelectedTimeSlot()
          );
        case 5: // Summary and confirmation
          return true;
        default:
          return false;
      }
    },
    [
      selectedVehicle,
      selectedServiceType,
      selectedValetType,
      selectedAddress,
      selectedDate,
      hasSelectedTimeSlot,
    ]
  );

  /**
   * Checks if the user can proceed to the next step
   *
   * This method validates the current step to determine if the user can
   * advance to the next step in the booking process.
   *
   * @param step - The current step number
   * @type {number}
   * @returns True if the user can proceed, false otherwise
   * @type {boolean}
   *
   * @example
   * const canProceed = canProceedToNextStep(2); // Returns true if service type is selected
   */
  const canProceedToNextStep = useCallback(
    (step: number): boolean => {
      return isStepValid(step);
    },
    [isStepValid]
  );

  /**
   * Checks if all required fields are completed to proceed to summary
   *
   * This method validates that all required booking information is completed
   * before allowing the user to proceed to the summary and confirmation step.
   *
   * Required fields:
   * - Vehicle selection
   * - Service type selection
   * - Valet type selection
   * - Address selection
   * - Valid date (future date)
   *
   * @returns True if all required fields are completed, false otherwise
   * @type {boolean}
   *
   * @example
   * const canProceed = canProceedToSummary(); // Returns true if all fields are completed
   */
  const canProceedToSummary = useCallback((): boolean => {
    return (
      selectedVehicle !== null &&
      selectedServiceType !== null &&
      selectedValetType !== null &&
      selectedAddress !== null &&
      selectedDate > new Date() &&
      hasSelectedTimeSlot()
    );
  }, [
    selectedVehicle,
    selectedServiceType,
    selectedValetType,
    selectedAddress,
    selectedDate,
    hasSelectedTimeSlot,
  ]);

  /**
   * Calculates the total price including SUV surcharge and addon costs
   *
   * This method calculates the final price for the booking by adding
   * the base service price, addon costs, and any applicable surcharges (like SUV surcharge).
   *
   * Price calculation:
   * - Base price: From selected service type
   * - Addon costs: Sum of all selected addon prices
   * - SUV surcharge: 15% of total price (base + addons) if vehicle is marked as SUV
   * - Total = Base price + Addon costs + SUV surcharge
   *
   * @returns The total price in euros
   * @type {number}
   *
   * @example
   * const totalPrice = getTotalPrice(); // Returns 108.75 if base price is 75, addons cost 18.75, and SUV surcharge is 15% of 93.75
   */
  const getTotalPrice = useCallback((): number => {
    const basePrice = selectedServiceType?.price || 0;
    const addonCosts = selectedAddons.reduce(
      (total, addon) => total + addon.price,
      0
    );
    const totalBeforeSurcharge = basePrice + addonCosts;
    const suvSurcharge = isSUV ? totalBeforeSurcharge * 0.15 : 0;
    const expressServiceFee = isExpressService ? 30 : 0;
    return totalBeforeSurcharge + suvSurcharge + expressServiceFee;
  }, [selectedServiceType, isSUV, isExpressService, selectedAddons]);

  /**
   * Gets the base price of the selected service
   *
   * This method returns the base price of the selected service type,
   * excluding any surcharges or additional fees.
   *
   * @returns The base service price in euros
   * @type {number}
   *
   * @example
   * const basePrice = getBasePrice(); // Returns 75 for Standard Detail service
   */
  const getBasePrice = useCallback((): number => {
    if (!selectedServiceType) return 0;
    
    // Use fleet_price if user is fleet owner/admin, otherwise use regular price
    if (selectedServiceType.user_price !== undefined) {
      return selectedServiceType.user_price;
    }
    
    if ((user?.is_fleet_owner || user?.is_branch_admin) && selectedServiceType.fleet_price) {
      return selectedServiceType.fleet_price;
    }
    
    return selectedServiceType.price;
  }, [selectedServiceType, user?.is_fleet_owner, user?.is_branch_admin]);

  /**
   * Gets the loyalty discount amount
   *
   * This method calculates the loyalty discount amount based on the user's tier and the selected addons.
   *
   * @returns The loyalty discount amount in euros
   * @type {number}
   *
   * @example
   * const loyaltyDiscount = getLoyaltyDiscount(); // Returns 10 if user has 10% discount and total price is 100
   */
  const getLoyaltyDiscount = useCallback((): number => {
    // Fleet owners and admins should NOT get loyalty discounts
    if (user?.is_fleet_owner || user?.is_branch_admin) return 0;
    if (!user?.loyalty_benefits?.discount) return 0;
    
    // Use fleet_price if user is fleet owner/admin, otherwise use regular price
    const servicePrice = selectedServiceType
      ? (selectedServiceType.user_price !== undefined
          ? selectedServiceType.user_price
          : (user?.is_fleet_owner || user?.is_branch_admin) && selectedServiceType.fleet_price
          ? selectedServiceType.fleet_price
          : selectedServiceType.price)
      : 0;
    
    const basePrice = servicePrice;
    const addonCosts = selectedAddons.reduce(
      (total, addon) => total + addon.price,
      0
    );
    const totalBeforeSurcharge = basePrice + addonCosts;
    const suvSurcharge = isSUV ? totalBeforeSurcharge * 0.15 : 0;
    const expressServiceFee = isExpressService ? 30 : 0;
    const totalBeforeDiscount = totalBeforeSurcharge + suvSurcharge + expressServiceFee;

    return totalBeforeDiscount * (user.loyalty_benefits.discount / 100);
  }, [
    user?.loyalty_benefits?.discount,
    user?.is_fleet_owner,
    user?.is_branch_admin,
    selectedServiceType,
    selectedAddons,
    isSUV,
    isExpressService,
  ]);

  /**
   * Gets the promotion discount amount
   *
   * This method calculates the promotion discount amount based on the user's active promotion.
   * The promotion discount is applied to the total price (base + addons + SUV surcharge).
   *
   * @returns The promotion discount amount in euros
   * @type {number}
   *
   * @example
   * const promotionDiscount = getPromotionDiscount(); // Returns 5 if user has 5% promotion and total price is 100
   */
  const getPromotionDiscount = useCallback((): number => {
    if (!promotions?.is_active || !promotions?.discount_percentage) return 0;

    // Do not apply promotion discount for fleet or partner accounts (regular users only)
    if (
      user?.is_fleet_owner ||
      user?.is_branch_admin ||
      user?.is_dealership ||
      user?.partner_referral_code
    )
      return 0;

    // Use fleet_price if user is fleet owner/admin, otherwise use regular price
    const servicePrice = selectedServiceType
      ? (selectedServiceType.user_price !== undefined
          ? selectedServiceType.user_price
          : (user?.is_fleet_owner || user?.is_branch_admin) && selectedServiceType.fleet_price
          ? selectedServiceType.fleet_price
          : selectedServiceType.price)
      : 0;

    const basePrice = servicePrice;
    const addonCosts = selectedAddons.reduce(
      (total, addon) => total + addon.price,
      0
    );
    const totalBeforeSurcharge = basePrice + addonCosts;
    const suvSurcharge = isSUV ? totalBeforeSurcharge * 0.15 : 0;
    const expressServiceFee = isExpressService ? 30 : 0;
    const totalBeforeDiscount = totalBeforeSurcharge + suvSurcharge + expressServiceFee;

    return totalBeforeDiscount * (promotions.discount_percentage / 100);
  }, [
    promotions?.is_active,
    promotions?.discount_percentage,
    user?.is_fleet_owner,
    user?.is_branch_admin,
    user?.is_dealership,
    user?.partner_referral_code,
    selectedServiceType,
    selectedAddons,
    isSUV,
    isExpressService,
  ]);
  /**
   * Gets the SUV surcharge amount
   *
   * This method returns the SUV surcharge amount if the vehicle is marked as an SUV.
   * The surcharge is a 15 percent increase on the total price (base price + addon costs).
   *
   * @returns The SUV surcharge amount (15% of total price if SUV, 0 otherwise)
   * @type {number}
   *
   * @example
   * const suvPrice = getSUVPrice(); // Returns 14.06 if total price is 93.75 and isSUV is true, 0 otherwise
   */
  /**
   * Gets the express service fee amount
   *
   * This method returns the express service fee if express service is selected.
   *
   * @returns The express service fee amount (€30 if selected, 0 otherwise)
   * @type {number}
   *
   * @example
   * const expressPrice = getExpressServicePrice(); // Returns 30 if isExpressService is true, 0 otherwise
   */
  const getExpressServicePrice = useCallback((): number => {
    return isExpressService ? 30 : 0;
  }, [isExpressService]);

  const getSUVPrice = useCallback((): number => {
    // Use fleet_price if user is fleet owner/admin, otherwise use regular price
    const servicePrice = selectedServiceType
      ? (selectedServiceType.user_price !== undefined
          ? selectedServiceType.user_price
          : (user?.is_fleet_owner || user?.is_branch_admin) && selectedServiceType.fleet_price
          ? selectedServiceType.fleet_price
          : selectedServiceType.price)
      : 0;
    
    const basePrice = servicePrice;
    const addonCosts = selectedAddons.reduce(
      (total, addon) => total + addon.price,
      0
    );
    const totalBeforeSurcharge = basePrice + addonCosts;
    return isSUV ? totalBeforeSurcharge * 0.15 : 0;
  }, [isSUV, selectedServiceType, user?.is_fleet_owner, user?.is_branch_admin, selectedAddons]);

  /**
   * Gets the original price before loyalty discount (for display purposes)
   *
   * @returns The original price before any loyalty discount
   */
  const getOriginalPrice = useCallback((): number => {
    // Use fleet_price if user is fleet owner/admin, otherwise use regular price
    const servicePrice = selectedServiceType
      ? (selectedServiceType.user_price !== undefined
          ? selectedServiceType.user_price
          : (user?.is_fleet_owner || user?.is_branch_admin) && selectedServiceType.fleet_price
          ? selectedServiceType.fleet_price
          : selectedServiceType.price)
      : 0;

    const basePrice = servicePrice;
    const addonCosts = selectedAddons.reduce(
      (total, addon) => total + addon.price,
      0
    );
    const totalBeforeSurcharge = basePrice + addonCosts;
    const suvSurcharge = isSUV ? totalBeforeSurcharge * 0.15 : 0;
    const expressServiceFee = isExpressService ? 30 : 0;

    return totalBeforeSurcharge + suvSurcharge + expressServiceFee;
  }, [selectedServiceType, user?.is_fleet_owner, user?.is_branch_admin, isSUV, isExpressService, selectedAddons]);

  /**
   * Calculate final price with option to exclude service base price (for free washes)
   *
   * This method provides a unified price calculation that can optionally exclude
   * the base service price when a free Quick Sparkle is applied. All discounts
   * and surcharges are calculated based on the actual amount being charged.
   *
   * @param excludeServicePrice - If true, sets service base price to 0 (free wash)
   * @returns Breakdown object with subtotal, VAT, and total
   *
   * @example
   * // Normal booking
   * const breakdown = calculateFinalPrice(false);  // { subtotal: 35.88, vat: 8.25, total: 44.13 }
   *
   * // Free Quick Sparkle (only charge addons)
   * const breakdown = calculateFinalPrice(true);   // { subtotal: 13.45, vat: 3.09, total: 16.54 }
   */
  const calculateFinalPrice = useCallback(
    (
      excludeServicePrice: boolean = false
    ): { subtotal: number; vat: number; total: number } => {
      // Step 1: Calculate base amounts
      // Use fleet_price if user is fleet owner/admin, otherwise use regular price
      const servicePrice = selectedServiceType
        ? (selectedServiceType.user_price !== undefined
            ? selectedServiceType.user_price
            : (user?.is_fleet_owner || user?.is_branch_admin) && selectedServiceType.fleet_price
            ? selectedServiceType.fleet_price
            : selectedServiceType.price)
        : 0;
      
      const basePrice = excludeServicePrice ? 0 : servicePrice;

      // Step 2: Calculate addon costs (with 4+ addon discount)
      let addonCosts = 0;
      if (selectedAddons.length >= 4) {
        const cheapestAddon = selectedAddons.reduce((min, addon) =>
          addon.price < min.price ? addon : min
        );
        addonCosts =
          selectedAddons.reduce((total, addon) => total + addon.price, 0) -
          cheapestAddon.price;
      } else {
        addonCosts = selectedAddons.reduce(
          (total, addon) => total + addon.price,
          0
        );
      }

      // Step 3: Calculate subtotal
      const subtotal = basePrice + addonCosts;

      // Step 4: Add SUV surcharge (NO surcharge when free wash is applied)
      const suvSurcharge = excludeServicePrice
        ? 0
        : isSUV
        ? subtotal * 0.15
        : 0;

      // Step 4b: Add express service fee (NO fee when free wash is applied)
      const expressServiceFee = excludeServicePrice ? 0 : isExpressService ? 30 : 0;

      // Step 5: Total before loyalty/promotion discounts
      const totalBeforeDiscounts = subtotal + suvSurcharge + expressServiceFee;

      // Step 6: Calculate loyalty discount (applied to current total)
      // Fleet owners and admins should NOT get loyalty discounts
      const loyaltyDiscount = 
        !(user?.is_fleet_owner || user?.is_branch_admin) &&
        user?.loyalty_benefits?.discount
          ? totalBeforeDiscounts * (user.loyalty_benefits.discount / 100)
          : 0;

      // Step 7: Calculate promotion discount (applied to current total)
      // Only for regular users; fleet and partners are excluded at API and here
      const isFleetOrPartner =
        user?.is_fleet_owner ||
        user?.is_branch_admin ||
        user?.is_dealership ||
        user?.partner_referral_code;
      const promotionDiscount =
        !isFleetOrPartner &&
        promotions?.is_active &&
        promotions?.discount_percentage
          ? totalBeforeDiscounts * (promotions.discount_percentage / 100)
          : 0;

      // Step 8: Calculate total after discounts (this is the final price with VAT included)
      const total = totalBeforeDiscounts - loyaltyDiscount - promotionDiscount;

      // Step 9: Extract VAT from total (since prices already include VAT)
      // Formula: subtotal_ex_vat = total / (1 + VAT_RATE)
      const subtotalExVat = total / (1 + VAT_RATE);
      const vat = total - subtotalExVat;

      return {
        subtotal: subtotalExVat,
        vat: vat,
        total: total,
      };
    },
    [
      selectedServiceType,
      selectedAddons,
      isSUV,
      isExpressService,
      user?.loyalty_benefits,
      promotions,
    ]
  );

  /**
   * Gets the final price after all discounts (loyalty + promotion)
   *
   * @deprecated Use calculateFinalPrice(false) instead for consistency
   * @returns The final price after all applicable discounts (including VAT)
   */
  const getFinalPrice = useCallback((): number => {
    // Use the new unified method for consistency
    return calculateFinalPrice(false).total;
  }, [calculateFinalPrice]);

  /**
   * Gets the total cost of selected addons
   *
   * This method calculates the total cost of all selected addons by summing
   * their individual prices.
   *
   * @returns The total addon cost
   * @type {number}
   *
   * @example
   * const addonCost = getAddonPrice(); // Returns 25 if two addons cost 10 and 15
   */
  const getAddonPrice = useCallback((): number => {
    // if the user select four or more addons, remove the cheapest addon price
    if (selectedAddons.length >= 4) {
      const cheapestAddon = selectedAddons.reduce((min, addon) =>
        addon.price < min.price ? addon : min
      );
      return (
        selectedAddons.reduce((total, addon) => total + addon.price, 0) -
        cheapestAddon.price
      );
    }
    return selectedAddons.reduce((total, addon) => total + addon.price, 0);
  }, [selectedAddons]);

  /**
   * Gets the total extra duration from selected addons
   *
   * This method calculates the total extra time required for all selected addons
   * by summing their individual extra_duration values.
   *
   * @returns The total extra duration in minutes
   * @type {number}
   *
   * @example
   * const extraTime = getAddonDuration(); // Returns 45 if two addons add 20 and 25 minutes
   */
  const getAddonDuration = useCallback((): number => {
    return selectedAddons.reduce(
      (total, addon) => total + addon.extra_duration,
      0
    );
  }, [selectedAddons]);

  /**
   * Gets the estimated duration of the selected service including addons
   *
   * This method returns the estimated duration of the selected service type
   * plus any additional time required for selected addons.
   * The duration is used for calculating available time slots and scheduling.
   *
   * @returns The estimated duration in minutes (service + addons)
   * @type {number}
   *
   * @example
   * const duration = getEstimatedDuration(); // Returns 120 for 90min service + 30min addon
   */
  const getEstimatedDuration = useCallback((): number => {
    const serviceDuration = selectedServiceType?.duration || 60;
    const addonDuration = getAddonDuration();
    return serviceDuration + addonDuration;
  }, [selectedServiceType, getAddonDuration]);

  /**
   * Formats a price value to euro currency string
   *
   * This method formats a numeric price value into a properly formatted
   * euro currency string with two decimal places.
   *
   * @param price - The price value to format
   * @type {number}
   * @returns Formatted price string (e.g., "€25.00")
   * @type {string}
   *
   * @example
   * const formattedPrice = formatPrice(25); // Returns "€25.00"
   * const formattedPrice = formatPrice(75.5); // Returns "€75.50"
   */
  const formatPrice = useCallback(
    (price: number): string => {
      return formatCurrency(price);
    },
    [formatCurrency]
  );

  /**
   * Formats duration in minutes to a human-readable string
   *
   * This method converts a duration in minutes to a user-friendly format
   * that displays hours and minutes appropriately.
   *
   * @param minutes - The duration in minutes
   * @type {number}
   * @returns Formatted duration string (e.g., "1h 30m", "45m")
   * @type {string}
   *
   * @example
   * const duration = formatDuration(90); // Returns "1h 30m"
   * const duration = formatDuration(45); // Returns "45m"
   * const duration = formatDuration(120); // Returns "2h"
   */
  const formatDuration = useCallback((minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours > 0 && mins > 0) {
      return `${hours}h ${mins}m`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      return `${mins}m`;
    }
  }, []);

  /**
   * Resets all booking state to initial values
   *
   * This method clears all booking selections and returns the booking
   * process to its initial state. It's typically called after a successful
   * booking or when the user wants to start over.
   *
   * Resets the following state:
   * - selectedVehicle: null
   * - selectedServiceType: null
   * - selectedValetType: null
   * - selectedAddress: null
   * - selectedDate: current date
   * - specialInstructions: empty string
   * - currentStep: 1
   * - isSUV: false
   * - selectedAddons: empty array
   * - isAddonModalVisible: false
   * - isConfirmationModalVisible: false
   * - confirmationBookingData: null
   *
   * @example
   * resetBooking();
   * // All booking state is reset to initial values
   */
  const resetBooking = useCallback(() => {
    setSelectedVehicle(null);
    setSelectedServiceType(null);
    setSelectedValetType(null);
    setSelectedAddress(null);
    setSelectedDate(new Date());
    setSpecialInstructions("");
    setCurrentStep(1);
    setIsSUV(false);
    setIsExpressService(false);
    setSelectedAddons([]);
    setIsAddonModalVisible(false);
    setIsConfirmationModalVisible(false);
    setConfirmationBookingData(null);
    setConfirmationBookingReference("");
    setIsCancellationModalVisible(false);
    setCancellationData(null);
    setCancellationBookingReference("");
    setWinnerVoucherApplied(null);
    setWinnerVoucherCode("");
  }, []);

  /**
   * Handles closing the confirmation modal
   *
   * This method closes the confirmation modal and resets the booking state.
   *
   * @example
   * handleCloseConfirmationModal();
   * // Closes the confirmation modal and resets booking
   */
  const handleCloseConfirmationModal = useCallback(() => {
    setIsConfirmationModalVisible(false);
    setConfirmationBookingData(null);
    setConfirmationBookingReference("");
    resetBooking();
    refetchAppointments();
    router.push("/main/dashboard/DashboardScreen");
  }, [resetBooking, refetchAppointments]);

  /**
   * Handles viewing the dashboard from the confirmation modal
   *
   * This method closes the confirmation modal and navigates to the dashboard.
   *
   * @example
   * handleViewDashboard();
   * // Closes modal and navigates to dashboard
   */
  const handleViewDashboard = useCallback(() => {
    setIsConfirmationModalVisible(false);
    setConfirmationBookingData(null);
    setConfirmationBookingReference("");
    resetBooking();
    refetchAppointments();
    router.push("/main/dashboard/DashboardScreen");
  }, [resetBooking, refetchAppointments]);

  /**
   * Handles closing the cancellation modal
   *
   * This method closes the cancellation modal without proceeding with cancellation.
   *
   * @example
   * handleCloseCancellationModal();
   * // Closes the cancellation modal
   */
  const handleCloseCancellationModal = useCallback(() => {
    setIsCancellationModalVisible(false);
    setCancellationData(null);
    setCancellationBookingReference("");
  }, []);

  const applyWinnerVoucherCode = useCallback(async () => {
    const code = winnerVoucherCode.trim();
    if (!code) {
      showSnackbarWithConfig({
        message: "Enter a code",
        type: "error",
        duration: 2500,
      });
      return;
    }
    const pre = calculateFinalPrice(false).total;
    try {
      const res = await applyWinnerVoucherMut({
        code,
        pre_voucher_total_amount: pre,
      }).unwrap();
      setWinnerVoucherApplied({
        voucherId: res.voucher_id,
        amountDue: res.amount_due,
        discountApplied: res.discount_applied,
        preTotal: res.pre_voucher_total,
      });
      showSnackbarWithConfig({
        message:
          res.amount_due <= 0
            ? "Voucher applied — no payment due."
            : `Voucher applied. ${formatCurrency(res.discount_applied)} off.`,
        type: "success",
        duration: 3500,
      });
    } catch (error: unknown) {
      setWinnerVoucherApplied(null);
      let message = "Could not apply this code.";
      if (
        error &&
        typeof error === "object" &&
        "data" in error &&
        (error as { data?: { error?: string } }).data?.error
      ) {
        message = (error as { data: { error: string } }).data.error;
      }
      showSnackbarWithConfig({
        message,
        type: "error",
        duration: 4000,
      });
    }
  }, [
    winnerVoucherCode,
    calculateFinalPrice,
    applyWinnerVoucherMut,
    showSnackbarWithConfig,
    formatCurrency,
  ]);

  const clearWinnerVoucher = useCallback(() => {
    setWinnerVoucherApplied(null);
    setWinnerVoucherCode("");
  }, []);

  const getPayableTotal = useCallback((): number => {
    if (winnerVoucherApplied) return winnerVoucherApplied.amountDue;
    return calculateFinalPrice(false).total;
  }, [winnerVoucherApplied, calculateFinalPrice]);

  /**
   * Handles the complete booking confirmation flow including payment and booking creation
   *
   * This method orchestrates the entire booking confirmation process:
   * 1. Builds booking data for client and detailer apps
   * 2. Processes payment through Stripe with booking data
   * 3. Waits for webhook to create bookings (webhook handles booking creation)
   * 4. Shows confirmation modal with booking details
   * 5. Handles navigation after successful booking
   *
   * @example
   * handleBookingConfirmation();
   * // Processes payment, webhook creates bookings automatically
   */
  const handleBookingConfirmation = useCallback(async () => {
    try {
      setIsLoading(true);
      setPaymentConfirmationStatus("pending");
      // Generate a booking reference
      const bookingReference = `APT${Date.now()}`;

      // Check if this is a Quick Sparkle - always call checkFreeWash; backend decides eligibility (loyalty or partner)
      const isQuickSparkle = selectedServiceType?.name === "The Quick Sparkle";
      let priceBreakdown = calculateFinalPrice(false);
      let applyFreeQuickSparkle = false;

      if (isQuickSparkle) {
        try {
          const checkResult = await checkFreeWash();

          if (checkResult.data && checkResult.data.can_use_free_wash) {
            priceBreakdown = calculateFinalPrice(true);
            applyFreeQuickSparkle = true;

            const message = checkResult.data.partner_free_wash
              ? "Partner free Quick Sparkle applied!"
              : `Free Quick Sparkle applied! You have ${checkResult.data.remaining_quick_sparkles} left this month.`;

            showSnackbarWithConfig({
              message,
              type: "success",
              duration: 3000,
            });
          }
        } catch (error) {
        }
      }

      // Calculate end time by adding total service duration to start time
      const startTime = selectedDate;
      const totalDurationMinutes = calculateTotalServiceDuration();
      const endTime = new Date(
        startTime.getTime() + totalDurationMinutes * 60 * 1000
      );

      const preWinnerBreakdown = calculateFinalPrice(false);
      const useWinnerVoucher =
        Boolean(winnerVoucherApplied) && !applyFreeQuickSparkle;
      const amountToPay = useWinnerVoucher
        ? winnerVoucherApplied!.amountDue
        : priceBreakdown.total;

      // Build booking data for client app (used to create BookedAppointment)
      const bookingDataForClient: Record<string, unknown> = {
        date: selectedDate ? formatLocalDate(selectedDate) : "",
        vehicle: selectedVehicle,
        valet_type: selectedValetType,
        service_type: selectedServiceType,
        address: selectedAddress,
        status: "accepted", // No separate accept step; job is accepted when assigned
        total_amount: amountToPay,
        subtotal_amount: useWinnerVoucher
          ? preWinnerBreakdown.subtotal
          : priceBreakdown.subtotal,
        vat_amount: useWinnerVoucher
          ? preWinnerBreakdown.vat
          : priceBreakdown.vat,
        vat_rate: VAT_RATE * 100, // Convert to percentage (23.00)
        addons: selectedAddons,
        start_time: selectedDate ? formatLocalTime(selectedDate) : "",
        duration: getEstimatedDuration(),
        special_instructions: specialInstructions,
        booking_reference: bookingReference,
        applied_free_quick_sparkle: applyFreeQuickSparkle,
        is_express_service: isExpressService,
      };
      if (useWinnerVoucher) {
        bookingDataForClient.pre_voucher_total_amount = preWinnerBreakdown.total;
        bookingDataForClient.winner_voucher_id = winnerVoucherApplied!.voucherId;
      }

      // Build detailer booking data (formatted for detailer app)
      const detailerBookingData: CreateBookingProps = {
        client_name: user?.name || "",
        client_phone: user?.phone || "",
        vehicle_registration: selectedVehicle?.licence || "",
        vehicle_make: selectedVehicle?.make || "",
        vehicle_model: selectedVehicle?.model || "",
        vehicle_year: selectedVehicle?.year.toString() || "",
        vehicle_color: selectedVehicle?.color || "",
        address: selectedAddress?.address || "",
        city: selectedAddress?.city || "",
        postcode: selectedAddress?.post_code || "",
        country: selectedAddress?.country || "",
        latitude: selectedAddress?.latitude ?? 0,
        longitude: selectedAddress?.longitude ?? 0,
        valet_type: selectedValetType?.name || "",
        addons: selectedAddons.map((addon) => addon.name || ""),
        special_instructions: specialInstructions || "",
        total_amount: getOriginalPrice(), // Send original price to detailer (no discount info)
        status: "accepted", // No separate accept step; job is accepted when created
        booking_reference: bookingReference,
        service_type: selectedServiceType?.name || "",
        booking_date: selectedDate ? formatLocalDate(selectedDate) : "",
        start_time: formatLocalTime(startTime),
        end_time: formatLocalTime(endTime),
        loyalty_tier: user?.loyalty_tier || "",
        loyalty_benefits: user?.loyalty_benefits?.free_service || [],
        is_express_service: isExpressService,
      };

      // Process payment with booking data (webhook will create bookings)
      setIsProcessingPayment(true);
      const paymentResult = await openPaymentSheet(
        amountToPay,
        "Prisma Valet",
        bookingReference,
        bookingDataForClient,
        detailerBookingData
      );

      // If payment was cancelled, don't proceed
      if (!paymentResult.success) {
        setIsProcessingPayment(false);
        setPaymentConfirmationStatus("failed");
        return;
      }

      // Free booking - already created on server, skip payment confirmation
      if (paymentResult.freeBooking) {
        setPaymentConfirmationStatus("confirmed");
        setIsProcessingPayment(false);

        // Mark promotion as used if there's an active promotion (best-effort; 404 is non-fatal)
        if (promotions?.is_active && promotions?.id) {
          try {
            await markPromotionAsUsed({
              promotion_id: String(promotions.id),
              booking_reference: bookingReference,
            }).unwrap();
          } catch (error: any) {
            const status = error?.status ?? error?.data?.status;
            if (status === 404) {
            } else {
            }
          }
        }

        setConfirmationBookingReference(bookingReference);
        setConfirmationBookingData({
          success: true,
          booking_reference: bookingReference,
        } as ReturnBookingProps);
        setIsConfirmationModalVisible(true);
        return;
      }

      // Wait for webhook confirmation (webhook creates bookings automatically)
      if (!paymentResult.paymentIntentId) {
        setIsProcessingPayment(false);
        setPaymentConfirmationStatus("failed");
        return;
      }

      setPaymentConfirmationStatus("confirming");
      try {
        await waitForPaymentConfirmation(paymentResult.paymentIntentId);
        setPaymentConfirmationStatus("confirmed");
        setIsProcessingPayment(false);

        // Mark promotion as used if there's an active promotion (best-effort; 404 is non-fatal)
        if (promotions?.is_active && promotions?.id) {
          try {
            await markPromotionAsUsed({
              promotion_id: String(promotions.id),
              booking_reference: bookingReference,
            }).unwrap();
          } catch (error: any) {
            const status = error?.status ?? error?.data?.status;
            if (status === 404) {
            } else {
            }
          }
        }

        setConfirmationBookingReference(bookingReference);
        setConfirmationBookingData({
          success: true,
          booking_reference: bookingReference,
        } as ReturnBookingProps);
        setIsConfirmationModalVisible(true);
      } catch (error: any) {
        setIsProcessingPayment(false);
        setPaymentConfirmationStatus("failed");
        showSnackbarWithConfig({
          message:
            error.message ||
            "Payment confirmation failed. Please contact support if payment was charged.",
          type: "error",
          duration: 5000,
        });
        return;
      }
    } catch (error: any) {
      let message = "";
      if (error?.data?.error) {
        message = error.data.error;
      } else if (error?.status === 400) {
        message = "Booking confirmation failed";
      } else if (error?.status === 401) {
        message = "You must be logged in to create a booking.";
      } else if (error?.status === 500) {
        message = "Server error. Please try again later.";
      } else {
        message = error?.message || "An error occurred during booking";
      }
      setPaymentConfirmationStatus("failed");
      setIsProcessingPayment(false);
      showSnackbarWithConfig({
        message: message,
        type: "error",
        duration: 3000,
      });
    } finally {
      setIsLoading(false);
      setIsProcessingPayment(false);
    }
  }, [
    openPaymentSheet,
    waitForPaymentConfirmation,
    calculateFinalPrice,
    checkFreeWash,
    showSnackbarWithConfig,
    selectedDate,
    selectedVehicle,
    selectedValetType,
    selectedServiceType,
    selectedAddress,
    selectedAddons,
    specialInstructions,
    calculateTotalServiceDuration,
    getEstimatedDuration,
    getOriginalPrice,
    user,
    promotions,
    markPromotionAsUsed,
    isExpressService,
    winnerVoucherApplied,
  ]);

  /* Show cancellation modal with details */
  const showCancellationModal = useCallback(
    (
      bookingReference: string,
      appointmentDate?: string,
      totalAmount?: number
    ) => {
      // Calculate hours until appointment
      let hoursUntilAppointment = 0;
      if (appointmentDate) {
        const appointment = new Date(appointmentDate);
        const now = new Date();
        const timeDifference = appointment.getTime() - now.getTime();
        hoursUntilAppointment = Math.max(
          0,
          Math.ceil(timeDifference / (1000 * 60 * 60))
        );
      }

      // Tiered refund: >12h full, 6-12h half, <=6h none
      const actualAmount = totalAmount || 0;
      let refundAmount = 0;
      let tier: "full" | "half" | "none" = "none";
      let message = "This booking will be cancelled.";

      if (hoursUntilAppointment > 12) {
        tier = "full";
        refundAmount = actualAmount;
        message =
          "This booking will be cancelled and you will receive a full refund.";
      } else if (hoursUntilAppointment > 6) {
        tier = "half";
        refundAmount = actualAmount / 2;
        message =
          "This booking will be cancelled and you will receive a 50% refund.";
      } else {
        tier = "none";
        message =
          "This booking will be cancelled. You will NOT receive a refund (cancellation within 6 hours of appointment).";
      }

      const cancellationData = {
        message,
        booking_status: "pending_cancellation",
        refund:
          refundAmount > 0
            ? { amount: Math.round(refundAmount * 100), tier }
            : null,
        hours_until_appointment: hoursUntilAppointment,
        tier,
      };

      setCancellationData(cancellationData);
      setCancellationBookingReference(bookingReference);
      setIsCancellationModalVisible(true);
    },
    []
  );

  /* Handle actual booking cancellation */
  const handleCancelBooking = useCallback(
    async (bookingReference: string) => {
      /* Process the actual cancellation */
      try {
        const response = await cancelBooking(bookingReference).unwrap();
        if (response) {
          const res = typeof response === "object" && response !== null ? response as { refund?: { tier?: string; processed?: boolean; amount?: number } } : null;
          const refund = res?.refund;
          let successMessage = "Appointment cancelled successfully.";
          if (refund?.tier === "full" && refund?.processed) {
            successMessage = `Appointment cancelled. Refund of ${refund.amount ?? ""} will be processed within 3-5 business days.`;
          } else if (refund?.tier === "half" && refund?.processed) {
            successMessage = `Appointment cancelled. 50% refund of ${refund.amount ?? ""} will be processed within 3-5 business days.`;
          } else if (refund?.tier === "none" || !refund?.processed) {
            successMessage = "Appointment cancelled. No refund applicable.";
          }
          showSnackbarWithConfig({
            message: successMessage,
            type: "success",
            duration: 3000,
          });
          refetchAppointments();
          // Navigate to dashboard after successful cancellation
          router.push("/main/dashboard/DashboardScreen");
          return true; // Return success status
        } else {
          showSnackbarWithConfig({
            message: "Booking Cancellation Failed",
            type: "error",
            duration: 3000,
          });
          return false; // Return failure status
        }
      } catch (error: any) {
        let message = "Failed to cancel booking";
        if (error?.data?.error) {
          message = error.data.error;
        }
        showSnackbarWithConfig({
          message: message,
          type: "error",
          duration: 3000,
        });
        throw error; // Re-throw to be caught by handleConfirmCancellation
      }
    },
    [cancelBooking, showSnackbarWithConfig, refetchAppointments]
  );

  const handleRescheduleBooking = useCallback(
    async (
      bookingId: string,
      newDate: string,
      newTime: string,
      totalCost?: number
    ) => {
      try {
        const response = await rescheduleBooking({
          booking_id: bookingId,
          new_date: newDate,
          new_time: newTime,
        }).unwrap();
        if (response) {
          const messageText =
            typeof response === "string"
              ? response
              : (response as { message?: string })?.message ??
                "Booking rescheduled successfully.";
          setAlertConfig({
            title: "Booking Rescheduled",
            message: messageText,
            type: "success",
            isVisible: true,
            onConfirm: () => {
              setIsVisible(false);
            },
          });
        }
      } catch (error: any) {
        let message = "Failed to reschedule booking";
        if (error?.data?.error) {
          message = error.data.error;
        }
        setAlertConfig({
          title: "Error",
          message: message,
          type: "error",
          isVisible: true,
          onConfirm: () => {
            setIsVisible(false);
          },
        });
      }
    },
    [rescheduleBooking, setAlertConfig, setIsVisible]
  );

  /**
   * Handles confirming the cancellation
   *
   * This method processes the actual cancellation and navigates to the dashboard.
   *
   * @example
   * handleConfirmCancellation();
   * // Processes cancellation and navigates to dashboard
   */
  const handleConfirmCancellation = useCallback(async () => {
    if (cancellationBookingReference) {
      try {
        await handleCancelBooking(cancellationBookingReference);
        // Close modal after successful cancellation
        setIsCancellationModalVisible(false);
        setCancellationData(null);
        setCancellationBookingReference("");
      } catch (error) {
        // Keep modal open if cancellation fails
        console.error("Cancellation failed:", error);
      }
    }
  }, [cancellationBookingReference, handleCancelBooking]);

  return {
    // State
    selectedVehicle,
    selectedServiceType,
    selectedValetType,
    selectedAddress,
    selectedDate,
    specialInstructions,
    currentStep,
    isLoading,
    isSUV,
    isExpressService,
    isProcessingPayment,
    paymentConfirmationStatus,
    selectedAddons,
    isAddonModalVisible,
    availableTimeSlots,
    isLoadingSlots,
    currentMonth,
    selectedDay,
    addOns,
    serviceTypes,
    valetTypes,
    user,
    isLoadingAddOns,
    isLoadingServiceTypes,
    isLoadingValetTypes,
    handleVehicleSelection,
    handleSUVChange,
    handleExpressServiceChange,
    handleServiceTypeSelection,
    handleValetTypeSelection,
    handleAddressSelection,
    handleDateChange,
    handleSpecialInstructionsChange,
    handleNextStep,
    handlePreviousStep,
    handleGoToStep,
    promotions,

    // Addon management handlers
    handleAddonSelection,
    handleAddonSelectionWithRefresh,
    handleCloseAddonModal,
    handleConfirmAddons,

    // Time slot management handlers
    fetchAvailableTimeSlots,
    handleTimeSlotSelect,
    clearTimeSlotSelection,
    handleSlotHoldExpired,
    selectedSlotAt,
    handleDaySelection,
    handleMonthNavigation,
    generateCalendarDays,
    hasSelectedTimeSlot,

    // Validation
    isStepValid,
    canProceedToNextStep,
    canProceedToSummary,

    // Booking
    resetBooking,

    // Confirmation modal state and handlers
    isConfirmationModalVisible,
    confirmationBookingData,
    confirmationBookingReference,
    handleCloseConfirmationModal,
    handleViewDashboard,

    // Cancellation modal state and handlers
    isCancellationModalVisible,
    cancellationData,
    cancellationBookingReference,
    showCancellationModal,
    handleCloseCancellationModal,
    handleConfirmCancellation,

    // Utilities
    getTotalPrice,
    getBasePrice,
    getSUVPrice,
    getExpressServicePrice,
    getAddonPrice,
    getAddonDuration,
    getEstimatedDuration,
    formatPrice,
    formatDuration,
    formatCurrency,
    handleBookingConfirmation,
    isLoadingBooking,
    handleRescheduleBooking,
    isLoadingRescheduleBooking,
    handleCancelBooking,
    isLoadingCancelBooking,
    getOriginalPrice,
    getFinalPrice,
    getLoyaltyDiscount,
    getPromotionDiscount,
    calculateFinalPrice,
    winnerVoucherApplied,
    winnerVoucherCode,
    setWinnerVoucherCode,
    applyWinnerVoucherCode,
    clearWinnerVoucher,
    getPayableTotal,
  };
};

export default useBooking;
