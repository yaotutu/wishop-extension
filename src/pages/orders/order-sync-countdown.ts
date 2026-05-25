import type { OrderSyncState, ScheduledJob } from '../../shared/types';

interface OrderSyncCountdownInput {
  syncState?: Partial<Pick<OrderSyncState, 'running' | 'nextSyncAt'>>;
  autoSyncJob?: Pick<ScheduledJob, 'enabled' | 'nextRunAt' | 'cronExpression'>;
  now?: number;
}

function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatInterval(cronExpression: string): string {
  const everyMinutes = cronExpression.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (everyMinutes) return `每 ${everyMinutes[1]} 分钟`;
  return cronExpression;
}

export function orderSyncCountdownText(input: OrderSyncCountdownInput): string {
  const { syncState, autoSyncJob, now = Date.now() } = input;
  if (syncState?.running) return '正在同步订单';

  if (autoSyncJob) {
    if (!autoSyncJob.enabled) return '自动同步已停用';
    if (!autoSyncJob.nextRunAt) return `${formatInterval(autoSyncJob.cronExpression)}，等待调度`;
    const remainingMs = autoSyncJob.nextRunAt - now;
    if (remainingMs <= 0) return `${formatInterval(autoSyncJob.cronExpression)}，即将自动更新`;
    return `${formatInterval(autoSyncJob.cronExpression)}，${formatCountdown(remainingMs)} 后自动更新`;
  }

  if (!syncState?.nextSyncAt) return '等待自动更新';
  const remainingMs = syncState.nextSyncAt - now;
  if (remainingMs <= 0) return '即将自动更新';
  const nextSyncSeconds = Math.ceil(remainingMs / 1000);
  return `${nextSyncSeconds} 秒后自动更新`;
}
