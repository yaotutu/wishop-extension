import type { AddLogFn, LogEntry } from '../../shared/types';
import { getAccount } from './account-repository';
import { updateAccountData } from './core';

export type ModuleLogKind = 'listing' | 'violation';
type StoreListener = (log: LogEntry) => void;

const listeners = new Map<string, Set<StoreListener>>();
const writeQueues = new Map<string, Promise<void>>();
let logCounter = 0;

function key(kind: ModuleLogKind, accountId: string): string {
  return `${kind}:${accountId}`;
}

function logField(kind: ModuleLogKind): 'listingLogs' | 'violationLogs' {
  return kind === 'listing' ? 'listingLogs' : 'violationLogs';
}

function eventName(kind: ModuleLogKind, accountId: string): string {
  return `${kind}Log:added:${accountId}`;
}

export function onModuleLog(kind: ModuleLogKind, accountId: string, listener: StoreListener): () => void {
  const listenerKey = key(kind, accountId);
  const set = listeners.get(listenerKey) || new Set<StoreListener>();
  set.add(listener);
  listeners.set(listenerKey, set);
  return () => set.delete(listener);
}

function emitModuleLog(kind: ModuleLogKind, accountId: string, log: LogEntry): void {
  listeners.get(key(kind, accountId))?.forEach(listener => listener(log));
  chrome.runtime.sendMessage({ type: 'event', event: eventName(kind, accountId), payload: log }).catch(() => {});
}

export function createScopedModuleLog(kind: ModuleLogKind, accountId: string): AddLogFn {
  return (log: Omit<LogEntry, 'id' | 'timestamp'>) => {
    void addModuleLog(kind, accountId, log);
  };
}

export async function getModuleLogs(kind: ModuleLogKind, accountId: string): Promise<LogEntry[]> {
  const account = await getAccount(accountId);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return (account?.[logField(kind)] || []).filter(log => log.timestamp > sevenDaysAgo);
}

export async function addModuleLog(kind: ModuleLogKind, accountId: string, log: Omit<LogEntry, 'id' | 'timestamp'>): Promise<void> {
  logCounter++;
  const entry: LogEntry = { ...log, id: `${Date.now()}-${logCounter}`, timestamp: Date.now() };
  const queueKey = key(kind, accountId);
  const field = logField(kind);
  const previous = writeQueues.get(queueKey) || Promise.resolve();
  const write = previous.catch(() => undefined).then(async () => {
    await updateAccountData(accountId, account => {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      account[field] = (account[field] || []).filter(item => item.timestamp > sevenDaysAgo);
      account[field].push(entry);
    });
    emitModuleLog(kind, accountId, entry);
  });
  const queued = write.finally(() => {
    if (writeQueues.get(queueKey) === queued) writeQueues.delete(queueKey);
  });
  writeQueues.set(queueKey, queued);
  await write;
}

export async function clearModuleLogs(kind: ModuleLogKind, accountId: string): Promise<void> {
  const queueKey = key(kind, accountId);
  const field = logField(kind);
  const previous = writeQueues.get(queueKey) || Promise.resolve();
  const write = previous.catch(() => undefined).then(() => updateAccountData(accountId, account => {
    account[field] = [];
  }));
  const queued = write.finally(() => {
    if (writeQueues.get(queueKey) === queued) writeQueues.delete(queueKey);
  });
  writeQueues.set(queueKey, queued);
  await write;
}

export const createScopedListingLog = (accountId: string): AddLogFn => createScopedModuleLog('listing', accountId);
export const createScopedViolationLog = (accountId: string): AddLogFn => createScopedModuleLog('violation', accountId);
export const getListingLogs = (accountId: string): Promise<LogEntry[]> => getModuleLogs('listing', accountId);
export const clearListingLogs = (accountId: string): Promise<void> => clearModuleLogs('listing', accountId);
