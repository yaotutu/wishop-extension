import type { ScheduledJob } from '../../shared/types';
import {
  addScheduledJob,
  getScheduledJobs,
  removeScheduledJob,
  updateScheduledJob,
} from '../store/scheduled-job-repository';
import {
  getScheduledJobNextRunAt,
  isSupportedJobCron,
  runScheduledJobNow,
  startScheduledJob,
  stopScheduledJob,
} from '../scheduler/scheduler-center';
import type { RuntimeHandlerMap } from '../router/runtime-router';

function unsupportedCronError(cronExpression: string): Error {
  return new Error(`当前插件定时器不支持该 cron 表达式: ${cronExpression}。请改为 */N * * * *、M * * * * 或 M H * * *。`);
}

function pruneUndefined<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<T>;
}

export function createSchedulerRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'scheduledJobs:list'() {
      const jobs = await getScheduledJobs();
      return Promise.all(jobs.map(async job => ({
        ...job,
        nextRunAt: await getScheduledJobNextRunAt(job),
      })));
    },
    async 'scheduledJobs:add'(args) {
      const input = args[0] as Omit<ScheduledJob, 'id' | 'stats' | 'createdAt' | 'updatedAt'>;
      if (!isSupportedJobCron(input.cronExpression)) throw unsupportedCronError(input.cronExpression);
      const job = await addScheduledJob(input);
      if (job.enabled) {
        const ok = await startScheduledJob(job);
        if (!ok) throw unsupportedCronError(job.cronExpression);
      }
      return job;
    },
    async 'scheduledJobs:update'(args) {
      const [jobId, patch] = args as [string, Partial<ScheduledJob>];
      if (patch.cronExpression && !isSupportedJobCron(patch.cronExpression)) {
        throw unsupportedCronError(patch.cronExpression);
      }

      const existing = (await getScheduledJobs()).find(job => job.id === jobId);
      if (!existing) return undefined;

      const nextPatch = pruneUndefined(patch as Record<string, unknown>) as Partial<ScheduledJob>;
      await updateScheduledJob(jobId, nextPatch);
      const updated = { ...existing, ...nextPatch };

      if (patch.enabled === false) await stopScheduledJob(jobId);
      else if (updated.enabled) await startScheduledJob(updated);

      return undefined;
    },
    async 'scheduledJobs:remove'(args) {
      const jobId = args[0] as string;
      await stopScheduledJob(jobId);
      return removeScheduledJob(jobId);
    },
    async 'scheduledJobs:runNow'(args) {
      return runScheduledJobNow(args[0] as string);
    },
  };
}
