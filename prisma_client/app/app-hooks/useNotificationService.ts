/**
 * Expo Notifications: register for push, get token, save token to backend, handle foreground/response. Uses usePermissions.
 */
import { useState, useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { usePermissions } from "./usePermissions";
import Constants from "expo-constants";
import { APP_CONFIG } from "@/constants/Config";
import store from "@/app/store/main_store";
import { dashboardApi } from "@/app/store/api/dashboardApi";

const BOOKING_PUSH_TYPES = new Set([
  "booking_confirmed",
  "appointment_started",
  "cleaning_completed",
]);

/**
 * Notification service hook that handles push notifications
 *
 * Features:
 * - Registers device for push notifications
 * - Manages notification tokens
 * - Handles notification responses
 * - Schedules local notifications
 * - Integrates with permission system
 *
 * @returns Push token, last notification, and local notification helpers
 */
export const useNotificationService = () => {
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>();
  const [notification, setNotification] =
    useState<Notifications.Notification>();
  const notificationListener = useRef<Notifications.EventSubscription>(null);
  const responseListener = useRef<Notifications.EventSubscription>(null);
  const { permissionStatus } = usePermissions();

  /**
   * Configure notification handler for the app
   */
  const configureNotifications = () => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  };

  /**
   * Register device for push notifications
   */
  const registerForPushNotificationsAsync = async () => {
    let token;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        return;
      }

      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId: APP_CONFIG.projectId, // Your EAS project ID
        })
      ).data;
    }

    return token;
  };

  /**
   * Schedule a local notification
   */
  const scheduleLocalNotification = async (
    title: string,
    body: string,
    data?: any,
    trigger?: Notifications.NotificationTriggerInput
  ) => {
    try {
      if (!permissionStatus.notifications.granted) {
        return null;
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: true,
        },
        trigger: trigger || null, // null means send immediately
      });

      return notificationId;
    } catch (error) {
      console.error("Error scheduling notification:", error);
      return null;
    }
  };

  /**
   * Cancel a scheduled notification
   */
  const cancelNotification = async (notificationId: string) => {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.error("Error canceling notification:", error);
    }
  };

  /**
   * Cancel all scheduled notifications
   */
  const cancelAllNotifications = async () => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      console.error("Error canceling all notifications:", error);
    }
  };

  /**
   * Get all scheduled notifications
   */
  const getScheduledNotifications = async () => {
    try {
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
      console.error("Error getting scheduled notifications:", error);
      return [];
    }
  };

  /**
   * Send a test notification
   */
  const sendTestNotification = async () => {
    if (!permissionStatus.notifications.granted) {
      return;
    }

    await scheduleLocalNotification(
      "Test Notification",
      "This is a test notification from your app!",
      { type: "test" }
    );
  };

  /**
   * Initialize notification service
   */
  const initializeNotificationService = async () => {
    try {
      configureNotifications();

      if (permissionStatus.notifications.granted) {
        const token = await registerForPushNotificationsAsync();
        setExpoPushToken(token);
      }

      // Set up notification listeners
      notificationListener.current =
        Notifications.addNotificationReceivedListener((notification) => {
          setNotification(notification);
          const type = notification.request.content.data?.type;
          if (typeof type === "string" && BOOKING_PUSH_TYPES.has(type)) {
            store.dispatch(
              dashboardApi.util.invalidateTags([
                "UpcomingAppointments",
                "RecentServices",
              ])
            );
          }
        });

      responseListener.current =
        Notifications.addNotificationResponseReceivedListener((response) => {
          const type = response.notification.request.content.data?.type;
          if (typeof type === "string" && BOOKING_PUSH_TYPES.has(type)) {
            store.dispatch(
              dashboardApi.util.invalidateTags([
                "UpcomingAppointments",
                "RecentServices",
              ])
            );
          }
        });

      return;
    } catch (error) {
      console.error("Error initializing notification service:", error);
    }
  };

  // Initialize on mount
  useEffect(() => {
    initializeNotificationService();

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [permissionStatus.notifications.granted]);

  return {
    expoPushToken,
    notification,
    scheduleLocalNotification,
    cancelNotification,
    cancelAllNotifications,
    getScheduledNotifications,
    sendTestNotification,
    initializeNotificationService,
  };
};
