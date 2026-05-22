import type { NotificationEntry, NotificationPreference } from '../../shared/notification';
import { DEFAULT_NOTIFICATION_PREFERENCE } from '../../shared/notification';

const NOTIFICATIONS_KEY = 'notifications';
const NOTIFICATION_PREFERENCE_KEY = 'notificationPreference';
const MAX_NOTIFICATIONS = 200;
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

function pruneNotifications(notifications: NotificationEntry[]): NotificationEntry[] {
  const oldestAllowed = Date.now() - RETENTION_MS;
  return notifications
    .filter(notification => notification.timestamp > oldestAllowed)
    .slice(-MAX_NOTIFICATIONS);
}

function normalizePreference(value: unknown): NotificationPreference {
  const input = value as Partial<NotificationPreference> | undefined;
  return {
    inAppEnabled: input?.inAppEnabled ?? DEFAULT_NOTIFICATION_PREFERENCE.inAppEnabled,
    levelEnabled: {
      ...DEFAULT_NOTIFICATION_PREFERENCE.levelEnabled,
      ...(input?.levelEnabled || {}),
    },
    moduleEnabled: {
      ...DEFAULT_NOTIFICATION_PREFERENCE.moduleEnabled,
      ...(input?.moduleEnabled || {}),
    },
    eventTypeEnabled: {
      ...DEFAULT_NOTIFICATION_PREFERENCE.eventTypeEnabled,
      ...(input?.eventTypeEnabled || {}),
    },
  };
}

export async function getNotifications(): Promise<NotificationEntry[]> {
  const data = await chrome.storage.local.get(NOTIFICATIONS_KEY);
  return pruneNotifications(Array.isArray(data.notifications) ? data.notifications : []);
}

export async function setNotifications(notifications: NotificationEntry[]): Promise<NotificationEntry[]> {
  const next = pruneNotifications(notifications);
  await chrome.storage.local.set({ [NOTIFICATIONS_KEY]: next });
  return next;
}

export async function appendNotification(notification: NotificationEntry): Promise<NotificationEntry[]> {
  const notifications = await getNotifications();
  return setNotifications([...notifications, notification]);
}

export async function clearNotifications(): Promise<void> {
  await chrome.storage.local.set({ [NOTIFICATIONS_KEY]: [] });
}

export async function getNotificationPreference(): Promise<NotificationPreference> {
  const data = await chrome.storage.local.get(NOTIFICATION_PREFERENCE_KEY);
  return normalizePreference(data.notificationPreference);
}

export async function setNotificationPreference(patch: Partial<NotificationPreference>): Promise<NotificationPreference> {
  const current = await getNotificationPreference();
  const next = normalizePreference({
    ...current,
    ...patch,
    levelEnabled: {
      ...current.levelEnabled,
      ...(patch.levelEnabled || {}),
    },
    moduleEnabled: {
      ...current.moduleEnabled,
      ...(patch.moduleEnabled || {}),
    },
    eventTypeEnabled: {
      ...current.eventTypeEnabled,
      ...(patch.eventTypeEnabled || {}),
    },
  });
  await chrome.storage.local.set({ [NOTIFICATION_PREFERENCE_KEY]: next });
  return next;
}
