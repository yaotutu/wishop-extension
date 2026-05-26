import { v4 as uuidv4 } from 'uuid';
import type { ScheduledJob, ScheduledJobInput, ScheduledJobRunStats } from '../../shared/types';
import { extensionDb } from '../db/extension-db.ts';
import { ensureAccountWorkspace, updateAccountWorkspace } from './workspace-repository.ts';

const SYSTEM_WORKSPACE_ACCOUNT_ID = '__system__';

const EMPTY_STATS: ScheduledJobRunStats = {
  lastRunDate: '',
  todayRunCount: 0,
};

export async function getScheduledJobs(): Promise<ScheduledJob[]> {
  const workspaces = await extensionDb.accountWorkspaces.toArray();
  return workspaces.flatMap(workspace => workspace.scheduledJobs || []);
}

export async function getScheduledJob(jobId: string): Promise<ScheduledJob | undefined> {
  return (await getScheduledJobs()).find(job => job.id === jobId);
}

export async function addScheduledJob(
  input: ScheduledJobInput,
): Promise<ScheduledJob> {
  const timestamp = Date.now();
  const job = {
    ...input,
    id: uuidv4(),
    stats: { ...EMPTY_STATS },
    createdAt: timestamp,
    updatedAt: timestamp,
  } as ScheduledJob;
  await updateAccountWorkspace(workspaceIdForJob(job), workspace => {
    workspace.scheduledJobs = [...(workspace.scheduledJobs || []), job];
  });
  return job;
}

export async function updateScheduledJob(jobId: string, patch: Partial<ScheduledJob>): Promise<void> {
  await updateScheduledJobAcrossWorkspaces(jobId, job => ({ ...job, ...patch, updatedAt: Date.now() } as ScheduledJob));
}

export async function updateScheduledJobPayload<TPayload>(
  jobId: string,
  payload: TPayload,
): Promise<void> {
  await updateScheduledJobAcrossWorkspaces(jobId, job => ({ ...job, payload, updatedAt: Date.now() } as ScheduledJob));
}

export async function completeScheduledJob(jobId: string, completedAt = Date.now()): Promise<void> {
  await updateScheduledJobAcrossWorkspaces(jobId, job => ({ ...job, enabled: false, completedAt, updatedAt: completedAt } as ScheduledJob));
}

export async function removeScheduledJob(jobId: string): Promise<void> {
  const workspaces = await extensionDb.accountWorkspaces.toArray();
  await Promise.all(workspaces
    .filter(workspace => (workspace.scheduledJobs || []).some(job => job.id === jobId))
    .map(workspace => updateAccountWorkspace(workspace.accountId, current => {
      current.scheduledJobs = (current.scheduledJobs || []).filter(job => job.id !== jobId);
    })));
}

export async function removeScheduledJobsForAccount(accountId: string): Promise<void> {
  await updateAccountWorkspace(accountId, workspace => {
    workspace.scheduledJobs = (workspace.scheduledJobs || []).filter(job => job.scope !== 'account' || job.accountId !== accountId);
  });
  await updateAccountWorkspace(SYSTEM_WORKSPACE_ACCOUNT_ID, workspace => {
    workspace.scheduledJobs = (workspace.scheduledJobs || []).map(job => {
      if (job.scope !== 'global' || !job.accountStats[accountId]) return job;
      const { [accountId]: _removed, ...accountStats } = job.accountStats;
      return { ...job, accountStats, updatedAt: Date.now() };
    });
  });
}

export async function updateScheduledJobStats(
  jobId: string,
  patch: Partial<ScheduledJobRunStats>,
): Promise<void> {
  await updateScheduledJobAcrossWorkspaces(jobId, job => ({
    ...job,
    stats: { ...job.stats, ...patch },
    updatedAt: Date.now(),
  } as ScheduledJob));
}

export async function updateScheduledJobAccountStats(
  jobId: string,
  accountId: string,
  patch: Partial<ScheduledJobRunStats>,
): Promise<void> {
  await updateScheduledJobAcrossWorkspaces(jobId, job => {
      if (job.id !== jobId) return job;
      if (job.scope !== 'global') return job;
      const prev = job.accountStats[accountId] || EMPTY_STATS;
      return {
        ...job,
        accountStats: {
          ...job.accountStats,
          [accountId]: { ...prev, ...patch },
        },
        updatedAt: Date.now(),
      };
    },
  );
}

function workspaceIdForJob(job: ScheduledJob): string {
  return job.scope === 'account' ? job.accountId : SYSTEM_WORKSPACE_ACCOUNT_ID;
}

async function updateScheduledJobAcrossWorkspaces(
  jobId: string,
  updater: (job: ScheduledJob) => ScheduledJob,
): Promise<void> {
  const workspaces = await extensionDb.accountWorkspaces.toArray();
  await Promise.all(workspaces
    .filter(workspace => (workspace.scheduledJobs || []).some(job => job.id === jobId))
    .map(workspace => updateAccountWorkspace(workspace.accountId, current => {
      current.scheduledJobs = (current.scheduledJobs || []).map(job => (
        job.id === jobId ? updater(job) : job
      ));
    })));
  if (workspaces.length === 0) {
    await ensureAccountWorkspace(SYSTEM_WORKSPACE_ACCOUNT_ID);
  }
}
