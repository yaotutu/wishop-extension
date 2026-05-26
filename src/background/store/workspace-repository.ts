import type { AccountWorkspaceRecord } from '../db/extension-db.ts';
import { extensionDb } from '../db/extension-db.ts';
import { DEFAULT_NOTIFICATION_PREFERENCE } from '../../shared/notification.ts';
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from '../../shared/settings.ts';
import { DEFAULT_BLACKLIST, DEFAULT_STATUS_RULES, DEFAULT_TASK_CONFIG } from './core.ts';
import { markAccountDirty } from './account-sync-state-repository.ts';

export function createDefaultAccountWorkspace(accountId: string, now = Date.now()): AccountWorkspaceRecord {
  return {
    accountId,
    taskConfig: DEFAULT_TASK_CONFIG,
    scheduledJobs: [],
    productSources: [],
    orderAssociations: [],
    realAddressCaches: [],
    rules: {
      skipKeywords: [],
      blacklistRules: [],
      statusRules: [],
      violationWords: [],
    },
    appSettings: DEFAULT_APP_SETTINGS,
    notificationPreference: DEFAULT_NOTIFICATION_PREFERENCE,
    orderSyncStates: {},
    updatedAt: now,
  };
}

export function normalizeAccountWorkspace(workspace: AccountWorkspaceRecord): AccountWorkspaceRecord {
  return {
    ...workspace,
    taskConfig: workspace.taskConfig || DEFAULT_TASK_CONFIG,
    scheduledJobs: Array.isArray(workspace.scheduledJobs) ? workspace.scheduledJobs : [],
    productSources: Array.isArray(workspace.productSources) ? workspace.productSources : [],
    orderAssociations: Array.isArray(workspace.orderAssociations) ? workspace.orderAssociations : [],
    realAddressCaches: Array.isArray(workspace.realAddressCaches) ? workspace.realAddressCaches : [],
    rules: {
      skipKeywords: Array.isArray(workspace.rules?.skipKeywords) ? workspace.rules.skipKeywords : [],
      blacklistRules: Array.isArray(workspace.rules?.blacklistRules) ? workspace.rules.blacklistRules : [],
      statusRules: Array.isArray(workspace.rules?.statusRules) ? workspace.rules.statusRules : [],
      violationWords: Array.isArray(workspace.rules?.violationWords) ? workspace.rules.violationWords : [],
    },
    appSettings: normalizeAppSettings(workspace.appSettings),
    notificationPreference: workspace.notificationPreference || DEFAULT_NOTIFICATION_PREFERENCE,
    orderSyncStates: workspace.orderSyncStates || {},
  };
}

export async function ensureAccountWorkspace(accountId: string): Promise<AccountWorkspaceRecord> {
  const existing = await extensionDb.accountWorkspaces.get(accountId);
  if (existing) return normalizeAccountWorkspace(existing);
  const workspace = createDefaultAccountWorkspace(accountId);
  await extensionDb.accountWorkspaces.put(workspace);
  return workspace;
}

export async function getAccountWorkspace(accountId: string): Promise<AccountWorkspaceRecord | null> {
  const workspace = await extensionDb.accountWorkspaces.get(accountId);
  return workspace ? normalizeAccountWorkspace(workspace) : null;
}

export async function updateAccountWorkspace(
  accountId: string,
  updater: (workspace: AccountWorkspaceRecord) => void,
): Promise<AccountWorkspaceRecord> {
  const workspace = await ensureAccountWorkspace(accountId);
  updater(workspace);
  const next = normalizeAccountWorkspace({ ...workspace, updatedAt: Date.now() });
  await extensionDb.accountWorkspaces.put(next);
  await markAccountDirty(accountId);
  return next;
}

export function mergeBlacklistRules(stored: AccountWorkspaceRecord['rules']['blacklistRules']) {
  const codeSet = new Set(stored.map(rule => rule.code));
  return [...stored, ...DEFAULT_BLACKLIST.filter(rule => !codeSet.has(rule.code))];
}

export function mergeStatusRules(stored: AccountWorkspaceRecord['rules']['statusRules']) {
  const statusSet = new Set(stored.map(rule => rule.editStatus));
  return [...stored, ...DEFAULT_STATUS_RULES.filter(rule => !statusSet.has(rule.editStatus))];
}
