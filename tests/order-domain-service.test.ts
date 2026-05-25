import assert from 'node:assert/strict';
import test from 'node:test';
import type { Account, Order, OrderStatus } from '../src/shared/types.ts';
import { createOrderStore } from '../src/background/orders/order-store.ts';
import { createOrderSyncService } from '../src/background/orders/order-sync-service.ts';
import { createOrderDomainService } from '../src/background/orders/order-domain-service.ts';

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

function makeAccount(id: string, name: string): Account {
  return {
    id,
    name,
    config: { appId: `${id}-app`, appSecret: `${id}-secret` },
    createdAt: 1700000000000,
  };
}

function makeOrder(orderId: string, patch: Partial<Order> = {}): Order {
  return {
    order_id: orderId,
    status: PENDING_SHIPMENT,
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
      ext_info: { customer_notes: '', merchant_notes: orderId, confirm_receipt_time: 0 },
    },
    ...patch,
  };
}

test('local list and local search read only from the store', async () => {
  const account = makeAccount('account-1', '店铺一');
  const store = createOrderStore(createMemoryStorage());
  await store.upsertMany(account.id, account.name, [makeOrder('local-order')], 'manualRefresh');
  const sourceCalls: string[] = [];
  const sync = createOrderSyncService({
    store,
    source: {
      async fetchRecentOrders() { sourceCalls.push('fetchRecentOrders'); return []; },
      async searchOrders() { sourceCalls.push('searchOrders'); return []; },
      async getOrderDetail() { sourceCalls.push('getOrderDetail'); return makeOrder('unused'); },
    },
    getAccounts: async () => [account],
  });
  const domain = createOrderDomainService({ store, sync });

  const list = await domain.list({ type: 'account', accountId: account.id }, {});
  const search = await domain.search({ type: 'all' }, { search_type: 'merchant_notes', keyword: 'local' }, 'local');

  assert.deepEqual(list.orders.map(item => item.orderId), ['local-order']);
  assert.deepEqual(search.orders.map(item => item.orderId), ['local-order']);
  assert.deepEqual(sourceCalls, []);
});

test('remote search calls source and writes results to the store', async () => {
  const account = makeAccount('account-1', '店铺一');
  const store = createOrderStore(createMemoryStorage());
  const sync = createOrderSyncService({
    store,
    source: {
      async fetchRecentOrders() { return []; },
      async searchOrders(accountId) { return [makeOrder(`remote-${accountId}`)]; },
      async getOrderDetail() { return makeOrder('unused'); },
    },
    getAccounts: async () => [account],
  });
  const domain = createOrderDomainService({ store, sync });

  const remote = await domain.search({ type: 'account', accountId: account.id }, { search_type: 'order_id', keyword: 'remote' }, 'remote');
  const local = await domain.search({ type: 'account', accountId: account.id }, { search_type: 'order_id', keyword: 'remote' }, 'local');

  assert.deepEqual(remote.orders.map(item => item.orderId), ['remote-account-1']);
  assert.deepEqual(local.orders.map(item => item.orderId), ['remote-account-1']);
});

test('detail refresh calls source and updates local snapshot', async () => {
  const account = makeAccount('account-1', '店铺一');
  const store = createOrderStore(createMemoryStorage());
  const sync = createOrderSyncService({
    store,
    source: {
      async fetchRecentOrders() { return []; },
      async searchOrders() { return []; },
      async getOrderDetail() { return makeOrder('detail-order', { status: COMPLETED, update_time: 1700000010 }); },
    },
    getAccounts: async () => [account],
  });
  const domain = createOrderDomainService({ store, sync });

  const detail = await domain.detail(account.id, 'detail-order', { refresh: true });
  const local = await store.get(account.id, 'detail-order');

  assert.equal(detail.status, COMPLETED);
  assert.equal(local?.order.status, COMPLETED);
});

test('all-account refresh keeps successful accounts when one account fails', async () => {
  const accounts = [makeAccount('good', '正常店铺'), makeAccount('bad', '异常店铺')];
  const store = createOrderStore(createMemoryStorage());
  const sync = createOrderSyncService({
    store,
    source: {
      async fetchRecentOrders(accountId) {
        if (accountId === 'bad') throw new Error('token invalid');
        return [makeOrder('good-order')];
      },
      async searchOrders() { return []; },
      async getOrderDetail() { return makeOrder('unused'); },
    },
    getAccounts: async () => accounts,
  });
  const domain = createOrderDomainService({ store, sync });

  const result = await domain.refresh({ type: 'all' });
  const list = await domain.list({ type: 'all' }, {});

  assert.deepEqual(result.refreshedAccountIds, ['good']);
  assert.deepEqual(result.failedAccounts.map(item => [item.accountId, item.error]), [['bad', 'token invalid']]);
  assert.deepEqual(list.orders.map(item => item.orderId), ['good-order']);
});

test('all-account refresh continues when the first account fails', async () => {
  const accounts = [makeAccount('bad', '异常店铺'), makeAccount('good', '正常店铺')];
  const store = createOrderStore(createMemoryStorage());
  const calls: string[] = [];
  const sync = createOrderSyncService({
    store,
    source: {
      async fetchRecentOrders(accountId) {
        calls.push(accountId);
        if (accountId === 'bad') throw new Error('invalid args');
        return [makeOrder('good-order')];
      },
      async searchOrders() { return []; },
      async getOrderDetail() { return makeOrder('unused'); },
    },
    getAccounts: async () => accounts,
  });
  const domain = createOrderDomainService({ store, sync });

  const result = await domain.refresh({ type: 'all' });
  const list = await domain.list({ type: 'all' }, {});

  assert.deepEqual(calls, ['bad', 'good']);
  assert.deepEqual(result.refreshedAccountIds, ['good']);
  assert.deepEqual(result.failedAccounts.map(item => item.accountId), ['bad']);
  assert.deepEqual(list.orders.map(item => item.orderId), ['good-order']);
});

test('all-account refresh rejects when every account fails', async () => {
  const accounts = [makeAccount('bad-1', '异常店铺一'), makeAccount('bad-2', '异常店铺二')];
  const store = createOrderStore(createMemoryStorage());
  const sync = createOrderSyncService({
    store,
    source: {
      async fetchRecentOrders(accountId) {
        throw new Error(`${accountId} token invalid`);
      },
      async searchOrders() { return []; },
      async getOrderDetail() { return makeOrder('unused'); },
    },
    getAccounts: async () => accounts,
  });
  const domain = createOrderDomainService({ store, sync });

  await assert.rejects(
    () => domain.refresh({ type: 'all' }),
    /bad-1 token invalid.*bad-2 token invalid/,
  );
  const state = await store.getSyncState({ type: 'all' });

  assert.match(state.lastError || '', /bad-1 token invalid/);
  assert.match(state.lastError || '', /bad-2 token invalid/);
});
