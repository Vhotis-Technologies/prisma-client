import React, { useMemo } from "react";
import { StyleSheet, Text, View, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import UpcomingAppointmentProps from "../../interfaces/DashboardInterfaces";
import StyledText from "@/app/components/helpers/StyledText";
import StyledButton from "../helpers/StyledButton";

const OngoingServiceCard: React.FC<{
  appointment?: UpcomingAppointmentProps | null;
}> = ({ appointment }) => {
  /* Get the colors from the usetheme color hook */
  const cardColor = useThemeColor({}, "cards");
  const iconColor = useThemeColor({}, "icons");
  const borderColor = useThemeColor({}, "borders");
  const textColor = useThemeColor({}, "text");
  const backgroundColor = useThemeColor({}, "background");

  // Make the appointmet status user friendly
  const userFriendlyStatus = useMemo(() => {
    return appointment?.status?.replace("_", " ");
  }, [appointment?.status]);

  if (!appointment) {
    return (
      <View
        style={[
          styles.ongoingCard,
          { backgroundColor: cardColor, borderColor: borderColor },
        ]}
      >
        <View style={styles.ongoingHeader}>
          <View style={styles.headerLeft}>
            <Ionicons name="time" size={22} color={iconColor} />
            <StyledText
              style={[styles.ongoingTitle, { color: textColor }]}
              variant="titleMedium"
              children="Ongoing Service"
            />
          </View>
        </View>

        <View style={styles.noServiceContent}>
          <Ionicons name="car-outline" size={48} color={iconColor} />
          <StyledText
            style={[styles.noServiceText, { color: textColor }]}
            variant="bodyMedium"
            children="You currently have no ongoing service"
          />
        </View>
      </View>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "in_progress":
        return "#FFA500";
      case "confirmed":
      case "scheduled":
        return "#2196F3";
      case "pending":
        return "#6B7280";
      default:
        return "#2196F3";
    }
  };

  return (
    <View
      style={[
        styles.ongoingCard,
        { backgroundColor: cardColor, borderColor: borderColor },
      ]}
    >
      <View style={styles.ongoingHeader}>
        <View style={styles.headerLeft}>
          <Ionicons name="time" size={22} color={iconColor} />
          <StyledText
            style={[styles.ongoingTitle, { color: textColor }]}
            variant="titleMedium"
            children="Ongoing Service"
          />
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(appointment.status || "") },
          ]}
        >
          <StyledText
            style={styles.statusBadgeText}
            variant="labelSmall"
            children={userFriendlyStatus?.toUpperCase() || ""}
          />
        </View>
      </View>

      <View style={styles.ongoingContent}>
        <View style={styles.detailerInfo}>
          <View style={styles.detailerContent}>
            <StyledText
              style={[styles.detailerName, { color: textColor }]}
              variant="titleMedium"
              children={
                appointment.detailers && appointment.detailers.length > 0
                  ? appointment.detailers.map(d => d.name).join(" & ")
                  : appointment.detailer?.name || "Assigning detailer..."
              }
            />
            {(appointment.detailers && appointment.detailers.length > 0) || appointment.detailer ? (
              <View style={styles.ratingContainer}>
                <Ionicons name="star" size={14} color="#FFD700" />
                <StyledText
                  style={[styles.ratingText, { color: textColor }]}
                  variant="bodySmall"
                  children={
                    appointment.detailers && appointment.detailers.length > 0
                      ? appointment.detailers.map(d => d.rating?.toFixed(1) || "0.0").join(", ")
                      : appointment.detailer?.rating?.toFixed(1) || "0.0"
                  }
                />
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.vehicleInfo}>
          <View style={styles.vehicleRow}>
            <Ionicons name="car-outline" size={16} color={iconColor} />
            <StyledText
              style={[styles.vehicleText, { color: textColor }]}
              variant="bodyMedium"
              children={`${appointment.vehicle.make} ${appointment.vehicle.model}`}
            />
          </View>
          <View style={styles.timeRow}>
            <Ionicons name="time-outline" size={16} color={iconColor} />
            <StyledText
              style={[styles.timeText, { color: textColor }]}
              variant="bodySmall"
              children={`${appointment.start_time} - ${appointment.end_time}`}
            />
          </View>
        </View>
      </View>
    </View>
  );
};

export default OngoingServiceCard;

const styles = StyleSheet.create({
  ongoingCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  ongoingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  ongoingTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginLeft: 10,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  ongoingContent: {
    marginBottom: 8,
  },
  detailerInfo: {
    marginBottom: 16,
  },
  detailerContent: {
    flexDirection: "column",
  },
  detailerName: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 4,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 2,
  },
  vehicleInfo: {
    marginTop: 4,
    gap: 8,
  },
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  vehicleText: {
    fontSize: 15,
    fontWeight: "600",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeText: {
    fontSize: 13,
    opacity: 0.8,
  },
  trackButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingVertical: 12,
    borderRadius: 12,
  },
  trackButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginRight: 8,
  },
  noServiceContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  noServiceText: {
    marginTop: 16,
    textAlign: "center",
    fontSize: 15,
    opacity: 0.7,
  },
});
