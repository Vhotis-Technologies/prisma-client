import React from "react";
import { StyleSheet, View, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "@/app/components/helpers/StyledText";
import StyledButton from "@/app/components/helpers/StyledButton";

const ForthcomingBookingsEmptyState = () => {
  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "cards");
  const buttonColor = useThemeColor({}, "button");

  const handleGoToBooking = () => {
    router.push("/main/bookings/BookingScreen");
  };

  return (
    <View style={[styles.container, { backgroundColor: cardColor }]}>
      <Ionicons name="calendar-outline" size={48} color={textColor} />
      <StyledText
        variant="titleMedium"
        style={[styles.title, { color: textColor }]}
      >
        No forthcoming bookings
      </StyledText>
      <StyledText
        variant="bodyMedium"
        style={[styles.message, { color: textColor }]}
      >
        You don't have any upcoming appointments. Book a service when you're ready.
      </StyledText>
      <StyledButton
        title="Book a service"
        onPress={handleGoToBooking}
        variant="tonal"
      />
    </View>
  );
};

export default ForthcomingBookingsEmptyState;

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 32,
    alignItems: "center",
    marginTop: 40,
    borderWidth: 1,
    borderColor: "transparent",
  },
  title: {
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  message: {
    textAlign: "center",
    opacity: 0.8,
    marginBottom: 20,
  },
  button: {
    minWidth: 160,
  },
});
