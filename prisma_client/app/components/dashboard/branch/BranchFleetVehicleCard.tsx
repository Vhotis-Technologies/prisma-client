import React, { useMemo } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import StyledText from "@/app/components/helpers/StyledText";
import { useGetVehicleBookingsQuery } from "@/app/store/api/fleetApi";

export interface BranchFleetVehicleCardVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  registration_number: string;
}

interface Props {
  vehicle: BranchFleetVehicleCardVehicle;
  cardColor: string;
  textColor: string;
  borderColor: string;
}

const BranchFleetVehicleCard = ({
  vehicle,
  cardColor,
  textColor,
  borderColor,
}: Props) => {
  const { data: bookingsData } = useGetVehicleBookingsQuery(
    { vehicle_id: vehicle.id },
    { skip: !vehicle.id },
  );

  const hasUpcomingBooking = useMemo(() => {
    if (!bookingsData?.bookings) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(today.getDate() + 7);
    sevenDaysFromNow.setHours(23, 59, 59, 999);

    return bookingsData.bookings.some((booking) => {
      const appointmentDate = new Date(booking.appointment_date);
      appointmentDate.setHours(0, 0, 0, 0);
      const isUpcoming =
        appointmentDate >= today && appointmentDate <= sevenDaysFromNow;
      const isActiveStatus = [
        "confirmed",
        "scheduled",
        "in_progress",
        "pending",
      ].includes(booking.status.toLowerCase());
      return isUpcoming && isActiveStatus;
    });
  }, [bookingsData]);

  const borderColorToUse = hasUpcomingBooking ? "#FFD700" : borderColor;
  const borderWidth = hasUpcomingBooking ? 3 : 1;

  return (
    <TouchableOpacity
      style={[
        styles.vehicleCard,
        {
          backgroundColor: cardColor,
          borderColor: borderColorToUse,
          borderWidth: borderWidth,
        },
      ]}
      onPress={() => {
        router.push({
          pathname: "/main/dashboard/VehicleBookingsScreen",
          params: { vehicleId: vehicle.id },
        });
      }}
    >
      <View style={styles.vehicleCardContent}>
        <View style={styles.vehicleCardHeader}>
          <StyledText
            variant="bodyMedium"
            style={{ color: textColor, fontWeight: "600" }}
          >
            {vehicle.make} {vehicle.model} ({vehicle.year})
          </StyledText>
          {hasUpcomingBooking && (
            <View
              style={[styles.bookingIndicator, { backgroundColor: "#FFD700" }]}
            >
              <Ionicons name="calendar" size={12} color="#000" />
            </View>
          )}
        </View>
        <StyledText
          variant="bodySmall"
          style={{ color: textColor, opacity: 0.7 }}
        >
          {vehicle.registration_number}
        </StyledText>
      </View>
    </TouchableOpacity>
  );
};

export default BranchFleetVehicleCard;

const styles = StyleSheet.create({
  vehicleCard: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  vehicleCardContent: {
    gap: 4,
  },
  vehicleCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bookingIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
});
