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

  const orders = await source.fetchRecentOrders('account-1', { fallbackStatuses: true });

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

test('recent sync continues scanning older windows after a non-empty recent window', async () => {
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

  const orders = await source.fetchRecentOrders('account-1');

  assert.deepEqual(orders.map(order => order.order_id), ['recent-order', 'older-order']);
  assert.equal(listCalls.length > 2, true);
});
