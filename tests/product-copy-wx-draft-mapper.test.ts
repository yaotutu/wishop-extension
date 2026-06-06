import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductCopyRecord } from '../src/shared/types.ts';
import {
  collectWxDraftSourceImages,
  mapProductCopyRecordToWxAddProductRequest,
} from '../src/background/services/product-copy-wx-draft-mapper.ts';

function sampleListing(patch: Partial<ProductCopyRecord> = {}): ProductCopyRecord {
  return {
    id: 'taobao:1010211244888',
    sourceUrl: 'https://item.taobao.com/item.htm?id=1010211244888',
    identity: {
      url: 'https://item.taobao.com/item.htm?id=1010211244888',
      platform: 'taobao',
      itemId: '1010211244888',
    },
    title: '适用kindle充电传输数据线paperwhite电子书配件',
    shop: { name: '百鸿胜数码电器' },
    category: { source: { id: '50024407', name: '电子书配件', path: ['数码', '电子教育', '电子书配件'] } },
    seller: {
      shopName: '百鸿胜数码电器',
      sellerId: 'seller-1',
      shopId: 'shop-1',
    },
    price: { rangeText: '3.12起' },
    images: {
      main: [
        'https://img.alicdn.com/main-1.jpg',
        'https://img.alicdn.com/main-2.jpg',
        'https://img.alicdn.com/main-3.jpg',
      ],
      detail: [
        'https://img.alicdn.com/detail-1.jpg',
        'https://img.alicdn.com/detail-2.jpg',
      ],
      assets: [],
    },
    detail: { text: '', source: 'detailDom', images: ['https://img.alicdn.com/detail-1.jpg', 'https://img.alicdn.com/detail-2.jpg'] },
    params: [
      { name: '品牌', value: '灿冕', group: 'basic' },
      { name: '型号', value: '1', group: 'basic' },
    ],
    sku: {
      groups: [
        { pid: '1627207', name: '颜色分类', values: ['白色', '黑色'] },
        { pid: '122216431', name: '长度', values: ['1m', '0.5m'] },
      ],
      properties: [],
      matrix: [
        {
          id: 'sku-white-1m',
          skuId: 'sku-white-1m',
          propPath: '1627207:28341;122216431:32298',
          specs: [
            { pid: '1627207', vid: '28341', name: '颜色分类', value: '白色' },
            { pid: '122216431', vid: '32298', name: '长度', value: '1m' },
          ],
          priceText: '3.12',
          priceMoney: 312,
          stockText: '有货',
          quantity: 100,
          imageUrl: 'https://img.alicdn.com/white.jpg',
          logisticsTime: '预计明天发货',
        },
        {
          id: 'sku-black-05m',
          skuId: 'sku-black-05m',
          propPath: '1627207:28320;122216431:30000',
          specs: [
            { pid: '1627207', vid: '28320', name: '颜色分类', value: '黑色' },
            { pid: '122216431', vid: '30000', name: '长度', value: '0.5m' },
          ],
          priceText: '4.20',
          priceMoney: 420,
          stockText: '无货',
          quantity: 0,
          imageUrl: '',
          logisticsTime: '承诺48小时内发货',
        },
      ],
    },
    sales: { text: '已售 14' },
    delivery: { text: '预计明天发货' },
    diagnostics: { usedPageModel: true, usedDocumentFallback: false, sources: {}, warnings: [] },
    missingFields: [],
    collectedAt: 1700000000000,
    updatedAt: 1700000000000,
    ...patch,
  };
}

