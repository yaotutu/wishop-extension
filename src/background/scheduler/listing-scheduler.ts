import {
  createScopedAddLog,
  getAccounts,
  getBlacklistRules,
  getSchedulers,
  getSkipKeywords,
  getStatusRules,
  updateScheduler,
} from '../store';
import type { ScheduledTask } from '../../shared/types';
import { runTaskCycle } from '../modules/task-cycle';
import { getClient } from '../wxshop/client-registry';
import { createLogger } from '../utils/logger';

const ALARM_PREFIX = 'scheduler:';

function alarmName(accountId: string, taskId: string): string {
  return `${ALARM_PREFIX}${accountId}:${taskId}`;
}

function parseAlarmSchedule(cronExpression: string): chrome.alarms.AlarmCreateInfo | null {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  if (dayOfMonth !== '*' || month !== '*' || dayOfWeek !== '*') return null;

  const everyMinutes = minute.match(/^\*\/(\d+)$/);
  if (everyMinutes && hour === '*') {
    const periodInMinutes = Number(everyMinutes[1]);
    return Number.isFinite(periodInMinutes) && periodInMinutes >= 1 ? { periodInMinutes } : null;
  }

  if (/^\d+$/.test(minute) && /^\d+$/.test(hour)) {
    const m = Number(minute);
    const h = Number(hour);
    if (m < 0 || m > 59 || h < 0 || h > 23) return null;
    const now = new Date();
    const next = new Date();
    next.setHours(h, m, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return { when: next.getTime(), periodInMinutes: 24 * 60 };
  }

  if (/^\d+$/.test(minute) && hour === '*') {
    const m = Number(minute);
    if (m < 0 || m > 59) return null;
    const next = new Date();
    next.setMinutes(m, 0, 0);
    if (next.getTime() <= Date.now()) next.setHours(next.getHours() + 1);
    return { when: next.getTime(), periodInMinutes: 60 };
  }

  return null;
}

export function isSupportedCron(cronExpression: string): boolean {
  return parseAlarmSchedule(cronExpression) !== null;
}

export async function executeTask(accountId: string, taskId: string): Promise<void> {
  const logger = createLogger('Scheduler', accountId);
  const task = (await getSchedulers(accountId)).find(item => item.id === taskId);
  if (!task || !task.enabled) return;

  const today = new Date().toISOString().slice(0, 10);
  let count = task.todayListedCount;
  if (task.lastRunDate !== today) {
    count = 0;
    await updateScheduler(accountId, taskId, { lastRunDate: today, todayListedCount: 0 });
  }

  if (task.dailyLimit > 0 && count >= task.dailyLimit) {
    logger.info(`[${taskId}] 今日上架次数已达上限，停止执行`);
    return;
  }

  try {
    const api = await getClient(accountId);
    const quota = await api.getAuditQuota();
    if (quota.quota <= 0) {
      logger.info(`[${taskId}] 配额已用完，停止执行`);
      return;
    }

    const result = await runTaskCycle(
      api,
      createScopedAddLog(accountId),
      task.taskConfig,
      `alarm-${taskId}-${Date.now()}`,
      undefined,
      accountId,
      await getBlacklistRules(),
      await getSkipKeywords(),
      await getStatusRules(),
    );

    await updateScheduler(accountId, taskId, { todayListedCount: count + result.listed });
    logger.info(`[${taskId}] 执行完毕: 提交=${result.listed}, 删除=${result.deleted}`);
  } catch (error) {
    logger.error(`[${taskId}] 执行失败:`, error);
  }
}

export async function startTask(accountId: string, task: ScheduledTask): Promise<boolean> {
  const logger = createLogger('Scheduler', accountId);
  const schedule = parseAlarmSchedule(task.cronExpression);
  await chrome.alarms.clear(alarmName(accountId, task.id));
  if (!task.enabled) return true;
  if (!schedule) {
    logger.warn(`[${task.id}] 当前插件版本不支持该 cron 表达式: ${task.cronExpression}`);
    return false;
  }
  await chrome.alarms.create(alarmName(accountId, task.id), schedule);
  logger.info(`[${task.id}] 已启动 "${task.name}", cron: ${task.cronExpression}`);
  return true;
}

export async function stopTask(accountId: string, taskId: string): Promise<void> {
  await chrome.alarms.clear(alarmName(accountId, taskId));
}

export async function startAllTasks(): Promise<void> {
  const accounts = await getAccounts();
  for (const account of accounts) {
    for (const task of await getSchedulers(account.id)) {
      if (task.enabled) await startTask(account.id, task);
    }
  }
}

export async function stopAllTasks(): Promise<void> {
  const alarms = await chrome.alarms.getAll();
  await Promise.all(alarms.filter(alarm => alarm.name.startsWith(ALARM_PREFIX)).map(alarm => chrome.alarms.clear(alarm.name)));
}

export function installAlarmListener(): void {
  chrome.alarms.onAlarm.addListener(alarm => {
    if (!alarm.name.startsWith(ALARM_PREFIX)) return;
    const rest = alarm.name.slice(ALARM_PREFIX.length);
    const [accountId, taskId] = rest.split(':');
    if (accountId && taskId) {
      void executeTask(accountId, taskId);
    }
  });
}
