import { v4 as uuidv4 } from 'uuid';
import type { ActivityLogEntry } from '../../../shared/activity-log';
import type { NotificationEntry, NotificationPreference } from '../../../shared/notification';
import { NOTIFICATION_TOPIC_DEFINITIONS } from '../../../shared/notification';
import { appendNotification, getNotificationPreference } from '../../notification-center/notification-store.ts';

function emitNotificationEvent(event: string, payload: unknown): void {
  chrome.runtime.sendMessage({ type: 'event', event, payload }).catch(() => {});
}

function shouldCreateNotification(log: ActivityLogEntry, preference: NotificationPreference): boolean {
  if (!log.notification?.topic) return false;
  if (!preference.inAppEnabled) return false;
  const topicDefinition = NOTIFICATION_TOPIC_DEFINITIONS.find(definition => definition.topic === log.notification?.topic);
  if (topicDefinition && preference.domainEnabled[topicDefinition.domain] === false) return false;
  return preference.topicEnabled[log.notification.topic] !== false;
}

function createNotificationFromLog(log: ActivityLogEntry): NotificationEntry {
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
    domain: log.domain,
    event: log.event,
    title: intent.title || log.title,
    detail: intent.detail || log.detail,
    errorMessage: log.error?.message,
    accountId: log.accountId,
    accountName: log.accountName,
    trigger: log.trigger,
    runId: log.runId,
    metadata: log.metadata,
  };
}

export async function writeNotificationFromActivityLog(log: ActivityLogEntry): Promise<NotificationEntry | null> {
  const preference = await getNotificationPreference();
  if (!shouldCreateNotification(log, preference)) return null;

  const notification = createNotificationFromLog(log);
  await appendNotification(notification);
  emitNotificationEvent('notification:added', notification);
  return notification;
}
