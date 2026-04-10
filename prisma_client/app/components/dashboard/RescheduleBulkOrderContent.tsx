import React, { useState, useMemo } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import dayjs from "dayjs";
import StyledText from "@/app/components/helpers/StyledText";
import StyledButton from "@/app/components/helpers/StyledButton";
import { AvailabilityCalendar } from "@/app/components/booking/AvailabilityCalendar";
import type { BulkCapacityOption } from "@/app/utils/fleetDashboardUtils";

export interface RescheduleBulkOrderContentProps {
  rescheduleNewDate: string;
  setRescheduleNewDate: (v: string) => void;
  rescheduleOptions: BulkCapacityOption[] | null;
  rescheduleSelectedIndex: number;
  setRescheduleSelectedIndex: (i: number) => void;
  setRescheduleSelectedOption: (o: BulkCapacityOption) => void;
  rescheduleLoading: boolean;
  isRescheduling: boolean;
  onCheckCapacity: () => void;
  onConfirm: () => void;
  onClose: () => void;
  /** Call when user selects a new date (clears time options). */
  onDateSelect?: () => void;
  textColor: string;
  borderColor: string;
  primaryColor: string;
}

export function RescheduleBulkOrderContent({
  rescheduleNewDate,
  setRescheduleNewDate,
  rescheduleOptions,
  rescheduleSelectedIndex,
  setRescheduleSelectedIndex,
  setRescheduleSelectedOption,
  rescheduleLoading,
  isRescheduling,
  onCheckCapacity,
  onConfirm,
  onClose,
  onDateSelect,
  textColor,
  borderColor,
  primaryColor,
}: RescheduleBulkOrderContentProps) {
  const [calendarMonth, setCalendarMonth] = useState(() => dayjs().startOf("month"));

  const monthDays = useMemo(() => {
    const start = calendarMonth.startOf("month").startOf("week");
    const end = calendarMonth.endOf("month").endOf("week");
    const days: dayjs.Dayjs[] = [];
    let d = start;
    while (d.isBefore(end) || d.isSame(end, "day")) {
      days.push(d);
      d = d.add(1, "day");
    }
    return days;
  }, [calendarMonth]);

  const handleDatePress = (dateString: string) => {
    setRescheduleNewDate(dateString);
    onDateSelect?.();
  };

  return (
    <>
      <StyledText variant="titleMedium" style={[styles.title, { color: textColor }]}>
        Choose new date
      </StyledText>
      <StyledText variant="bodySmall" style={[styles.subtitle, { color: textColor }]}>
        Tap a date, then check availability for that day.
      </StyledText>
      <View style={styles.calendarWrap}>
        <AvailabilityCalendar
          currentMonth={calendarMonth}
          currentYear={calendarMonth.year()}
          monthDays={monthDays}
          selectedDates={rescheduleNewDate ? [rescheduleNewDate] : []}
          onDatePress={handleDatePress}
          onPreviousMonth={() => setCalendarMonth((m) => m.subtract(1, "month"))}
          onNextMonth={() => setCalendarMonth((m) => m.add(1, "month"))}
          disabledDates={[]}
        />
      </View>
      {rescheduleNewDate ? (
        <StyledText variant="bodySmall" style={[styles.selectedLabel, { color: textColor }]}>
          Selected: {dayjs(rescheduleNewDate).format("dddd, MMM D, YYYY")}
        </StyledText>
      ) : null}
      <View style={styles.actions}>
        <StyledButton
          title={rescheduleLoading ? "Checking…" : "Check availability"}
          variant="small"
          onPress={onCheckCapacity}
          disabled={rescheduleLoading || !rescheduleNewDate.trim()}
          isLoading={rescheduleLoading}
        />
      </View>
      {rescheduleOptions && rescheduleOptions.length > 0 && (
        <>
          <StyledText
            variant="titleSmall"
            style={[styles.sectionLabel, { color: textColor }]}
          >
            Select time window
          </StyledText>
          {rescheduleOptions.map((opt, idx) => (
            <TouchableOpacity
              key={idx}
              style={[
                styles.optionRow,
                { borderColor },
                rescheduleSelectedIndex === idx && { backgroundColor: primaryColor + "20" },
              ]}
              onPress={() => {
                setRescheduleSelectedIndex(idx);
                setRescheduleSelectedOption(opt);
              }}
            >
              <StyledText variant="bodySmall" style={{ color: textColor }}>
                {opt.window}: {opt.best_start_time} – {opt.estimated_finish_time}
              </StyledText>
            </TouchableOpacity>
          ))}
          <View style={styles.actions}>
            <StyledButton
              title="Confirm reschedule"
              variant="small"
              onPress={onConfirm}
              disabled={isRescheduling}
              isLoading={isRescheduling}
            />
          </View>
        </>
      )}
      <TouchableOpacity style={styles.closeLink} onPress={onClose}>
        <StyledText variant="bodySmall" style={{ color: primaryColor }}>
          Close
        </StyledText>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: 8,
  },
  subtitle: {
    opacity: 0.8,
    marginBottom: 12,
  },
  calendarWrap: {
    marginBottom: 12,
  },
  selectedLabel: {
    opacity: 0.9,
    marginBottom: 8,
  },
  actions: {
    marginTop: 8,
  },
  sectionLabel: {
    marginTop: 16,
    marginBottom: 8,
  },
  optionRow: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  closeLink: {
    marginTop: 16,
    marginBottom: 8,
  },
});
