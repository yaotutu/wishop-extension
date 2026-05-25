import assert from 'node:assert/strict';
import test from 'node:test';
import { orderSyncCountdownText } from '../src/pages/orders/order-sync-countdown.ts';

test('formats order auto sync countdown from local time', () => {
  assert.equal(orderSyncCountdownText({ nextSyncAt: 1700000065000 }, 1700000000000), '65 秒后自动更新');
  assert.equal(orderSyncCountdownText({ running: true, nextSyncAt: 1700000065000 }, 1700000000000), '正在同步订单');
  assert.equal(orderSyncCountdownText({}, 1700000000000), '等待自动更新');
});
