import type { GlobalScheduledTask, ScheduledJob, ScheduledTask, TaskConfig } from '../../shared/types';
import {
  addScheduledJob,
  getScheduledJobs,
  removeScheduledJob,
  updateScheduledJob,
} from '../store/scheduled-job-repository';
import {
  isSupportedJobCron,
  startScheduledJob,
  stopScheduledJob,
} from '../scheduler/scheduler-center';
import type { RuntimeHandlerMap } from '../router/runtime-router';

function unsupportedCronError(cronExpression: string): Error {
  return new Error(`当前插件定时器不支持该 cron 表达式: ${cronExpression}。请改为 */N * * * *、M * * * * 或 M H * * *。`);
}

function listingJobs(jobs: ScheduledJob[]): ScheduledJob<TaskConfig>[] {
  return jobs.filter((job): job is ScheduledJob<TaskConfig> => job.jobType === 'listing.submitDrafts');
}

function jobToScheduledTask(job: ScheduledJob<TaskConfig>): ScheduledTask {
  return {
    id: job.id,
    name: job.name,
    enabled: job.enabled,
    cronExpression: job.cronExpression,
    dailyLimit: job.dailyLimit || 0,
    taskConfig: job.payload,
    lastRunDate: job.stats.lastRunDate,
    todayListedCount: job.stats.todayRunCount,
  };
}

function scheduledTaskInputToJob(
  accountId: string,
  task: Omit<ScheduledTask, 'id' | 'lastRunDate' | 'todayListedCount'>,
): Omit<ScheduledJob<TaskConfig>, 'id' | 'stats' | 'createdAt' | 'updatedAt'> {
  return {
    name: task.name,
    enabled: task.enabled,
    module: 'listing',
    jobType: 'listing.submitDrafts',
    scope: 'account',
    accountId,
    cronExpression: task.cronExpression,
    dailyLimit: task.dailyLimit,
    payload: task.taskConfig,
  };
}

function jobToGlobalScheduledTask(job: ScheduledJob<TaskConfig>): GlobalScheduledTask {
  return {
    id: job.id,
    name: job.name,
    enabled: job.enabled,
    cronExpression: job.cronExpression,
    staggerMinutes: job.staggerMinutes || 0,
    excludedAccountIds: job.excludedAccountIds || [],
    taskConfig: job.payload,
    accountStats: Object.fromEntries(Object.entries(job.accountStats || {}).map(([accountId, stat]) => [
      accountId,
      {
        lastRunDate: stat.lastRunDate,
        todayListedCount: stat.todayRunCount,
      },
    ])),
  };
}

function globalTaskInputToJob(
  task: Omit<GlobalScheduledTask, 'id' | 'accountStats'>,
): Omit<ScheduledJob<TaskConfig>, 'id' | 'stats' | 'createdAt' | 'updatedAt'> {
  return {
    name: task.name,
    enabled: task.enabled,
    module: 'listing',
    jobType: 'listing.submitDrafts',
    scope: 'global',
    excludedAccountIds: task.excludedAccountIds || [],
    cronExpression: task.cronExpression,
    staggerMinutes: task.staggerMinutes,
    payload: task.taskConfig,
    accountStats: {},
  };
}

