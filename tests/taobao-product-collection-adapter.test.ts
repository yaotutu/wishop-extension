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
    encryptUid: 'should-not-be-persisted',
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
        asac: 'should-not-be-persisted',
        buyExParams: {
          mi_id: 'should-not-be-persisted',
        },
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
    deliveryVO: {
      agingDesc: '预计明天发货｜承诺48小时内发货',
      deliveryFromAddr: '广东深圳',
      deliveryToAddr: 'should-not-be-persisted',
      addressId: 'should-not-be-persisted',
      areaId: 'should-not-be-persisted',
      deliverToCity: 'should-not-be-persisted',
      deliverToDistrict: 'should-not-be-persisted',
    },
    rateVO: {
      totalCount: '900+',
      group: {
        items: [
          {
            content: 'should-not-be-persisted',
            feedId: 'should-not-be-persisted',
            headPic: 'should-not-be-persisted',
          },
        ],
      },
    },
    itemEndorseVO: {
      endorseList: [
        {
          textList: ['should-not-be-persisted'],
          type: 'itemRate',
        },
      ],
    },
    tabVO: {
      tabList: [
        {
          name: 'comments',
          title: '用户评价',
        },
      ],
    },
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
    detailContent: {
      text: '适用于 Kindle 充电传输，支持 Paperwhite 与 Oasis。',
      source: 'detailDom',
      images: [{
        url: '//img.alicdn.com/detail-1.jpg',
        normalizedUrl: 'https://img.alicdn.com/detail-1.jpg',
        role: 'detail',
        source: 'detailDom',
        sourceSelector: '#imageTextInfo-content',
        width: 750,
        height: 1000,
        naturalWidth: 750,
        naturalHeight: 1000,
        lazyAttrs: { 'data-src': '//img.alicdn.com/detail-1.jpg' },
        flags: [],
      }],
    },
    collectedAt: 1700000000000,
  });

  assert.equal(snapshot.identity.itemId, '1010211244888');
  assert.equal(snapshot.title, pageModel.item.title);
  assert.deepEqual(snapshot.category.source, {
    id: '50024407',
  });
  assert.equal(snapshot.shop.name, '百鸿胜数码电器');
  assert.equal(snapshot.seller.sellerId, 'seller-1');
  assert.deepEqual(snapshot.images.main, [
    'https://img.alicdn.com/main-1.jpg',
    'https://img.alicdn.com/main-2.jpg',
  ]);
  assert.deepEqual(snapshot.images.detail, ['https://img.alicdn.com/detail-1.jpg']);
  assert.equal(snapshot.detail.text, '适用于 Kindle 充电传输，支持 Paperwhite 与 Oasis。');
  assert.deepEqual(snapshot.params, [
    { name: '数据线适用范围', value: '通用', group: 'enhance' },
    { name: '品牌', value: '灿冕', group: 'basic' },
    { name: '型号', value: '1', group: 'basic' },
  ]);
  assert.deepEqual(snapshot.sku.groups.map(group => group.name), ['颜色分类', '长度']);
  assert.deepEqual(snapshot.sku.properties[0], {
    pid: '1627207',
    name: '颜色分类',
    values: [
      { vid: '28341', name: '白色', imageUrl: 'https://img.alicdn.com/white.jpg' },
      { vid: '28320', name: '黑色', imageUrl: 'https://img.alicdn.com/black.jpg' },
    ],
  });
  assert.equal(snapshot.sku.matrix.length, 2);
  assert.deepEqual(snapshot.sku.matrix[0], {
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
  });
  assert.equal(snapshot.price.rangeText, '3.12起');
  assert.equal(snapshot.sales.text, '已售 14');
  assert.equal(snapshot.delivery.text, '预计明天发货｜承诺48小时内发货');
  assert.deepEqual(snapshot.images.assets.map(asset => `${asset.role}:${asset.source}:${asset.normalizedUrl}`), [
    'main:pageModel:https://img.alicdn.com/main-1.jpg',
    'main:pageModel:https://img.alicdn.com/main-2.jpg',
    'detail:detailDom:https://img.alicdn.com/detail-1.jpg',
    'sku:skuModel:https://img.alicdn.com/white.jpg',
    'sku:skuModel:https://img.alicdn.com/black.jpg',
  ]);
  assert.equal(snapshot.diagnostics.usedPageModel, true);
  assert.equal(snapshot.diagnostics.usedDocumentFallback, false);
  assert.equal(snapshot.diagnostics.sources.detail, 'detailDom');
  assert.match(JSON.stringify(snapshot.rawModel), /skuBase/);
  assert.doesNotMatch(JSON.stringify(snapshot.rawModel), /should-not-be-persisted/);
});

