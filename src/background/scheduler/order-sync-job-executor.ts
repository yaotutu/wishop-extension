import type { ScheduledJob } from '../../shared/types';
import { addScheduledJob, getScheduledJobs, updateScheduledJob } from '../store/scheduled-job-repository';
import { orderSyncService } from '../orders/order-domain';
import { registerScheduledJobExecutor } from './scheduler-center';

const DEFAULT_ORDER_SYNC_JOB_NAME = '订单自动同步';
const DEFAULT_ORDER_SYNC_CRON = '*/1 * * * *';

export async function ensureOrderSyncScheduledJob(): Promise<ScheduledJob | null> {
  const jobs = await getScheduledJobs();
  const existing = jobs.find(job => job.jobType === 'orders.syncRecent' && job.scope === 'system');
  if (existing) {
    const patch: Partial<ScheduledJob> = {};
    if (existing.cronExpression !== DEFAULT_ORDER_SYNC_CRON) patch.cronExpression = DEFAULT_ORDER_SYNC_CRON;
    if (!existing.enabled) patch.enabled = true;
    if (Object.keys(patch).length > 0) {
      const updatedAt = Date.now();
      await updateScheduledJob(existing.id, patch);
      return { ...existing, ...patch, updatedAt };
    }
    return existing;
  }

  return addScheduledJob({
    name: DEFAULT_ORDER_SYNC_JOB_NAME,
    enabled: true,
    module: 'orders',
    jobType: 'orders.syncRecent',
    scope: 'system',
    cronExpression: DEFAULT_ORDER_SYNC_CRON,
    dailyLimit: 0,
    payload: {},
  });
}

export function registerOrderSyncScheduledJobs(): void {
  registerScheduledJobExecutor('orders.syncRecent', async () => {
    const result = await orderSyncService.refresh({ type: 'all' }, { reason: 'autoSync' });
    const failedCount = result.failedAccounts.length;
    return {
      listed: Math.max(result.updatedOrderCount, 1),
      status: failedCount > 0 && result.refreshedAccountIds.length === 0 ? 'failed' as const : 'completed' as const,
      error: failedCount > 0
        ? `订单自动同步完成，成功 ${result.refreshedAccountIds.length} 个账号，失败 ${failedCount} 个账号`
        : `订单自动同步完成，更新 ${result.updatedOrderCount} 条订单`,
    };
  });
}
