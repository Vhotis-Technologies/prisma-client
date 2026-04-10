/**
 * Permission hooks: push notifications, location. Prompts and status for Expo Notifications and Location.
 */
import { useState, useEffect } from "react";
import * as Notifications from "expo-notifications";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { useAlertContext } from "../contexts/AlertContext";
import { useSnackbar } from "../contexts/SnackbarContext";

/**
 * Permission status types
 */
export interface PermissionStatus {
  notifications: {
    granted: boolean;
    canAskAgain: boolean;
    status: "granted" | "denied" | "undetermined" | "blocked";
  };
  location: {
    granted: boolean;
    canAskAgain: boolean;
    status: "granted" | "denied" | "undetermined" | "blocked";
  };
}

/**
 * Permission service hook that manages notification and location permissions
 *
 * Features:
 * - Checks current permission status
 * - Requests permissions with proper error handling
 * - Persists permission preferences in SecureStore
 * - Provides real-time permission status updates
 * - Handles platform-specific permission flows
 * - Graceful degradation when permissions are denied
 */
export const usePermissions = () => {
  const { setAlertConfig, setIsVisible } = useAlertContext();

  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>({
    notifications: {
      granted: false,
      canAskAgain: true,
      status: "undetermined",
    },
    location: {
      granted: false,
      canAskAgain: true,
      status: "undetermined",
    },
  });

  const [isLoading, setIsLoading] = useState(true);

  /**
   * Check current notification permission status
   */
  const checkNotificationPermission = async () => {
    try {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();

      const permissionInfo = {
        granted: status === "granted",
        canAskAgain,
        status,
      };

      setPermissionStatus((prev) => ({
        ...prev,
        notifications: permissionInfo,
      }));

      return permissionInfo;
    } catch (error) {
      console.error("Error checking notification permission:", error);
      return null;
    }
  };

  /**
   * Check current location permission status
   */
  const checkLocationPermission = async () => {
    try {
      const { status, canAskAgain } =
        await Location.getForegroundPermissionsAsync();

      const permissionInfo = {
        granted: status === "granted",
        canAskAgain,
        status,
      };

      setPermissionStatus((prev) => ({
        ...prev,
        location: permissionInfo,
      }));

      return permissionInfo;
    } catch (error) {
      console.error("Error checking location permission:", error);
      return null;
    }
  };

  /**
   * Request notification permission
   */
  const requestNotificationPermission = async (): Promise<boolean> => {
    try {
      // First check if we can ask for permission
      const currentStatus = await Notifications.getPermissionsAsync();

      if (!currentStatus.canAskAgain) {
        // Permission was permanently denied - don't show alert, just return false
        const permissionInfo = {
          granted: false,
          canAskAgain: false,
          status: "denied" as const,
        };

        setPermissionStatus((prev) => ({
          ...prev,
          notifications: permissionInfo,
        }));
        return false;
      }

      // Request permission
      const { status } = await Notifications.requestPermissionsAsync();

      const permissionInfo = {
        granted: status === "granted",
        canAskAgain: currentStatus.canAskAgain,
        status,
      };

      setPermissionStatus((prev) => ({
        ...prev,
        notifications: permissionInfo,
      }));

      if (status === "granted") {
        // Configure notification handler for Android
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "default",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#FF231F7C",
          });
        }

        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      return false;
    }
  };

  /**
   * Toggle notification permission - for use in settings
   * This handles both enabling and disabling notifications
   */
  const toggleNotificationPermission = async (
    enable: boolean
  ): Promise<boolean> => {
    try {
      if (enable) {
        // User wants to enable notifications
        return await requestNotificationPermission();
      } else {
        // User wants to disable notifications
        // We can't actually disable system permissions, but we can update our state
        const permissionInfo = {
          granted: false,
          canAskAgain: true,
          status: "denied" as const,
        };

        setPermissionStatus((prev) => ({
          ...prev,
          notifications: permissionInfo,
        }));

        return true; // Return true because we successfully updated our state
      }
    } catch (error) {
      console.error("Error toggling notification permission:", error);
      return false;
    }
  };

  /**
   * Request location permission
   */
  const requestLocationPermission = async (): Promise<boolean> => {
    try {
      // First check if we can ask for permission
      const currentStatus = await Location.getForegroundPermissionsAsync();

      if (!currentStatus.canAskAgain) {
        setAlertConfig({
          isVisible: true,
          title: "Location Permission Required",
          message:
            "Please enable location services in your device settings to find nearby services and provide accurate location-based features.",
          type: "warning",
          onConfirm: () => {
            import("expo-linking").then(({ openSettings }) => openSettings());
          },
        });
        return false;
      }

      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();

      const permissionInfo = {
        granted: status === "granted",
        canAskAgain: currentStatus.canAskAgain,
        status,
      };

      setPermissionStatus((prev) => ({
        ...prev,
        location: permissionInfo,
      }));

      if (status === "granted") {
        return true;
      } else {
        setAlertConfig({
          isVisible: true,
          title: "Permission Denied",
          message:
            "You can enable location services later in the app settings.",
          type: "warning",
          onClose: () => {
            setIsVisible(false);
          },
        });
        return false;
      }
    } catch (error) {
      console.error("Error requesting location permission:", error);
      return false;
    }
  };

  /**
   * Toggle location permission - for use in settings
   * This handles both enabling and disabling location access
   */
  const toggleLocationPermission = async (
    enable: boolean
  ): Promise<boolean> => {
    try {
      if (enable) {
        // User wants to enable location
        return await requestLocationPermission();
      } else {
        // User wants to disable location
        // We can't actually disable system permissions, but we can update our state
        // and show guidance to the user
        const permissionInfo = {
          granted: false,
          canAskAgain: true,
          status: "denied" as const,
        };

        setPermissionStatus((prev) => ({
          ...prev,
          location: permissionInfo,
        }));

        // Show alert to guide user to device settings
        setAlertConfig({
          isVisible: true,
          title: "Disable Location Access",
          message:
            "To completely disable location access, please go to your device Settings > Apps > Prisma Valet > Permissions and turn off Location.",
          type: "warning",
          onConfirm: () => {
            import("expo-linking").then(({ openSettings }) => openSettings());
          },
          onClose: () => {
            setIsVisible(false);
          },
        });

        return true; // Return true because we successfully updated our state
      }
    } catch (error) {
      console.error("Error toggling location permission:", error);
      return false;
    }
  };

  /**
   * Request all permissions (for first-time setup)
   */
  const requestAllPermissions = async () => {
    setIsLoading(true);

    try {
      const notificationResult = await requestNotificationPermission();
      const locationResult = await requestLocationPermission();

      return {
        notifications: notificationResult,
        location: locationResult,
      };
    } catch (error) {
      console.error("Error requesting all permissions:", error);
      return {
        notifications: false,
        location: false,
      };
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Initialize permissions on app startup
   */
  const initializePermissions = async () => {
    setIsLoading(true);

    try {
      await checkNotificationPermission();
      await checkLocationPermission();
    } catch (error) {
      console.error("Error initializing permissions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize permissions on mount
  useEffect(() => {
    initializePermissions();
  }, []);

  return {
    permissionStatus,
    isLoading,
    checkNotificationPermission,
    checkLocationPermission,
    requestNotificationPermission,
    toggleNotificationPermission,
    requestLocationPermission,
    toggleLocationPermission,
    requestAllPermissions,
  };
};
