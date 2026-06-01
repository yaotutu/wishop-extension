import assert from 'node:assert/strict';
import test from 'node:test';
import type { CollectedProductListing } from '../src/shared/types.ts';
import {
  createWxProductDraftFromCollectedListing,
  prepareWxProductDraftFromCollectedListing,
  submitPreparedWxProductDraft,
} from '../src/background/services/product-listing-wx-draft-service.ts';
import type { WxShopAddProductRequest, WxShopListingClient } from '../src/background/wxshop/listing/types.ts';

function sampleListing(): CollectedProductListing {
  return {
    id: 'taobao:1010211244888',
    platform: 'taobao',
    sourceUrl: 'https://item.taobao.com/item.htm?id=1010211244888',
    itemId: '1010211244888',
    title: '适用kindle充电传输数据线paperwhite电子书配件',
    shopName: '百鸿胜数码电器',
    seller: {
      shopName: '百鸿胜数码电器',
      sellerId: 'seller-1',
      shopId: 'shop-1',
    },
    priceRangeText: '3.12起',
    mainImages: [
      'https://img.alicdn.com/main-1.jpg',
      'https://img.alicdn.com/main-2.jpg',
      'https://img.alicdn.com/main-3.jpg',
    ],
    detailImages: [
      'https://img.alicdn.com/main-1.jpg',
      'https://img.alicdn.com/detail-1.jpg',
    ],
    productParams: [{ name: '品牌', value: '灿冕', group: 'basic' }],
    skuGroups: [],
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
    }],
    salesText: '已售 14',
    deliveryText: '预计明天发货',
    missingFields: [],
    collectedAt: 1700000000000,
    updatedAt: 1700000000000,
  };
}

function fakeListingClient(uploaded: string[], addRequests: WxShopAddProductRequest[]): WxShopListingClient {
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
    async uploadImageByUrl(imgUrl: string) {
      uploaded.push(imgUrl);
      return { imgUrl: `https://mmecimage.cn/p/${uploaded.length}.jpg` };
    },
    async addProduct(input: WxShopAddProductRequest) {
      addRequests.push(input);
      return { productId: '987654321', createTime: '2026-06-01 12:00:00' };
    },
    async listProduct() {
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

test('creates a WeChat product draft from a collected listing using uploaded WeChat images', async () => {
  const uploaded: string[] = [];
  const addRequests: WxShopAddProductRequest[] = [];

  const result = await createWxProductDraftFromCollectedListing({
    accountId: 'account-1',
    listingId: 'taobao:1010211244888',
    catIds: ['10000111', '10000113', '6091'],
    expressTemplateId: '47428464001',
    defaultStockNum: 30,
    autoListing: false,
  }, {
    getListing: async () => sampleListing(),
    getClient: async () => fakeListingClient(uploaded, addRequests),
    recordStarted: async () => {},
    recordCompleted: async () => {},
    recordFailed: async () => {},
  });

  assert.deepEqual(uploaded, [
    'https://img.alicdn.com/main-1.jpg',
    'https://img.alicdn.com/main-2.jpg',
    'https://img.alicdn.com/main-3.jpg',
    'https://img.alicdn.com/detail-1.jpg',
    'https://img.alicdn.com/white.jpg',
  ]);
  assert.equal(addRequests.length, 1);
  assert.equal(addRequests[0].head_imgs[0], 'https://mmecimage.cn/p/1.jpg');
  assert.equal(addRequests[0].desc_info?.imgs?.[0], 'https://mmecimage.cn/p/4.jpg');
  assert.equal(addRequests[0].skus[0].thumb_img, 'https://mmecimage.cn/p/5.jpg');
  assert.deepEqual(result, {
    accountId: 'account-1',
    listingId: 'taobao:1010211244888',
    productId: '987654321',
    createTime: '2026-06-01 12:00:00',
    autoListing: false,
    uploadedImageCount: 5,
  });
});

test('prepares a WeChat product draft without submitting it to the add-product API', async () => {
  const uploaded: string[] = [];
  const addRequests: WxShopAddProductRequest[] = [];

  const prepared = await prepareWxProductDraftFromCollectedListing({
    accountId: 'account-1',
    listingId: 'taobao:1010211244888',
    catIds: ['10000111', '10000113', '6091'],
    expressTemplateId: '47428464001',
    attrs: [{ attrKey: '型号', attrValue: 'KPW-1' }],
    defaultStockNum: 30,
    autoListing: false,
  }, {
    getListing: async () => sampleListing(),
    getClient: async () => fakeListingClient(uploaded, addRequests),
  });

  assert.deepEqual(uploaded, [
    'https://img.alicdn.com/main-1.jpg',
    'https://img.alicdn.com/main-2.jpg',
    'https://img.alicdn.com/main-3.jpg',
    'https://img.alicdn.com/detail-1.jpg',
    'https://img.alicdn.com/white.jpg',
  ]);
  assert.equal(addRequests.length, 0);
  assert.equal(prepared.accountId, 'account-1');
  assert.equal(prepared.listingId, 'taobao:1010211244888');
  assert.equal(prepared.uploadedImageCount, 5);
  assert.equal(prepared.request.title, sampleListing().title);
  assert.equal(prepared.request.head_imgs[0], 'https://mmecimage.cn/p/1.jpg');
  assert.deepEqual(prepared.request.attrs, [{ attr_key: '型号', attr_value: 'KPW-1' }]);
  assert.deepEqual(prepared.summary, {
    title: sampleListing().title,
    headImageCount: 3,
    detailImageCount: 1,
    skuCount: 1,
    attrCount: 1,
    listing: false,
  });
});

test('submits a prepared WeChat product draft without re-uploading images', async () => {
  const uploaded: string[] = [];
  const addRequests: WxShopAddProductRequest[] = [];
  const prepared = await prepareWxProductDraftFromCollectedListing({
    accountId: 'account-1',
    listingId: 'taobao:1010211244888',
    catIds: ['10000111', '10000113', '6091'],
  }, {
    getListing: async () => sampleListing(),
    getClient: async () => fakeListingClient(uploaded, addRequests),
  });
  uploaded.length = 0;

  const result = await submitPreparedWxProductDraft({
    accountId: 'account-1',
    listingId: 'taobao:1010211244888',
    request: prepared.request,
    uploadedImageCount: prepared.uploadedImageCount,
    autoListing: false,
  }, {
    getClient: async () => fakeListingClient(uploaded, addRequests),
    recordStarted: async () => {},
    recordCompleted: async () => {},
    recordFailed: async () => {},
  });

  assert.deepEqual(uploaded, []);
  assert.equal(addRequests.length, 1);
  assert.equal(addRequests[0], prepared.request);
  assert.deepEqual(result, {
    accountId: 'account-1',
    listingId: 'taobao:1010211244888',
    productId: '987654321',
    createTime: '2026-06-01 12:00:00',
    autoListing: false,
    uploadedImageCount: 5,
  });
});

test('fails before calling WeChat when the collected listing no longer exists', async () => {
  let clientRequested = false;

  await assert.rejects(
    () => createWxProductDraftFromCollectedListing({
      accountId: 'account-1',
      listingId: 'missing',
      catIds: ['10000111', '10000113', '6091'],
    }, {
      getListing: async () => null,
      getClient: async () => {
        clientRequested = true;
        return fakeListingClient([], []);
      },
      recordStarted: async () => {},
      recordCompleted: async () => {},
      recordFailed: async () => {},
    }),
    /采集商品不存在或已删除/,
  );

  assert.equal(clientRequested, false);
});
