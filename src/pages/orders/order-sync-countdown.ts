import type { OrderSyncState } from '../../shared/types';

export function orderSyncCountdownText(syncState: Partial<Pick<OrderSyncState, 'running' | 'nextSyncAt'>> | undefined, now = Date.now()): string {
  if (syncState?.running) return '正在同步订单';
  if (!syncState?.nextSyncAt) return '等待自动更新';
  const nextSyncSeconds = Math.max(0, Math.ceil((syncState.nextSyncAt - now) / 1000));
  return `${nextSyncSeconds} 秒后自动更新`;
}
