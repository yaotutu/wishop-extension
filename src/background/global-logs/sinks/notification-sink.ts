import { v4 as uuidv4 } from 'uuid';
import type { GlobalLogEntry } from '../../../shared/global-log';
import type { NotificationEntry, NotificationPreference } from '../../../shared/notification';
import { NOTIFICATION_TOPIC_DEFINITIONS } from '../../../shared/notification';
import { appendNotification, getNotificationPreference } from '../../notification-center/notification-store';

function emitNotificationEvent(event: string, payload: unknown): void {
  chrome.runtime.sendMessage({ type: 'event', event, payload }).catch(() => {});
}

function shouldCreateNotification(log: GlobalLogEntry, preference: NotificationPreference): boolean {
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

export async function writeNotificationFromGlobalLog(log: GlobalLogEntry): Promise<NotificationEntry | null> {
  const preference = await getNotificationPreference();
  if (!shouldCreateNotification(log, preference)) return null;

  const notification = createNotificationFromLog(log);
  await appendNotification(notification);
  emitNotificationEvent('notification:added', notification);
  return notification;
}
