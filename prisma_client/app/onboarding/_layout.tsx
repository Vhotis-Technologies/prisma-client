import { KeyboardAvoidingView, Platform, StatusBar } from "react-native";
import React from "react";
import { Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useThemeContext } from "../contexts/ThemeProvider";
import { BackButton } from "../components/shared/BackButton";

const OnboardingLayout = () => {
  const backgroundColor = useThemeColor({}, "background");
  const { currentTheme } = useThemeContext();

  // Set status bar style based on theme
  // Light theme -> dark content, Dark theme -> light content
  const statusBarStyle =
    currentTheme === "dark" ? "light-content" : "dark-content";
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor,
      }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 10}
      >
        <BackButton />
        <StatusBar barStyle={statusBarStyle} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="OnboardingScreen" />
          <Stack.Screen name="SigninScreen" />
        </Stack>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default OnboardingLayout;
