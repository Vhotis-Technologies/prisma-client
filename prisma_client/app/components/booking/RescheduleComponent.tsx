import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import dayjs from "dayjs";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "../helpers/StyledText";
import StyledButton from "../helpers/StyledButton";
import { TimeSlot } from "@/app/interfaces/BookingInterfaces";
import { API_CONFIG } from "@/constants/Config";
import { useAlertContext } from "@/app/contexts/AlertContext";
import TimeSlotPicker from "./TimeSlotPicker";

interface RescheduleComponentProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (newDate: string, newTime: string) => void;
  currentDate: string;
  currentTime: string;
  appointmentId: string;
  userCountry?: string;
  userCity?: string;
  userLatitude?: number;
  userLongitude?: number;
  serviceDuration?: number;
  serviceTypeName?: string;
  isLoading?: boolean;
}

const RescheduleComponent: React.FC<RescheduleComponentProps> = ({
  visible,
  onClose,
  onConfirm,
  currentDate,
  currentTime,
  appointmentId,
  userCountry = "United Kingdom",
  userCity = "London",
  userLatitude,
  userLongitude,
  serviceDuration = 60,
  serviceTypeName = "Appointment",
  isLoading = false,
}) => {
  // Theme colors
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");

  // Alert context
  const { setAlertConfig, setIsVisible } = useAlertContext();

  // State management
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs>(
    dayjs(currentDate)
  );
  const [selectedTime, setSelectedTime] = useState<string>(currentTime);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<TimeSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [currentMonth, setCurrentMonth] = useState<dayjs.Dayjs>(
    dayjs(currentDate)
  );
  const [selectedDay, setSelectedDay] = useState<dayjs.Dayjs>(
    dayjs(currentDate)
  );

  /**
   * Fetches available time slots from the server for a specific date
   */
  const fetchAvailableTimeSlots = useCallback(
    async (date: dayjs.Dayjs): Promise<any> => {
      if (!userCountry || !userCity) {
        setAlertConfig({
          title: "Error",
          message:
            "Address information is required to fetch available timeslots",
          type: "error",
          isVisible: true,
          onConfirm: () => {
            setIsVisible(false);
          },
        });
        throw new Error("Address information is required");
      }

      setIsLoadingSlots(true);

      try {
        const url = new URL(
          `${API_CONFIG.detailerAppUrl}/api/v1/availability/get_timeslots/`
        );
        url.searchParams.append("date", date.format("YYYY-MM-DD"));
        url.searchParams.append("service_duration", serviceDuration.toString());
        url.searchParams.append("country", userCountry);
        url.searchParams.append("city", userCity);
        // Pass lat/lng for geographic fallback (30km radius) when city match fails
        if (userLatitude != null && userLongitude != null) {
          url.searchParams.append("latitude", userLatitude.toString());
          url.searchParams.append("longitude", userLongitude.toString());
        }

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Check for error messages from the server (e.g. no detailers in area)
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
          return data;
        }

        // Transform the response to TimeSlot format
        const transformedSlots: TimeSlot[] = [];

        if (data.slots && Array.isArray(data.slots)) {
          data.slots.forEach((slot: any) => {
            if (slot.is_available && slot.start_time && slot.end_time) {
              transformedSlots.push({
                startTime: slot.start_time,
                endTime: slot.end_time,
                isAvailable: slot.is_available,
                isSelected: false,
              });
            }
          });
        } else if (
          data.available_slots &&
          Array.isArray(data.available_slots)
        ) {
          data.available_slots.forEach((slot: any) => {
            if (slot.is_available && slot.start_time && slot.end_time) {
              transformedSlots.push({
                startTime: slot.start_time,
                endTime: slot.end_time,
                isAvailable: slot.is_available,
                isSelected: false,
              });
            }
          });
        }

        if (transformedSlots.length === 0) {
          setAlertConfig({
            title: "No Available Times",
            message:
              "No available time slots found for the selected date. Please try a different date.",
            type: "success",
            isVisible: true,
            onConfirm: () => {
              setIsVisible(false);
            },
          });
        }

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
    [userCountry, userCity, userLatitude, userLongitude, serviceDuration, setAlertConfig, setIsVisible]
  );

  /**
   * Handles date change (from TimeSlotPicker) – sync state and fetch slots for the new date
   */
  const handleDateChange = useCallback(
    (date: Date) => {
      const day = dayjs(date);
      setSelectedDate(day);
      setSelectedDay(day);
      setCurrentMonth(day);
      setSelectedTime("");
      fetchAvailableTimeSlots(day).catch((err) => {
        console.error("Failed to fetch time slots:", err);
        setAvailableTimeSlots([]);
      });
    },
    [fetchAvailableTimeSlots]
  );

  /**
   * Handles month navigation
   */
  const handleMonthNavigation = useCallback(
    (direction: "prev" | "next") => {
      if (direction === "prev") {
        setCurrentMonth((m) => m.subtract(1, "month"));
      } else {
        setCurrentMonth((m) => m.add(1, "month"));
      }
    },
    []
  );

  /**
   * Handles day selection
   */
  const handleDaySelection = useCallback(
    async (dateString: string) => {
      const day = dayjs(dateString);
      const minimumDate = new Date();

      if (day.isBefore(dayjs(minimumDate), "day")) return;

      setSelectedDay(day);
      setCurrentMonth(day);
      setSelectedDate(day);

      // Clear selected time when date changes
      setSelectedTime("");

      // Fetch available time slots for the selected date
      try {
        await fetchAvailableTimeSlots(day);
      } catch (error) {
        console.error("Failed to fetch time slots:", error);
        setAvailableTimeSlots([]);
      }
    },
    [fetchAvailableTimeSlots]
  );

  /**
   * Handles time slot selection
   */
  const handleTimeSlotSelect = useCallback((slot: TimeSlot) => {
    if (!slot.isAvailable) return;

    setSelectedTime(slot.startTime);

    // Update the availableTimeSlots to mark the selected slot
    setAvailableTimeSlots((prevSlots) =>
      prevSlots.map((s) => ({
        ...s,
        isSelected:
          s.startTime === slot.startTime && s.endTime === slot.endTime,
      }))
    );
  }, []);

  /**
   * Handles confirm reschedule
   */
  const handleConfirm = useCallback(() => {
    if (!selectedTime) {
      setAlertConfig({
        title: "Time Required",
        message: "Please select a time slot for your appointment",
        type: "error",
        isVisible: true,
        onConfirm: () => {
          setIsVisible(false);
        },
      });
      return;
    }

    const newDate = selectedDate.format("YYYY-MM-DD");
    const newTime = selectedTime;

    onConfirm(newDate, newTime);
  }, [selectedDate, selectedTime, onConfirm, setAlertConfig, setIsVisible]);

  /**
   * Initialize component when modal opens – set current date; times load when user taps a date
   */
  useEffect(() => {
    if (visible) {
      const currentDateDay = dayjs(currentDate);
      setSelectedDate(currentDateDay);
      setSelectedDay(currentDateDay);
      setCurrentMonth(currentDateDay);
      setSelectedTime(currentTime);
      setAvailableTimeSlots([]);
    }
  }, [visible, currentDate, currentTime]);

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {/* Current Appointment Info */}
      <View
        style={[
          styles.currentInfoCard,
          { backgroundColor: cardColor, borderColor },
        ]}
      >
        <StyledText
          variant="titleMedium"
          style={[styles.sectionTitle, { color: textColor }]}
        >
          Current Appointment
        </StyledText>
        <StyledText
          variant="bodyMedium"
          style={[styles.currentInfo, { color: textColor }]}
        >
          Date: {dayjs(currentDate).format("dddd, MMMM D, YYYY")}
        </StyledText>
        <StyledText
          variant="bodyMedium"
          style={[styles.currentInfo, { color: textColor }]}
        >
          Time: {currentTime}
        </StyledText>
      </View>

      {/* Date & Time selection – same stack as booking: calendar + detailer timeslots on date tap */}
      <TimeSlotPicker
        selectedDate={selectedDate.toDate()}
        onDateChange={handleDateChange}
        minimumDate={new Date()}
        serviceDuration={serviceDuration}
        serviceTypeName={serviceTypeName}
        availableTimeSlots={availableTimeSlots}
        isLoadingSlots={isLoadingSlots}
        currentMonth={currentMonth}
        selectedDay={selectedDay}
        onDaySelection={handleDaySelection}
        onMonthNavigation={handleMonthNavigation}
        onTimeSlotSelect={handleTimeSlotSelect}
        hasSelectedTimeSlot={false}
        selectedSlotAt={null}
        onSlotHoldExpired={undefined}
      />

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <StyledButton
          title="Cancel"
          onPress={onClose}
          variant="medium"
          style={styles.cancelButton}
        />
        <StyledButton
          title={isLoading ? "Updating..." : "Update"}
          onPress={handleConfirm}
          variant="tonal"
          disabled={!selectedTime || isLoading}
          style={styles.confirmButton}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 12,
    minHeight: 400,
  },
  currentInfoCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  section: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionTitle: {
    fontWeight: "600",
    marginBottom: 12,
  },
  currentInfo: {
    marginBottom: 4,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
  },
  confirmButton: {
    flex: 2,
  },
});

export default RescheduleComponent;
