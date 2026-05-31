import type { NotificationEntry, NotificationPreference } from '../../shared/notification';
import {
  clearNotifications,
  getNotificationPreference,
  getNotifications,
  setNotificationPreference,
  setNotifications,
} from './notification-store';

function emitNotificationEvent(event: string, payload: unknown): void {
  chrome.runtime.sendMessage({ type: 'event', event, payload }).catch(() => {});
}

export async function listNotifications(): Promise<NotificationEntry[]> {
  return getNotifications();
}

export async function markNotificationRead(notificationId: string): Promise<NotificationEntry[]> {
  const timestamp = Date.now();
  const notifications = await getNotifications();
  const next = await setNotifications(notifications.map(notification => notification.id === notificationId
    ? { ...notification, deliveryStatus: 'read' as const, readAt: notification.readAt || timestamp }
    : notification));
  emitNotificationEvent('notification:changed', next);
  return next;
}

export async function markAllNotificationsRead(): Promise<NotificationEntry[]> {
  const timestamp = Date.now();
  const notifications = await getNotifications();
  const next = await setNotifications(notifications.map(notification => notification.readAt
    ? notification
    : { ...notification, deliveryStatus: 'read' as const, readAt: timestamp }));
  emitNotificationEvent('notification:changed', next);
  return next;
}

export async function clearNotificationCenter(): Promise<void> {
  await clearNotifications();
  emitNotificationEvent('notification:changed', []);
}

export async function getNotificationCenterPreference(): Promise<NotificationPreference> {
  return getNotificationPreference();
}

export async function updateNotificationCenterPreference(patch: Partial<NotificationPreference>): Promise<NotificationPreference> {
  const next = await setNotificationPreference(patch);
  emitNotificationEvent('notification:preferenceChanged', next);
  return next;
}