export function createSchedulerRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'scheduler:list'(args) {
      const accountId = args[0] as string;
      return listingJobs(await getScheduledJobs())
        .filter(job => job.scope === 'account' && job.accountId === accountId)
        .map(jobToScheduledTask);
    },
    async 'scheduler:add'(args) {
      const [accountId, task] = args as [string, Omit<ScheduledTask, 'id' | 'lastRunDate' | 'todayListedCount'>];
      if (!isSupportedJobCron(task.cronExpression)) throw unsupportedCronError(task.cronExpression);
      const job = await addScheduledJob(scheduledTaskInputToJob(accountId, task));
      if (job.enabled) {
        const ok = await startScheduledJob(job);
        if (!ok) throw unsupportedCronError(job.cronExpression);
      }
      return jobToScheduledTask(job as ScheduledJob<TaskConfig>);
    },
    async 'scheduler:update'(args) {
      const [accountId, taskId, patch] = args as [string, string, Partial<ScheduledTask>];
      if (patch.cronExpression && !isSupportedJobCron(patch.cronExpression)) {
        throw unsupportedCronError(patch.cronExpression);
      }
      const existing = listingJobs(await getScheduledJobs()).find(job => job.id === taskId && job.accountId === accountId);
      if (!existing) return undefined;
      const nextPatch: Partial<ScheduledJob<TaskConfig>> = {
        name: patch.name,
        enabled: patch.enabled,
        cronExpression: patch.cronExpression,
        dailyLimit: patch.dailyLimit,
        payload: patch.taskConfig,
      };
      Object.keys(nextPatch).forEach((key) => {
        if (nextPatch[key as keyof typeof nextPatch] === undefined) delete nextPatch[key as keyof typeof nextPatch];
      });
      await updateScheduledJob(taskId, nextPatch as Partial<ScheduledJob>);
      const updated = { ...existing, ...nextPatch };
      if (patch.enabled === false) await stopScheduledJob(taskId);
      else if (updated.enabled) await startScheduledJob(updated);
      return undefined;
    },
    async 'scheduler:remove'(args) {
      const accountId = args[0] as string;
      const taskId = args[1] as string;
      const existing = listingJobs(await getScheduledJobs()).find(job => job.id === taskId && job.accountId === accountId);
      if (!existing) return undefined;
      await stopScheduledJob(taskId);
      return removeScheduledJob(taskId);
    },
    async 'globalScheduler:list'() {
      return listingJobs(await getScheduledJobs())
        .filter(job => job.scope === 'global')
        .map(jobToGlobalScheduledTask);
    },
    async 'globalScheduler:add'(args) {
      const task = args[0] as Omit<GlobalScheduledTask, 'id' | 'accountStats'>;
      if (!isSupportedJobCron(task.cronExpression)) throw unsupportedCronError(task.cronExpression);
      const job = await addScheduledJob(globalTaskInputToJob(task));
      if (job.enabled) {
        const ok = await startScheduledJob(job);
        if (!ok) throw unsupportedCronError(job.cronExpression);
      }
      return jobToGlobalScheduledTask(job as ScheduledJob<TaskConfig>);
    },
    async 'globalScheduler:update'(args) {
      const [taskId, patch] = args as [string, Partial<GlobalScheduledTask>];
      if (patch.cronExpression && !isSupportedJobCron(patch.cronExpression)) {
        throw unsupportedCronError(patch.cronExpression);
      }
      const existing = listingJobs(await getScheduledJobs()).find(job => job.id === taskId && job.scope === 'global');
      if (!existing) return undefined;
      const nextPatch: Partial<ScheduledJob<TaskConfig>> = {
        name: patch.name,
        enabled: patch.enabled,
        cronExpression: patch.cronExpression,
        staggerMinutes: patch.staggerMinutes,
        excludedAccountIds: patch.excludedAccountIds,
        payload: patch.taskConfig,
      };
      Object.keys(nextPatch).forEach((key) => {
        if (nextPatch[key as keyof typeof nextPatch] === undefined) delete nextPatch[key as keyof typeof nextPatch];
      });
      await updateScheduledJob(taskId, nextPatch as Partial<ScheduledJob>);
      const updated = { ...existing, ...nextPatch };
      if (patch.enabled === false) await stopScheduledJob(taskId);
      else if (updated.enabled) await startScheduledJob(updated);
      return undefined;
    },
    async 'globalScheduler:remove'(args) {
      const taskId = args[0] as string;
      await stopScheduledJob(taskId);
      return removeScheduledJob(taskId);
    },
  };
}
