import assert from 'node:assert/strict';
import test from 'node:test';
import { STATUS_FILTER_OPTIONS } from '../src/pages/orders/components/OrderToolbar.tsx';

test('aftersale module is exposed at the same level as order status filters', () => {
  assert.deepEqual(
    STATUS_FILTER_OPTIONS.map(option => option.label),
    ['全部', '待付款', '待发货', '待收货', '已完成', '退货售后'],
  );
  assert.equal(STATUS_FILTER_OPTIONS.at(-1)?.value, 'aftersales');
});
