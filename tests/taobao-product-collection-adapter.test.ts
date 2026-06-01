import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTaobaoProductSnapshotFromPageModel,
  sanitizeTaobaoProductPageModel,
} from '../src/content/taobao/adapters/product-detail-collection-adapter.ts';
import { collectTaobaoProductSnapshotFromSources } from '../src/content/taobao/runtime/product-listing-collection-workflow.ts';

const pageModel = {
  seller: {
    shopName: '百鸿胜数码电器',
    sellerId: 'seller-1',
    shopId: 'shop-1',
    nick: 'should-not-be-persisted',
  },
  item: {
    itemId: '1010211244888',
    title: '适用kindle充电传输数据线paperwhite 2/3/4线558适配oasis电子书',
    images: ['//img.alicdn.com/main-1.jpg', '//img.alicdn.com/main-2.jpg'],
    categoryId: '50024407',
    categoryName: '电子书配件',
    categoryPath: ['数码', '电子教育', '电子书配件'],
    pcADescUrl: '//desc.alicdn.com/detail.html',
    vagueSellCount: '14',
  },
  plusViewVO: {
    industryParamVO: {
      enhanceParamList: [
        { propertyName: '数据线适用范围', valueName: '通用' },
      ],
      basicParamList: [
        { propertyName: '品牌', valueName: '灿冕' },
        { propertyName: '型号', valueName: '1' },
      ],
    },
  },
  skuBase: {
    props: [
      {
        name: '颜色分类',
        pid: '1627207',
        values: [
          { vid: '28341', name: '白色', image: '//img.alicdn.com/white.jpg' },
          { vid: '28320', name: '黑色', image: '//img.alicdn.com/black.jpg' },
        ],
      },
      {
        name: '长度',
        pid: '122216431',
        values: [
          { vid: '32298', name: '1m' },
          { vid: '30000', name: '0.5m' },
        ],
      },
    ],
    skus: [
      { skuId: 'sku-white-1m', propPath: '1627207:28341;122216431:32298' },
      { skuId: 'sku-black-05m', propPath: '1627207:28320;122216431:30000' },
    ],
  },
  skuCore: {
    sku2info: {
      0: {
        price: { priceText: '3.12', priceMoney: 312, priceDesc: '起' },
        quantity: 200,
        quantityText: '有货',
        logisticsTime: '预计明天发货',
      },
      'sku-white-1m': {
        price: { priceText: '3.12', priceMoney: 312 },
        quantity: 100,
        quantityText: '有货',
        logisticsTime: '预计明天发货',
      },
      'sku-black-05m': {
        price: { priceText: '4.20', priceMoney: 420 },
        quantity: 0,
        quantityText: '无货',
        logisticsTime: '承诺48小时内发货',
      },
    },
  },
  componentsVO: {
    titleVO: { salesDesc: '已售 14' },
    deliveryVO: { agingDesc: '预计明天发货｜承诺48小时内发货' },
  },
  services: {
    unrelated: true,
  },
  privateAddressList: {
    address: 'should-not-be-persisted',
    tel: '13800000000',
  },
};

test('maps Taobao ICE page model to a complete listing collection snapshot', () => {
  const snapshot = buildTaobaoProductSnapshotFromPageModel({
    pageModel,
    url: 'https://item.taobao.com/item.htm?id=1010211244888',
    detailImages: ['//img.alicdn.com/detail-1.jpg'],
    collectedAt: 1700000000000,
  });

  assert.equal(snapshot.itemId, '1010211244888');
  assert.equal(snapshot.title, pageModel.item.title);
  assert.deepEqual(snapshot.sourceCategory, {
    id: '50024407',
    name: '电子书配件',
    path: ['数码', '电子教育', '电子书配件'],
  });
  assert.equal(snapshot.shopName, '百鸿胜数码电器');
  assert.equal(snapshot.seller.sellerId, 'seller-1');
  assert.deepEqual(snapshot.mainImages, [
    'https://img.alicdn.com/main-1.jpg',
    'https://img.alicdn.com/main-2.jpg',
  ]);
  assert.deepEqual(snapshot.detailImages, ['https://img.alicdn.com/detail-1.jpg']);
  assert.deepEqual(snapshot.productParams, [
    { name: '数据线适用范围', value: '通用', group: 'enhance' },
    { name: '品牌', value: '灿冕', group: 'basic' },
    { name: '型号', value: '1', group: 'basic' },
  ]);
  assert.deepEqual(snapshot.skuGroups.map(group => group.name), ['颜色分类', '长度']);
  assert.equal(snapshot.skuMatrix.length, 2);
  assert.deepEqual(snapshot.skuMatrix[0], {
    id: 'sku-white-1m',
    skuId: 'sku-white-1m',
    propPath: '1627207:28341;122216431:32298',
    specs: [
      { name: '颜色分类', value: '白色' },
      { name: '长度', value: '1m' },
    ],
    priceText: '3.12',
    priceMoney: 312,
    stockText: '有货',
    quantity: 100,
    imageUrl: 'https://img.alicdn.com/white.jpg',
    logisticsTime: '预计明天发货',
  });
  assert.equal(snapshot.priceRangeText, '3.12起');
  assert.equal(snapshot.salesText, '已售 14');
  assert.equal(snapshot.deliveryText, '预计明天发货｜承诺48小时内发货');
});

test('sanitizes Taobao page model before content script sends it to background', () => {
  const sanitized = sanitizeTaobaoProductPageModel(pageModel);
  const serialized = JSON.stringify(sanitized);

  assert.match(serialized, /百鸿胜数码电器/);
  assert.match(serialized, /skuBase/);
  assert.match(serialized, /skuCore/);
  assert.match(serialized, /plusViewVO/);
  assert.doesNotMatch(serialized, /13800000000/);
  assert.doesNotMatch(serialized, /privateAddressList/);
  assert.doesNotMatch(serialized, /should-not-be-persisted/);
  assert.equal(Object.prototype.hasOwnProperty.call(sanitized as Record<string, unknown>, 'services'), false);
});

test('normalizes Taobao cropped image urls before rendering previews', () => {
  const snapshot = buildTaobaoProductSnapshotFromPageModel({
    pageModel: {
      ...pageModel,
      item: {
        ...pageModel.item,
        images: [
          'https://gw.alicdn.com/bao/uploaded/i1/221/O1CN.png~crop,3,0,749,749~_!!221.png',
          'https://img.alicdn.com/imgextra/i1/221/O1CN.jpg_120x120q90.jpg',
        ],
      },
    },
    url: 'https://item.taobao.com/item.htm?id=1010211244888',
    collectedAt: 1700000000000,
  });

  assert.deepEqual(snapshot.mainImages, [
    'https://gw.alicdn.com/bao/uploaded/i1/221/O1CN.png',
    'https://img.alicdn.com/imgextra/i1/221/O1CN.jpg',
  ]);
});

test('falls back to DOM snapshot when page-world collection times out', async () => {
  const fallback = buildTaobaoProductSnapshotFromPageModel({
    pageModel,
    url: 'https://item.taobao.com/item.htm?id=1010211244888',
    detailImages: [],
    collectedAt: 1700000000000,
  });

  const snapshot = await collectTaobaoProductSnapshotFromSources(
    fallback,
    async () => {
      throw new Error('读取淘宝商品页面模型超时');
    },
  );

  assert.equal(snapshot.itemId, fallback.itemId);
  assert.equal(snapshot.title, fallback.title);
});
