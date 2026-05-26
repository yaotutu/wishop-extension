import type { NotificationEntry, NotificationPreference } from '../../shared/notification';
import { DEFAULT_NOTIFICATION_PREFERENCE } from '../../shared/notification';
import { extensionDb } from '../db/extension-db.ts';
import { markAccountDirty } from '../store/account-sync-state-repository.ts';
import { ensureAccountWorkspace, updateAccountWorkspace } from '../store/workspace-repository.ts';

const NOTIFICATION_ACCOUNT_ID = '__notifications__';
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
    topicEnabled: {
      ...DEFAULT_NOTIFICATION_PREFERENCE.topicEnabled,
      ...(input?.topicEnabled || {}),
    },
    moduleEnabled: {
      ...DEFAULT_NOTIFICATION_PREFERENCE.moduleEnabled,
      ...(input?.moduleEnabled || {}),
    },
  };
}

export async function getNotifications(): Promise<NotificationEntry[]> {
  const records = await extensionDb.accountLogs.where('kind').equals('notification').toArray();
  return pruneNotifications(records.map(record => record.entry as NotificationEntry));
}

export async function setNotifications(notifications: NotificationEntry[]): Promise<NotificationEntry[]> {
  const next = pruneNotifications(notifications);
  await extensionDb.transaction('rw', extensionDb.accountLogs, async () => {
    await extensionDb.accountLogs.where('kind').equals('notification').delete();
    if (next.length > 0) {
      await extensionDb.accountLogs.bulkPut(next.map(notification => ({
        id: notification.id,
        accountId: notification.accountId || NOTIFICATION_ACCOUNT_ID,
        kind: 'notification',
        timestamp: notification.timestamp,
        entry: notification,
      })));
    }
  });
  await Promise.all([...new Set(next.map(notification => notification.accountId).filter(Boolean) as string[])]
    .map(accountId => markAccountDirty(accountId)));
  return next;
}

export async function appendNotification(notification: NotificationEntry): Promise<NotificationEntry[]> {
  const notifications = await getNotifications();
  return setNotifications([...notifications, notification]);
}

export async function clearNotifications(): Promise<void> {
  await extensionDb.accountLogs.where('kind').equals('notification').delete();
}

export async function getNotificationPreference(): Promise<NotificationPreference> {
  const workspace = await ensureAccountWorkspace(NOTIFICATION_ACCOUNT_ID);
  return normalizePreference(workspace.notificationPreference);
}

export async function setNotificationPreference(patch: Partial<NotificationPreference>): Promise<NotificationPreference> {
  const current = await getNotificationPreference();
  const next = normalizePreference({
    ...current,
    ...patch,
    topicEnabled: {
      ...current.topicEnabled,
      ...(patch.topicEnabled || {}),
    },
    moduleEnabled: {
      ...current.moduleEnabled,
      ...(patch.moduleEnabled || {}),
    },
  });
  await updateAccountWorkspace(NOTIFICATION_ACCOUNT_ID, workspace => {
    workspace.notificationPreference = next;
  });
  return next;
}
