import type { StoreSchema } from './core';
import { CURRENT_STORAGE_VERSION } from './core';
import { DEFAULT_NOTIFICATION_PREFERENCE } from '../../shared/notification';
import type { GlobalScheduledTask, ScheduledJob, ScheduledTask, TaskConfig } from '../../shared/types';

type RawStore = Partial<StoreSchema> & Record<string, unknown>;
type Migration = (store: RawStore) => RawStore;

const migrations: Record<number, Migration> = {
  1(store) {
    return {
      ...store,
      accounts: Array.isArray(store.accounts) ? store.accounts : [],
      activeAccountId: typeof store.activeAccountId === 'string' ? store.activeAccountId : '',
      globalSchedulers: Array.isArray(store.globalSchedulers) ? store.globalSchedulers : [],
      skipKeywords: Array.isArray(store.skipKeywords) ? store.skipKeywords : [],
      storageVersion: 1,
    };
  },
  2(store) {
    return {
      ...store,
      notificationPreference: store.notificationPreference || DEFAULT_NOTIFICATION_PREFERENCE,
      storageVersion: 2,
    };
  },
  3(store) {
    const now = Date.now();
    const existingJobs = Array.isArray(store.scheduledJobs) ? store.scheduledJobs as ScheduledJob[] : [];
    const accountJobs = (Array.isArray(store.accounts) ? store.accounts : []).flatMap((account) => {
      const accountId = typeof account?.id === 'string' ? account.id : '';
      if (!accountId) return [];
      return (Array.isArray(account.schedulers) ? account.schedulers as ScheduledTask[] : []).map(task => ({
        id: task.id,
        name: task.name,
        enabled: task.enabled,
        module: 'listing' as const,
        jobType: 'listing.submitDrafts' as const,
        scope: 'account' as const,
        accountId,
        cronExpression: task.cronExpression,
        dailyLimit: task.dailyLimit,
        payload: task.taskConfig,
        stats: {
          lastRunDate: task.lastRunDate || '',
          todayRunCount: task.todayListedCount || 0,
        },
        createdAt: now,
        updatedAt: now,
      }));
    });
    const globalJobs = (Array.isArray(store.globalSchedulers) ? store.globalSchedulers as GlobalScheduledTask[] : []).map(task => ({
      id: task.id,
      name: task.name,
      enabled: task.enabled,
      module: 'listing' as const,
      jobType: 'listing.submitDrafts' as const,
      scope: 'global' as const,
      excludedAccountIds: task.excludedAccountIds || [],
      cronExpression: task.cronExpression,
      staggerMinutes: task.staggerMinutes,
      payload: task.taskConfig as TaskConfig,
      stats: {
        lastRunDate: '',
        todayRunCount: 0,
      },
      accountStats: Object.fromEntries(Object.entries(task.accountStats || {}).map(([accountId, stat]) => [
        accountId,
        {
          lastRunDate: stat.lastRunDate || '',
          todayRunCount: stat.todayListedCount || 0,
        },
      ])),
      createdAt: now,
      updatedAt: now,
    }));
    const existingIds = new Set(existingJobs.map(job => job.id));
    return {
      ...store,
      scheduledJobs: [
        ...existingJobs,
        ...accountJobs.filter(job => !existingIds.has(job.id)),
        ...globalJobs.filter(job => !existingIds.has(job.id)),
      ],
      storageVersion: 3,
    };
  },
};

export async function migrateStore(): Promise<void> {
  const store = await chrome.storage.local.get(null) as RawStore;
  let version = typeof store.storageVersion === 'number' ? store.storageVersion : 0;
  if (version > CURRENT_STORAGE_VERSION) return;

  let nextStore = store;
  while (version < CURRENT_STORAGE_VERSION) {
    const nextVersion = version + 1;
    const migration = migrations[nextVersion];
    if (!migration) throw new Error(`Missing storage migration: ${nextVersion}`);
    nextStore = migration(nextStore);
    version = nextVersion;
  }

  await chrome.storage.local.set(nextStore);
}
