import { KeyboardAvoidingView, Platform, View } from "react-native";
import React from "react";
import { Stack } from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";

const BookingsLayout = () => {
  const backgroundColor = useThemeColor({}, "background");
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <View style={{ flex: 1, backgroundColor: backgroundColor }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="BookingScreen" />
        </Stack>
      </View>
    </KeyboardAvoidingView>
  );
};

export default BookingsLayout;
