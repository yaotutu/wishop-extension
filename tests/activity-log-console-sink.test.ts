import assert from 'node:assert/strict';
import test from 'node:test';
import { formatActivityConsoleLog } from '../src/background/logging/console-log-sink.ts';
import type { ActivityLogEntry } from '../src/shared/activity-log.ts';

test('formats activity logs for service worker console output', () => {
  const entry: ActivityLogEntry = {
    id: 'log-1',
    timestamp: 1700000000000,
    domain: 'orders',
    event: 'completed',
    level: 'warning',
    scope: 'global',
    trigger: 'manual',
    runId: 'run-1',
    title: '订单刷新部分失败',
    detail: '成功 1，失败 1',
    summary: {
      succeeded: 1,
      failed: 1,
      fetched: 20,
      updated: 3,
    },
  };

  const formatted = formatActivityConsoleLog(entry);

  assert.equal(formatted.method, 'warn');
  assert.equal(formatted.args[0], '[activity:orders:global]');
  assert.deepEqual(formatted.args[1], {
    event: 'completed',
    trigger: 'manual',
    title: '订单刷新部分失败',
    detail: '成功 1，失败 1',
    accountId: undefined,
    accountName: undefined,
    runId: 'run-1',
    summary: {
      succeeded: 1,
      failed: 1,
      fetched: 20,
      updated: 3,
    },
    error: undefined,
    metadata: undefined,
  });
});
