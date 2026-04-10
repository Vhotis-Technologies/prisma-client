import React from "react";
import { Stack } from "expo-router";
import { View } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";

const DashboardLayout = () => {
  const backgroundColor = useThemeColor({}, "background");
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: backgroundColor,
      }}
    >
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="DashboardScreen" />
        <Stack.Screen name="FleetDashboardScreen" />
        <Stack.Screen name="BranchAdminDashboardScreen" />
        <Stack.Screen name="AdminManagementScreen" />
        <Stack.Screen name="CreateBranchAdminScreen" />
        <Stack.Screen name="BranchesListScreen" />
        <Stack.Screen name="BranchManagementScreen" />
        <Stack.Screen name="UpcomingBookingScreen" />
        <Stack.Screen name="ForthcomingBookingsListScreen" />
        <Stack.Screen name="DealershipPartnerDashboardScreen" />
        <Stack.Screen name="PartnerPayoutScreen" />
      </Stack>
    </View>
  );
};

export default DashboardLayout;
