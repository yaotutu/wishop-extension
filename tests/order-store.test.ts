import assert from 'node:assert/strict';
import test from 'node:test';
import 'fake-indexeddb/auto';
import type { Order, OrderStatus } from '../src/shared/types.ts';
import { extensionDb } from '../src/background/db/extension-db.ts';
import { createOrderStore, orderStore } from '../src/background/orders/order-store.ts';

const PENDING_SHIPMENT = 20 as OrderStatus;
const COMPLETED = 100 as OrderStatus;

interface MemoryStorage {
  data: Record<string, unknown>;
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(patch: Record<string, unknown>): Promise<void>;
}

function createMemoryStorage(): MemoryStorage {
  return {
    data: {},
    async get(keys) {
      const names = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(names.map(key => [key, this.data[key]]));
    },
    async set(patch) {
      this.data = { ...this.data, ...patch };
    },
  };
}

function makeOrder(orderId: string, patch: Partial<Order> = {}): Order {
  return {
    order_id: orderId,
    status: PENDING_SHIPMENT,
    create_time: 1700000000,
    update_time: 1700000000,
    order_detail: {
      product_infos: [{
        product_id: `product-${orderId}`,
        sku_id: `sku-${orderId}`,
        thumb_img: '',
        sku_cnt: 1,
        sale_price: 100,
        title: `商品 ${orderId}`,
        sku_code: '',
        market_price: 100,
        sku_attrs: [],
        real_price: 100,
        estimate_price: 100,
        on_aftersale_sku_cnt: 0,
        finish_aftersale_sku_cnt: 0,
      }],
      price_info: {
        product_price: 100,
        order_price: 100,
        freight: 0,
        discounted_price: 0,
        original_order_price: 100,
        merchant_receieve_price: 100,
      },
      pay_info: { pay_time: 1700000000, transaction_id: '', payment_method: 0 },
      delivery_info: {
        address_info: {
          user_name: `买家${orderId}`,
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
      ext_info: {
        customer_notes: `买家备注 ${orderId}`,
        merchant_notes: `商家备注 ${orderId}`,
        confirm_receipt_time: 0,
      },
    },
    ...patch,
  };
}

async function resetDb(): Promise<void> {
  await extensionDb.delete();
  await extensionDb.open();
}

test('stores account metadata and lists all-account orders newest first', async () => {
  const store = createOrderStore(createMemoryStorage());

  await store.upsertMany('account-1', '店铺一', [makeOrder('order-1', { update_time: 1700000001 })], 'autoSync');
  await store.upsertMany('account-2', '店铺二', [makeOrder('order-2', { update_time: 1700000002 })], 'manualRefresh');

  const result = await store.list({ type: 'all' }, {});

  assert.equal(result.hasMore, false);
  assert.deepEqual(result.orders.map(item => [item.accountId, item.accountName, item.orderId]), [
    ['account-2', '店铺二', 'order-2'],
    ['account-1', '店铺一', 'order-1'],
  ]);
});

test('filters by account, status, time scope, and local indexed text', async () => {
  const store = createOrderStore(createMemoryStorage());
  await store.upsertMany('account-1', '店铺一', [
    makeOrder('pending', { status: PENDING_SHIPMENT, create_time: 1700000000 }),
    makeOrder('done', { status: COMPLETED, create_time: 1600000000 }),
  ], 'autoSync');

  const list = await store.list(
    { type: 'account', accountId: 'account-1' },
    { status: PENDING_SHIPMENT, timeScope: '90d', nowSeconds: 1700000100 },
  );
  const search = await store.search({ type: 'all' }, { search_type: 'merchant_notes', keyword: 'pending' });

  assert.deepEqual(list.orders.map(item => item.orderId), ['pending']);
  assert.deepEqual(search.orders.map(item => item.orderId), ['pending']);
});

test('keeps only the newest orders per account', async () => {
  const store = createOrderStore(createMemoryStorage(), { maxOrdersPerAccount: 2 });

  await store.upsertMany('account-1', '店铺一', [
    makeOrder('old', { update_time: 1 }),
    makeOrder('middle', { update_time: 2 }),
    makeOrder('new', { update_time: 3 }),
  ], 'autoSync');

  const result = await store.list({ type: 'account', accountId: 'account-1' }, {});

  assert.deepEqual(result.orders.map(item => item.orderId), ['new', 'middle']);
});

test('keeps all synced orders by default instead of silently pruning at 500', async () => {
  const store = createOrderStore(createMemoryStorage());
  await store.upsertMany('account-1', '店铺一', Array.from({ length: 510 }, (_, index) => (
    makeOrder(`order-${index + 1}`, { update_time: 1700000000 + index })
  )), 'autoSync');

  const result = await store.list({ type: 'account', accountId: 'account-1' }, {});

  assert.equal(result.total, 510);
  assert.equal(result.orders.length, 510);
});

test('reports fetched and changed counts when upserting orders', async () => {
  const store = createOrderStore(createMemoryStorage());

  const first = await store.upsertMany('account-1', '店铺一', [
    makeOrder('order-1'),
    makeOrder('order-2'),
  ], 'autoSync');
  const second = await store.upsertMany('account-1', '店铺一', [
    makeOrder('order-1'),
    makeOrder('order-2'),
  ], 'autoSync');
  const third = await store.upsertMany('account-1', '店铺一', [
    makeOrder('order-1', { status: COMPLETED, update_time: 1700000010 }),
    makeOrder('order-2'),
  ], 'autoSync');

  assert.equal(first.fetchedCount, 2);
  assert.equal(first.changedCount, 2);
  assert.equal(second.fetchedCount, 2);
  assert.equal(second.changedCount, 0);
  assert.equal(third.fetchedCount, 2);
  assert.equal(third.changedCount, 1);
});

test('paginated order lists return the filtered total count', async () => {
  const store = createOrderStore(createMemoryStorage());
  await store.upsertMany('account-1', '店铺一', Array.from({ length: 55 }, (_, index) => (
    makeOrder(`order-${index + 1}`, { update_time: 1700000000 + index })
  )), 'autoSync');

  const firstPage = await store.list({ type: 'all' }, { pageSize: 50 });

  assert.equal(firstPage.orders.length, 50);
  assert.equal(firstPage.hasMore, true);
  assert.equal(firstPage.nextCursor, '50');
  assert.equal(firstPage.total, 55);
});

test('default order store persists order snapshots in IndexedDB', async () => {
  await resetDb();

  await orderStore.upsertMany('account-1', '店铺一', [makeOrder('order-1')], 'autoSync');

  const stored = await extensionDb.orders.get(['account-1', 'order-1']);
  assert.equal(stored?.accountId, 'account-1');
  assert.equal(stored?.accountName, '店铺一');
  assert.equal(stored?.orderId, 'order-1');
});