test('sanitizes Taobao page model before content script sends it to background', () => {
  const sanitized = sanitizeTaobaoProductPageModel(pageModel);
  const serialized = JSON.stringify(sanitized);

  assert.match(serialized, /百鸿胜数码电器/);
  assert.match(serialized, /skuBase/);
  assert.match(serialized, /skuCore/);
  assert.match(serialized, /plusViewVO/);
  assert.match(serialized, /广东深圳/);
  assert.doesNotMatch(serialized, /13800000000/);
  assert.doesNotMatch(serialized, /privateAddressList/);
  assert.doesNotMatch(serialized, /should-not-be-persisted/);
  assert.doesNotMatch(serialized, /deliveryToAddr/);
  assert.doesNotMatch(serialized, /addressId/);
  assert.doesNotMatch(serialized, /areaId/);
  assert.doesNotMatch(serialized, /asac/);
  assert.doesNotMatch(serialized, /buyExParams/);
  assert.doesNotMatch(serialized, /mi_id/);
  assert.doesNotMatch(serialized, /encryptUid/);
  assert.doesNotMatch(serialized, /rateVO/);
  assert.doesNotMatch(serialized, /itemEndorseVO/);
  assert.doesNotMatch(serialized, /tabVO/);
  assert.doesNotMatch(serialized, /用户评价/);
  assert.equal(Object.prototype.hasOwnProperty.call(sanitized as Record<string, unknown>, 'services'), false);
});

test('normalizes collected product URLs and removes recommendation tracking params', () => {
  const snapshot = buildTaobaoProductSnapshotFromPageModel({
    pageModel,
    url: 'https://item.taobao.com/item.htm?id=1010211244888&mi_id=sensitive&pvid=abc&skuId=sku-white-1m&spm=a&utparam=%7B%22userId%22%3A1%7D',
    detailContent: { text: '', images: [], source: 'none' },
    collectedAt: 1700000000000,
  });

  assert.equal(snapshot.identity.url, 'https://item.taobao.com/item.htm?id=1010211244888&skuId=sku-white-1m');
});

test('ignores Taobao category name text and keeps only the category id from page model', () => {
  const snapshot = buildTaobaoProductSnapshotFromPageModel({
    pageModel: {
      item: {
        itemId: '860484438535',
        title: '测试商品',
        categoryId: '50013886',
        categoryName: '进店',
      },
      componentsVO: {
        categoryVO: {
          name: '进店',
          path: ['店铺', '进店'],
        },
      },
    },
    url: 'https://item.taobao.com/item.htm?id=860484438535',
    detailImages: [],
    collectedAt: 1700000000000,
  });

  assert.deepEqual(snapshot.category.source, {
    id: '50013886',
  });
});

test('reads Taobao category aliases from page model when official field names vary', () => {
  const snapshot = buildTaobaoProductSnapshotFromPageModel({
    pageModel: {
      item: {
        itemId: '860484438535',
        title: '测试商品',
        leafCatId: '123456',
        leafCatName: '工业内窥镜',
        catPaths: ['工业品', '仪器仪表', '工业内窥镜'],
      },
    },
    url: 'https://item.taobao.com/item.htm?id=860484438535',
    detailImages: [],
    collectedAt: 1700000000000,
  });

  assert.deepEqual(snapshot.category.source, {
    id: '123456',
  });
});

test('reads Taobao 2025 detail category id from log params when category name is absent', () => {
  const snapshot = buildTaobaoProductSnapshotFromPageModel({
    pageModel: {
      item: {
        itemId: '860484438535',
        title: '测试商品',
      },
      plusViewVO: {
        leftButtonStyleVO: {
          logParams: {
            catId: '50013886',
          },
        },
      },
      pcTrade: {
        pcBuyParams: {
          rootCatId: '50013886',
        },
      },
    },
    url: 'https://item.taobao.com/item.htm?id=860484438535',
    detailImages: [],
    collectedAt: 1700000000000,
  });

  assert.deepEqual(snapshot.category.source, {
    id: '50013886',
  });
});

