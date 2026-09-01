/**
 * Bulk booking hook: service type, valet, address, date, vehicle count, capacity check, build payload for payment.
 */
import { useState, useCallback, useEffect } from "react";
import dayjs from "dayjs";
import type { ServiceTypeProps, ValetTypeProps, AddOnsProps } from "@/app/interfaces/BookingInterfaces";
import { useLazyCheckBulkCapacityQuery } from "@/app/store/api/eventApi";
import type { MyAddressProps } from "@/app/interfaces/ProfileInterfaces";

export interface BulkCapacityOption {
  window: "morning" | "afternoon" | "fullday";
  best_start_time: string;
  estimated_finish_time: string;
  suggested_team_size: number;
}

export interface BulkBookingState {
  selectedServiceType: ServiceTypeProps | null;
  selectedValetType: ValetTypeProps | null;
  selectedAddons: AddOnsProps[];
  numberOfVehicles: number;
  isSUV: boolean;
  selectedDate: Date | null;
  selectedAddress: MyAddressProps | null;
  capacityOptions: BulkCapacityOption[] | null;
  selectedOption: BulkCapacityOption | null;
  isLoadingCapacity: boolean;
  capacityError: string | null;
  specialInstructions: string;
}

const BULK_DISCOUNT_THRESHOLD = 10;
const BULK_DISCOUNT_PERCENT = 10;
export const MIN_BULK_VEHICLES = 2;

/**
 * Bulk fleet booking hook: capacity check, pricing, and payload builder for payment.
 *
 * @returns Bulk booking state, pricing breakdown, and capacity/payload handlers
 */
