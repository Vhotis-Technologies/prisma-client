/**
 * Expo Updates: check for OTA updates, prompt reload. Skips in development.
 */
import { useEffect, useState } from "react";
import * as Updates from "expo-updates";
import { Alert } from "react-native";
import Constants from "expo-constants";

export const useUpdateMonitor = () => {
  const [isCheckingForUpdate, setIsCheckingForUpdate] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const checkForUpdates = async () => {
      // Skip update checks in development
      if (__DEV__) {
        return;
      }

      // Check if updates are enabled
      if (!Updates.isEnabled) {
        return;
      }

      try {
        setIsCheckingForUpdate(true);
        const update = await Updates.checkForUpdateAsync();

        if (update.isAvailable) {
          setUpdateAvailable(true);

          // Show alert to user
          Alert.alert(
            "Update Available",
            "A new version of the app is available. Would you like to download and install it now?",
            [
              {
                text: "Later",
                style: "cancel",
              },
              {
                text: "Update Now",
                onPress: async () => {
                  try {
                    await Updates.fetchUpdateAsync();
                    await Updates.reloadAsync();
                  } catch (error) {
                    Alert.alert(
                      "Update Failed",
                      "Failed to install update. Please try again later."
                    );
                  }
                },
              },
            ]
          );
        }
      } catch (error:any) {
        // Don't show error alerts in production to avoid annoying users
        if (__DEV__) {
          Alert.alert("Update Check Failed", error.message);
        }
      } finally {
        setIsCheckingForUpdate(false);
      }
    };

    // Check for updates on app start
    checkForUpdates();

    // Set up periodic checks (every 5 minutes) - only in production
    if (!__DEV__) {
      const interval = setInterval(checkForUpdates, 300000);
      return () => clearInterval(interval);
    }
  }, []);

  return {
    isCheckingForUpdate,
    updateAvailable,
  };
};