test('normalizes Taobao cropped image urls before rendering previews', () => {
  const croppedMainUrl = 'https://img.alicdn.com/imgextra/i3/2208240310997/O1CN013kFxXl1JEfb4wWNBH~crop,200,0,600,800~_!!2208240310997.jpg';
  const snapshot = buildTaobaoProductSnapshotFromPageModel({
    pageModel: {
      ...pageModel,
      item: {
        ...pageModel.item,
        images: [
          croppedMainUrl,
          'https://img.alicdn.com/imgextra/i1/221/O1CN.jpg_120x120q90.jpg',
        ],
      },
    },
    url: 'https://item.taobao.com/item.htm?id=1010211244888',
    collectedAt: 1700000000000,
  });

  assert.deepEqual(snapshot.images.main, [
    'https://img.alicdn.com/imgextra/i3/2208240310997/O1CN013kFxXl1JEfb4wWNBH_!!2208240310997.jpg',
    'https://img.alicdn.com/imgextra/i1/221/O1CN.jpg',
  ]);
  assert.equal(snapshot.images.assets[0].url, croppedMainUrl);
  assert.equal(
    snapshot.images.assets[0].normalizedUrl,
    'https://img.alicdn.com/imgextra/i3/2208240310997/O1CN013kFxXl1JEfb4wWNBH_!!2208240310997.jpg',
  );
});

test('filters non-product detail images and keeps valid Taobao detail filenames', () => {
  const croppedDetailUrl = 'https://img.alicdn.com/imgextra/i4/2208240310997/O1CN01validDetail~crop,0,0,750,1000~_!!2208240310997.jpg';
  const snapshot = buildTaobaoProductSnapshotFromPageModel({
    pageModel,
    url: 'https://item.taobao.com/item.htm?id=1010211244888',
    detailContent: {
      text: '',
      source: 'detailDom',
      images: [
        {
          url: 'https://gw.alicdn.com/imgextra/i2/O1CN010DB1Un24kXOjdGhG3_!!6000000007429-0-tps-84-82.jpg',
          normalizedUrl: 'https://gw.alicdn.com/imgextra/i2/O1CN010DB1Un24kXOjdGhG3_!!6000000007429-0-tps-84-82.jpg',
          role: 'detail',
          source: 'detailDom',
          naturalWidth: 84,
          naturalHeight: 82,
          flags: [],
        },
        {
          url: 'https://img.alicdn.com/imgextra/i3/O1CN01XU1Y2d1Sk7fIMOkeU_!!6000000002284-2-tps-1125-1446.png',
          normalizedUrl: 'https://img.alicdn.com/imgextra/i3/O1CN01XU1Y2d1Sk7fIMOkeU_!!6000000002284-2-tps-1125-1446.png',
          role: 'detail',
          source: 'detailDom',
          naturalWidth: 1125,
          naturalHeight: 1446,
          flags: ['platformPriceDescription'],
        },
        {
          url: 'https://img.alicdn.com/imgextra/i2/O1CN012pqGiT1gp4XhKkkRs_!!6000000004190-2-tps-96-96.png',
          normalizedUrl: 'https://img.alicdn.com/imgextra/i2/O1CN012pqGiT1gp4XhKkkRs_!!6000000004190-2-tps-96-96.png',
          role: 'detail',
          source: 'detailDom',
          flags: [],
        },
        {
          url: croppedDetailUrl,
          normalizedUrl: 'https://img.alicdn.com/imgextra/i4/2208240310997/O1CN01validDetail',
          role: 'detail',
          source: 'detailDom',
          naturalWidth: 750,
          naturalHeight: 1000,
          flags: [],
        },
      ],
    },
    collectedAt: 1700000000000,
  });

  assert.deepEqual(snapshot.images.detail, [
    'https://img.alicdn.com/imgextra/i4/2208240310997/O1CN01validDetail_!!2208240310997.jpg',
  ]);
  assert.equal(snapshot.images.assets.some(asset => asset.normalizedUrl.includes('tps-84-82')), false);
  assert.equal(snapshot.images.assets.some(asset => asset.normalizedUrl.includes('6000000002284-2-tps')), false);
  assert.equal(snapshot.images.assets.some(asset => asset.normalizedUrl.includes('6000000004190-2-tps')), false);
});

