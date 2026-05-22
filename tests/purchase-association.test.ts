import assert from 'node:assert/strict';
import test from 'node:test';
import type { LinkedPlatformOrder } from '../src/shared/types.ts';
import { normalizeLinkedPurchaseOrder } from '../src/shared/purchase-status.ts';
import { buildPaidTaobaoLinkedOrder } from '../src/background/shipping/purchase-association.ts';

test('paid Taobao association stores order id without purchase or logistics status', () => {
  const linked = buildPaidTaobaoLinkedOrder(undefined, '1234567890', 1700000000000, () => 'linked-id');

  assert.deepEqual(linked, {
    id: 'linked-id',
    platform: 'taobao',
    platformOrderId: '1234567890',
    platformOrderStatus: '',
    logisticsStatus: '',
    logisticsCompany: '',
    trackingNumber: '',
    remark: '淘宝付款完成页自动关联',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  });
});

test('paid Taobao association keeps existing details that came from order lookup', () => {
  const existing: LinkedPlatformOrder = {
    id: 'existing-id',
    platform: 'taobao',
    platformOrderId: 'old-order',
    platformOrderStatus: '买家已付款',
    logisticsStatus: '包裹正在等待揽收',
    logisticsCompany: '顺丰',
    trackingNumber: 'SF123456789',
    remark: '淘宝详情页读取',
    createdAt: 1600000000000,
    updatedAt: 1600000000000,
  };

  const linked = buildPaidTaobaoLinkedOrder(existing, '1234567890', 1700000000000, () => 'unused-id');

  assert.equal(linked.id, 'existing-id');
  assert.equal(linked.platformOrderId, '1234567890');
  assert.equal(linked.platformOrderStatus, '买家已付款');
  assert.equal(linked.logisticsStatus, '包裹正在等待揽收');
  assert.equal(linked.logisticsCompany, '顺丰');
  assert.equal(linked.trackingNumber, 'SF123456789');
  assert.equal(linked.remark, '淘宝详情页读取');
  assert.equal(linked.createdAt, 1600000000000);
  assert.equal(linked.updatedAt, 1700000000000);
});

test('legacy payment-success placeholders are treated as unsynced status fields', () => {
  const existing: LinkedPlatformOrder = {
    id: 'legacy-id',
    platform: 'taobao',
    platformOrderId: '1234567890',
    platformOrderStatus: '支付成功',
    logisticsStatus: '待发货',
    logisticsCompany: '',
    trackingNumber: '',
    remark: '支付成功页自动关联',
    createdAt: 1600000000000,
    updatedAt: 1600000000000,
  };

  const normalized = normalizeLinkedPurchaseOrder(existing);
  const linked = buildPaidTaobaoLinkedOrder(existing, '1234567890', 1700000000000, () => 'unused-id');

  assert.equal(normalized.platformOrderStatus, '');
  assert.equal(normalized.logisticsStatus, '');
  assert.equal(linked.platformOrderStatus, '');
  assert.equal(linked.logisticsStatus, '');
  assert.equal(linked.remark, '淘宝付款完成页自动关联');
});
