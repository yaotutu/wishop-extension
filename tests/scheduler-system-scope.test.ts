import assert from 'node:assert/strict';
import test from 'node:test';
import type { ScheduledJob } from '../src/shared/types.ts';
import { ORDER_HISTORY_BACKFILL_CRON, ORDER_RECENT_SYNC_CRON } from '../src/background/orders/order-sync-schedule.ts';
import { RECENT_ORDER_WINDOW_SECONDS } from '../src/background/orders/recent-order-window.ts';
import { planOrderHistoryBackfillWindow } from '../src/background/orders/order-history-backfill-window.ts';
import { nextUntilCompleteRunSchedule } from '../src/background/scheduler/scheduled-job-alarm-schedule.ts';

test('supports five-minute system-level order sync jobs', () => {
  const job: ScheduledJob = {
    id: 'orders-sync-recent',
    name: '订单自动同步',
    enabled: true,
    module: 'orders',
    jobType: 'orders.syncRecent',
    scope: 'system',
    runMode: 'recurring',
    cronExpression: '*/5 * * * *',
    dailyLimit: 0,
    payload: {},
    completedAt: null,
    stats: { lastRunDate: '', todayRunCount: 0 },
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };

  assert.equal(job.scope, 'system');
  assert.equal(job.jobType, 'orders.syncRecent');
  assert.equal(job.cronExpression, '*/5 * * * *');
  assert.equal(ORDER_RECENT_SYNC_CRON, '*/5 * * * *');
});

test('runs order history backfill every three minutes by default', () => {
  assert.equal(ORDER_HISTORY_BACKFILL_CRON, '*/3 * * * *');
});

test('schedules incomplete order history backfill to continue immediately', () => {
  assert.deepEqual(nextUntilCompleteRunSchedule(1700000000000), { when: 1700000001000 });
});

test('plans order history backfill one seven-day window behind incremental sync', () => {
  const nowSeconds = 1700000000;
  const plan = planOrderHistoryBackfillWindow({ nowSeconds, lookbackDays: 182 });

  assert.equal(plan.completed, false);
  assert.equal(plan.windowEndTime, nowSeconds - RECENT_ORDER_WINDOW_SECONDS);
  assert.equal(plan.windowStartTime, nowSeconds - RECENT_ORDER_WINDOW_SECONDS * 2 + 1);
  assert.equal(plan.nextCursor, nowSeconds - RECENT_ORDER_WINDOW_SECONDS * 2);
});

test('clamps order history backfill to the configured lookback horizon', () => {
  const nowSeconds = 1700000000;
  const plan = planOrderHistoryBackfillWindow({
    nowSeconds,
    lookbackDays: 10,
    cursor: nowSeconds - RECENT_ORDER_WINDOW_SECONDS,
  });

  assert.equal(plan.completed, false);
  assert.equal(plan.windowStartTime, nowSeconds - 10 * 24 * 60 * 60);
  assert.equal(plan.nextCursor, nowSeconds - 10 * 24 * 60 * 60 - 1);
});
