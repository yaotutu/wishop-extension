import type { GlobalLogEntry } from '../../shared/global-log';
import { extensionDb } from '../db/extension-db.ts';
import { markAccountDirty } from '../store/account-sync-state-repository.ts';

const GLOBAL_LOG_ACCOUNT_ID = '__global_logs__';
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOGS = 500;

function pruneLogs(logs: GlobalLogEntry[]): GlobalLogEntry[] {
  const oldestAllowed = Date.now() - RETENTION_MS;
  return logs.filter(log => log.timestamp > oldestAllowed).slice(-MAX_LOGS);
}

function normalizeStoredLog(log: GlobalLogEntry): GlobalLogEntry {
  return {
    ...log,
    eventType: log.eventType || (log.level === 'error' ? 'failed' : log.level === 'warning' ? 'skipped' : log.level === 'success' ? 'completed' : 'started'),
  };
}

export async function getGlobalLogs(): Promise<GlobalLogEntry[]> {
  const records = await extensionDb.accountLogs.where('kind').equals('global').toArray();
  return pruneLogs(records.map(record => normalizeStoredLog(record.entry as GlobalLogEntry)));
}

export async function appendGlobalLog(entry: GlobalLogEntry): Promise<void> {
  const logs = await getGlobalLogs();
  const next = pruneLogs([...logs, entry]);
  await extensionDb.transaction('rw', extensionDb.accountLogs, async () => {
    await extensionDb.accountLogs.where('kind').equals('global').delete();
    await extensionDb.accountLogs.bulkPut(next.map(log => ({
      id: log.id,
      accountId: log.accountId || GLOBAL_LOG_ACCOUNT_ID,
      kind: 'global',
      timestamp: log.timestamp,
      entry: log,
    })));
  });
  if (entry.accountId) await markAccountDirty(entry.accountId);
}

export async function clearGlobalLogs(): Promise<void> {
  await extensionDb.accountLogs.where('kind').equals('global').delete();
}
