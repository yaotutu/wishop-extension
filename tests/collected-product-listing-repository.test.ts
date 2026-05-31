import assert from 'node:assert/strict';
import test from 'node:test';
import 'fake-indexeddb/auto';
import { extensionDb } from '../src/background/db/extension-db.ts';
import {
  listCollectedProductListings,
  removeCollectedProductListing,
  saveCollectedProductListing,
} from '../src/background/store/collected-product-listing-repository.ts';
import type { CollectedProductListing } from '../src/shared/types.ts';

function sampleListing(patch: Partial<CollectedProductListing> = {}): CollectedProductListing {
  return {
    id: 'taobao:1010211244888',
    platform: 'taobao',
    sourceUrl: 'https://item.taobao.com/item.htm?id=1010211244888',
    itemId: '1010211244888',
    title: '适用kindle充电传输数据线',
    shopName: '百鸿胜数码电器',
    seller: {
      shopName: '百鸿胜数码电器',
      sellerId: 'seller-1',
      shopId: 'shop-1',
    },
    priceRangeText: '3.12起',
    mainImages: ['https://img.alicdn.com/main.jpg'],
    detailImages: ['https://img.alicdn.com/detail.jpg'],
    productParams: [{ name: '品牌', value: '灿冕', group: 'basic' }],
    skuGroups: [{ name: '颜色分类', values: ['白色'] }],
    skuMatrix: [{
      id: 'sku-white',
      skuId: 'sku-white',
      propPath: '1627207:28341',
      specs: [{ name: '颜色分类', value: '白色' }],
      priceText: '3.12',
      priceMoney: 312,
      stockText: '有货',
      quantity: 100,
      imageUrl: 'https://img.alicdn.com/white.jpg',
      logisticsTime: '预计明天发货',
    }],
    salesText: '已售 14',
    deliveryText: '预计明天发货',
    missingFields: [],
    collectedAt: 1700000000000,
    updatedAt: 1700000000000,
    ...patch,
  };
}

async function resetDb(): Promise<void> {
  await extensionDb.delete();
  await extensionDb.open();
}

test('collected product listings are saved, listed newest first, overwritten by platform item id, and removable', async () => {
  await resetDb();

  const first = await saveCollectedProductListing(sampleListing({ title: '第一次采集' }));
  const overwritten = await saveCollectedProductListing(sampleListing({
    title: '第二次采集',
    collectedAt: 1700000005000,
    updatedAt: 1700000005000,
  }));
  await saveCollectedProductListing(sampleListing({
    id: 'taobao:222',
    itemId: '222',
    title: '另一个商品',
    sourceUrl: 'https://item.taobao.com/item.htm?id=222',
    collectedAt: 1700000010000,
    updatedAt: 1700000010000,
  }));

  assert.equal(first.id, 'taobao:1010211244888');
  assert.equal(overwritten.id, first.id);

  const listings = await listCollectedProductListings();
  assert.deepEqual(listings.map(item => item.title), ['另一个商品', '第二次采集']);

  await removeCollectedProductListing('taobao:1010211244888');

  assert.deepEqual((await listCollectedProductListings()).map(item => item.id), ['taobao:222']);
});
