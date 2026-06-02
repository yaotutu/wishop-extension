import type { AccountWorkspaceRecord } from '../db/extension-db.ts';
import { extensionDb } from '../db/extension-db.ts';
import { DEFAULT_NOTIFICATION_PREFERENCE, normalizeNotificationPreference } from '../../shared/notification.ts';
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from '../../shared/settings.ts';
import {
  DEFAULT_PRODUCT_AUDIT_CONFIG,
  DEFAULT_PRODUCT_AUDIT_FAILURE_DEFAULT_ACTION,
  DEFAULT_PRODUCT_AUDIT_FAILURE_RULES,
  DEFAULT_STATUS_RULES,
  normalizeProductAuditTaskConfig,
} from './core.ts';
import { markAccountDirty } from './account-sync-state-repository.ts';

export function createDefaultAccountWorkspace(accountId: string, now = Date.now()): AccountWorkspaceRecord {
  return {
    accountId,
    productAuditConfig: DEFAULT_PRODUCT_AUDIT_CONFIG,
    scheduledJobs: [],
    productSources: [],
    orderAssociations: [],
    realAddressCaches: [],
    rules: {
      productAuditRules: DEFAULT_PRODUCT_AUDIT_FAILURE_RULES,
      productAuditDefaultFailureAction: DEFAULT_PRODUCT_AUDIT_FAILURE_DEFAULT_ACTION,
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
    productAuditConfig: normalizeProductAuditTaskConfig(workspace.productAuditConfig),
    scheduledJobs: Array.isArray(workspace.scheduledJobs)
      ? workspace.scheduledJobs.filter(job => (job as { jobType?: string }).jobType !== 'listing.submitDrafts')
      : [],
    productSources: Array.isArray(workspace.productSources) ? workspace.productSources : [],
    orderAssociations: Array.isArray(workspace.orderAssociations) ? workspace.orderAssociations : [],
    realAddressCaches: Array.isArray(workspace.realAddressCaches) ? workspace.realAddressCaches : [],
    rules: {
      productAuditRules: Array.isArray(workspace.rules?.productAuditRules) ? workspace.rules.productAuditRules : DEFAULT_PRODUCT_AUDIT_FAILURE_RULES,
      productAuditDefaultFailureAction: workspace.rules?.productAuditDefaultFailureAction === 'deleteDraft' ? 'deleteDraft' : DEFAULT_PRODUCT_AUDIT_FAILURE_DEFAULT_ACTION,
      statusRules: Array.isArray(workspace.rules?.statusRules) ? workspace.rules.statusRules : [],
      violationWords: Array.isArray(workspace.rules?.violationWords) ? workspace.rules.violationWords : [],
    },
    appSettings: normalizeAppSettings(workspace.appSettings),
    notificationPreference: normalizeNotificationPreference(workspace.notificationPreference),
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

export function mergeStatusRules(stored: AccountWorkspaceRecord['rules']['statusRules']) {
  const statusSet = new Set(stored.map(rule => rule.editStatus));
  return [...stored, ...DEFAULT_STATUS_RULES.filter(rule => !statusSet.has(rule.editStatus))];
}
