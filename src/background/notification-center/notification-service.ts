import { v4 as uuidv4 } from 'uuid';
import type { GlobalLogEntry } from '../../shared/global-log';
import type { NotificationEntry, NotificationPreference } from '../../shared/notification';
import { NOTIFICATION_TOPIC_DEFINITIONS } from '../../shared/notification';
import {
  appendNotification,
  clearNotifications,
  getNotificationPreference,
  getNotifications,
  setNotificationPreference,
  setNotifications,
} from './notification-store';

function emitNotificationEvent(event: string, payload: unknown): void {
  chrome.runtime.sendMessage({ type: 'event', event, payload }).catch(() => {});
}

function shouldNotify(log: GlobalLogEntry, preference: NotificationPreference): boolean {
  if (!log.notification?.topic) return false;
  if (!preference.inAppEnabled) return false;
  const topicDefinition = NOTIFICATION_TOPIC_DEFINITIONS.find(definition => definition.topic === log.notification?.topic);
  if (topicDefinition && preference.moduleEnabled[topicDefinition.module] === false) return false;
  return preference.topicEnabled[log.notification.topic] !== false;
}

function createNotificationFromLog(log: GlobalLogEntry): NotificationEntry {
  const intent = log.notification;
  if (!intent) throw new Error('Missing notification intent');
  return {
    id: uuidv4(),
    sourceLogId: log.id,
    topic: intent.topic,
    timestamp: Date.now(),
    channel: 'inApp',
    deliveryStatus: 'created',
    level: log.level,
    module: log.module,
    eventType: log.eventType,
    title: intent.title || log.title,
    detail: intent.detail || log.detail,
    errorMessage: log.error?.message,
    accountId: log.accountId,
    accountName: log.accountName,
    taskKind: log.taskKind,
    runId: log.runId,
    metadata: log.metadata,
  };
}

export async function createNotificationForGlobalLog(log: GlobalLogEntry): Promise<NotificationEntry | null> {
  const preference = await getNotificationPreference();
  if (!shouldNotify(log, preference)) return null;

  const notification = createNotificationFromLog(log);
  await appendNotification(notification);
  emitNotificationEvent('notification:added', notification);
  return notification;
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
