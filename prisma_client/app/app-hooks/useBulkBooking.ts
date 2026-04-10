/**
 * Bulk booking hook: service type, valet, address, date, vehicle count, capacity check, build payload for payment.
 */
import { useState, useCallback, useEffect } from "react";
import { API_CONFIG } from "@/constants/Config";
import type { ServiceTypeProps, ValetTypeProps, AddOnsProps } from "@/app/interfaces/BookingInterfaces";
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

export function useBulkBooking() {
  const [selectedServiceType, setSelectedServiceType] =
    useState<ServiceTypeProps | null>(null);
  const [selectedValetType, setSelectedValetType] =
    useState<ValetTypeProps | null>(null);
  const [numberOfVehicles, setNumberOfVehicles] = useState<number>(0);
  const [isSUV, setIsSUV] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
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
  const suvSurcharge = isSUV ? amountAfterDiscount * 0.15 : 0;
  const total = amountAfterDiscount + suvSurcharge;

  const checkBulkCapacity = useCallback(async () => {
    if (
      !selectedServiceType ||
      !selectedDate ||
      !selectedAddress ||
      numberOfVehicles < 1
    ) {
      setCapacityError("Please select service, date, address and vehicle count.");
      return;
    }
    setIsLoadingCapacity(true);
    setCapacityError(null);
    setCapacityOptions(null);
    setSelectedOption(null);
    try {
      const url = new URL(
        `${API_CONFIG.detailerAppUrl}/api/v1/availability/check_bulk_capacity/`
      );
      const dateStr = selectedDate.toISOString().slice(0, 10);
      url.searchParams.append("date", dateStr);
      const today = new Date();
      const isToday = dateStr === today.toISOString().slice(0, 10);
      if (isToday) {
        url.searchParams.append("now", new Date().toISOString());
      }
      url.searchParams.append("workload_minutes", String(workloadMinutes));
      url.searchParams.append(
        "service_duration",
        String(selectedServiceType.duration || 60)
      );
      url.searchParams.append("country", selectedAddress.country || "");
      url.searchParams.append("city", selectedAddress.city || "");
      if (
        selectedAddress.latitude != null &&
        selectedAddress.longitude != null
      ) {
        url.searchParams.append(
          "latitude",
          String(selectedAddress.latitude)
        );
        url.searchParams.append(
          "longitude",
          String(selectedAddress.longitude)
        );
      }
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
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
  ]);

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

  const resetBulkBooking = useCallback(() => {
    setSelectedServiceType(null);
    setSelectedValetType(null);
    setSelectedAddons([]);
    setNumberOfVehicles(1);
    setIsSUV(false);
    setSelectedDate(null);
    setSelectedAddress(null);
    setCapacityOptions(null);
    setSelectedOption(null);
    setCapacityError(null);
    setSpecialInstructions("");
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
  };
}
