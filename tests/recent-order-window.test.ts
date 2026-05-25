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

test('default recent order window covers the same horizon as legacy order loading', () => {
  const state = makeRecentOrderWindowState(1700000000);
  const windows: Array<{ start_time: number; end_time: number }> = [];

  for (let i = 0; i < 26; i += 1) {
    const window = getRecentOrderWindow(state);
    if (!window) break;
    windows.push(window);
    moveRecentOrderWindowBack(state);
  }

  assert.equal(windows.length, 26);
  assert.ok(windows[25].start_time <= 1700000000 - 181 * 24 * 60 * 60);
});