test('maps a Taobao product copy record to a WeChat add-product draft request', () => {
  const listing = sampleListing();
  const imageMap = new Map(collectWxDraftSourceImages(listing).map((url, index) => [url, `https://mmecimage.cn/p/uploaded-${index}.jpg`]));

  const request = mapProductCopyRecordToWxAddProductRequest(listing, {
    catIds: ['10000111', '10000113', '6091'],
    expressTemplateId: '47428464001',
    afterSaleAddressId: '123456',
    brandId: '2100000000',
    defaultStockNum: 88,
    uploadedImages: imageMap,
  });

  assert.equal(request.out_product_id, 'wishop-taobao-1010211244888');
  assert.equal(request.title, listing.title);
  assert.equal(request.short_title, '适用kindle充电传输数据线paper');
  assert.deepEqual(request.head_imgs, [
    'https://mmecimage.cn/p/uploaded-0.jpg',
    'https://mmecimage.cn/p/uploaded-1.jpg',
    'https://mmecimage.cn/p/uploaded-2.jpg',
  ]);
  assert.deepEqual(request.desc_info?.imgs, [
    'https://mmecimage.cn/p/uploaded-3.jpg',
    'https://mmecimage.cn/p/uploaded-4.jpg',
  ]);
  assert.deepEqual(request.cats, []);
  assert.deepEqual(request.cats_v2, [{ cat_id: '10000111' }, { cat_id: '10000113' }, { cat_id: '6091' }]);
  assert.deepEqual(request.attrs, [
    { attr_key: '品牌', attr_value: '灿冕' },
    { attr_key: '型号', attr_value: '1' },
  ]);
  assert.deepEqual(request.express_info, { template_id: '47428464001' });
  assert.deepEqual(request.after_sale_info, { after_sale_address_id: 123456 });
  assert.equal(request.brand_id, '2100000000');
  assert.deepEqual(request.extra_service, { is_open_cod: 0, seven_day_return: 1, freight_insurance: 0 });
  assert.equal(request.listing, 0);
  assert.deepEqual(request.skus[0], {
    thumb_img: 'https://mmecimage.cn/p/uploaded-5.jpg',
    sale_price: 312,
    stock_num: 100,
    sku_code: 'sku-white-1m',
    sku_attrs: [
      { attr_key: '颜色分类', attr_value: '白色' },
      { attr_key: '长度', attr_value: '1m' },
    ],
    sku_deliver_info: { stock_type: 0 },
  });
  assert.deepEqual(request.skus[1], {
    thumb_img: 'https://mmecimage.cn/p/uploaded-0.jpg',
    sale_price: 420,
    stock_num: 0,
    sku_code: 'sku-black-05m',
    sku_attrs: [
      { attr_key: '颜色分类', attr_value: '黑色' },
      { attr_key: '长度', attr_value: '0.5m' },
    ],
    sku_deliver_info: { stock_type: 0 },
  });
});

test('applies product copy pricing, title, image, and stock settings before building the WeChat draft request', () => {
  const listing = sampleListing({
    images: {
      ...sampleListing().images,
      main: [
        'https://img.alicdn.com/main-0.jpg',
        'https://img.alicdn.com/main-1.jpg',
        'https://img.alicdn.com/main-2.jpg',
        'https://img.alicdn.com/main-3.jpg',
        'https://img.alicdn.com/main-4.jpg',
      ],
      detail: [
        'https://img.alicdn.com/detail-0.jpg',
        'https://img.alicdn.com/detail-1.jpg',
        'https://img.alicdn.com/detail-2.jpg',
        'https://img.alicdn.com/detail-3.jpg',
      ],
    },
    detail: {
      text: '',
      source: 'detailDom',
      images: [
        'https://img.alicdn.com/detail-0.jpg',
        'https://img.alicdn.com/detail-1.jpg',
        'https://img.alicdn.com/detail-2.jpg',
        'https://img.alicdn.com/detail-3.jpg',
      ],
    },
  });
  const imageMap = new Map(collectWxDraftSourceImages(listing, {
    content: {
      titlePrefix: '现货 ',
      titleSuffix: ' 包邮',
      mainImageSkipFirst: 1,
      mainImageSkipLast: 1,
      detailImageSkipFirst: 1,
      detailImageSkipLast: 1,
      maxDetailImages: 1,
    },
  }).map((url, index) => [url, `https://mmecimage.cn/p/uploaded-${index}.jpg`]));

  const request = mapProductCopyRecordToWxAddProductRequest(listing, {
    catIds: ['10000111', '10000113', '6091'],
    expressTemplateId: '47428464001',
    afterSaleAddressId: '123456',
    uploadedImages: imageMap,
    pricing: {
      multiplier: 2,
      addAmountFen: 9,
      rounding: 'jiao',
    },
    content: {
      titlePrefix: '现货 ',
      titleSuffix: ' 包邮',
      mainImageSkipFirst: 1,
      mainImageSkipLast: 1,
      detailImageSkipFirst: 1,
      detailImageSkipLast: 1,
      maxDetailImages: 1,
    },
    sku: {
      defaultStockNum: 99,
      unifiedStockNum: 66,
      zeroStockReplacement: 12,
      minSkuPriceFen: 700,
    },
  });

  assert.equal(request.title, '现货 适用kindle充电传输数据线paperwhite电子书配件 包邮');
  assert.deepEqual(request.head_imgs, [
    'https://mmecimage.cn/p/uploaded-0.jpg',
    'https://mmecimage.cn/p/uploaded-1.jpg',
    'https://mmecimage.cn/p/uploaded-2.jpg',
  ]);
  assert.deepEqual(request.desc_info?.imgs, ['https://mmecimage.cn/p/uploaded-3.jpg']);
  assert.equal(request.skus.length, 1);
  assert.equal(request.skus[0].sku_code, 'sku-black-05m');
  assert.equal(request.skus[0].sale_price, 840);
  assert.equal(request.skus[0].stock_num, 66);
});

