import React, { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { useNotificationService } from "@/app/app-hooks/useNotificationService";

/**
 * Mounts once at app root to configure Expo notification handlers/channels
 * and delegate token registration to {@link useNotificationService}.
 */
const NotificationInitializer: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { initializeNotificationService } = useNotificationService();

  useEffect(() => {
    const initializeNotifications = async () => {
      try {
        // Configure notification handler
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });

        // Configure Android notification channel
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "default",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#FF231F7C",
          });
        }

        // Initialize the notification service
        await initializeNotificationService();
      } catch (error) {
        console.error("Error initializing notification system:", error);
      }
    };

    initializeNotifications();
  }, [initializeNotificationService]);

  return <>{children}</>;
};

export default NotificationInitializer;
