/**
 * In-app notification types and status for the notification list and badges.
 */
export interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  status: NotificationStatus;
  timestamp: Date;
  isRead: boolean;
  data?: {
    bookingReference?: string;
    status?: string;
    timestamp?: string;
    [key: string]: any;
  };
}

export enum NotificationType {
  BOOKING_CONFIRMED = "booking_confirmed",
  BOOKING_CANCELLED = "booking_cancelled",
  BOOKING_RESCHEDULED = "booking_rescheduled",
  CLEANING_COMPLETED = "cleaning_completed",
  APPOINTMENT_STARTED = "appointment_started",
  CAR_READY = "car_ready",
  PAYMENT_RECEIVED = "payment_received",
  REMINDER = "reminder",
  SYSTEM = "system",
  SERVICE_STARTED = "service_started",
  SERVICE_COMPLETED = "service_completed",
}

export enum NotificationStatus {
  SUCCESS = "success",
  WARNING = "warning",
  ERROR = "error",
  INFO = "info",
}

export interface NotificationIcon {
  name: string;
  color: string;
  size?: number;
}

export interface NotificationFilters {
  showRead: boolean;
  showUnread: boolean;
  types: NotificationType[];
}
