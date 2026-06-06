import type { ProductCopyRecord } from '../src/shared/types.ts';

export function sampleProductCopyRecord(patch: Partial<ProductCopyRecord> = {}): ProductCopyRecord {
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
    category: {
      source: {
        id: '50024407',
        name: '电子书配件',
        path: ['数码', '电子教育', '电子书配件'],
      },
    },
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
    detail: {
      text: '',
      source: 'detailDom',
      images: [
        'https://img.alicdn.com/detail-1.jpg',
        'https://img.alicdn.com/detail-2.jpg',
      ],
    },
    params: [
      { name: '品牌', value: '灿冕', group: 'basic' },
      { name: '型号', value: 'KPW-1', group: 'basic' },
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
    rawModel: undefined,
    diagnostics: {
      usedPageModel: true,
      usedDocumentFallback: false,
      sources: {},
      warnings: [],
    },
    missingFields: [],
    collectedAt: 1700000000000,
    updatedAt: 1700000000000,
    ...patch,
  };
}
