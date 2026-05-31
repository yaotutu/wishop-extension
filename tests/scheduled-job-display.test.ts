import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCountdown, formatCron, nextRunCountdownText } from '../src/pages/scheduled-jobs/scheduled-job-display.ts';
import type { ScheduledJobView } from '../src/shared/types.ts';

function makeJob(patch: Partial<ScheduledJobView> = {}): ScheduledJobView {
  return {
    id: 'job-1',
    name: '订单历史补拉',
    enabled: true,
    module: 'orders',
    jobType: 'orders.backfillHistory',
    scope: 'system',
    runMode: 'untilComplete',
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

test('formats three-minute schedule for the job table', () => {
  assert.equal(formatCron('*/3 * * * *'), '每 3 分钟');
});

test('formats next run countdown from alarm scheduled time', () => {
  assert.equal(formatCountdown(125_000), '02:05');
  assert.equal(nextRunCountdownText(makeJob({ nextRunAt: 1700000125000 }), 1700000000000), '02:05 后更新');
});

test('does not show countdown for disabled jobs without an active alarm', () => {
  assert.equal(nextRunCountdownText(makeJob({ enabled: false, nextRunAt: null }), 1700000000000), '已停用');
});

test('shows completed finite jobs as completed instead of disabled', () => {
  assert.equal(nextRunCountdownText(makeJob({ enabled: false, completedAt: 1700000125000, nextRunAt: null }), 1700000000000), '已完成');
});
