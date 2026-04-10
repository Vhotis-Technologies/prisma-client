import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  StatusBar,
} from "react-native";
import React, { useState, useEffect } from "react";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useThemeColor } from "@/hooks/useThemeColor";
import { router, usePathname, Slot, Stack } from "expo-router";
import StyledText from "@/app/components/helpers/StyledText";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { Divider } from "react-native-paper";
import { RootState, useAppSelector } from "../store/main_store";
import ExpoStripeProvider from "../contexts/ExpoStripeProvider";
import { Image } from "expo-image";
import { useNotification } from "../app-hooks/useNotification";
import LinearGradientComponent from "../components/helpers/LinearGradientComponent";
import { useThemeContext } from "../contexts/ThemeProvider";
import { BlurView } from "expo-blur";
import { BackButton } from "@/app/components/shared/BackButton";

/* This is the custom header component visible at the top of the main layout */
const CustomHeader = ({ name }: { name: string }) => {
  const { unreadCount } = useNotification();

  const backgroundColor = useThemeColor({}, "background");
  const iconColor = useThemeColor({}, "icons");
  const textColor = useThemeColor({}, "text");

  return (
    <View style={[styles.header, { backgroundColor }]}>
      <View style={styles.headerButtons}>
        <BackButton />
        <StyledText variant="titleMedium" style={{ color: textColor }}>
          { name}
        </StyledText>
      </View>
      <View style={styles.headerButtons}>
        <View style={styles.notificationContainer}>
          <Pressable
            style={[
              styles.profileButton,
              { backgroundColor, shadowColor: textColor },
            ]}
            onPress={() => router.push("/main/settings/NotificationScreen")}
          >
            <Ionicons
              name="notifications-outline"
              size={24}
              color={iconColor}
            />
          </Pressable>
          {/* Display a small red badge if there are unread notifications */}
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <StyledText variant="bodySmall" style={styles.unreadBadgeText}>
                {unreadCount}
              </StyledText>
            </View>
          )}
        </View>
        <Pressable
          style={[
            styles.profileButton,
            { backgroundColor, shadowColor: textColor },
          ]}
          onPress={() => router.push("/main/settings/SettingsScreen")}
        >
          <Ionicons name="settings-outline" size={24} color={iconColor} />
        </Pressable>
      </View>
    </View>
  );
};

/* This is the main layout component */
export default function MainLayout() {
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const iconColor = useThemeColor({}, "icons");
  const primaryColor = useThemeColor({}, "primary");
  const insets = useSafeAreaInsets();
  const { currentTheme } = useThemeContext();

  const TAB_BAR_HEIGHT = 50;
  const TAB_BAR_BOTTOM_OFFSET = 0;
  const contentPaddingBottom =
    20 + TAB_BAR_BOTTOM_OFFSET + (insets.bottom ?? 0);

  const user = useAppSelector((state: RootState) => state.auth.user);
  const pathname = usePathname();

  const isDashboardActive =
    pathname.includes("/dashboard") ||
    pathname === "/main" ||
    pathname.endsWith("/main");
  const isBookingsActive = pathname.includes("/bookings");
  const isGarageActive = pathname.includes("/garage");
  const isHistoryActive = pathname.includes("/history");

  return (
    <ExpoStripeProvider>
      <KeyboardAvoidingView style={{ flex: 1 }}>
        <SafeAreaView style={[styles.mainContainer, { backgroundColor }]}>
          <StatusBar
            barStyle={
              currentTheme === "dark" ? "light-content" : "dark-content"
            }
          />
          <CustomHeader name={user?.name || ""} />
          <Divider style={{ marginTop: 5, marginBottom: 5 }} />
          <View style={{ flex: 1}}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="bookings" />
              <Stack.Screen name="history" />
              <Stack.Screen name="garage" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="dashboard" />
            </Stack>
          </View>

          <BlurView
            intensity={10}
            tint={currentTheme === "dark" ? "dark" : "light"}
            style={[
              styles.bottomNavWrapper,
              { bottom: 5 + (insets.bottom ?? 0) },
            ]}
          >
            <LinearGradientComponent
              color1={backgroundColor}
              color2={primaryColor}
              start={{ x: 0, y: 3 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.floatingBottomTabContainer,
                { maxHeight: TAB_BAR_HEIGHT },
              ]}
            >
            <Pressable
              onPress={() => router.push("/main/dashboard/DashboardScreen")}
              style={[
                styles.floatingBottomButtons,
                isDashboardActive && {
                  backgroundColor: primaryColor + "50",
                },
              ]}
            >
                <Ionicons
                  name={isDashboardActive ? "home" : "home-outline"}
                  size={24}
                  color={isDashboardActive ? primaryColor : iconColor}
                />
              </Pressable>
              <Pressable
                onPress={() => router.push("/main/bookings/BookingScreen")}
                style={[
                  styles.floatingBottomButtons,
                  isBookingsActive && {
                    backgroundColor: primaryColor + "30",
                  },
                ]}
              >
                <Ionicons
                  name={isBookingsActive ? "book" : "book-outline"}
                  size={24}
                  color={isBookingsActive ? primaryColor : iconColor}
                />
              </Pressable>
              <Pressable
                onPress={() => router.push("/main/garage/GarageScreen")}
                style={[
                  styles.floatingBottomButtons,
                  isGarageActive && {
                    backgroundColor: primaryColor + "30",
                  },
                ]}
              >
                <Ionicons
                  name={isGarageActive ? "car" : "car-outline"}
                  size={24}
                  color={isGarageActive ? primaryColor : iconColor}
                />
              </Pressable>
              <Pressable
                onPress={() => router.push("/main/history/HistoryScreen")}
                style={[
                  styles.floatingBottomButtons,
                  isHistoryActive && {
                    backgroundColor: primaryColor + "30",
                  },
                ]}
              >
                <MaterialIcons
                  name="history"
                  size={24}
                  color={isHistoryActive ? primaryColor : iconColor}
                />
              </Pressable>
            </LinearGradientComponent>
          </BlurView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ExpoStripeProvider>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  profileButton: {
    padding: 8,
    borderRadius: 30,
    borderWidth: 1,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 3,
  },
  notificationContainer: {
    position: "relative",
  },
  unreadBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: "#FF4444",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  unreadBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    fontFamily: "RobotoMedium",
    color: "white",
  },
  floatingBottomTabContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 15,
    borderRadius: 30,
    maxWidth: "80%",
    alignItems: "center",
  },
  bottomNavWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  floatingBottomButtons: {
    padding: 12,
    borderRadius: 25,
  },
});
