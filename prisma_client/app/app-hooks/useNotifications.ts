/**
 * Notifications list hook: fetch, filter, mark read, mark all read, delete. Uses notificationApi.
 */
import { useState, useEffect } from "react";
import {
  Notification,
  NotificationType,
  NotificationStatus,
  NotificationFilters,
} from '@/app/interfaces/NotificationInterface'

// Dummy data for notifications
const dummyNotifications: Notification[] = [
  {
    id: "1",
    title: "Booking Confirmed",
    message:
      "Your car valet booking for tomorrow at 2:00 PM has been confirmed.",
    type: NotificationType.BOOKING_CONFIRMED,
    status: NotificationStatus.SUCCESS,
    timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    isRead: false,
    data: { bookingId: "BK001", time: "2:00 PM", date: "2024-01-15" },
  },
  {
    id: "2",
    title: "Cleaning Completed",
    message:
      "Your car cleaning service has been completed. Your car is ready for pickup.",
    type: NotificationType.CLEANING_COMPLETED,
    status: NotificationStatus.SUCCESS,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    isRead: true,
    data: { bookingId: "BK002", serviceType: "Full Valet" },
  },
  {
    id: "3",
    title: "Booking Cancelled",
    message:
      "Your booking for today at 10:00 AM has been cancelled due to weather conditions.",
    type: NotificationType.BOOKING_CANCELLED,
    status: NotificationStatus.WARNING,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4), // 4 hours ago
    isRead: false,
    data: { bookingId: "BK003", reason: "Weather conditions" },
  },
  {
    id: "4",
    title: "Payment Received",
    message:
      "Payment of $75.00 has been received for your recent valet service.",
    type: NotificationType.PAYMENT_RECEIVED,
    status: NotificationStatus.SUCCESS,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6), // 6 hours ago
    isRead: true,
    data: { amount: 75.0, bookingId: "BK004" },
  },
  {
    id: "5",
    title: "Booking Rescheduled",
    message: "Your booking has been rescheduled to tomorrow at 3:00 PM.",
    type: NotificationType.BOOKING_RESCHEDULED,
    status: NotificationStatus.INFO,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8), // 8 hours ago
    isRead: false,
    data: { bookingId: "BK005", newTime: "3:00 PM", newDate: "2024-01-16" },
  },
  {
    id: "6",
    title: "Car Ready for Pickup",
    message: "Your car is ready for pickup at our facility.",
    type: NotificationType.CAR_READY,
    status: NotificationStatus.SUCCESS,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12), // 12 hours ago
    isRead: true,
    data: { bookingId: "BK006", location: "Main Facility" },
  },
  {
    id: "7",
    title: "Reminder",
    message: "Don't forget your car valet appointment tomorrow at 1:00 PM.",
    type: NotificationType.REMINDER,
    status: NotificationStatus.INFO,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    isRead: false,
    data: { bookingId: "BK007", appointmentTime: "1:00 PM" },
  },
  {
    id: "8",
    title: "System Maintenance",
    message:
      "Our booking system will be under maintenance tonight from 2:00 AM to 4:00 AM.",
    type: NotificationType.SYSTEM,
    status: NotificationStatus.INFO,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48), // 2 days ago
    isRead: true,
    data: { maintenanceTime: "2:00 AM - 4:00 AM" },
  },
];

export const useNotification = () => {
  const [notifications, setNotifications] =
    useState<Notification[]>(dummyNotifications);
  const [filters, setFilters] = useState<NotificationFilters>({
    showRead: true,
    showUnread: true,
    types: [],
  });

  // Get filtered notifications
  const getFilteredNotifications = (): Notification[] => {
    return notifications
      .filter((notification) => {
        // Filter by read status
        if (!filters.showRead && notification.isRead) return false;
        if (!filters.showUnread && !notification.isRead) return false;

        // Filter by type
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

  // Mark notification as read
  const markAsRead = (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === notificationId
          ? { ...notification, isRead: true }
          : notification
      )
    );
  };

  // Mark all notifications as read
  const markAllAsRead = () => {
    setNotifications((prev) =>
      prev.map((notification) => ({ ...notification, isRead: true }))
    );
  };

  // Delete notification
  const deleteNotification = (notificationId: string) => {
    setNotifications((prev) =>
      prev.filter((notification) => notification.id !== notificationId)
    );
  };

  // Get unread count
  const getUnreadCount = (): number => {
    return notifications.filter((notification) => !notification.isRead).length;
  };

  // Update filters
  const updateFilters = (newFilters: Partial<NotificationFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  // Add new notification (for future use with real notifications)
  const addNotification = (
    notification: Omit<Notification, "id" | "timestamp">
  ) => {
    const newNotification: Notification = {
      ...notification,
      id: Date.now().toString(),
      timestamp: new Date(),
    };
    setNotifications((prev) => [newNotification, ...prev]);
  };

  return {
    notifications: getFilteredNotifications(),
    allNotifications: notifications,
    filters,
    unreadCount: getUnreadCount(),
    markAsRead,
    markAllAsRead,
    deleteNotification,
    updateFilters,
    addNotification,
  };
};
