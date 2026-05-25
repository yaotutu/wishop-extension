import assert from 'node:assert/strict';
import test from 'node:test';
import { createWxOrderSource } from '../src/background/orders/wx-order-source.ts';
import type { Order, OrderListParams, OrderSearchParams, OrderStatus } from '../src/shared/types.ts';

const PENDING_SHIPMENT = 20 as OrderStatus;

function makeOrder(orderId: string, status = PENDING_SHIPMENT): Order {
  return {
    order_id: orderId,
    status,
    create_time: 1700000000,
    update_time: 1700000000,
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
  };
}

test('manual recent sync falls back to status-scoped order lists when the unfiltered list is empty', async () => {
  const listCalls: OrderListParams[] = [];
  const source = createWxOrderSource(async () => ({
    async getOrderList(params: OrderListParams) {
      listCalls.push(params);
      return params.status === PENDING_SHIPMENT
        ? { order_id_list: ['status-order'], next_key: '', has_more: false }
        : { order_id_list: [], next_key: '', has_more: false };
    },
    async getOrderDetail(orderId: string) {
      return makeOrder(orderId);
    },
    async searchOrders(_params: OrderSearchParams) {
      return { order_id_list: [], next_key: '', has_more: false };
    },
  }));

  const orders = await source.fetchRecentOrders('account-1', { mode: 'full', fallbackStatuses: true });

  assert.deepEqual(orders.map(order => order.order_id), ['status-order']);
  assert.ok(listCalls.some(call => call.status === PENDING_SHIPMENT));
  assert.equal(listCalls.some(call => call.status === 200), false);
});

test('recent sync always sends a concrete seven-day create time range', async () => {
  const listCalls: OrderListParams[] = [];
  const source = createWxOrderSource(async () => ({
    async getOrderList(params: OrderListParams) {
      listCalls.push(params);
      return { order_id_list: ['recent-order'], next_key: '', has_more: false };
    },
    async getOrderDetail(orderId: string) {
      return makeOrder(orderId);
    },
    async searchOrders(_params: OrderSearchParams) {
      return { order_id_list: [], next_key: '', has_more: false };
    },
  }));

  await source.fetchRecentOrders('account-1', { fallbackStatuses: true });

  assert.ok(listCalls.length > 0);
  for (const call of listCalls) {
    assert.ok(call.create_time_range);
    assert.equal(call.update_time_range, undefined);
    assert.ok(Number.isFinite(call.create_time_range.start_time));
    assert.ok(Number.isFinite(call.create_time_range.end_time));
    assert.ok(call.create_time_range.end_time - call.create_time_range.start_time <= 7 * 24 * 60 * 60);
  }
});

test('incremental recent sync scans only the latest seven-day window', async () => {
  const listCalls: OrderListParams[] = [];
  const source = createWxOrderSource(async () => ({
    async getOrderList(params: OrderListParams) {
      listCalls.push(params);
      return { order_id_list: [], next_key: '', has_more: false };
    },
    async getOrderDetail(orderId: string) {
      return makeOrder(orderId);
    },
    async searchOrders(_params: OrderSearchParams) {
      return { order_id_list: [], next_key: '', has_more: false };
    },
  }));

  const orders = await source.fetchRecentOrders('account-1', { mode: 'incremental' });

  assert.deepEqual(orders, []);
  assert.equal(listCalls.length, 1);
});

test('full recent sync continues scanning older windows after a non-empty recent window', async () => {
  const listCalls: OrderListParams[] = [];
  const source = createWxOrderSource(async () => ({
    async getOrderList(params: OrderListParams) {
      listCalls.push(params);
      if (listCalls.length === 1) {
        return { order_id_list: ['recent-order'], next_key: '', has_more: false };
      }
      if (listCalls.length === 2) {
        return { order_id_list: ['older-order'], next_key: '', has_more: false };
      }
      return { order_id_list: [], next_key: '', has_more: false };
    },
    async getOrderDetail(orderId: string) {
      return makeOrder(orderId);
    },
    async searchOrders(_params: OrderSearchParams) {
      return { order_id_list: [], next_key: '', has_more: false };
    },
  }));

  const orders = await source.fetchRecentOrders('account-1', { mode: 'full' });

  assert.deepEqual(orders.map(order => order.order_id), ['recent-order', 'older-order']);
  assert.equal(listCalls.length > 2, true);
});

test('full recent sync does not stop at 500 orders when older windows have more orders', async () => {
  const listCalls: OrderListParams[] = [];
  const source = createWxOrderSource(async () => ({
    async getOrderList(params: OrderListParams) {
      listCalls.push(params);
      const windowStart = params.create_time_range?.start_time;
      const previousCallsInWindow = listCalls
        .slice(0, -1)
        .filter(call => call.create_time_range?.start_time === windowStart).length;
      if (listCalls.length <= 10) {
        return {
          order_id_list: Array.from({ length: 50 }, (_, index) => `recent-${previousCallsInWindow * 50 + index + 1}`),
          next_key: listCalls.length < 10 ? `next-${listCalls.length}` : '',
          has_more: listCalls.length < 10,
        };
      }
      if (listCalls.length === 11) {
        return { order_id_list: ['older-501'], next_key: '', has_more: false };
      }
      return { order_id_list: [], next_key: '', has_more: false };
    },
    async getOrderDetail(orderId: string) {
      return makeOrder(orderId);
    },
    async searchOrders(_params: OrderSearchParams) {
      return { order_id_list: [], next_key: '', has_more: false };
    },
  }));

  const orders = await source.fetchRecentOrders('account-1', { mode: 'full' });

  assert.equal(orders.length, 501);
  assert.equal(orders.at(-1)?.order_id, 'older-501');
});

test('backfill history sync scans one requested seven-day window', async () => {
  const listCalls: OrderListParams[] = [];
  const source = createWxOrderSource(async () => ({
    async getOrderList(params: OrderListParams) {
      listCalls.push(params);
      return { order_id_list: ['history-order'], next_key: '', has_more: false };
    },
    async getOrderDetail(orderId: string) {
      return makeOrder(orderId);
    },
    async searchOrders(_params: OrderSearchParams) {
      return { order_id_list: [], next_key: '', has_more: false };
    },
  }));

  const orders = await source.fetchRecentOrders('account-1', {
    mode: 'backfill',
    windowStartTime: 1699395201,
    windowEndTime: 1700000000,
  });

  assert.deepEqual(orders.map(order => order.order_id), ['history-order']);
  assert.equal(listCalls.length, 1);
  assert.equal(listCalls[0].create_time_range?.start_time, 1699395201);
  assert.equal(listCalls[0].create_time_range?.end_time, 1700000000);
});
