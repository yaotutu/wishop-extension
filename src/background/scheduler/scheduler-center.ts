import type { GlobalLogModule } from '../../shared/global-log';
import type { GlobalLogScope, GlobalLogTaskKind } from '../../shared/global-log';
import type {
  ScheduledJob,
  ScheduledJobExecutorResult,
  ScheduledJobRunNowResult,
  ScheduledJobRunStats,
  ScheduledJobStatus,
  ScheduledJobType,
} from '../../shared/types';
import { getAccounts, getAccount } from '../store/account-repository';
import {
  getScheduledJob,
  getScheduledJobs,
  completeScheduledJob,
  updateScheduledJobAccountStats,
  updateScheduledJobStats,
} from '../store/scheduled-job-repository';
import { createLogger } from '../utils/logger';
import {
  recordTaskCompleted,
  recordTaskFailed,
  recordTaskSkipped,
  recordTaskStarted,
} from '../global-logs/global-log-service';

const JOB_ALARM_PREFIX = 'scheduled-job:';
const GLOBAL_JOB_ALARM_PREFIX = 'scheduled-job-global:';

export type ScheduledJobExecutor = (context: {
  job: ScheduledJob;
  accountId?: string;
  runId: string;
}) => Promise<ScheduledJobExecutorResult>;

const executors = new Map<ScheduledJobType, ScheduledJobExecutor>();

function accountAlarmName(jobId: string): string {
  return `${JOB_ALARM_PREFIX}${jobId}`;
}

