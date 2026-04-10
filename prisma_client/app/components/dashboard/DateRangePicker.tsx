import React, { useState } from "react";
import { StyleSheet, View, TouchableOpacity, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "../helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";

interface DateRangePickerProps {
  startDate: Date;
  endDate: Date;
  onStartDateChange: (date: Date) => void;
  onEndDateChange: (date: Date) => void;
}

type PresetOption = "7days" | "30days" | "90days" | "thismonth" | "custom";

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}) => {
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<PresetOption | null>(null);

  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const iconColor = useThemeColor({}, "icons");

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const applyPreset = (preset: PresetOption) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    let newStartDate = new Date();

    switch (preset) {
      case "7days":
        newStartDate.setDate(today.getDate() - 7);
        break;
      case "30days":
        newStartDate.setDate(today.getDate() - 30);
        break;
      case "90days":
        newStartDate.setDate(today.getDate() - 90);
        break;
      case "thismonth":
        newStartDate = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case "custom":
        setSelectedPreset(null);
        return;
    }

    newStartDate.setHours(0, 0, 0, 0);
    onStartDateChange(newStartDate);
    onEndDateChange(today);
    setSelectedPreset(preset);
  };

  const handleStartDateChange = (event: any, date?: Date) => {
    if (Platform.OS === "android") {
      setShowStartPicker(false);
    }
    if (date) {
      onStartDateChange(date);
      setSelectedPreset(null);
      // Ensure end date is not before start date
      if (date > endDate) {
        onEndDateChange(date);
      }
    }
  };

  const handleEndDateChange = (event: any, date?: Date) => {
    if (Platform.OS === "android") {
      setShowEndPicker(false);
    }
    if (date) {
      // Ensure end date is not before start date
      if (date >= startDate) {
        onEndDateChange(date);
        setSelectedPreset(null);
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: cardColor, borderColor }]}>
      <StyledText variant="labelMedium" style={[styles.title, { color: textColor }]}>
        Time Period
      </StyledText>

      {/* Preset Options */}
      <View style={styles.presetContainer}>
        <TouchableOpacity
          style={[
            styles.presetButton,
            selectedPreset === "7days" && { backgroundColor: primaryColor },
            { borderColor },
          ]}
          onPress={() => applyPreset("7days")}
        >
          <StyledText
            variant="bodySmall"
            style={[
              styles.presetText,
              { color: selectedPreset === "7days" ? "white" : textColor },
            ]}
          >
            7 Days
          </StyledText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.presetButton,
            selectedPreset === "30days" && { backgroundColor: primaryColor },
            { borderColor },
          ]}
          onPress={() => applyPreset("30days")}
        >
          <StyledText
            variant="bodySmall"
            style={[
              styles.presetText,
              { color: selectedPreset === "30days" ? "white" : textColor },
            ]}
          >
            30 Days
          </StyledText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.presetButton,
            selectedPreset === "90days" && { backgroundColor: primaryColor },
            { borderColor },
          ]}
          onPress={() => applyPreset("90days")}
        >
          <StyledText
            variant="bodySmall"
            style={[
              styles.presetText,
              { color: selectedPreset === "90days" ? "white" : textColor },
            ]}
          >
            90 Days
          </StyledText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.presetButton,
            selectedPreset === "thismonth" && { backgroundColor: primaryColor },
            { borderColor },
          ]}
          onPress={() => applyPreset("thismonth")}
        >
          <StyledText
            variant="bodySmall"
            style={[
              styles.presetText,
              { color: selectedPreset === "thismonth" ? "white" : textColor },
            ]}
          >
            This Month
          </StyledText>
        </TouchableOpacity>
      </View>

      {/* Custom Date Range */}
      <View style={styles.dateRangeContainer}>
        <TouchableOpacity
          style={[styles.dateButton, { backgroundColor, borderColor }]}
          onPress={() => setShowStartPicker(true)}
        >
          <Ionicons name="calendar-outline" size={18} color={iconColor} />
          <View style={styles.dateButtonContent}>
            <StyledText variant="bodySmall" style={[styles.dateLabel, { color: textColor }]}>
              Start Date
            </StyledText>
            <StyledText variant="bodyMedium" style={[styles.dateValue, { color: textColor }]}>
              {formatDate(startDate)}
            </StyledText>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dateButton, { backgroundColor, borderColor }]}
          onPress={() => setShowEndPicker(true)}
        >
          <Ionicons name="calendar-outline" size={18} color={iconColor} />
          <View style={styles.dateButtonContent}>
            <StyledText variant="bodySmall" style={[styles.dateLabel, { color: textColor }]}>
              End Date
            </StyledText>
            <StyledText variant="bodyMedium" style={[styles.dateValue, { color: textColor }]}>
              {formatDate(endDate)}
            </StyledText>
          </View>
        </TouchableOpacity>
      </View>

      {/* Date Pickers */}
      {showStartPicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={handleStartDateChange}
          maximumDate={endDate}
        />
      )}
      {showEndPicker && (
        <DateTimePicker
          value={endDate}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={handleEndDateChange}
          minimumDate={startDate}
          maximumDate={new Date()}
        />
      )}
    </View>
  );
};

export default DateRangePicker;

const styles = StyleSheet.create({
  container: {
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  presetContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  presetButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  presetText: {
    fontSize: 12,
    fontWeight: "500",
  },
  dateRangeContainer: {
    flexDirection: "row",
    gap: 12,
  },
  dateButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  dateButtonContent: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 10,
    opacity: 0.7,
    marginBottom: 2,
  },
  dateValue: {
    fontSize: 14,
    fontWeight: "500",
  },
});
