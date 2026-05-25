import { v4 as uuidv4 } from 'uuid';
import type { ScheduledJob, ScheduledJobInput, ScheduledJobRunStats } from '../../shared/types';
import { readStore, writeStore } from './core';

const EMPTY_STATS: ScheduledJobRunStats = {
  lastRunDate: '',
  todayRunCount: 0,
};

export async function getScheduledJobs(): Promise<ScheduledJob[]> {
  return (await readStore()).scheduledJobs || [];
}

export async function getScheduledJob(jobId: string): Promise<ScheduledJob | undefined> {
  return (await getScheduledJobs()).find(job => job.id === jobId);
}

export async function addScheduledJob(
  input: ScheduledJobInput,
): Promise<ScheduledJob> {
  const store = await readStore();
  const timestamp = Date.now();
  const job = {
    ...input,
    id: uuidv4(),
    stats: { ...EMPTY_STATS },
    createdAt: timestamp,
    updatedAt: timestamp,
  } as ScheduledJob;
  await writeStore({ scheduledJobs: [...(store.scheduledJobs || []), job] });
  return job;
}

export async function updateScheduledJob(jobId: string, patch: Partial<ScheduledJob>): Promise<void> {
  const store = await readStore();
  await writeStore({
    scheduledJobs: (store.scheduledJobs || []).map(job => (
      job.id === jobId ? { ...job, ...patch, updatedAt: Date.now() } : job
    )) as ScheduledJob[],
  });
}

export async function updateScheduledJobPayload<TPayload>(
  jobId: string,
  payload: TPayload,
): Promise<void> {
  const store = await readStore();
  await writeStore({
    scheduledJobs: (store.scheduledJobs || []).map(job => (
      job.id === jobId ? { ...job, payload, updatedAt: Date.now() } : job
    )),
  });
}

export async function completeScheduledJob(jobId: string, completedAt = Date.now()): Promise<void> {
  const store = await readStore();
  await writeStore({
    scheduledJobs: (store.scheduledJobs || []).map(job => (
      job.id === jobId ? { ...job, enabled: false, completedAt, updatedAt: completedAt } : job
    )),
  });
}

export async function removeScheduledJob(jobId: string): Promise<void> {
  const store = await readStore();
  await writeStore({
    scheduledJobs: (store.scheduledJobs || []).filter(job => job.id !== jobId),
  });
}

export async function removeScheduledJobsForAccount(accountId: string): Promise<void> {
  const store = await readStore();
  await writeStore({
    scheduledJobs: (store.scheduledJobs || [])
      .filter(job => job.scope !== 'account' || job.accountId !== accountId)
      .map(job => {
        if (job.scope !== 'global' || !job.accountStats[accountId]) return job;
        const { [accountId]: _removed, ...accountStats } = job.accountStats;
        return { ...job, accountStats, updatedAt: Date.now() };
      }),
  });
}

export async function updateScheduledJobStats(
  jobId: string,
  patch: Partial<ScheduledJobRunStats>,
): Promise<void> {
  const store = await readStore();
  await writeStore({
    scheduledJobs: (store.scheduledJobs || []).map(job => (
      job.id === jobId
        ? { ...job, stats: { ...job.stats, ...patch }, updatedAt: Date.now() }
        : job
    )),
  });
}

export async function updateScheduledJobAccountStats(
  jobId: string,
  accountId: string,
  patch: Partial<ScheduledJobRunStats>,
): Promise<void> {
  const store = await readStore();
  await writeStore({
    scheduledJobs: (store.scheduledJobs || []).map(job => {
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
    }),
  });
}