function globalAlarmName(jobId: string, accountId: string): string {
  return `${GLOBAL_JOB_ALARM_PREFIX}${jobId}:${accountId}`;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function isGlobalAlarm(name: string): boolean {
  return name.startsWith(GLOBAL_JOB_ALARM_PREFIX);
}

function isAccountAlarm(name: string): boolean {
  return name.startsWith(JOB_ALARM_PREFIX);
}

function parseGlobalAlarm(name: string): { jobId: string; accountId: string } | null {
  if (!isGlobalAlarm(name)) return null;
  const rest = name.slice(GLOBAL_JOB_ALARM_PREFIX.length);
  const [jobId, accountId] = rest.split(':');
  return jobId && accountId ? { jobId, accountId } : null;
}

function parseAccountAlarm(name: string): string | null {
  if (!isAccountAlarm(name)) return null;
  return name.slice(JOB_ALARM_PREFIX.length) || null;
}

function logModule(job: ScheduledJob): GlobalLogModule {
  return job.module;
}

function logScope(job: ScheduledJob): GlobalLogScope {
  return job.scope === 'account' ? 'account' : 'global';
}

function taskKind(job: ScheduledJob): GlobalLogTaskKind {
  if (job.scope === 'global') return 'globalScheduled';
  if (job.scope === 'system') return 'background';
  return 'scheduled';
}

async function updateRunStats(
  jobId: string,
  accountId: string | undefined,
  patch: Partial<ScheduledJobRunStats>,
): Promise<void> {
  if (accountId) {
    await updateScheduledJobAccountStats(jobId, accountId, patch);
    return;
  }
  await updateScheduledJobStats(jobId, patch);
}

function statsFor(job: ScheduledJob, targetAccountId?: string): ScheduledJobRunStats {
  if (job.scope === 'global' && targetAccountId) {
    return job.accountStats[targetAccountId] || { lastRunDate: '', todayRunCount: 0 };
  }
  return job.stats;
}

async function patchStatsFor(
  job: ScheduledJob,
  targetAccountId: string | undefined,
  patch: Partial<ScheduledJobRunStats>,
): Promise<void> {
  await updateRunStats(job.id, job.scope === 'global' ? targetAccountId : undefined, patch);
}

export function registerScheduledJobExecutor(jobType: ScheduledJobType, executor: ScheduledJobExecutor): void {
  executors.set(jobType, executor);
}

export function parseJobAlarmSchedule(cronExpression: string, offsetMinutes = 0): chrome.alarms.AlarmCreateInfo | null {
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
    const next = new Date();
    next.setHours(h, m, 0, 0);
    if (offsetMinutes > 0) next.setMinutes(next.getMinutes() + offsetMinutes);
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
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

export function isSupportedJobCron(cronExpression: string): boolean {
  return parseJobAlarmSchedule(cronExpression) !== null;
}

export async function startScheduledJob(job: ScheduledJob): Promise<boolean> {
  const logger = createLogger('SchedulerCenter', job.scope === 'account' ? job.accountId : undefined);
  await stopScheduledJob(job.id);
  if (!job.enabled) return true;

  if (job.scope === 'global') {
    const accounts = (await getAccounts()).filter(account => !job.excludedAccountIds.includes(account.id));
    for (const [index, account] of accounts.entries()) {
      const schedule = parseJobAlarmSchedule(job.cronExpression, index * job.staggerMinutes);
      if (!schedule) {
        logger.warn(`[${job.id}] 不支持的 cron 表达式: ${job.cronExpression}`);
        await stopScheduledJob(job.id);
        return false;
      }
      await chrome.alarms.create(globalAlarmName(job.id, account.id), schedule);
    }
    logger.info(`[${job.id}] 已启动全局任务 "${job.name}", 账号=${accounts.length}`);
    return true;
  }

  const schedule = parseJobAlarmSchedule(job.cronExpression);
  if (!schedule) {
    logger.warn(`[${job.id}] 不支持的 cron 表达式: ${job.cronExpression}`);
    return false;
  }
  await chrome.alarms.create(accountAlarmName(job.id), schedule);
  logger.info(`[${job.id}] 已启动账号任务 "${job.name}"`);
  return true;
}

export async function stopScheduledJob(jobId: string): Promise<void> {
  const alarms = await chrome.alarms.getAll();
  await Promise.all(
    alarms
      .filter(alarm => alarm.name === accountAlarmName(jobId) || alarm.name.startsWith(`${GLOBAL_JOB_ALARM_PREFIX}${jobId}:`))
      .map(alarm => chrome.alarms.clear(alarm.name)),
  );
}

export async function startAllScheduledJobs(): Promise<void> {
  for (const job of await getScheduledJobs()) {
    if (job.enabled) await startScheduledJob(job);
  }
}

export async function stopAllScheduledJobs(): Promise<void> {
  const alarms = await chrome.alarms.getAll();
  await Promise.all(
    alarms
      .filter(alarm => isAccountAlarm(alarm.name) || isGlobalAlarm(alarm.name))
      .map(alarm => chrome.alarms.clear(alarm.name)),
  );
}

export async function getScheduledJobNextRunAt(job: ScheduledJob): Promise<number | null> {
  if (!job.enabled) return null;
  const alarms = await chrome.alarms.getAll();
  if (job.scope === 'global') {
    return alarms
      .filter(alarm => alarm.name.startsWith(`${GLOBAL_JOB_ALARM_PREFIX}${job.id}:`))
      .map(alarm => alarm.scheduledTime)
      .sort((a, b) => a - b)[0] ?? null;
  }
  return alarms.find(alarm => alarm.name === accountAlarmName(job.id))?.scheduledTime ?? null;
}

function aggregateRunResults(results: ScheduledJobRunNowResult[]): ScheduledJobRunNowResult {
  if (results.length === 0) return { listed: 0, status: 'skipped', message: null, error: '没有可执行账号', completed: false };
  const listed = results.reduce((sum, result) => sum + result.listed, 0);
  const failed = results.filter(result => result.status === 'failed');
  const completed = results.filter(result => result.status === 'completed');
  const status: ScheduledJobStatus = failed.length === results.length
    ? 'failed'
    : completed.length > 0
      ? 'completed'
      : 'skipped';
  return {
    listed,
    status,
    message: failed.length > 0 && completed.length > 0
      ? `手动执行完成，失败 ${failed.length}/${results.length} 个账号：${failed.map(result => result.error).filter(Boolean).join('; ')}`
      : results.map(result => result.message).filter(Boolean).join('; ') || null,
    error: failed.length === results.length
      ? failed.map(result => result.error || result.message).filter(Boolean).join('; ')
      : null,
    completed: false,
  };
}

async function executeScheduledJob(job: ScheduledJob, accountId?: string): Promise<ScheduledJobRunNowResult> {
  if (!job.enabled) return { listed: 0, status: 'skipped', message: null, error: '任务已停用', completed: false };
  const targetAccountId = accountId || (job.scope === 'account' ? job.accountId : undefined);
  const stat = statsFor(job, targetAccountId);
  const currentDate = todayKey();
  const todayRunCount = stat?.lastRunDate === currentDate ? stat.todayRunCount : 0;
  const account = targetAccountId ? await getAccount(targetAccountId) : undefined;

  if (job.dailyLimit > 0 && todayRunCount >= job.dailyLimit) {
    await recordTaskSkipped({
      module: logModule(job),
      scope: logScope(job),
      accountId: targetAccountId,
      accountName: account?.name,
      taskId: job.id,
      taskName: job.name,
      taskKind: taskKind(job),
      title: '定时任务跳过',
      detail: `今日已执行 ${todayRunCount}，达到任务上限 ${job.dailyLimit}`,
    });
    return { listed: 0, status: 'skipped', message: null, error: `今日已执行 ${todayRunCount}，达到任务上限 ${job.dailyLimit}`, completed: false };
  }

  const runId = `${job.scope === 'global' ? 'global-job' : job.scope === 'system' ? 'system-job' : 'job'}-${job.id}-${Date.now()}`;
  const startedAt = Date.now();
  await patchStatsFor(job, targetAccountId, {
    lastRunDate: currentDate,
    todayRunCount,
    lastRunAt: startedAt,
    lastStatus: 'running',
    lastMessage: undefined,
    lastListed: undefined,
    lastError: undefined,
  });

  await recordTaskStarted({
    module: logModule(job),
    scope: logScope(job),
    accountId: targetAccountId,
    accountName: account?.name,
    taskId: job.id,
    taskName: job.name,
    taskKind: taskKind(job),
    runId,
    title: '定时任务开始执行',
    detail: `任务类型：${job.jobType}`,
  });

  try {
    const executor = executors.get(job.jobType);
    if (!executor) throw new Error(`未注册定时任务执行器: ${job.jobType}`);

    const result = await executor({ job, accountId, runId });
    if (job.runMode === 'recurring' && result.completed) {
      throw new Error(`周期任务 ${job.jobType} 不允许返回 completed=true`);
    }
    const status = result.status;
    const countIncrement = result.listed;
    const detail = result.message ?? result.error ?? undefined;
    const errorMessage = status === 'failed' ? result.error || result.message || undefined : undefined;
    await patchStatsFor(job, targetAccountId, {
      lastRunDate: currentDate,
      todayRunCount: todayRunCount + countIncrement,
      lastFinishedAt: Date.now(),
      lastStatus: status,
      lastMessage: status === 'failed' ? undefined : detail,
      lastListed: result.listed,
      lastError: errorMessage,
    });

    if (job.runMode === 'untilComplete' && result.completed) {
      await completeScheduledJob(job.id);
      await stopScheduledJob(job.id);
    }

    if (status === 'skipped') {
      await recordTaskSkipped({
        module: logModule(job),
        scope: logScope(job),
        accountId: targetAccountId,
        accountName: account?.name,
        taskId: job.id,
        taskName: job.name,
        taskKind: taskKind(job),
        title: '定时任务跳过',
        detail,
      });
      return { listed: countIncrement, status, message: detail ?? null, error: null, completed: result.completed };
    }

    await recordTaskCompleted({
      module: logModule(job),
      scope: logScope(job),
      accountId: targetAccountId,
      accountName: account?.name,
      taskId: job.id,
      taskName: job.name,
      taskKind: taskKind(job),
      runId,
      level: status === 'failed' ? 'warning' : 'success',
      title: '定时任务执行完成',
      detail,
      summary: { listed: result.listed },
    });
    return { listed: countIncrement, status, message: status === 'failed' ? null : detail ?? null, error: errorMessage ?? null, completed: result.completed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await patchStatsFor(job, targetAccountId, {
      lastRunDate: currentDate,
      todayRunCount: todayRunCount + 1,
      lastFinishedAt: Date.now(),
      lastStatus: 'failed',
      lastMessage: undefined,
      lastListed: 1,
      lastError: message,
    });
    await recordTaskFailed({
      module: logModule(job),
      scope: logScope(job),
      accountId: targetAccountId,
      accountName: account?.name,
      taskId: job.id,
      taskName: job.name,
      taskKind: taskKind(job),
      runId,
      title: '定时任务执行失败',
      error: { message },
    });
    return { listed: 1, status: 'failed', message: null, error: message, completed: false };
  }
}

export async function runScheduledJobNow(jobId: string): Promise<ScheduledJobRunNowResult> {
  const job = await getScheduledJob(jobId);
  if (!job) throw new Error('定时任务不存在');
  if (!job.enabled) throw new Error('任务已停用，无法手动执行');

  let result: ScheduledJobRunNowResult;
  if (job.scope === 'global') {
    const accounts = (await getAccounts()).filter(account => !job.excludedAccountIds.includes(account.id));
    const results: ScheduledJobRunNowResult[] = [];
    for (const account of accounts) {
      results.push(await executeScheduledJob(job, account.id));
    }
    result = aggregateRunResults(results);
  } else {
    result = await executeScheduledJob(job);
  }

  const latestJob = await getScheduledJob(jobId);
  if (latestJob?.enabled) await startScheduledJob(latestJob);
  else await stopScheduledJob(jobId);
  return result;
}

export function installScheduledJobAlarmListener(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    const global = parseGlobalAlarm(alarm.name);
    if (global) {
      void getScheduledJob(global.jobId).then((job) => {
        if (job) return executeScheduledJob(job, global.accountId);
      });
      return;
    }

    const jobId = parseAccountAlarm(alarm.name);
    if (jobId) {
      void getScheduledJob(jobId).then((job) => {
        if (job) return executeScheduledJob(job);
      });
    }
  });
}
