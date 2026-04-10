import { View } from "react-native";
import React from "react";
import { Stack } from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";

const SettingsLayout = () => {
  const backgroundColor = useThemeColor({}, "background");
  return (
    <View style={{ flex: 1, backgroundColor: backgroundColor }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="SettingsScreen" />
        <Stack.Screen name="HelpSupportScreen" />
        <Stack.Screen name="TicketDetailScreen" />
        <Stack.Screen name="NotificationScreen" />
        <Stack.Screen name="TrackDetailerMapScreen" />
        <Stack.Screen name="ManageAddressesScreen" />
        <Stack.Screen name="ManagePaymentsScreen" />
        <Stack.Screen name="InvoicesScreen" />
        <Stack.Screen name="InvoiceDetailScreen" />
        <Stack.Screen name="ProfileUpdateScreen" />
        <Stack.Screen name="SubscriptionPlanScreen" />
      </Stack>
    </View>
  );
};

export default SettingsLayout;
