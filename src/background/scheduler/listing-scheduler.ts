import { getAccount, getAccounts } from '../store/account-repository';
import { createScopedAddLog } from '../store/log-repository';
import { getBlacklistRules, getSkipKeywords, getStatusRules } from '../store/rule-repository';
import {
  getGlobalSchedulers,
  getSchedulers,
  updateGlobalSchedulerAccountStat,
  updateScheduler,
} from '../store/scheduler-repository';
import type { GlobalScheduledTask, ScheduledTask } from '../../shared/types';
import { runTaskCycle } from '../modules/task-cycle';
import { getClient } from '../wxshop/client-registry';
import { createLogger } from '../utils/logger';
import { recordTaskCompleted, recordTaskFailed, recordTaskSkipped, recordTaskStarted } from '../global-logs/global-log-service';

const ALARM_PREFIX = 'scheduler:';
const GLOBAL_ALARM_PREFIX = 'global-scheduler:';
const DEFAULT_GLOBAL_TASK_CONFIG = {
  listUnreviewed: true,
  listUnreviewedQuantity: 150,
  autoDeleteFailed: true,
};

function alarmName(accountId: string, taskId: string): string {
  return `${ALARM_PREFIX}${accountId}:${taskId}`;
}

function globalAlarmName(taskId: string, accountId: string): string {
  return `${GLOBAL_ALARM_PREFIX}${taskId}:${accountId}`;
}

function parseAlarmSchedule(cronExpression: string, offsetMinutes = 0): chrome.alarms.AlarmCreateInfo | null {
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
    if (offsetMinutes > 0) next.setMinutes(next.getMinutes() + offsetMinutes);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return { when: next.getTime(), periodInMinutes: 24 * 60 };
  }

  if (/^\d+$/.test(minute) && hour === '*') {
    const m = Number(minute);
    if (m < 0 || m > 59) return null;
    const next = new Date();
    next.setMinutes(m, 0, 0);
    if (offsetMinutes > 0) next.setMinutes(next.getMinutes() + offsetMinutes);
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
  const account = await getAccount(accountId);

  const today = new Date().toISOString().slice(0, 10);
  let count = task.todayListedCount;
  if (task.lastRunDate !== today) {
    count = 0;
    await updateScheduler(accountId, taskId, { lastRunDate: today, todayListedCount: 0 });
  }

  if (task.dailyLimit > 0 && count >= task.dailyLimit) {
    logger.info(`[${taskId}] 今日上架次数已达上限，停止执行`);
    await recordTaskSkipped({
      module: 'listing',
      scope: 'account',
      accountId,
      accountName: account?.name,
      taskId,
      taskName: task.name,
      taskKind: 'scheduled',
      title: '单账号定时任务跳过',
      detail: `今日已提审 ${count}，达到任务上限 ${task.dailyLimit}`,
    });
    return;
  }

  try {
    const api = await getClient(accountId);
    const quota = await api.getAuditQuota();
    if (quota.quota <= 0) {
      logger.info(`[${taskId}] 配额已用完，停止执行`);
      await recordTaskSkipped({
        module: 'listing',
        scope: 'account',
        accountId,
        accountName: account?.name,
        taskId,
        taskName: task.name,
        taskKind: 'scheduled',
        title: '单账号定时任务跳过',
        detail: `今日提审配额已用完，剩余 ${quota.quota}/${quota.total}`,
      });
      return;
    }

    const runId = `alarm-${taskId}-${Date.now()}`;
    await recordTaskStarted({
      module: 'listing',
      scope: 'account',
      accountId,
      accountName: account?.name,
      taskId,
      taskName: task.name,
      taskKind: 'scheduled',
      runId,
      title: '单账号定时任务开始执行',
      detail: `账号「${account?.name || accountId}」，剩余配额 ${quota.quota}/${quota.total}`,
    });

    const result = await runTaskCycle(
      api,
      createScopedAddLog(accountId),
      { ...task.taskConfig, listUnreviewedQuantity: quota.quota },
      runId,
      undefined,
      accountId,
      await getBlacklistRules(),
      await getSkipKeywords(),
      await getStatusRules(),
    );

    await updateScheduler(accountId, taskId, { todayListedCount: count + result.listed });
    await recordTaskCompleted({
      module: 'listing',
      scope: 'account',
      accountId,
      accountName: account?.name,
      taskId,
      taskName: task.name,
      taskKind: 'scheduled',
      runId,
      level: result.stopped || result.errors > 0 ? 'warning' : 'success',
      title: '单账号定时任务执行完成',
      detail: result.reason ? `原因：${result.reason}` : undefined,
      summary: {
        scanned: result.scanned,
        listed: result.listed,
        deleted: result.deleted,
        skipped: result.skipped,
        errors: result.errors,
      },
    });
    logger.info(`[${taskId}] 执行完毕: 提交=${result.listed}, 删除=${result.deleted}`);
  } catch (error: any) {
    await recordTaskFailed({
      module: 'listing',
      scope: 'account',
      accountId,
      accountName: account?.name,
      taskId,
      taskName: task.name,
      taskKind: 'scheduled',
      title: '单账号定时任务执行异常',
      error: { message: error?.message || String(error) },
    });
    logger.error(`[${taskId}] 执行失败:`, error);
  }
}

