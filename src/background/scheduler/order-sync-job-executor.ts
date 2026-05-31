import type { OrderHistoryBackfillPayload, ScheduledJob, ScheduledJobExecutorResult } from '../../shared/types';
import { planOrderHistoryBackfillWindow } from '../orders/order-history-backfill-window.ts';
import { ORDER_HISTORY_BACKFILL_CRON, ORDER_RECENT_SYNC_CRON } from '../orders/order-sync-schedule.ts';
import { getAccounts } from '../store/account-repository';
import { addScheduledJob, getScheduledJob, getScheduledJobs, updateScheduledJob, updateScheduledJobPayload } from '../store/scheduled-job-repository';
import { orderSyncService } from '../orders/order-domain';
import { registerScheduledJobExecutor } from './scheduler-center';

const DEFAULT_ORDER_SYNC_JOB_NAME = '订单自动同步';
const DEFAULT_HISTORY_BACKFILL_JOB_NAME = '订单历史补拉';
const DEFAULT_HISTORY_BACKFILL_LOOKBACK_DAYS = 182;

export async function ensureOrderSyncScheduledJob(): Promise<ScheduledJob | null> {
  const jobs = await getScheduledJobs();
  const existing = jobs.find(job => job.jobType === 'orders.syncRecent' && job.scope === 'system');
  if (existing) {
    const patch: Partial<ScheduledJob> = {};
    if (existing.cronExpression !== ORDER_RECENT_SYNC_CRON) patch.cronExpression = ORDER_RECENT_SYNC_CRON;
    if (!existing.enabled) patch.enabled = true;
    if (Object.keys(patch).length > 0) {
      await updateScheduledJob(existing.id, patch);
      return (await getScheduledJob(existing.id)) || existing;
    }
    return existing;
  }

  return addScheduledJob({
    name: DEFAULT_ORDER_SYNC_JOB_NAME,
    enabled: true,
    module: 'orders',
    jobType: 'orders.syncRecent',
    scope: 'system',
    runMode: 'recurring',
    cronExpression: ORDER_RECENT_SYNC_CRON,
    dailyLimit: 0,
    completedAt: null,
    payload: {},
  });
}

function normalizeBackfillPayload(payload: unknown): OrderHistoryBackfillPayload {
  const value = typeof payload === 'object' && payload !== null ? payload as OrderHistoryBackfillPayload : {};
  return {
    lookbackDays: value.lookbackDays || DEFAULT_HISTORY_BACKFILL_LOOKBACK_DAYS,
    cursorByAccountId: value.cursorByAccountId || {},
  };
}

export async function ensureOrderHistoryBackfillScheduledJob(): Promise<ScheduledJob<OrderHistoryBackfillPayload> | null> {
  const jobs = await getScheduledJobs();
  const existing = jobs.find(job => job.jobType === 'orders.backfillHistory' && job.scope === 'system') as ScheduledJob<OrderHistoryBackfillPayload> | undefined;
  if (existing) {
    const patch: Partial<ScheduledJob<OrderHistoryBackfillPayload>> = {};
    const normalizedPayload = normalizeBackfillPayload(existing.payload);
    if (existing.cronExpression !== ORDER_HISTORY_BACKFILL_CRON) patch.cronExpression = ORDER_HISTORY_BACKFILL_CRON;
    if (existing.runMode !== 'untilComplete') patch.runMode = 'untilComplete';
    if (JSON.stringify(existing.payload || {}) !== JSON.stringify(normalizedPayload)) patch.payload = normalizedPayload;
    if (Object.keys(patch).length > 0) {
      await updateScheduledJob(existing.id, patch as Partial<ScheduledJob>);
      return ((await getScheduledJob(existing.id)) || existing) as ScheduledJob<OrderHistoryBackfillPayload>;
    }
    return existing;
  }

  return addScheduledJob({
    name: DEFAULT_HISTORY_BACKFILL_JOB_NAME,
    enabled: true,
    module: 'orders',
    jobType: 'orders.backfillHistory',
    scope: 'system',
    runMode: 'untilComplete',
    cronExpression: ORDER_HISTORY_BACKFILL_CRON,
    dailyLimit: 0,
    completedAt: null,
    payload: {
      lookbackDays: DEFAULT_HISTORY_BACKFILL_LOOKBACK_DAYS,
      cursorByAccountId: {},
    },
  }) as Promise<ScheduledJob<OrderHistoryBackfillPayload>>;
}