test('rejects product copy settings that filter every SKU before creating a WeChat draft request', () => {
  const listing = sampleListing();
  const imageMap = new Map(collectWxDraftSourceImages(listing).map((url, index) => [url, `https://mmecimage.cn/p/uploaded-${index}.jpg`]));

  assert.throws(
    () => mapProductCopyRecordToWxAddProductRequest(listing, {
      catIds: ['10000111', '10000113', '6091'],
      expressTemplateId: '47428464001',
      afterSaleAddressId: '123456',
      uploadedImages: imageMap,
      sku: {
        defaultStockNum: 99,
        minSkuPriceFen: 99999,
      },
    }),
    /SKU 过滤后没有可复制规格，请调整最低 SKU 价格/,
  );
});

test('builds one default SKU when the product copy record has no SKU matrix', () => {
  const listing = sampleListing({
    price: { rangeText: '12.80' },
    images: { ...sampleListing().images, detail: [] },
    detail: { text: '', source: 'none', images: [] },
    sku: { ...sampleListing().sku, matrix: [] },
  });
  const imageMap = new Map(collectWxDraftSourceImages(listing).map((url, index) => [url, `https://mmecimage.cn/p/uploaded-${index}.jpg`]));

  const request = mapProductCopyRecordToWxAddProductRequest(listing, {
    catIds: ['10000111', '10000113', '6091'],
    expressTemplateId: '47428464001',
    afterSaleAddressId: '123456',
    uploadedImages: imageMap,
  });

  assert.equal(request.listing, 0);
  assert.deepEqual(request.skus, [{
    thumb_img: 'https://mmecimage.cn/p/uploaded-0.jpg',
    sale_price: 1280,
    stock_num: 999,
    sku_code: 'taobao-1010211244888-default',
    sku_attrs: [],
    sku_deliver_info: { stock_type: 0 },
  }]);
});

test('uses the first uploaded main image as detail fallback when detail images are empty', () => {
  const listing = sampleListing({
    images: { ...sampleListing().images, detail: [] },
    detail: { text: '', source: 'none', images: [] },
  });
  const imageMap = new Map(collectWxDraftSourceImages(listing).map((url, index) => [url, `https://mmecimage.cn/p/uploaded-${index}.jpg`]));

  const request = mapProductCopyRecordToWxAddProductRequest(listing, {
    catIds: ['10000111', '10000113', '6091'],
    expressTemplateId: '47428464001',
    afterSaleAddressId: '123456',
    uploadedImages: imageMap,
  });

  assert.deepEqual(request.desc_info?.imgs, ['https://mmecimage.cn/p/uploaded-0.jpg']);
});

