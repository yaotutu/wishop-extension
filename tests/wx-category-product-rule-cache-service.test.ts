import assert from 'node:assert/strict';
import test from 'node:test';
import 'fake-indexeddb/auto';
import { extensionDb } from '../src/background/db/extension-db.ts';
import {
  getWxCategoryProductRuleCacheItem,
  getWxCategoryProductRuleCacheStatus,
} from '../src/background/store/wx-category-product-rule-repository.ts';
import {
  syncWxCategoryProductRulesToLocalCache,
  wxCategoryProductRuleCacheItemToProductRule,
} from '../src/background/services/wx-category-product-rule-cache-service.ts';
import type { WxShopCategoryProductRule, WxShopListingClient } from '../src/background/wxshop/listing/types.ts';
import type { RuntimeCategoryPath } from '../src/background/services/product-copy-category-shortlist.ts';

const CATEGORY_PATHS: RuntimeCategoryPath[] = [
  {
    catIds: ['100', '110', '111'],
    names: ['家居生活', '清洁用品', '垃圾袋'],
    path: '家居生活 / 清洁用品 / 垃圾袋',
    leaf: true,
  },
  {
    catIds: ['100', '120', '222'],
    names: ['家居生活', '清洁用品', '保鲜袋'],
    path: '家居生活 / 清洁用品 / 保鲜袋',
    leaf: true,
  },
];

function categoryRule(catId: string, productAttrNames: string[] = ['材质']): WxShopCategoryProductRule {
  return {
    catId,
    productAttrs: productAttrNames.map(name => ({
      name,
      type: name === '材质' ? 'select_one' : 'text',
      values: name === '材质' ? ['塑料', '其他'] : [],
      required: true,
      appendAllowed: name !== '材质',
    })),
    saleAttrs: [],
  };
}

function fakeListingClient(
  getRule: (catId: string) => Promise<WxShopCategoryProductRule>,
): WxShopListingClient {
  return {
    async getDraftProducts() {
      return { productIds: [], nextKey: '', hasMore: false };
    },
    async getProductDetail() {
      throw new Error('not used');
    },
    async getProductQrcode() {
      throw new Error('not used');
    },
    async getAllCategoryPaths() {
      return [];
    },
    async precheckProductCategory(catId: string) {
      return { catId, allPass: true, failReasons: [] };
    },
    getCategoryProductRule: getRule,
    async getFreightTemplates() {
      return [];
    },
    async getFreightTemplateIds() {
      return [];
    },
    async getMerchantAddressIds() {
      return [];
    },
    async getMerchantAddressDetail() {
      throw new Error('not used');
    },
    async uploadImageByUrl() {
      throw new Error('not used');
    },
    async addProduct() {
      throw new Error('not used');
    },
    async submitProductAudit() {
      return { errcode: 0, errmsg: 'ok' };
    },
    async getAuditQuota() {
      return { quota: 0, total: 0 };
    },
    async deleteProduct() {
      return { errcode: 0, errmsg: 'ok' };
    },
  };
}

async function resetDb(): Promise<void> {
  await extensionDb.delete();
  await extensionDb.open();
}

function noopActivityRecorder(): Promise<void> {
  return Promise.resolve();
}

test('syncs WeChat category product rules into local cache and keeps failed items visible', async () => {
  await resetDb();
  const requestedCatIds: string[] = [];
  let currentTime = 1700000000000;
  const startedLogs: Record<string, unknown>[] = [];
  const completedLogs: Record<string, unknown>[] = [];

  const status = await syncWxCategoryProductRulesToLocalCache({
    accountId: 'account-1',
  }, {
    loadCategoryPaths: async () => CATEGORY_PATHS,
    getClient: async () => fakeListingClient(async catId => {
      requestedCatIds.push(catId);
      if (catId === '222') throw new Error('类目接口异常');
      return categoryRule(catId, ['材质', '颜色']);
    }),
    intervalMs: 0,
    now: () => {
      currentTime += 1;
      return currentTime;
    },
    recordStarted: async input => { startedLogs.push(input); },
    recordCompleted: async input => { completedLogs.push(input); },
    recordFailed: noopActivityRecorder,
  });

  assert.deepEqual(requestedCatIds, ['111', '222']);
  assert.equal(status.total, 2);
  assert.equal(status.cached, 1);
  assert.equal(status.failed, 1);
  assert.equal(status.missing, 0);
  assert.equal(status.syncing, false);
  assert.equal(status.processed, 2);
  assert.equal(status.skipped, 0);

  const successItem = await getWxCategoryProductRuleCacheItem('111');
  assert.equal(successItem?.path, '家居生活 / 清洁用品 / 垃圾袋');
  assert.deepEqual(successItem?.requiredProductAttrs.map(attr => attr.name), ['材质', '颜色']);
  assert.deepEqual(successItem && wxCategoryProductRuleCacheItemToProductRule(successItem), {
    catId: '111',
    productAttrs: [
      { name: '材质', type: 'select_one', values: ['塑料', '其他'], required: true, appendAllowed: false, hint: undefined },
      { name: '颜色', type: 'text', values: [], required: true, appendAllowed: true, hint: undefined },
    ],
    saleAttrs: [],
  });

  const failedItem = await getWxCategoryProductRuleCacheItem('222');
  assert.equal(failedItem?.lastError, '类目接口异常');
  assert.deepEqual(failedItem?.productAttrs, []);
  assert.equal(startedLogs[0].title, '微信类目云端数据下载开始');
  assert.equal(completedLogs[0].title, '微信类目云端数据下载完成');
});

test('skips cached successful categories and retries categories that were cached as failures', async () => {
  await resetDb();
  const requestedCatIds: string[] = [];
  let failFirstPreserveBag = true;

  const runSync = () => syncWxCategoryProductRulesToLocalCache({
    accountId: 'account-1',
  }, {
    loadCategoryPaths: async () => CATEGORY_PATHS,
    getClient: async () => fakeListingClient(async catId => {
      requestedCatIds.push(catId);
      if (catId === '222' && failFirstPreserveBag) {
        failFirstPreserveBag = false;
        throw new Error('临时失败');
      }
      return categoryRule(catId);
    }),
    intervalMs: 0,
    now: Date.now,
    recordStarted: noopActivityRecorder,
    recordCompleted: noopActivityRecorder,
    recordFailed: noopActivityRecorder,
  });

  const firstStatus = await runSync();
  assert.equal(firstStatus.cached, 1);
  assert.equal(firstStatus.failed, 1);
  assert.deepEqual(requestedCatIds, ['111', '222']);

  const secondStatus = await runSync();
  assert.deepEqual(requestedCatIds, ['111', '222', '222']);
  assert.equal(secondStatus.cached, 2);
  assert.equal(secondStatus.failed, 0);
  assert.equal(secondStatus.missing, 0);
  assert.equal(secondStatus.processed, 2);
  assert.equal(secondStatus.skipped, 1);

  const persistentStatus = await getWxCategoryProductRuleCacheStatus(CATEGORY_PATHS.length);
  assert.equal(persistentStatus.cached, 2);
  assert.equal(persistentStatus.failed, 0);
  assert.equal(persistentStatus.missing, 0);
});
