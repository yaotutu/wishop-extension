import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichTaobaoProductSnapshotWithItemcatLookup } from '../src/background/services/taobao-itemcat-lookup.ts';
import type { TaobaoProductSnapshot } from '../src/shared/types.ts';

function listingSnapshot(sourceCategory: TaobaoProductSnapshot['sourceCategory']): TaobaoProductSnapshot {
  return {
    url: 'https://item.taobao.com/item.htm?id=860484438535',
    platform: 'taobao',
    itemId: '860484438535',
    title: '瑞士科技多功能迷你龟背钳9合1折叠口袋钳子螺丝刀EDC工具钳组合',
    shopName: '天生玩家 EDCgear',
    sourceCategory,
    seller: { shopName: '天生玩家 EDCgear', sellerId: '2200620807206', shopId: '439146235' },
    priceRangeText: '22.99',
    mainImages: [],
    detailImages: [],
    productParams: [],
    skuGroups: [],
    skuMatrix: [],
    salesText: '1000+',
    deliveryText: '预计明天发货',
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

  assert.deepEqual(snapshot.sourceCategory, {
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

  assert.deepEqual(snapshot.sourceCategory, { id: 'missing' });
});
