/**
 * Single notification state and actions: fetch one notification, mark read, delete.
 */
import { useState, useEffect } from "react";
import {
  Notification,
  NotificationType,
  NotificationStatus,
  NotificationFilters,
} from "../interfaces/NotificationInterface";
import {
  useGetNotificationsQuery,
  useMarkNotificationAsReadMutation,
  useMarkAllNotificationsAsReadMutation,
  useDeleteNotificationMutation,
  useSaveNotificationTokenMutation,
} from "../store/api/notificationApi";
import { useNotificationService } from "./useNotificationService";

/**
 * Custom hook for managing notifications in the application.
 *
 * This hook provides a comprehensive interface for:
 * - Fetching and displaying notifications
 * - Filtering notifications by read status and type
 * - Managing notification state (mark as read, delete)
 * - Real-time notification updates
 *
 * @returns {Object} An object containing notification data and management functions
 * @returns {Notification[]} notifications - Filtered notifications based on current filters
 * @returns {Notification[]} allNotifications - All notifications without filtering
 * @returns {NotificationFilters} filters - Current filter settings
 * @returns {number} unreadCount - Number of unread notifications
 * @returns {Function} markAsRead - Function to mark a single notification as read
 * @returns {Function} markAllAsRead - Function to mark all notifications as read
 * @returns {Function} deleteNotification - Function to delete a notification
 * @returns {Function} updateFilters - Function to update notification filters
 * @returns {Function} addNotification - Function to add a new notification (for future use)
 * @returns {Function} refreshNotifications - Function to manually refresh notifications
 * @returns {Function} saveNotificationToken - Function to save push token to server
 * @returns {string} expoPushToken - Current Expo push token
 * @returns {boolean} tokenSaved - Whether the push token has been saved to the server
 * @returns {boolean} isSavingToken - Whether the token is currently being saved
 *
 * @example
 * ```tsx
 * const {
 *   notifications,
 *   unreadCount,
 *   markAsRead,
 *   updateFilters
 * } = useNotification();
 *
 * // Filter to show only unread notifications
 * updateFilters({ showRead: false, showUnread: true });
 *
 * // Mark a notification as read
 * markAsRead(notificationId);
 * ```
 */
export const useNotification = () => {
  // Fetch notifications from the API
  const {
    data: notifications = [],
    isLoading,
    error,
    refetch: refetchNotifications,
  } = useGetNotificationsQuery();

  // Get notification service for push token management
  const { expoPushToken } = useNotificationService();

  /**
   * Process notifications by converting timestamp strings to Date objects.
   * This ensures consistent date handling throughout the application.
   */
  const processedNotifications = notifications.map((notification) => ({
    ...notification,
    timestamp: new Date(notification.timestamp),
  }));

  /**
   * State for managing notification filters.
   * Controls which notifications are displayed based on read status and type.
   */
  const [filters, setFilters] = useState<NotificationFilters>({
    showRead: true,
    showUnread: true,
    types: [],
  });

  /**
   * State to track if the push token has been saved to prevent duplicate saves.
   */
  const [tokenSaved, setTokenSaved] = useState(false);

  /**
   * State to track if the token is currently being saved.
   */
  const [isSavingToken, setIsSavingToken] = useState(false);

  /**
   * Get filtered notifications based on current filter settings.
   *
   * Filters notifications by:
   * - Read status (showRead/showUnread flags)
   * - Notification type (if types array is specified)
   *
   * Results are sorted by timestamp in descending order (newest first).
   *
   * @returns {Notification[]} Array of filtered and sorted notifications
   */
  const getFilteredNotifications = (): Notification[] => {
    return processedNotifications
      .filter((notification) => {
        // Filter by read status
        if (!filters.showRead && notification.isRead) return false;
        if (!filters.showUnread && !notification.isRead) return false;

        // Filter by notification type
        if (
          filters.types.length > 0 &&
          !filters.types.includes(notification.type)
        ) {
          return false;
        }

        return true;
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  };

  /**
   * Mark a single notification as read.
   *
   * @param {string} notificationId - The ID of the notification to mark as read
   */
  const [markAsReadMutation] = useMarkNotificationAsReadMutation();
  const markAsRead = (notificationId: string) => {
    markAsReadMutation({ id: notificationId });
  };

  /**
   * Mark all unread notifications as read.
   *
   * Collects all unread notification IDs and sends them to the API
   * in a single batch operation for efficiency.
   */
  const [markAllAsReadMutation] = useMarkAllNotificationsAsReadMutation();
  const markAllAsRead = () => {
    const unreadIds = processedNotifications
      .filter((notification) => !notification.isRead)
      .map((notification) => notification.id);

    if (unreadIds.length > 0) {
      markAllAsReadMutation({ ids: unreadIds });
    }
  };

  /**
   * Delete a notification permanently.
   *
   * @param {string} notificationId - The ID of the notification to delete
   */
  const [deleteNotificationMutation] = useDeleteNotificationMutation();
  const deleteNotification = (notificationId: string) => {
    deleteNotificationMutation({ id: notificationId });
  };

  /**
   * Save notification token to the server.
   * This should be called once when the user grants notification permissions.
   *
   * @param {string} token - The Expo push token to save
   * @returns {Promise<boolean>} Success status of the operation
   */
  const [saveNotificationTokenMutation] = useSaveNotificationTokenMutation();
  const saveNotificationToken = async (token: string): Promise<boolean> => {
    try {
      if (!token || tokenSaved || isSavingToken) {
        return false;
      }

      setIsSavingToken(true);
      const result = await saveNotificationTokenMutation({ token }).unwrap();

      if (result.success) {
        setTokenSaved(true);
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    } finally {
      setIsSavingToken(false);
    }
  };

  /**
   * Get the count of unread notifications.
   *
   * @returns {number} The number of unread notifications
   */
  const getUnreadCount = (): number => {
    return processedNotifications.filter((notification) => !notification.isRead)
      .length;
  };

  /**
   * Update notification filters.
   *
   * Merges new filter settings with existing ones, allowing partial updates.
   *
   * @param {Partial<NotificationFilters>} newFilters - Partial filter object to merge
   */
  const updateFilters = (newFilters: Partial<NotificationFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  /**
   * Add a new notification (for future use with real-time notifications).
   *
   * Currently creates a notification object but doesn't persist it.
   * This function is prepared for future implementation of real-time
   * notification handling.
   *
   * @param {Omit<Notification, "id" | "timestamp">} notification - Notification data without ID and timestamp
   */
  const addNotification = (
    notification: Omit<Notification, "id" | "timestamp">
  ) => {
    const newNotification: Notification = {
      ...notification,
      id: Date.now().toString(),
      timestamp: new Date(),
    };
    // TODO: Implement notification persistence when real-time notifications are added
  };

  /**
   * Manually refresh notifications from the API.
   *
   * Useful for pull-to-refresh functionality or manual data synchronization.
   */
  const refreshNotifications = () => {
    refetchNotifications();
  };

  /**
   * Automatically save the push token when it becomes available.
   * This effect runs when the expoPushToken changes and saves it to the server.
   */
  useEffect(() => {
    if (expoPushToken && !tokenSaved) {
      saveNotificationToken(expoPushToken);
    }
  }, [expoPushToken, tokenSaved]);

  return {
    notifications: getFilteredNotifications(),
    allNotifications: processedNotifications,
    filters,
    unreadCount: getUnreadCount(),
    markAsRead,
    markAllAsRead,
    deleteNotification,
    updateFilters,
    addNotification,
    refreshNotifications,
    saveNotificationToken,
    expoPushToken,
    tokenSaved,
    isSavingToken,
  };
};