export async function executeGlobalTask(taskId: string, accountId: string): Promise<void> {
  const logger = createLogger('GlobalScheduler', accountId);
  const task = (await getGlobalSchedulers()).find(item => item.id === taskId);
  if (!task || !task.enabled || task.excludedAccountIds.includes(accountId)) return;
  const account = await getAccount(accountId);

  const today = new Date().toISOString().slice(0, 10);
  const stat = task.accountStats?.[accountId] || { lastRunDate: '', todayListedCount: 0 };
  if (stat.lastRunDate !== today) {
    await updateGlobalSchedulerAccountStat(taskId, accountId, { lastRunDate: today, todayListedCount: 0 });
  }

  try {
    const api = await getClient(accountId);
    const quota = await api.getAuditQuota();
    const runId = `global-alarm-${taskId}-${Date.now()}`;
    createScopedAddLog(accountId)({
      runId,
      productId: '',
      productTitle: `全账号任务「${task.name}」今日提审配额: 剩余${quota.quota}/${quota.total}`,
      action: 'check',
      status: quota.quota > 0 ? 'success' : 'failed',
    });
    if (quota.quota <= 0) {
      await recordTaskSkipped({
        module: 'listing',
        scope: 'global',
        accountId,
        accountName: account?.name,
        taskId,
        taskName: task.name,
        taskKind: 'globalScheduled',
        runId,
        title: '全部账号任务账号跳过',
        detail: `账号「${account?.name || accountId}」今日提审配额已用完，剩余 ${quota.quota}/${quota.total}`,
      });
      logger.info(`[${taskId}] 配额已用完，停止执行`);
      return;
    }
    const configuredQuantity = task.taskConfig?.listUnreviewedQuantity || DEFAULT_GLOBAL_TASK_CONFIG.listUnreviewedQuantity;
    const listUnreviewedQuantity = Math.min(configuredQuantity, quota.quota);
    await recordTaskStarted({
      module: 'listing',
      scope: 'global',
      accountId,
      accountName: account?.name,
      taskId,
      taskName: task.name,
      taskKind: 'globalScheduled',
      runId,
      title: '全部账号任务开始执行',
      detail: `账号「${account?.name || accountId}」，配置提审 ${configuredQuantity}，本次按配额执行 ${listUnreviewedQuantity}，剩余配额 ${quota.quota}/${quota.total}`,
    });

    const result = await runTaskCycle(
      api,
      createScopedAddLog(accountId),
      { ...DEFAULT_GLOBAL_TASK_CONFIG, listUnreviewedQuantity },
      runId,
      undefined,
      accountId,
      await getBlacklistRules(),
      await getSkipKeywords(),
      await getStatusRules(),
    );

    const latest = (await getGlobalSchedulers()).find(item => item.id === taskId);
    const latestStat = latest?.accountStats?.[accountId] || { lastRunDate: today, todayListedCount: 0 };
    await updateGlobalSchedulerAccountStat(taskId, accountId, {
      lastRunDate: today,
      todayListedCount: latestStat.todayListedCount + result.listed,
    });
    await recordTaskCompleted({
      module: 'listing',
      scope: 'global',
      accountId,
      accountName: account?.name,
      taskId,
      taskName: task.name,
      taskKind: 'globalScheduled',
      runId,
      level: result.stopped || result.errors > 0 ? 'warning' : 'success',
      title: '全部账号任务账号执行完成',
      detail: `账号「${account?.name || accountId}」${result.reason ? `，原因：${result.reason}` : ''}`,
      summary: {
        scanned: result.scanned,
        listed: result.listed,
        deleted: result.deleted,
        skipped: result.skipped,
        errors: result.errors,
      },
    });
    logger.info(`[${taskId}] 全账号任务执行完毕: 提交=${result.listed}, 删除=${result.deleted}`);
  } catch (error: any) {
    await recordTaskFailed({
      module: 'listing',
      scope: 'global',
      accountId,
      accountName: account?.name,
      taskId,
      taskName: task.name,
      taskKind: 'globalScheduled',
      title: '全部账号任务账号执行异常',
      error: { message: `账号「${account?.name || accountId}」${error?.message || String(error)}` },
    });
    logger.error(`[${taskId}] 全账号任务执行失败:`, error);
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

async function clearGlobalTaskAlarms(taskId: string): Promise<void> {
  const alarms = await chrome.alarms.getAll();
  await Promise.all(
    alarms
      .filter(alarm => alarm.name.startsWith(`${GLOBAL_ALARM_PREFIX}${taskId}:`))
      .map(alarm => chrome.alarms.clear(alarm.name)),
  );
}

export async function startGlobalTask(task: GlobalScheduledTask): Promise<boolean> {
  await clearGlobalTaskAlarms(task.id);
  if (!task.enabled) return true;

  const accounts = (await getAccounts()).filter(account => !task.excludedAccountIds.includes(account.id));
  for (const [index, account] of accounts.entries()) {
    const schedule = parseAlarmSchedule(task.cronExpression, index * task.staggerMinutes);
    if (!schedule) {
      createLogger('GlobalScheduler').warn(`[${task.id}] 当前插件版本不支持该 cron 表达式: ${task.cronExpression}`);
      await clearGlobalTaskAlarms(task.id);
      return false;
    }
    await chrome.alarms.create(globalAlarmName(task.id, account.id), schedule);
  }
  createLogger('GlobalScheduler').info(`[${task.id}] 已启动 "${task.name}", 覆盖账号=${accounts.length}, cron: ${task.cronExpression}`);
  return true;
}

export async function stopGlobalTask(taskId: string): Promise<void> {
  await clearGlobalTaskAlarms(taskId);
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
  for (const task of await getGlobalSchedulers()) {
    if (task.enabled) await startGlobalTask(task);
  }
}

export async function stopAllTasks(): Promise<void> {
  const alarms = await chrome.alarms.getAll();
  await Promise.all(
    alarms
      .filter(alarm => alarm.name.startsWith(ALARM_PREFIX) || alarm.name.startsWith(GLOBAL_ALARM_PREFIX))
      .map(alarm => chrome.alarms.clear(alarm.name)),
  );
}

export function installAlarmListener(): void {
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name.startsWith(GLOBAL_ALARM_PREFIX)) {
      const rest = alarm.name.slice(GLOBAL_ALARM_PREFIX.length);
      const [taskId, accountId] = rest.split(':');
      if (taskId && accountId) {
        void executeGlobalTask(taskId, accountId);
      }
      return;
    }
    if (alarm.name.startsWith(ALARM_PREFIX)) {
      const rest = alarm.name.slice(ALARM_PREFIX.length);
      const [accountId, taskId] = rest.split(':');
      if (accountId && taskId) {
      void executeTask(accountId, taskId);
      }
    }
  });
}
