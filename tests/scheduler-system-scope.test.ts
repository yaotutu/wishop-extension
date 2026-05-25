import assert from 'node:assert/strict';
import test from 'node:test';
import type { ScheduledJob } from '../src/shared/types.ts';

test('supports one-minute system-level order sync jobs', () => {
  const job: ScheduledJob = {
    id: 'orders-sync-recent',
    name: '订单自动同步',
    enabled: true,
    module: 'orders',
    jobType: 'orders.syncRecent',
    scope: 'system',
    cronExpression: '*/1 * * * *',
    payload: {},
    stats: { lastRunDate: '', todayRunCount: 0 },
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };

  assert.equal(job.scope, 'system');
  assert.equal(job.jobType, 'orders.syncRecent');
  assert.equal(job.cronExpression, '*/1 * * * *');
});
