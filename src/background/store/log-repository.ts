import type { AddLogFn, LogEntry } from '../../shared/types';
import { getAccount } from './account-repository';
import { updateAccountData } from './core';

type StoreListener = (log: LogEntry) => void;

const listeners = new Map<string, Set<StoreListener>>();
let logCounter = 0;

export function onLog(accountId: string, listener: StoreListener): () => void {
  const set = listeners.get(accountId) || new Set<StoreListener>();
  set.add(listener);
  listeners.set(accountId, set);
  return () => set.delete(listener);
}

function emitLog(accountId: string, log: LogEntry): void {
  listeners.get(accountId)?.forEach(listener => listener(log));
  chrome.runtime.sendMessage({ type: 'event', event: `log:added:${accountId}`, payload: log }).catch(() => {});
  chrome.runtime.sendMessage({ type: 'event', event: `violation:log:${accountId}`, payload: log }).catch(() => {});
}

export function createScopedAddLog(accountId: string): AddLogFn {
  return (log: Omit<LogEntry, 'id' | 'timestamp'>) => {
    void addLog(accountId, log);
  };
}

export async function getLogs(accountId: string): Promise<LogEntry[]> {
  const account = await getAccount(accountId);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return (account?.logs || []).filter(log => log.timestamp > sevenDaysAgo);
}

export async function addLog(accountId: string, log: Omit<LogEntry, 'id' | 'timestamp'>): Promise<void> {
  logCounter++;
  const entry: LogEntry = { ...log, id: `${Date.now()}-${logCounter}`, timestamp: Date.now() };
  await updateAccountData(accountId, account => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    account.logs = (account.logs || []).filter(item => item.timestamp > sevenDaysAgo);
    account.logs.push(entry);
  });
  emitLog(accountId, entry);
}

export async function clearLogs(accountId: string): Promise<void> {
  await updateAccountData(accountId, account => {
    account.logs = [];
  });
}
