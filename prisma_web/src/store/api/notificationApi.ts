import type { InboxNotification } from "../../types/account";
import { getData, patchData } from "./client";

export function getNotifications() {
  return getData<InboxNotification[]>("/api/v1/notifications/get_notifications/");
}

export function markNotificationRead(id: string) {
  return patchData("/api/v1/notifications/mark_notification_as_read/", { id });
}

export function markAllNotificationsRead(ids: string[]) {
  return patchData("/api/v1/notifications/mark_all_notifications_as_read/", { ids });
}

export function deleteNotification(id: string) {
  return patchData("/api/v1/notifications/delete_notification/", { id });
}
