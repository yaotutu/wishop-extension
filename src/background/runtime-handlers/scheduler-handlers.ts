import type { GlobalScheduledTask, ScheduledTask } from '../../shared/types';
import {
  addGlobalScheduler,
  addScheduler,
  getGlobalSchedulers,
  getSchedulers,
  removeGlobalScheduler,
  removeScheduler,
  updateGlobalScheduler,
  updateScheduler,
} from '../store/scheduler-repository';
import { isSupportedCron, startGlobalTask, startTask, stopGlobalTask, stopTask } from '../scheduler/listing-scheduler';
import type { RuntimeHandlerMap } from '../router/runtime-router';

function unsupportedCronError(cronExpression: string): Error {
  return new Error(`当前插件定时器不支持该 cron 表达式: ${cronExpression}。请改为 */N * * * *、M * * * * 或 M H * * *。`);
}

export function createSchedulerRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'scheduler:list'(args) {
      return getSchedulers(args[0] as string);
    },
    async 'scheduler:add'(args) {
      const [accountId, task] = args as [string, Omit<ScheduledTask, 'id' | 'lastRunDate' | 'todayListedCount'>];
      const newTask = await addScheduler(accountId, task);
      if (newTask.enabled) {
        const ok = await startTask(accountId, newTask);
        if (!ok) throw unsupportedCronError(newTask.cronExpression);
      }
      return newTask;
    },
    async 'scheduler:update'(args) {
      const [accountId, taskId, patch] = args as [string, string, Partial<ScheduledTask>];
      if (patch.cronExpression && !isSupportedCron(patch.cronExpression)) {
        throw unsupportedCronError(patch.cronExpression);
      }
      await updateScheduler(accountId, taskId, patch);
      const task = (await getSchedulers(accountId)).find(item => item.id === taskId);
      if (patch.enabled === false) await stopTask(accountId, taskId);
      else if (task?.enabled) await startTask(accountId, task);
      return undefined;
    },
    async 'scheduler:remove'(args) {
      await stopTask(args[0] as string, args[1] as string);
      return removeScheduler(args[0] as string, args[1] as string);
    },
    async 'globalScheduler:list'() {
      return getGlobalSchedulers();
    },
    async 'globalScheduler:add'(args) {
      const task = args[0] as Omit<GlobalScheduledTask, 'id' | 'accountStats'>;
      if (!isSupportedCron(task.cronExpression)) throw unsupportedCronError(task.cronExpression);
      const newTask = await addGlobalScheduler(task);
      if (newTask.enabled) {
        const ok = await startGlobalTask(newTask);
        if (!ok) throw unsupportedCronError(newTask.cronExpression);
      }
      return newTask;
    },
    async 'globalScheduler:update'(args) {
      const [taskId, patch] = args as [string, Partial<GlobalScheduledTask>];
      if (patch.cronExpression && !isSupportedCron(patch.cronExpression)) {
        throw unsupportedCronError(patch.cronExpression);
      }
      await updateGlobalScheduler(taskId, patch);
      const task = (await getGlobalSchedulers()).find(item => item.id === taskId);
      if (patch.enabled === false) await stopGlobalTask(taskId);
      else if (task?.enabled) await startGlobalTask(task);
      return undefined;
    },
    async 'globalScheduler:remove'(args) {
      const taskId = args[0] as string;
      await stopGlobalTask(taskId);
      return removeGlobalScheduler(taskId);
    },
  };
}
