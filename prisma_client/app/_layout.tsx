/**
 * Root layout: Redux, Theme, Auth, Alert, Snackbar, GestureHandler, SafeArea, NotificationInitializer, ModalService, UpdateMonitor.
 */
import { Stack } from "expo-router";
import { Provider } from "react-redux";
import store from "./store/main_store";
import ThemeProvider, { useThemeContext } from "./contexts/ThemeProvider";
import AuthContextProvider from "./contexts/AuthContextProvider";
import { AlertProvider } from "./contexts/AlertContext";
import { SnackbarProvider } from "./contexts/SnackbarContext";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import NotificationInitializer from "./components/notification/NotificationInitializer";
import { StatusBar } from "react-native";
import { useUpdateMonitor } from "@/hooks/useUpdateMonitor";
import ModalServiceProvider from "./contexts/ModalServiceProvider";

export default function RootLayout() {
  const { currentTheme } = useThemeContext();

  // Initialize update monitoring
  useUpdateMonitor();

  // Set status bar style based on theme
  // Light theme -> dark content, Dark theme -> light content
  const statusBarStyle =
    currentTheme === "dark" ? "light-content" : "dark-content";
  return (
    <SafeAreaProvider>
      <StatusBar barStyle={statusBarStyle} />
      <Provider store={store}>
        <ThemeProvider>
          <AlertProvider>
            <SnackbarProvider>
              <ModalServiceProvider>
                <AuthContextProvider>
                  <NotificationInitializer>
                    <GestureHandlerRootView>
                      <Stack screenOptions={{ headerShown: false }}>
                        <Stack.Screen name="onboarding" />
                        <Stack.Screen name="main" />
                        <Stack.Screen name="vehiclehistory" />
                      </Stack>
                    </GestureHandlerRootView>
                  </NotificationInitializer>
                </AuthContextProvider>
              </ModalServiceProvider>
            </SnackbarProvider>
          </AlertProvider>
        </ThemeProvider>
      </Provider>
    </SafeAreaProvider>
  );
}
