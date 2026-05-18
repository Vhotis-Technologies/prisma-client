import { KeyboardAvoidingView, Platform, View } from "react-native";
import React from "react";
import { Stack } from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useFetchPromotionsQuery } from "@/app/store/api/eventApi";
import { useAppSelector } from "@/app/store/main_store";
import type AuthState from "@/app/interfaces/AuthInterface";
import PromotionsCard from "@/app/components/booking/PromotionsCard";

const BookingsLayout = () => {
  const backgroundColor = useThemeColor({}, "background");
  const { data: promotions } = useFetchPromotionsQuery();
  const user = useAppSelector(
    (state) => (state as { auth: AuthState }).auth.user,
  );
  const showPromotion =
    Boolean(promotions?.is_active) &&
    !user?.is_fleet_owner &&
    !user?.is_branch_admin;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <View style={{ flex: 1, backgroundColor }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="BookingScreen" />
        </Stack>
        {showPromotion && promotions ? (
          <PromotionsCard {...promotions} />
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
};

export default BookingsLayout;
