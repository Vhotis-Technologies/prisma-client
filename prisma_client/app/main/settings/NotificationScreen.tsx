import React, { useState } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NotificationItem } from "@/app/components/notification/NotificationItem";
import {
  Notification,
  NotificationType,
} from "@/app/interfaces/NotificationInterface";
import StyledText from "@/app/components/helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAlertContext } from "@/app/contexts/AlertContext";
import { useNotification } from "@/app/app-hooks/useNotification";

const NotificationScreen = () => {
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const primaryColor = useThemeColor({}, "primary");
  const iconColor = useThemeColor({}, "icons");
  const borderColor = useThemeColor({}, "borders");
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refreshNotifications,
  } = useNotification();
  const { setAlertConfig, setIsVisible } = useAlertContext();
  const [refreshing, setRefreshing] = useState(false);

  const getAlertTypeForNotification = (
    type: NotificationType
  ): "success" | "error" | "warning" => {
    switch (type) {
      case NotificationType.BOOKING_CONFIRMED:
      case NotificationType.CLEANING_COMPLETED:
      case NotificationType.CAR_READY:
      case NotificationType.PAYMENT_RECEIVED:
        return "success";
      case NotificationType.BOOKING_CANCELLED:
        return "error";
      case NotificationType.BOOKING_RESCHEDULED:
      case NotificationType.REMINDER:
        return "warning";
      default:
        return "success";
    }
  };

  const handleNotificationPress = (notification: Notification) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
    setAlertConfig({
      isVisible: true,
      title: notification.title,
      message: notification.message,
      type: getAlertTypeForNotification(notification.type),
      confirmLabel: "OK",
      onConfirm: () => setIsVisible(false),
    });
  };

  const handleMarkAllAsRead = () => {
    if (unreadCount > 0) {
      setAlertConfig({
        isVisible: true,
        title: "Mark All as Read",
        message:
          "Are you sure you want to mark all notifications as read?",
        type: "warning",
        confirmLabel: "Mark All Read",
        onClose: () => setIsVisible(false),
        onConfirm: () => {
          markAllAsRead();
          setIsVisible(false);
        },
      });
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshNotifications();
    } finally {
      setRefreshing(false);
    }
  };


  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="notifications-off" size={64} color={iconColor} />
      <StyledText variant="titleLarge">No notifications</StyledText>
      <StyledText variant="bodySmall">
        You're all caught up! New notifications will appear here.
      </StyledText>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <View style={styles.headerContent}>
          <StyledText variant="titleLarge" style={[styles.headerTitle, { color: textColor }]}>
            Notifications
          </StyledText>
          {unreadCount > 0 && (
            <TouchableOpacity
              onPress={handleMarkAllAsRead}
              style={styles.markAllButton}
              activeOpacity={0.7}
            >
              <StyledText
                variant="labelLarge"
                style={[styles.markAllText, { color: primaryColor }]}
              >
                Mark all read
              </StyledText>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationItem
            notification={item}
            onPress={handleNotificationPress}
            onDelete={deleteNotification}
          />
        )}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[primaryColor]}
            tintColor={primaryColor}
          />
        }
        ListEmptyComponent={renderEmptyState}
      />
    </View>
  );
};

export default NotificationScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
  },
  markAllButton: {
    alignSelf: "flex-end",
  },
  markAllText: {
    fontSize: 14,
    fontWeight: "500",
  },
  listContainer: {
    paddingVertical: 8,
    flexGrow: 1,
    paddingBottom: 60,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    marginTop: 100,
  },
});
