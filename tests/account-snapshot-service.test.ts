import assert from 'node:assert/strict';
import test from 'node:test';
import 'fake-indexeddb/auto';
import { extensionDb } from '../src/background/db/extension-db.ts';
import {
  exportAccountSnapshot,
  importAccountSnapshot,
} from '../src/background/sync/account-snapshot-service.ts';
import { DEFAULT_APP_SETTINGS } from '../src/shared/settings.ts';
import { DEFAULT_NOTIFICATION_PREFERENCE } from '../src/shared/notification.ts';
import type { Order, OrderStatus } from '../src/shared/types.ts';

const PENDING_SHIPMENT = 20 as OrderStatus;
const COMPLETED = 100 as OrderStatus;
const DEFAULT_TASK_CONFIG = {
  listUnreviewed: true,
  listUnreviewedQuantity: 0,
  autoDeleteFailed: true,
};

function makeOrder(orderId: string, status: OrderStatus = PENDING_SHIPMENT): Order {
  return {
    order_id: orderId,
    status,
    create_time: 1700000000,
    update_time: 1700000000,
    order_detail: {
      product_infos: [],
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
      ext_info: { customer_notes: '', merchant_notes: '', confirm_receipt_time: 0 },
    },
  };
}

async function resetDb(): Promise<void> {
  await extensionDb.delete();
  await extensionDb.open();
}

test('account snapshots replace only the target account data', async () => {
  await resetDb();
  await extensionDb.accounts.bulkPut([
    {
      id: 'account-1',
      appId: 'app-1',
      name: '店铺一',
      config: { appId: 'app-1', appSecret: 'secret-1' },
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    },
    {
      id: 'account-2',
      appId: 'app-2',
      name: '店铺二',
      config: { appId: 'app-2', appSecret: 'secret-2' },
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    },
  ]);
  await extensionDb.orders.bulkPut([
    {
      accountId: 'account-1',
      accountName: '店铺一',
      orderId: 'order-1',
      status: PENDING_SHIPMENT,
      createTime: 1700000000,
      updateTime: 1700000000,
      indexedText: 'order-1',
      order: makeOrder('order-1'),
      source: 'autoSync',
      lastFetchedAt: 1700000000000,
      lastChangedAt: 1700000000000,
    },
    {
      accountId: 'account-2',
      accountName: '店铺二',
      orderId: 'order-2',
      status: PENDING_SHIPMENT,
      createTime: 1700000000,
      updateTime: 1700000000,
      indexedText: 'order-2',
      order: makeOrder('order-2'),
      source: 'autoSync',
      lastFetchedAt: 1700000000000,
      lastChangedAt: 1700000000000,
    },
  ]);
  await extensionDb.accountWorkspaces.bulkPut([
    {
      accountId: 'account-1',
      taskConfig: DEFAULT_TASK_CONFIG,
      scheduledJobs: [],
      productSources: [{ productId: 'product-1', sources: [] }],
      orderAssociations: [],
      realAddressCaches: [],
      rules: {
        skipKeywords: [],
        blacklistRules: [],
        statusRules: [],
        violationWords: ['违规词'],
      },
      appSettings: DEFAULT_APP_SETTINGS,
      notificationPreference: DEFAULT_NOTIFICATION_PREFERENCE,
      orderSyncStates: {},
      updatedAt: 1700000000000,
    },
    {
      accountId: 'account-2',
      taskConfig: DEFAULT_TASK_CONFIG,
      scheduledJobs: [],
      productSources: [{ productId: 'product-2', sources: [] }],
      orderAssociations: [],
      realAddressCaches: [],
      rules: {
        skipKeywords: [],
        blacklistRules: [],
        statusRules: [],
        violationWords: [],
      },
      appSettings: DEFAULT_APP_SETTINGS,
      notificationPreference: DEFAULT_NOTIFICATION_PREFERENCE,
      orderSyncStates: {},
      updatedAt: 1700000000000,
    },
  ]);
  await extensionDb.accountLogs.bulkPut([
    {
      id: 'log-1',
      accountId: 'account-1',
      kind: 'listing',
      timestamp: 1700000000000,
      entry: { id: 'log-1', timestamp: 1700000000000 },
    },
    {
      id: 'log-2',
      accountId: 'account-2',
      kind: 'listing',
      timestamp: 1700000000000,
      entry: { id: 'log-2', timestamp: 1700000000000 },
    },
  ]);
  await extensionDb.accountSyncStates.bulkPut([
    {
      accountId: 'account-1',
      appId: 'app-1',
      revision: 7,
      checksum: 'before',
      dirty: false,
      updatedAt: 1700000000000,
    },
    {
      accountId: 'account-2',
      appId: 'app-2',
      revision: 3,
      checksum: 'other',
      dirty: false,
      updatedAt: 1700000000000,
    },
  ]);

  const snapshot = await exportAccountSnapshot('account-1');
  assert.equal(snapshot.accountId, 'account-1');
  assert.equal(snapshot.tables.orders.length, 1);
  assert.equal(snapshot.tables.workspace.rules.violationWords[0], '违规词');

  await extensionDb.orders.put({
    accountId: 'account-1',
    accountName: '店铺一',
    orderId: 'local-only',
    status: COMPLETED,
    createTime: 1700000001,
    updateTime: 1700000001,
    indexedText: 'local-only',
    order: makeOrder('local-only', COMPLETED),
    source: 'manualRefresh',
    lastFetchedAt: 1700000001000,
    lastChangedAt: 1700000001000,
  });
  await extensionDb.accountLogs.put({
    id: 'local-log',
    accountId: 'account-1',
    kind: 'listing',
    timestamp: 1700000001000,
    entry: { id: 'local-log', timestamp: 1700000001000 },
  });

  await importAccountSnapshot(snapshot);

  const accountOneOrders = await extensionDb.orders.where('accountId').equals('account-1').toArray();
  const accountTwoOrders = await extensionDb.orders.where('accountId').equals('account-2').toArray();
  const accountOneLogs = await extensionDb.accountLogs.where('accountId').equals('account-1').toArray();
  const accountTwoLogs = await extensionDb.accountLogs.where('accountId').equals('account-2').toArray();

  assert.deepEqual(accountOneOrders.map(order => order.orderId), ['order-1']);
  assert.deepEqual(accountTwoOrders.map(order => order.orderId), ['order-2']);
  assert.deepEqual(accountOneLogs.map(log => log.id), ['log-1']);
  assert.deepEqual(accountTwoLogs.map(log => log.id), ['log-2']);
  assert.equal((await extensionDb.accountWorkspaces.get('account-2'))?.productSources[0]?.productId, 'product-2');
});
