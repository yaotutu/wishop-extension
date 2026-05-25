import type { OrderSyncState } from '../../shared/types';

const ORDER_AUTO_SYNC_INTERVAL_MS = 60_000;

export function orderSyncCountdownText(syncState: Partial<Pick<OrderSyncState, 'running' | 'nextSyncAt'>> | undefined, now = Date.now()): string {
  if (syncState?.running) return '正在同步订单';
  if (!syncState?.nextSyncAt) return '等待自动更新';
  const rawRemaining = syncState.nextSyncAt - now;
  const remainingMs = rawRemaining > 0
    ? rawRemaining
    : ORDER_AUTO_SYNC_INTERVAL_MS - Math.abs(rawRemaining) % ORDER_AUTO_SYNC_INTERVAL_MS;
  const nextSyncSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return `${nextSyncSeconds} 秒后自动更新`;
}