export function useBulkBooking() {
  const [checkCapacity] = useLazyCheckBulkCapacityQuery();
  const [selectedServiceType, setSelectedServiceType] =
    useState<ServiceTypeProps | null>(null);
  const [selectedValetType, setSelectedValetType] =
    useState<ValetTypeProps | null>(null);
  const [numberOfVehicles, setNumberOfVehicles] = useState<number>(MIN_BULK_VEHICLES);
  const [isSUV, setIsSUV] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState<dayjs.Dayjs>(
    () => dayjs()
  );
  const [selectedAddress, setSelectedAddress] = useState<MyAddressProps | null>(
    null
  );
  const [specialInstructions, setSpecialInstructions] = useState<string>("");
  const [capacityOptions, setCapacityOptions] = useState<
    BulkCapacityOption[] | null
  >(null);
  const [selectedOption, setSelectedOption] =
    useState<BulkCapacityOption | null>(null);
  const [isLoadingCapacity, setIsLoadingCapacity] = useState(false);
  const [capacityError, setCapacityError] = useState<string | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<AddOnsProps[]>([]);

  useEffect(() => {
    if (selectedDate) {
      setCurrentCalendarMonth(dayjs(selectedDate));
    }
  }, [selectedDate]);

  // When user changes service, date, address or vehicle count, clear capacity so they must re-check
  const dateKey = selectedDate ? selectedDate.toISOString().slice(0, 10) : null;
  useEffect(() => {
    setCapacityOptions(null);
    setSelectedOption(null);
    setCapacityError(null);
  }, [selectedServiceType?.id, dateKey, selectedAddress?.id, numberOfVehicles, selectedValetType?.id]);

  const addonDurationTotal = selectedAddons.reduce(
    (sum, a) => sum + (a.extra_duration || 0),
    0
  );
  const addonPriceTotal = selectedAddons.reduce(
    (sum, a) => sum + (a.price || 0),
    0
  );

  /**
   * Resolve per-vehicle service price (user_price, fleet_price, or list price).
   *
   * @param service - Service type with pricing fields
   * @returns Price in euros for one vehicle
   */
  const getFleetPrice = useCallback((service: ServiceTypeProps): number => {
    if (service.user_price != null) return service.user_price;
    if (service.fleet_price != null) return service.fleet_price;
    return service.price;
  }, []);

  const workloadMinutes = selectedServiceType
    ? numberOfVehicles * ((selectedServiceType.duration || 60) + addonDurationTotal)
    : 0;

  const subtotal = selectedServiceType
    ? numberOfVehicles * getFleetPrice(selectedServiceType)
    : 0;
  const addonSubtotal = numberOfVehicles * addonPriceTotal;
  const subtotalWithAddons = subtotal + addonSubtotal;
  const discountPercent =
    numberOfVehicles > BULK_DISCOUNT_THRESHOLD ? BULK_DISCOUNT_PERCENT : 0;
  const discountAmount = (subtotalWithAddons * discountPercent) / 100;
  const amountAfterDiscount = Math.max(0, subtotalWithAddons - discountAmount);
  const suvSurcharge = isSUV ? amountAfterDiscount * 0.20 : 0;
  const total = amountAfterDiscount + suvSurcharge;

  /**
   * Navigate the bulk booking calendar month forward or backward.
   *
   * @param direction - "prev" or "next"
   */
  const handleCalendarMonthNavigation = useCallback(
    (direction: "prev" | "next") => {
      setCurrentCalendarMonth((prev) =>
        direction === "prev"
          ? prev.subtract(1, "month")
          : prev.add(1, "month")
      );
    },
    []
  );

  /**
   * Query detailer availability for bulk workload on the selected date/address.
   * Populates capacity window options or sets capacityError.
   */
  const checkBulkCapacity = useCallback(async () => {
    if (
      !selectedServiceType ||
      !selectedDate ||
      !selectedAddress ||
      numberOfVehicles < MIN_BULK_VEHICLES
    ) {
      setCapacityError("Please select service, date, address and at least 2 vehicles.");
      return;
    }
    setIsLoadingCapacity(true);
    setCapacityError(null);
    setCapacityOptions(null);
    setSelectedOption(null);
    try {
      const dateStr = selectedDate.toISOString().slice(0, 10);
      const today = new Date();
      const isToday = dateStr === today.toISOString().slice(0, 10);
      const data = await checkCapacity({
        date: dateStr,
        workload_minutes: workloadMinutes,
        service_duration: selectedServiceType.duration || 60,
        country: selectedAddress.country || "",
        city: selectedAddress.city || "",
        latitude: selectedAddress.latitude,
        longitude: selectedAddress.longitude,
        ...(isToday ? { now: new Date().toISOString() } : {}),
      }).unwrap();
      if (data.error || !data.available) {
        setCapacityError(
          data.error ||
            "Not enough capacity on this date. Try another date or fewer vehicles."
        );
        return;
      }
      if (data.options && data.options.length > 0) {
        setCapacityOptions(data.options);
        setSelectedOption(data.options[0]);
      } else {
        setCapacityError(
          "Not enough capacity on this date. Try another date or fewer vehicles."
        );
      }
    } catch (e) {
      setCapacityError(
        "Unable to check capacity. Please try again."
      );
    } finally {
      setIsLoadingCapacity(false);
    }
  }, [
    selectedServiceType,
    selectedDate,
    selectedAddress,
    numberOfVehicles,
    workloadMinutes,
    checkCapacity,
  ]);

  /**
   * Build the bulk booking payload sent to Stripe/webhook after payment.
   *
   * @param bookingReference - Unique booking reference string
   * @returns Bulk order metadata for client and detailer servers
   */
  const buildBulkBookingData = useCallback(
    (bookingReference: string): Record<string, unknown> => {
      const option = selectedOption || capacityOptions?.[0];
      const addressPayload = selectedAddress?.id
        ? { id: selectedAddress.id, ...selectedAddress }
        : selectedAddress;
      return {
        is_bulk: true,
        booking_reference: bookingReference,
        service_type:
          selectedServiceType &&
          (typeof selectedServiceType === "object"
            ? {
                id: selectedServiceType.id,
                name: selectedServiceType.name,
                duration: selectedServiceType.duration,
                fleet_price: selectedServiceType.fleet_price,
                price: selectedServiceType.price,
              }
            : selectedServiceType),
        valet_type:
          selectedValetType &&
          (typeof selectedValetType === "object"
            ? {
                id: selectedValetType.id,
                name: selectedValetType.name,
                description: selectedValetType.description,
              }
            : selectedValetType),
        address_id: selectedAddress?.id,
        address: addressPayload,
        date: selectedDate?.toISOString().slice(0, 10),
        best_start_time: option?.best_start_time || "06:00",
        estimated_finish_time: option?.estimated_finish_time || "21:00",
        start_time: option?.best_start_time || "06:00",
        end_time: option?.estimated_finish_time || "21:00",
        window: option?.window || "fullday",
        suggested_team_size: option?.suggested_team_size ?? 1,
        number_of_vehicles: numberOfVehicles,
        is_suv: isSUV,
        subtotal_amount: subtotalWithAddons,
        discount_applied: discountAmount,
        total_amount: total,
        special_instructions: specialInstructions.trim(),
        addons: selectedAddons.map((a) => ({
          id: a.id,
          name: a.name,
          price: a.price,
          extra_duration: a.extra_duration,
          description: a.description,
        })),
      };
    },
    [
      selectedOption,
      capacityOptions,
      selectedAddress,
      selectedServiceType,
      selectedValetType,
      selectedAddons,
      selectedDate,
      numberOfVehicles,
      subtotal,
      discountAmount,
      total,
      isSUV,
      specialInstructions,
    ]
  );

  /** Reset all bulk booking form and capacity state to initial values. */
  const resetBulkBooking = useCallback(() => {
    setSelectedServiceType(null);
    setSelectedValetType(null);
    setSelectedAddons([]);
    setNumberOfVehicles(MIN_BULK_VEHICLES);
    setIsSUV(false);
    setSelectedDate(null);
    setSelectedAddress(null);
    setCapacityOptions(null);
    setSelectedOption(null);
    setCapacityError(null);
    setSpecialInstructions("");
    setCurrentCalendarMonth(dayjs());
  }, []);

  return {
    selectedServiceType,
    setSelectedServiceType,
    selectedValetType,
    setSelectedValetType,
    selectedAddons,
    setSelectedAddons,
    numberOfVehicles,
    setNumberOfVehicles,
    isSUV,
    setIsSUV,
    selectedDate,
    setSelectedDate,
    selectedAddress,
    setSelectedAddress,
    specialInstructions,
    setSpecialInstructions,
    capacityOptions,
    selectedOption,
    setSelectedOption,
    isLoadingCapacity,
    capacityError,
    getFleetPrice,
    workloadMinutes,
    subtotal,
    discountPercent,
    discountAmount,
    suvSurcharge,
    total,
    addonPriceTotal,
    addonDurationTotal,
    checkBulkCapacity,
    buildBulkBookingData,
    resetBulkBooking,
    calendarMonth: currentCalendarMonth,
    handleCalendarMonthNavigation,
  };
}
