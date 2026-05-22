import assert from 'node:assert/strict';
import test from 'node:test';
import type { Order, OrderAssociation } from '../src/shared/types.ts';
import { OrderStatus } from '../src/shared/types.ts';
import { DEFAULT_SHIPMENT_CHECK_SETTINGS } from '../src/shared/settings.ts';
import {
  buildShipmentCheckDispatchPlan,
  selectShipmentCheckCandidates,
} from '../src/background/scheduler/order-shipment-check-planner.ts';

function makeOrder(orderId: string, patch: Partial<Order> = {}): Order {
  return {
    order_id: orderId,
    status: OrderStatus.PendingShipment,
    create_time: Math.floor(Date.now() / 1000),
    update_time: Math.floor(Date.now() / 1000),
    order_detail: {
      product_infos: [],
      price_info: {
        product_price: 0,
        order_price: 0,
        freight: 0,
        discounted_price: 0,
        original_order_price: 0,
        merchant_receieve_price: 0,
      },
      pay_info: { pay_time: 0, transaction_id: '', payment_method: 0 },
      delivery_info: {
        address_info: {
          user_name: '',
          postal_code: '',
          province_name: '',
          city_name: '',
          county_name: '',
          detail_info: '',
          tel_number: '',
          house_number: '',
        },
        delivery_product_info: [],
        ship_done_time: 0,
        deliver_method: 0,
      },
      ext_info: { customer_notes: '', merchant_notes: '', confirm_receipt_time: 0 },
    },
    ...patch,
  };
}

function makeAssociation(orderId: string, patch: Partial<OrderAssociation['linkedOrders'][number]> = {}): OrderAssociation {
  return {
    orderId,
    internalRemark: '',
    linkedOrders: [{
      id: `linked-${orderId}`,
      platform: 'taobao',
      platformOrderId: `tb-${orderId}`,
      platformOrderStatus: '买家已付款',
      logisticsStatus: '',
      logisticsCompany: '',
      trackingNumber: '',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      ...patch,
    }],
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };
}

test('selects only pending shipment Taobao orders that still need logistics data', () => {
  const now = 1700000000000;
  const candidates = selectShipmentCheckCandidates({
    accountId: 'account-1',
    orders: [
      makeOrder('need-check', { create_time: Math.floor(now / 1000) }),
      makeOrder('already-shipped', {
        create_time: Math.floor(now / 1000),
        order_detail: {
          ...makeOrder('already-shipped').order_detail,
          delivery_info: {
            ...makeOrder('already-shipped').order_detail.delivery_info,
            delivery_product_info: [{
              waybill_id: 'SF123',
              delivery_id: 'SF',
              delivery_name: '顺丰',
              delivery_time: 1700000000,
            }],
          },
        },
      }),
      makeOrder('completed', { status: OrderStatus.Completed, create_time: Math.floor(now / 1000) }),
      makeOrder('has-logistics', { create_time: Math.floor(now / 1000) }),
      makeOrder('closed', { create_time: Math.floor(now / 1000) }),
      makeOrder('cooldown', { create_time: Math.floor(now / 1000) }),
      makeOrder('queued', { create_time: Math.floor(now / 1000) }),
    ],
    associationsByOrderId: {
      'need-check': makeAssociation('need-check'),
      'already-shipped': makeAssociation('already-shipped'),
      completed: makeAssociation('completed'),
      'has-logistics': makeAssociation('has-logistics', {
        logisticsCompany: '顺丰',
        trackingNumber: 'SF123',
      }),
      closed: makeAssociation('closed', { platformOrderStatus: '交易关闭' }),
      cooldown: makeAssociation('cooldown', { nextShipmentCheckAfter: now + 60_000 }),
      queued: makeAssociation('queued', {
        lastShipmentCheckStatus: 'queued',
        nextShipmentCheckAfter: now + 60_000,
      }),
    },
    settings: DEFAULT_SHIPMENT_CHECK_SETTINGS,
    now,
    activeKeys: new Set(),
  });

  assert.deepEqual(candidates.map(candidate => candidate.orderId), ['need-check']);
});

test('stale queued metadata does not permanently block shipment checks', () => {
  const now = 1700000000000;
  const candidates = selectShipmentCheckCandidates({
    accountId: 'account-1',
    orders: [
      makeOrder('stale-queued', { create_time: Math.floor(now / 1000) }),
    ],
    associationsByOrderId: {
      'stale-queued': makeAssociation('stale-queued', {
        lastShipmentCheckStatus: 'queued',
        nextShipmentCheckAfter: now - 60_000,
      }),
    },
    settings: DEFAULT_SHIPMENT_CHECK_SETTINGS,
    now,
    activeKeys: new Set(),
  });

  assert.deepEqual(candidates.map(candidate => candidate.orderId), ['stale-queued']);
});

test('dispatch plan randomizes checks inside the ten minute window while preserving spacing', () => {
  const candidates = ['a', 'b', 'c'].map(orderId => ({
    accountId: 'account-1',
    orderId,
    platformOrderId: `tb-${orderId}`,
  }));
  const randomValues = [0, 0.5, 1];
  const plan = buildShipmentCheckDispatchPlan({
    candidates,
    settings: DEFAULT_SHIPMENT_CHECK_SETTINGS,
    now: 1700000000000,
    random: () => randomValues.shift() ?? 0,
  });

  assert.equal(plan.length, 3);
  assert.deepEqual(plan.map(item => item.orderId), ['a', 'b', 'c']);
  assert.ok(plan[0].scheduledAt >= 1700000030000);
  assert.ok(plan[2].scheduledAt <= 1700000540000);
  assert.ok(plan[1].scheduledAt - plan[0].scheduledAt >= 60_000);
  assert.ok(plan[2].scheduledAt - plan[1].scheduledAt >= 60_000);
});
