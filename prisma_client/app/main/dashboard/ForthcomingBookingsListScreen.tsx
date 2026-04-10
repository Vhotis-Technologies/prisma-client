import React from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "@/app/components/helpers/StyledText";
import { useFetchOngoingAppointmentsQuery } from "@/app/store/api/dashboardApi";
import ForthcomingBookingComponent from "@/app/components/dashboard/ForthcomingBookingComponent";
import ForthcomingBookingsEmptyState from "@/app/components/dashboard/ForthcomingBookingsEmptyState";

const ForthcomingBookingsListScreen = () => {
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const primaryColor = useThemeColor({}, "primary");
  const buttonColor = useThemeColor({}, "button");

  const params = useLocalSearchParams<{ scope?: string | string[] }>();
  const scopeRaw = params.scope;
  const scopeStr = Array.isArray(scopeRaw) ? scopeRaw[0] : scopeRaw;
  const listScope =
    scopeStr === "my_bookings" ? ("my_bookings" as const) : undefined;

  const {
    data: appointments = [],
    isLoading,
    error,
    refetch,
    isFetching,
  } = useFetchOngoingAppointmentsQuery(
    listScope ? { scope: "my_bookings" } : undefined,
  );

  const handleRefresh = () => {
    refetch();
  };

  if (isLoading && appointments.length === 0) {
    return (
      <View style={[styles.centerContainer, { backgroundColor }]}>
        <ActivityIndicator size="large" color={primaryColor} />
        <StyledText
          variant="bodyMedium"
          style={[styles.loadingText, { color: textColor }]}
        >
          Loading forthcoming bookings...
        </StyledText>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centerContainer, { backgroundColor }]}>
        <StyledText variant="bodyMedium" style={{ color: textColor }}>
          Error loading bookings
        </StyledText>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: buttonColor }]}
          onPress={() => refetch()}
        >
          <StyledText variant="bodyMedium">Retry</StyledText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.backButton, { borderColor: textColor }]}
          onPress={() => router.back()}
        >
          <StyledText variant="bodyMedium" style={{ color: textColor }}>
            Go back
          </StyledText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && appointments.length > 0}
            onRefresh={handleRefresh}
          />
        }
      >
        {appointments.length === 0 ? (
          <ForthcomingBookingsEmptyState />
        ) : (
          appointments.map((appointment) => (
            <ForthcomingBookingComponent
              key={appointment.booking_reference}
              appointment={appointment}
              onPress={() => {
                router.push({
                  pathname: "/main/dashboard/UpcomingBookingScreen",
                  params: {
                    appointmentId: appointment.booking_reference,
                    ...(listScope ? { scope: "my_bookings" } : {}),
                  },
                });
              }}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
};

export default ForthcomingBookingsListScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
});