test('removes emoji characters from WeChat SKU attribute values', () => {
  const listing = sampleListing({
    sku: {
      ...sampleListing().sku,
      matrix: [
        {
          ...sampleListing().sku.matrix[0],
          specs: [
            { pid: '1627207', vid: '28341', name: '颜色分类🎮', value: '透明🔥【电竞级】😊' },
            { pid: '122216431', vid: '32298', name: '长度', value: '1m⚡' },
          ],
        },
      ],
    },
  });
  const imageMap = new Map(collectWxDraftSourceImages(listing).map((url, index) => [url, `https://mmecimage.cn/p/uploaded-${index}.jpg`]));

  const request = mapProductCopyRecordToWxAddProductRequest(listing, {
    catIds: ['10000111', '10000113', '6091'],
    expressTemplateId: '47428464001',
    afterSaleAddressId: '123456',
    uploadedImages: imageMap,
  });

  assert.deepEqual(request.skus[0].sku_attrs, [
    { attr_key: '颜色分类', attr_value: '透明【电竞级】' },
    { attr_key: '长度', attr_value: '1m' },
  ]);
});

test('uses AI-normalized attributes when they are supplied for the WeChat draft', () => {
  const listing = sampleListing();
  const imageMap = new Map(collectWxDraftSourceImages(listing).map((url, index) => [url, `https://mmecimage.cn/p/uploaded-${index}.jpg`]));

  const request = mapProductCopyRecordToWxAddProductRequest(listing, {
    catIds: ['10000111', '10000113', '6091'],
    expressTemplateId: '47428464001',
    afterSaleAddressId: '123456',
    attrs: [
      { attrKey: ' 型号 ', attrValue: ' KPW-1 ' },
      { attrKey: '', attrValue: 'ignored' },
    ],
    uploadedImages: imageMap,
  });

  assert.deepEqual(request.attrs, [{ attr_key: '型号', attr_value: 'KPW-1' }]);
});

test('accepts a four-level WeChat leaf category path when preparing a draft request', () => {
  const listing = sampleListing();
  const imageMap = new Map(collectWxDraftSourceImages(listing).map((url, index) => [url, `https://mmecimage.cn/p/uploaded-${index}.jpg`]));

  const request = mapProductCopyRecordToWxAddProductRequest(listing, {
    catIds: ['10000215', '10000218', '10000603', '546890'],
    expressTemplateId: '47428464001',
    afterSaleAddressId: '123456',
    uploadedImages: imageMap,
  });

  assert.deepEqual(request.cats_v2, [
    { cat_id: '10000215' },
    { cat_id: '10000218' },
    { cat_id: '10000603' },
    { cat_id: '546890' },
  ]);
});

test('rejects product copy records that cannot satisfy WeChat add-product minimum fields', () => {
  const listing = sampleListing({ images: { ...sampleListing().images, main: ['https://img.alicdn.com/main-1.jpg'] } });
  const imageMap = new Map(collectWxDraftSourceImages(listing).map((url, index) => [url, `https://mmecimage.cn/p/uploaded-${index}.jpg`]));

  assert.throws(
    () => mapProductCopyRecordToWxAddProductRequest(listing, {
      catIds: ['10000111', '10000113', '6091'],
      expressTemplateId: '47428464001',
      afterSaleAddressId: '123456',
      defaultStockNum: 10,
      uploadedImages: imageMap,
    }),
    /微信小店商品主图至少需要 3 张/,
  );

  assert.throws(
    () => mapProductCopyRecordToWxAddProductRequest(sampleListing(), {
      catIds: ['6091'],
      expressTemplateId: '47428464001',
      afterSaleAddressId: '123456',
      uploadedImages: imageMap,
    }),
    /请输入完整的微信小店类目路径 ID/,
  );

  assert.throws(
    () => mapProductCopyRecordToWxAddProductRequest(sampleListing(), {
      catIds: ['10000111', '10000113', '6091'],
      expressTemplateId: '',
      afterSaleAddressId: '123456',
      uploadedImages: imageMap,
    }),
    /运费模板 ID 不能为空/,
  );

  assert.throws(
    () => mapProductCopyRecordToWxAddProductRequest(sampleListing(), {
      catIds: ['10000111', '10000113', '6091'],
      expressTemplateId: '47428464001',
      afterSaleAddressId: '',
      uploadedImages: imageMap,
    }),
    /售后地址 ID 不能为空/,
  );
});
