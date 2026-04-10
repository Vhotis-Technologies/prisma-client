import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import StyledText from "@/app/components/helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";

interface AvailabilityCalendarProps {
  currentMonth: dayjs.Dayjs;
  currentYear: number;
  monthDays: dayjs.Dayjs[];
  selectedDates: string[];
  onDatePress: (date: string) => void;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  disabledDates?: string[]; // Add disabled dates prop
}

const { width } = Dimensions.get("window");

export const AvailabilityCalendar: React.FC<AvailabilityCalendarProps> = ({
  currentMonth,
  currentYear,
  monthDays,
  selectedDates,
  onDatePress,
  onPreviousMonth,
  onNextMonth,
  disabledDates = [],
}) => {
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const buttonTextColor = useThemeColor({}, "buttonText");
  const iconsColor = useThemeColor({}, "icons");

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const isDateSelected = (date: dayjs.Dayjs) => {
    return selectedDates.includes(date.format("YYYY-MM-DD"));
  };

  const isCurrentMonth = (date: dayjs.Dayjs) => {
    return date.month() === currentMonth.month();
  };

  const isToday = (date: dayjs.Dayjs) => {
    return date.isSame(dayjs(), "day");
  };

  const isDateDisabled = (date: dayjs.Dayjs) => {
    const dateString = date.format("YYYY-MM-DD");
    return disabledDates.includes(dateString) || date.isBefore(dayjs(), "day");
  };

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {/* Header with month navigation */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.navButton, { backgroundColor: primaryColor }]}
          onPress={onPreviousMonth}
        >
          <Ionicons name="chevron-back" size={20} color={buttonTextColor} />
        </TouchableOpacity>

        <StyledText variant="titleMedium">
          {currentMonth.format("MMMM YYYY")}
        </StyledText>

        <TouchableOpacity
          style={[styles.navButton, { backgroundColor: primaryColor }]}
          onPress={onNextMonth}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={buttonTextColor}
          />
        </TouchableOpacity>
      </View>

      {/* Week days header */}
      <View style={styles.weekDaysContainer}>
        {weekDays.map((day, index) => (
          <View key={index} style={styles.weekDayHeader}>
            <StyledText variant="bodySmall">{day}</StyledText>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      <ScrollView
        style={styles.calendarContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.calendarGrid}>
          {monthDays.map((date, index) => {
            const dateString = date.format("YYYY-MM-DD");
            const selected = isDateSelected(date);
            const currentMonthDate = isCurrentMonth(date);
            const today = isToday(date);
            const disabled = isDateDisabled(date);

            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dateCell,
                  {
                    backgroundColor: selected ? primaryColor : "transparent",
                    borderColor: today ? primaryColor : borderColor,
                    borderWidth: today ? 2 : 1,
                    opacity: currentMonthDate ? (disabled ? 0.3 : 1) : 0.3,
                  },
                ]}
                onPress={() => onDatePress(dateString)}
                disabled={!currentMonthDate || disabled}
              >
                <StyledText
                  style={[
                    styles.dateText,
                    {
                      color: selected
                        ? buttonTextColor
                        : currentMonthDate
                        ? textColor
                        : iconsColor,   
                      fontWeight: today ? "bold" : "normal",
                      opacity: currentMonthDate ? (disabled ? 0.5 : 1) : 0.5,
                    },
                  ]}
                >
                  {date.format("D")}
                </StyledText>
                {selected && currentMonthDate && (
                  <View
                    style={[
                      styles.selectedIndicator,
                      { backgroundColor: buttonTextColor },
                    ]}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 5,
    padding: 5,
    marginVertical: 5,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  navButton: {
    width: 30,
    height: 30,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  monthYearText: {
    fontSize: 18,
    fontWeight: "600",
  },
  weekDaysContainer: {
    flexDirection: "row",
    marginBottom: 5,
  },
  weekDayHeader: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 5,
  },
  calendarContainer: {
    maxHeight: 300,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dateCell: {
    width: (width - 50) / 7,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 5,
    margin: 1,
    position: "relative",
  },
  dateText: {
    fontSize: 14,
    fontWeight: "500",
  },
  selectedIndicator: {
    position: "absolute",
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
