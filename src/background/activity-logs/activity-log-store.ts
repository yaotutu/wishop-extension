import type { ActivityLogEntry } from '../../shared/activity-log';
import { extensionDb } from '../db/extension-db.ts';
import { markAccountDirty } from '../store/account-sync-state-repository.ts';

const ACTIVITY_LOG_ACCOUNT_ID = '__activity_logs__';
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOGS = 1000;

function pruneLogs(logs: ActivityLogEntry[]): ActivityLogEntry[] {
  const oldestAllowed = Date.now() - RETENTION_MS;
  return logs.filter(log => log.timestamp > oldestAllowed).slice(-MAX_LOGS);
}

export async function getActivityLogs(): Promise<ActivityLogEntry[]> {
  const records = await extensionDb.accountLogs.where('kind').equals('activity').toArray();
  return pruneLogs(records.map(record => record.entry as ActivityLogEntry));
}

export async function appendActivityLog(entry: ActivityLogEntry): Promise<void> {
  const logs = await getActivityLogs();
  const next = pruneLogs([...logs, entry]);
  await extensionDb.transaction('rw', extensionDb.accountLogs, async () => {
    await extensionDb.accountLogs.where('kind').equals('activity').delete();
    await extensionDb.accountLogs.bulkPut(next.map(log => ({
      id: log.id,
      accountId: log.accountId || ACTIVITY_LOG_ACCOUNT_ID,
      kind: 'activity',
      timestamp: log.timestamp,
      entry: log,
    })));
  });
  if (entry.accountId) await markAccountDirty(entry.accountId);
}

export async function clearActivityLogs(): Promise<void> {
  await extensionDb.accountLogs.where('kind').equals('activity').delete();
}
