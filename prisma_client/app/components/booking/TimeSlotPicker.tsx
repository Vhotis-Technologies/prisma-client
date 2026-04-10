import React, { useState, useEffect, useMemo, useCallback } from "react";
import { StyleSheet, View, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "@/app/components/helpers/StyledText";
import { AvailabilityCalendar } from "./AvailabilityCalendar";

/**
 * Props for the TimeSlotPicker component
 */
interface TimeSlotPickerProps {
  /** The currently selected date and time */
  selectedDate: Date;
  /** Callback function called when date or time changes */
  onDateChange: (date: Date) => void;
  /** Minimum allowed date (defaults to current date) */
  minimumDate?: Date;
  /** Maximum allowed date */
  maximumDate?: Date;
  /** Service duration in minutes */
  serviceDuration: number;
  /** Selected service type name for display */
  serviceTypeName?: string;
  /** Available time slots from the booking hook */
  availableTimeSlots: Array<{
    startTime: string;
    endTime: string;
    isAvailable: boolean;
    isSelected: boolean;
  }>;
  /** Loading state for time slots */
  isLoadingSlots: boolean;
  /** Current month for calendar display */
  currentMonth: dayjs.Dayjs;
  /** Selected day for calendar display */
  selectedDay: dayjs.Dayjs;
  /** Handler for day selection */
  onDaySelection: (dateString: string) => void;
  /** Handler for month navigation */
  onMonthNavigation: (direction: "prev" | "next") => void;
  /** Handler for time slot selection */
  onTimeSlotSelect: (slot: {
    startTime: string;
    endTime: string;
    isAvailable: boolean;
    isSelected: boolean;
  }) => void;
  /** Whether a time slot has been selected */
  hasSelectedTimeSlot?: boolean;
  /** Timestamp (ms) when the current slot was selected, for 1-min countdown */
  selectedSlotAt?: number | null;
  /** Called when the 1-minute slot hold countdown expires */
  onSlotHoldExpired?: () => void;
}

/**
 * TimeSlotPicker component that displays a custom calendar with available booking time slots
 * to prevent double booking by showing predefined time slots based on service duration.
 *
 * Features:
 * - Custom calendar with month navigation
 * - Date selection with visual indicators
 * - Time slot cards showing available/blocked times
 * - Service duration-based slot calculation
 * - Visual indicators for availability and selection
 * - Prevents double booking by showing only available slots
 *
 * This component now delegates all time slot management logic to the useBooking hook
 * for better code organization and reusability.
 */
const TimeSlotPicker: React.FC<TimeSlotPickerProps> = ({
  selectedDate,
  onDateChange,
  minimumDate = new Date(),
  maximumDate,
  serviceDuration,
  serviceTypeName = "Service",
  availableTimeSlots,
  isLoadingSlots,
  currentMonth,
  selectedDay,
  onDaySelection,
  onMonthNavigation,
  onTimeSlotSelect,
  hasSelectedTimeSlot = false,
  selectedSlotAt = null,
  onSlotHoldExpired,
}) => {
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const primaryPurpleColor = useThemeColor({}, "primary");
  const backgroundColor = useThemeColor({}, "background");

  const [now, setNow] = useState(Date.now());
  const expiredCalledRef = React.useRef(false);

  const secondsLeft =
    hasSelectedTimeSlot && selectedSlotAt != null
      ? Math.max(0, 60 - Math.floor((now - selectedSlotAt) / 1000))
      : 60;

  useEffect(() => {
    if (!hasSelectedTimeSlot || selectedSlotAt == null || secondsLeft <= 0) {
      if (secondsLeft <= 0 && onSlotHoldExpired && !expiredCalledRef.current) {
        expiredCalledRef.current = true;
        onSlotHoldExpired();
      }
      return;
    }
    expiredCalledRef.current = false;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [hasSelectedTimeSlot, selectedSlotAt, secondsLeft, onSlotHoldExpired]);

  useEffect(() => {
    if (!hasSelectedTimeSlot || selectedSlotAt == null) {
      expiredCalledRef.current = false;
    }
  }, [hasSelectedTimeSlot, selectedSlotAt]);

  const countdownDisplay =
    secondsLeft > 0
      ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
      : "0:00";

  /**
   * Check if a time slot is in the past
   */
  const isTimeSlotInPast = useCallback(
    (slot: { startTime: string; endTime: string }) => {
      const now = dayjs();
      const selectedDateDayjs = dayjs(selectedDay);

      // Create a datetime object for the slot start time on the selected date
      const [hours, minutes] = slot.startTime.split(":").map(Number);
      const slotDateTime = selectedDateDayjs
        .hour(hours)
        .minute(minutes)
        .second(0);

      // Check if the slot time is before the current time
      return slotDateTime.isBefore(now);
    },
    [selectedDay]
  );

  /**
   * Get the status text for a time slot
   */
  const getTimeSlotStatusText = useCallback(
    (slot: { startTime: string; endTime: string; isAvailable: boolean }) => {
      if (isTimeSlotInPast(slot)) {
        return "Too Late";
      }
      return slot.isAvailable ? "Available" : "Too Late";
    },
    [isTimeSlotInPast]
  );

  /**
   * Generates calendar days for the current month
   * @returns Array of calendar day objects
   */
  const generateCalendarDays = useMemo(() => {
    const days: Array<{
      date: dayjs.Dayjs;
      isCurrentMonth: boolean;
      isSelected: boolean;
      isToday: boolean;
      isDisabled: boolean;
    }> = [];
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
  }, [currentMonth, selectedDay, minimumDate]);

  /**
   * Formats duration for display
   */
  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours > 0 && mins > 0) {
      return `${hours}h ${mins}m`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      return `${mins}m`;
    }
  };

  return (
    <View style={styles.container}>
      <StyledText
        variant="labelLarge"
        style={[styles.title, { color: textColor }]}
      >
        Select Date & Time
      </StyledText>

      {/* Service Info Card */}
      <View style={[styles.serviceInfoCard, { backgroundColor: cardColor }]}>
        <View style={styles.serviceInfoContent}>
          <StyledText variant="bodyMedium">{serviceTypeName}</StyledText>
          <StyledText variant="bodySmall">
            {formatDuration(serviceDuration)}
          </StyledText>
        </View>
      </View>

      {/* Calendar */}
      <AvailabilityCalendar
        currentMonth={currentMonth}
        currentYear={currentMonth.year()}
        monthDays={generateCalendarDays.map((day) => day.date)}
        selectedDates={[selectedDay.format("YYYY-MM-DD")]}
        onDatePress={onDaySelection}
        onPreviousMonth={() => onMonthNavigation("prev")}
        onNextMonth={() => onMonthNavigation("next")}
        disabledDates={generateCalendarDays
          .filter((day) => day.isDisabled)
          .map((day) => day.date.format("YYYY-MM-DD"))}
      />

      {/* Time Slots */}
      <View style={styles.timeSlotsContainer}>
        <StyledText
          variant="bodyMedium"
          style={[styles.timeSlotsTitle, { color: textColor }]}
        >
          Available Times for {selectedDay.format("MMM D, YYYY")}
        </StyledText>

        {!isLoadingSlots &&
          availableTimeSlots.length > 0 &&
          !hasSelectedTimeSlot && (
            <StyledText
              variant="bodySmall"
              style={[styles.helperText, { color: textColor + "80" }]}
            >
              Please select a time slot to continue
            </StyledText>
          )}

        {hasSelectedTimeSlot && selectedSlotAt != null && (
          <View style={[styles.countdownBanner, { backgroundColor: cardColor }]}>
            <StyledText
              variant="bodyMedium"
              style={[styles.countdownText, { color: textColor }]}
            >
              {secondsLeft > 0
                ? `Complete your booking within 1 min or you may lose your slot. Remaining time: ${countdownDisplay}`
                : "Time expired. Please select a time slot again."}
            </StyledText>
          </View>
        )}

        {isLoadingSlots ? (
          <View
            style={[styles.loadingContainer, { backgroundColor: cardColor }]}
          >
            <StyledText
              variant="bodyMedium"
              style={[styles.loadingText, { color: textColor }]}
            >
              Loading available times...
            </StyledText>
          </View>
        ) : (
          <ScrollView
            style={styles.timeSlotsScroll}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
          >
            <View style={styles.timeSlotsGrid}>
              {availableTimeSlots.map((slot, index) => {
                const statusText = getTimeSlotStatusText(slot);
                const isPast = isTimeSlotInPast(slot);

                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.timeSlotCard,
                      { backgroundColor: cardColor },
                      slot.isSelected && {
                        borderColor: primaryPurpleColor,
                        borderWidth: 2,
                      },
                      !slot.isAvailable && { opacity: 0.5 },
                    ]}
                    onPress={() => onTimeSlotSelect(slot)}
                    disabled={!slot.isAvailable}
                  >
                    <View style={styles.timeSlotContent}>
                      <StyledText
                        variant="bodyMedium"
                        style={[
                          styles.timeSlotTime,
                          {
                            color: slot.isAvailable
                              ? textColor
                              : textColor + "60",
                            fontWeight: slot.isSelected ? "600" : "400",
                          },
                        ]}
                      >
                        {slot.startTime} - {slot.endTime}
                      </StyledText>

                      <View style={styles.timeSlotStatus}>
                        {slot.isAvailable ? (
                          <>
                            <Ionicons
                              name="checkmark-circle"
                              size={16}
                              color={
                                slot.isSelected ? primaryPurpleColor : "#4CAF50"
                              }
                            />
                            <StyledText
                              variant="bodySmall"
                              style={[
                                styles.timeSlotStatusText,
                                {
                                  color: slot.isSelected
                                    ? primaryPurpleColor
                                    : "#4CAF50",
                                },
                              ]}
                            >
                              {statusText}
                            </StyledText>
                          </>
                        ) : (
                          <>
                            <Ionicons
                              name="close-circle"
                              size={16}
                              color="#F44336"
                            />
                            <StyledText
                              variant="bodySmall"
                              style={[
                                styles.timeSlotStatusText,
                                { color: "#F44336" },
                              ]}
                            >
                              {statusText}
                            </StyledText>
                          </>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
};

export default TimeSlotPicker;

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  title: {
    fontWeight: "600",
    marginBottom: 12,
  },
  serviceInfoCard: {
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
  },
  serviceInfoContent: {
    alignItems: "center",
  },
  serviceName: {
    fontWeight: "600",
    marginBottom: 4,
  },
  serviceDuration: {
    fontWeight: "400",
  },

  timeSlotsContainer: {
    marginBottom: 5,
  },
  timeSlotsTitle: {
    fontWeight: "600",
    marginBottom: 12,
  },
  helperText: {
    marginBottom: 8,
    fontStyle: "italic",
  },
  countdownBanner: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#FF9800",
  },
  countdownText: {
    fontWeight: "600",
  },
  loadingContainer: {
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  loadingText: {
    opacity: 0.7,
  },
  timeSlotsScroll: {
    maxHeight: 300,
  },
  timeSlotsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-evenly",
    gap: 10,
  },
  timeSlotCard: {
    width: "30%",
    borderRadius: 2,
    padding: 5,
  },
  timeSlotContent: {
    alignItems: "center",
  },
  timeSlotTime: {
    marginBottom: 8,
    textAlign: "center",
  },
  timeSlotStatus: {
    flexDirection: "row",
    alignItems: "center",
  },
  timeSlotStatusText: {
    marginLeft: 4,
    fontWeight: "500",
  },
});
