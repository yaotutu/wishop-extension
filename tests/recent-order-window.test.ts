import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRecentOrderWindow,
  makeRecentOrderWindowState,
  moveRecentOrderWindowBack,
} from '../src/background/orders/recent-order-window.ts';

test('recent order windows scan backwards in seven-day chunks', () => {
  const state = makeRecentOrderWindowState(1700000000, 30);
  const first = getRecentOrderWindow(state);

  assert.deepEqual(first, {
    start_time: 1700000000 - 7 * 24 * 60 * 60 + 1,
    end_time: 1700000000,
  });

  moveRecentOrderWindowBack(state);
  const second = getRecentOrderWindow(state);

  assert.deepEqual(second, {
    start_time: 1700000000 - 14 * 24 * 60 * 60 + 1,
    end_time: 1700000000 - 7 * 24 * 60 * 60,
  });
});
