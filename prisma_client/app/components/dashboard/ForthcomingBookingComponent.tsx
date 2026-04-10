import React from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "@/app/components/helpers/StyledText";
import type UpcomingAppointmentProps from "@/app/interfaces/DashboardInterfaces";

interface ForthcomingBookingComponentProps {
  appointment: UpcomingAppointmentProps;
  onPress: () => void;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "in_progress":
      return "#FF9800";
    case "confirmed":
    case "scheduled":
      return "#2196F3";
    case "pending":
      return "#6B7280";
    default:
      return "#6B7280";
  }
};

const ForthcomingBookingComponent = ({
  appointment,
  onPress,
}: ForthcomingBookingComponentProps) => {
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const textColor = useThemeColor({}, "text");

  const vehicleReg =
    appointment.is_bulk && appointment.number_of_vehicles != null
      ? `Bulk · ${appointment.number_of_vehicles} vehicles`
      : appointment.vehicle?.licence ||
        (appointment.vehicle as { registration_number?: string })?.registration_number ||
        "";

  const formatDateTime = () => {
    const dateStr = appointment.booking_date;
    const timeStr = appointment.start_time;
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    const dateFormatted = date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return timeStr ? `${dateFormatted} · ${timeStr}` : dateFormatted;
  };

  const statusColor = getStatusColor(appointment.status || "");

  return (
    <Pressable
      style={[styles.card, { backgroundColor: cardColor, borderColor }]}
      onPress={onPress}
    >
      <View style={styles.header}>
        <StyledText
          variant="bodyMedium"
          style={[styles.vehicleReg, { color: textColor }]}
        >
          {appointment.is_bulk ? vehicleReg : vehicleReg.toUpperCase()}
        </StyledText>
        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <StyledText variant="bodySmall" style={styles.statusText}>
            {appointment.is_bulk
              ? "BULK"
              : (appointment.status || "PENDING").replace("_", " ").toUpperCase()}
          </StyledText>
        </View>
      </View>
      <StyledText
        variant="bodyMedium"
        style={[styles.serviceType, { color: textColor }]}
      >
        {appointment.service_type?.name ?? "—"}
      </StyledText>
      <View style={styles.dateRow}>
        <Ionicons name="calendar-outline" size={14} color={textColor} />
        <StyledText
          variant="bodySmall"
          style={[styles.dateText, { color: textColor }]}
        >
          {formatDateTime()}
        </StyledText>
      </View>
      {appointment.estimated_duration ? (
        <View style={styles.durationRow}>
          <Ionicons name="time-outline" size={14} color={textColor} />
          <StyledText
            variant="bodySmall"
            style={[styles.durationText, { color: textColor }]}
          >
            {appointment.estimated_duration}
          </StyledText>
        </View>
      ) : null}
    </Pressable>
  );
};

export default ForthcomingBookingComponent;

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  vehicleReg: {
    fontWeight: "600",
    fontSize: 14,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: "white",
    fontSize: 9,
    fontWeight: "600",
  },
  serviceType: {
    fontWeight: "500",
    opacity: 0.9,
    marginBottom: 4,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dateText: {
    opacity: 0.8,
  },
  durationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  durationText: {
    opacity: 0.8,
  },
});
