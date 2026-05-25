import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeOrderListTimeRange, ORDER_LIST_MAX_RANGE_SECONDS } from '../src/shared/order-time-range.ts';

test('order list time range requires concrete timestamps', () => {
  assert.equal(normalizeOrderListTimeRange(undefined), null);
  assert.equal(normalizeOrderListTimeRange({ start_time: Number.NaN, end_time: 1700000000 }), null);
  assert.equal(normalizeOrderListTimeRange({ start_time: 1700000000, end_time: 1699999999 }), null);
});

test('order list time range allows at most a seven-day window', () => {
  const startTime = 1700000000;
  assert.deepEqual(
    normalizeOrderListTimeRange({ start_time: startTime, end_time: startTime + ORDER_LIST_MAX_RANGE_SECONDS - 1 }),
    { start_time: startTime, end_time: startTime + ORDER_LIST_MAX_RANGE_SECONDS - 1 },
  );
  assert.equal(
    normalizeOrderListTimeRange({ start_time: startTime, end_time: startTime + ORDER_LIST_MAX_RANGE_SECONDS }),
    null,
  );
});
