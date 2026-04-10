import React from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "@/app/components/helpers/StyledText";
import { useGetVehicleBookingsQuery } from "@/app/store/api/fleetApi";

const VehicleBookingsScreen = () => {
  const params = useLocalSearchParams();
  const vehicleId = params.vehicleId as string | undefined;

  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");

  const {
    data: bookingsData,
    isLoading,
    error,
  } = useGetVehicleBookingsQuery(
    { vehicle_id: vehicleId || "" },
    { skip: !vehicleId }
  );

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return "#4CAF50";
      case "in_progress":
        return "#FF9800";
      case "scheduled":
      case "confirmed":
        return "#2196F3";
      case "cancelled":
        return "#EF4444";
      default:
        return "#6B7280";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor }]}>
        <ActivityIndicator size="large" color={primaryColor} />
        <StyledText children="Loading bookings..." variant="bodyMedium" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.errorContainer, { backgroundColor }]}>
        <StyledText children="Error loading bookings" variant="bodyMedium" />
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: primaryColor }]}
          onPress={() => router.back()}
        >
          <StyledText children="Go Back" variant="bodyMedium" />
        </TouchableOpacity>
      </View>
    );
  }

  const vehicle = bookingsData?.vehicle;
  const bookings = bookingsData?.bookings || [];

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <StyledText
            variant="titleMedium"
            style={[styles.title, { color: textColor }]}
          >
            Vehicle Bookings
          </StyledText>
          {vehicle && (
            <StyledText
              variant="bodySmall"
              style={[styles.vehicleInfo, { color: textColor }]}
            >
              {vehicle.make} {vehicle.model} ({vehicle.year})
            </StyledText>
          )}
          {vehicle && (
            <StyledText
              variant="bodySmall"
              style={[styles.vehicleReg, { color: textColor }]}
            >
              {vehicle.registration_number}
            </StyledText>
          )}
        </View>
      </View>

      {/* Bookings List */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {bookings.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: cardColor }]}>
            <Ionicons name="calendar-outline" size={48} color={textColor} />
            <StyledText
              variant="titleMedium"
              style={[styles.emptyTitle, { color: textColor }]}
            >
              No Bookings Found
            </StyledText>
            <StyledText
              variant="bodyMedium"
              style={[styles.emptyText, { color: textColor }]}
            >
              This vehicle has no bookings in the last 90 days.
            </StyledText>
          </View>
        ) : (
          bookings.map((booking) => (
            <View
              key={booking.id}
              style={[styles.bookingCard, { backgroundColor: cardColor, borderColor }]}
            >
              <View style={styles.bookingHeader}>
                <View style={styles.bookingRefContainer}>
                  <StyledText
                    variant="bodyMedium"
                    style={[styles.bookingRef, { color: textColor }]}
                  >
                    {booking.booking_reference}
                  </StyledText>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusColor(booking.status) },
                    ]}
                  >
                    <StyledText
                      variant="bodySmall"
                      style={styles.statusText}
                    >
                      {booking.status.charAt(0).toUpperCase() + booking.status.slice(1).replace("_", " ")}
                    </StyledText>
                  </View>
                </View>
              </View>

              <View style={styles.bookingDetails}>
                <View style={styles.detailRow}>
                  <Ionicons name="calendar-outline" size={16} color={textColor} />
                  <View style={styles.detailContent}>
                    <StyledText
                      variant="bodySmall"
                      style={[styles.detailLabel, { color: textColor }]}
                    >
                      Appointment Date
                    </StyledText>
                    <StyledText
                      variant="bodyMedium"
                      style={[styles.detailValue, { color: textColor }]}
                    >
                      {formatDate(booking.appointment_date)}
                    </StyledText>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Ionicons name="time-outline" size={16} color={textColor} />
                  <View style={styles.detailContent}>
                    <StyledText
                      variant="bodySmall"
                      style={[styles.detailLabel, { color: textColor }]}
                    >
                      Booking Created
                    </StyledText>
                    <StyledText
                      variant="bodyMedium"
                      style={[styles.detailValue, { color: textColor }]}
                    >
                      {formatDate(booking.created_at)}
                    </StyledText>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Ionicons name="construct-outline" size={16} color={textColor} />
                  <View style={styles.detailContent}>
                    <StyledText
                      variant="bodySmall"
                      style={[styles.detailLabel, { color: textColor }]}
                    >
                      Service Type
                    </StyledText>
                    <StyledText
                      variant="bodyMedium"
                      style={[styles.detailValue, { color: textColor }]}
                    >
                      {booking.service_type}
                    </StyledText>
                  </View>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

export default VehicleBookingsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    paddingTop: 8,
    gap: 12,
  },
  backButtonHeader: {
    padding: 4,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
  },
  vehicleInfo: {
    marginTop: 4,
    fontWeight: "600",
  },
  vehicleReg: {
    marginTop: 2,
    opacity: 0.7,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 8,
    paddingTop: 8,
    paddingBottom: 60,
  },
  bookingCard: {
    padding: 16,
    borderRadius: 5,
    marginBottom: 12,
    borderWidth: 0.5,
  },
  bookingHeader: {
    marginBottom: 12,
  },
  bookingRefContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bookingRef: {
    fontWeight: "600",
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 5,
    marginLeft: 8,
  },
  statusText: {
    color: "white",
    fontSize: 10,
    fontWeight: "600",
  },
  bookingDetails: {
    gap: 12,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    opacity: 0.7,
    marginBottom: 2,
  },
  detailValue: {
    fontWeight: "500",
  },
  emptyState: {
    borderRadius: 5,
    padding: 32,
    alignItems: "center",
    marginTop: 40,
  },
  emptyTitle: {
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: "center",
    opacity: 0.7,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
  },
});
