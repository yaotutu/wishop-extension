import type { GlobalLogEntry } from '../../shared/global-log';

const GLOBAL_LOGS_KEY = 'globalLogs';
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
  const data = await chrome.storage.local.get(GLOBAL_LOGS_KEY);
  return pruneLogs(Array.isArray(data.globalLogs) ? data.globalLogs.map(normalizeStoredLog) : []);
}

export async function appendGlobalLog(entry: GlobalLogEntry): Promise<void> {
  const logs = await getGlobalLogs();
  await chrome.storage.local.set({ [GLOBAL_LOGS_KEY]: pruneLogs([...logs, entry]) });
}

export async function clearGlobalLogs(): Promise<void> {
  await chrome.storage.local.set({ [GLOBAL_LOGS_KEY]: [] });
}