async function runHistoryBackfillWindow(job: ScheduledJob): Promise<ScheduledJobExecutorResult> {
  const accounts = await getAccounts();
  const payload = normalizeBackfillPayload(job.payload);
  const cursorByAccountId = { ...(payload.cursorByAccountId || {}) };
  const lookbackDays = payload.lookbackDays || DEFAULT_HISTORY_BACKFILL_LOOKBACK_DAYS;
  const nowSeconds = Math.floor(Date.now() / 1000);
  let updatedOrderCount = 0;
  let processedAccountCount = 0;
  let completedAccountCount = 0;
  const failures: string[] = [];

  for (const account of accounts) {
    const plan = planOrderHistoryBackfillWindow({
      nowSeconds,
      lookbackDays,
      cursor: cursorByAccountId[account.id],
    });
    if (plan.completed || plan.windowStartTime === undefined || plan.windowEndTime === undefined || plan.nextCursor === undefined) {
      completedAccountCount += 1;
      continue;
    }

    try {
      const result = await orderSyncService.refresh(
        { type: 'account', accountId: account.id },
        {
          reason: 'historyBackfill',
          mode: 'backfill',
          windowStartTime: plan.windowStartTime,
          windowEndTime: plan.windowEndTime,
          lookbackDays,
          maxWindows: 1,
        },
      );
      updatedOrderCount += result.updatedOrderCount;
      processedAccountCount += 1;
      cursorByAccountId[account.id] = plan.nextCursor;
    } catch (error) {
      failures.push(`${account.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const allCompleted = accounts.length > 0 && completedAccountCount === accounts.length;
  await updateScheduledJobPayload(job.id, {
    lookbackDays,
    cursorByAccountId,
  } satisfies OrderHistoryBackfillPayload);

  if (accounts.length === 0) {
    return { listed: 1, status: 'skipped', message: '订单历史补拉跳过：当前没有账号', error: null, completed: false };
  }
  if (allCompleted) {
    return { listed: 1, status: 'completed', message: '订单历史补拉已完成', error: null, completed: true };
  }
  const message = failures.length > 0
    ? `订单历史补拉完成，处理 ${processedAccountCount} 个账号，失败 ${failures.length} 个账号：${failures.join('; ')}`
    : `订单历史补拉完成，处理 ${processedAccountCount} 个账号，新增/变更 ${updatedOrderCount} 条订单`;
  const status = failures.length > 0 && processedAccountCount === 0 ? 'failed' as const : 'completed' as const;
  return {
    listed: Math.max(updatedOrderCount, processedAccountCount, 1),
    status,
    message: status === 'completed' ? message : null,
    error: status === 'failed' ? message : null,
    completed: false,
  };
}

export function registerOrderSyncScheduledJobs(): void {
  registerScheduledJobExecutor('orders.syncRecent', async () => {
    const result = await orderSyncService.refresh({ type: 'all' }, { reason: 'autoSync' });
    const failedCount = result.failedAccounts.length;
    const message = failedCount > 0
      ? `订单自动同步完成，成功 ${result.refreshedAccountIds.length} 个账号，失败 ${failedCount} 个账号，扫描 ${result.fetchedOrderCount || 0} 条，新增/变更 ${result.updatedOrderCount} 条`
      : `订单自动同步完成，扫描 ${result.fetchedOrderCount || 0} 条，新增/变更 ${result.updatedOrderCount} 条`;
    const status = failedCount > 0 && result.refreshedAccountIds.length === 0 ? 'failed' as const : 'completed' as const;
    return {
      listed: Math.max(result.fetchedOrderCount || result.updatedOrderCount, 1),
      status,
      message: status === 'completed' ? message : null,
      error: status === 'failed' ? message : null,
      completed: false,
    };
  });

  registerScheduledJobExecutor('orders.backfillHistory', async ({ job }) => {
    return runHistoryBackfillWindow(job);
  });
}