test('filters Taobao platform TPS assets from document fallback detail images', () => {
  const snapshot = buildTaobaoProductSnapshotFromPageModel({
    pageModel,
    url: 'https://item.taobao.com/item.htm?id=1010211244888',
    detailImages: [
      'https://img.alicdn.com/imgextra/i2/2200619642876/O1CN01A3eq5W1X7GDS9za2L_!!2200619642876.png',
      'https://img.alicdn.com/imgextra/i2/O1CN012pqGiT1gp4XhKkkRs_!!6000000004190-2-tps-96-96.png',
    ],
    collectedAt: 1700000000000,
  });

  assert.deepEqual(snapshot.images.detail, [
    'https://img.alicdn.com/imgextra/i2/2200619642876/O1CN01A3eq5W1X7GDS9za2L_!!2200619642876.png',
  ]);
  assert.equal(snapshot.images.assets.some(asset => asset.normalizedUrl.includes('6000000004190-2-tps')), false);
});

test('falls back to DOM snapshot when page-world collection times out', async () => {
  const fallback = buildTaobaoProductSnapshotFromPageModel({
    pageModel,
    url: 'https://item.taobao.com/item.htm?id=1010211244888',
    detailContent: { text: '', images: [], source: 'none' },
    collectedAt: 1700000000000,
  });

  const snapshot = await collectTaobaoProductSnapshotFromSources(
    fallback,
    async () => {
      throw new Error('读取淘宝商品页面模型超时');
    },
  );

  assert.equal(snapshot.identity.itemId, fallback.identity.itemId);
  assert.equal(snapshot.title, fallback.title);
});

test('does not merge document fallback image assets when page model assets are complete', async () => {
  const fallback = buildTaobaoProductSnapshotFromPageModel({
    pageModel,
    url: 'https://item.taobao.com/item.htm?id=1010211244888',
    detailContent: { text: '', images: [], source: 'none' },
    collectedAt: 1700000000000,
  });
  fallback.images.assets = [{
    url: 'https://img.alicdn.com/decorative-icon.png',
    normalizedUrl: 'https://img.alicdn.com/decorative-icon.png',
    role: 'fallback',
    source: 'documentDom',
    flags: [],
  }];

  const snapshot = await collectTaobaoProductSnapshotFromSources(
    fallback,
    async () => ({
      pageModel,
      detailContent: {
        text: '',
        source: 'detailDom',
        images: [{
          url: '//img.alicdn.com/detail-1.jpg',
          normalizedUrl: 'https://img.alicdn.com/detail-1.jpg',
          role: 'detail',
          source: 'detailDom',
          flags: [],
        }],
      },
    }),
  );

  assert.equal(snapshot.images.assets.some(asset => asset.source === 'documentDom'), false);
  assert.equal(snapshot.images.assets.some(asset => asset.normalizedUrl.includes('decorative-icon')), false);
});

test('filters Taobao platform fallback assets during page-world fallback merge', async () => {
  const fallback = buildTaobaoProductSnapshotFromPageModel({
    pageModel,
    url: 'https://item.taobao.com/item.htm?id=1010211244888',
    detailContent: { text: '', images: [], source: 'none' },
    collectedAt: 1700000000000,
  });
  fallback.images.assets = [
    {
      url: 'https://img.alicdn.com/imgextra/i2/2200619642876/O1CN01A3eq5W1X7GDS9za2L_!!2200619642876.png',
      normalizedUrl: 'https://img.alicdn.com/imgextra/i2/2200619642876/O1CN01A3eq5W1X7GDS9za2L_!!2200619642876.png',
      role: 'fallback',
      source: 'documentDom',
      flags: [],
    },
    {
      url: 'https://img.alicdn.com/imgextra/i2/O1CN012pqGiT1gp4XhKkkRs_!!6000000004190-2-tps-96-96.png',
      normalizedUrl: 'https://img.alicdn.com/imgextra/i2/O1CN012pqGiT1gp4XhKkkRs_!!6000000004190-2-tps-96-96.png',
      role: 'fallback',
      source: 'documentDom',
      flags: [],
    },
  ];

  const snapshot = await collectTaobaoProductSnapshotFromSources(
    fallback,
    async () => ({
      pageModel,
      detailContent: { text: '', source: 'none', images: [] },
    }),
  );

  assert.equal(snapshot.images.assets.some(asset => asset.normalizedUrl.includes('2200619642876')), true);
  assert.equal(snapshot.images.assets.some(asset => asset.normalizedUrl.includes('6000000004190-2-tps')), false);
});
