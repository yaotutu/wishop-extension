import assert from 'node:assert/strict';
import test from 'node:test';
import { orderSyncCountdownText } from '../src/pages/orders/order-sync-countdown.ts';
import type { ScheduledJobView } from '../src/shared/types.ts';

function makeOrderSyncJob(patch: Partial<ScheduledJobView> = {}): ScheduledJobView {
  return {
    id: 'orders-sync-recent',
    name: '订单自动同步',
    enabled: true,
    module: 'orders',
    jobType: 'orders.syncRecent',
    scope: 'system',
    runMode: 'recurring',
    cronExpression: '*/3 * * * *',
    dailyLimit: 0,
    payload: {},
    completedAt: null,
    stats: { lastRunDate: '', todayRunCount: 0 },
    nextRunAt: null,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...patch,
  } as ScheduledJobView;
}

test('formats order auto sync countdown from backend scheduled job', () => {
  assert.equal(
    orderSyncCountdownText({
      syncState: { nextSyncAt: 1700000065000 },
      autoSyncJob: makeOrderSyncJob({ nextRunAt: 1700000180000 }),
      now: 1700000000000,
    }),
    '每 3 分钟，03:00 后自动更新',
  );
  assert.equal(
    orderSyncCountdownText({
      autoSyncJob: makeOrderSyncJob({ nextRunAt: 1700000180000 }),
      now: 1700000150000,
    }),
    '每 3 分钟，00:30 后自动更新',
  );
});

test('uses sync state only as a fallback when scheduled job is unavailable', () => {
  assert.equal(orderSyncCountdownText({ syncState: { nextSyncAt: 1700000065000 }, now: 1700000000000 }), '65 秒后自动更新');
  assert.equal(orderSyncCountdownText({ syncState: { running: true, nextSyncAt: 1700000065000 }, now: 1700000000000 }), '正在同步订单');
  assert.equal(orderSyncCountdownText({ syncState: {}, now: 1700000000000 }), '等待自动更新');
});

test('does not invent a rolling cycle when fallback sync state is expired', () => {
  assert.equal(orderSyncCountdownText({ syncState: { nextSyncAt: 1700000065000 }, now: 1700000065000 }), '即将自动更新');
});
