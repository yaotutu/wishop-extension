import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichTaobaoProductSnapshotWithItemcatLookup } from '../src/background/services/taobao-itemcat-lookup.ts';
import type { TaobaoProductSnapshot, TaobaoProductSourceCategorySnapshot } from '../src/shared/types.ts';

function listingSnapshot(sourceCategory: TaobaoProductSourceCategorySnapshot): TaobaoProductSnapshot {
  return {
    identity: {
      url: 'https://item.taobao.com/item.htm?id=860484438535',
      platform: 'taobao',
      itemId: '860484438535',
    },
    title: '瑞士科技多功能迷你龟背钳9合1折叠口袋钳子螺丝刀EDC工具钳组合',
    shop: { name: '天生玩家 EDCgear' },
    category: { source: sourceCategory },
    seller: { shopName: '天生玩家 EDCgear', sellerId: '2200620807206', shopId: '439146235' },
    price: { rangeText: '22.99' },
    images: { main: [], detail: [], assets: [] },
    detail: { text: '', source: 'none', images: [] },
    params: [],
    sku: { groups: [], properties: [], matrix: [] },
    sales: { text: '1000+' },
    delivery: { text: '预计明天发货' },
    diagnostics: { usedPageModel: true, usedDocumentFallback: false, sources: {}, warnings: [] },
    collectedAt: 1700000000000,
  };
}

test('enriches collected Taobao category id with itemcats Chinese category name', () => {
  const snapshot = enrichTaobaoProductSnapshotWithItemcatLookup(listingSnapshot({ id: '50013886' }), {
    source: 'fixture',
    updatedAt: '2020-07-27',
    byId: {
      50013886: {
        name: '户外/登山/野营/旅行用品',
        path: ['户外/登山/野营/旅行用品'],
        parentId: '0',
        isParent: true,
      },
    },
  });

  assert.deepEqual(snapshot.category.source, {
    id: '50013886',
    name: '户外/登山/野营/旅行用品',
    path: ['户外/登山/野营/旅行用品'],
  });
});

test('keeps category id when itemcats lookup has no matching Chinese name', () => {
  const snapshot = enrichTaobaoProductSnapshotWithItemcatLookup(listingSnapshot({ id: 'missing' }), {
    source: 'fixture',
    updatedAt: '2020-07-27',
    byId: {},
  });

  assert.deepEqual(snapshot.category.source, { id: 'missing' });
});
