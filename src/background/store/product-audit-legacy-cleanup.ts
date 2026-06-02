import type { ScheduledJob } from '../../shared/types';
import { extensionDb } from '../db/extension-db.ts';
import {
  DEFAULT_PRODUCT_AUDIT_CONFIG,
  DEFAULT_PRODUCT_AUDIT_FAILURE_RULES,
} from './core.ts';
import { normalizeAccountWorkspace } from './workspace-repository.ts';

type LegacyWorkspace = Record<string, any>;

function removeLegacyScheduledJobs(jobs: unknown): ScheduledJob[] {
  if (!Array.isArray(jobs)) return [];
  return jobs.filter(job => (job as { jobType?: string }).jobType !== 'listing.submitDrafts') as ScheduledJob[];
}

function removeLegacyWorkspaceFields(workspace: LegacyWorkspace): LegacyWorkspace {
  const next: LegacyWorkspace = {
    ...workspace,
    productAuditConfig: workspace.productAuditConfig || DEFAULT_PRODUCT_AUDIT_CONFIG,
    scheduledJobs: removeLegacyScheduledJobs(workspace.scheduledJobs),
    rules: {
      ...(workspace.rules || {}),
      productAuditRules: Array.isArray(workspace.rules?.productAuditRules)
        ? workspace.rules.productAuditRules
        : DEFAULT_PRODUCT_AUDIT_FAILURE_RULES,
    },
  };

  delete next.taskConfig;
  delete next.listingLogs;
  delete next.rules.skipKeywords;
  delete next.rules.blacklistRules;

  return next;
}

export async function cleanupProductAuditLegacyData(): Promise<void> {
  const workspaces = await extensionDb.accountWorkspaces.toArray();
  await extensionDb.transaction('rw', extensionDb.accountWorkspaces, extensionDb.accountLogs, async () => {
    for (const workspace of workspaces) {
      const cleaned = normalizeAccountWorkspace(removeLegacyWorkspaceFields(workspace as LegacyWorkspace) as any);
      await extensionDb.accountWorkspaces.put(cleaned);
    }

    await extensionDb.accountLogs.where('kind').equals('listing').delete();
  });
}

