import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchAllTaobaoItemcats,
  normalizeTaobaoItemCat,
  parseTaobaoItemcatsResponse,
  signTopRequestMd5,
} from '../scripts/fetch-taobao-itemcats.ts';

test('signs Taobao TOP requests with sorted MD5 parameters', () => {
  const sign = signTopRequestMd5({
    method: 'taobao.itemcats.get',
    app_key: 'app',
    timestamp: '2026-06-01 12:00:00',
    format: 'json',
    v: '2.0',
    sign_method: 'md5',
    session: 'sess',
    fields: 'cid,parent_cid,name,is_parent,status,sort_order',
    parent_cid: '0',
  }, 'secret');

  assert.equal(sign, 'D188A07D7CBD2F9366B9CABBA475069A');
});

test('parses itemcats.get responses and normalizes category fields', () => {
  const categories = parseTaobaoItemcatsResponse({
    itemcats_get_response: {
      item_cats: {
        item_cat: [
          {
            cid: 5001,
            parent_cid: 0,
            name: '数码',
            is_parent: true,
            status: 'normal',
            sort_order: '12',
          },
        ],
      },
    },
  });

  assert.deepEqual(categories.map(normalizeTaobaoItemCat), [
    {
      cid: '5001',
      parentCid: '0',
      name: '数码',
      isParent: true,
      status: 'normal',
      sortOrder: 12,
    },
  ]);
});

test('fetches all Taobao item categories with BFS paths', async () => {
  const requestedParents: string[] = [];
  const result = await fetchAllTaobaoItemcats(async parentCid => {
    requestedParents.push(parentCid);
    if (parentCid === '0') {
      return [
        { cid: '100', parent_cid: '0', name: '数码', is_parent: true },
        { cid: '200', parent_cid: '0', name: '服饰', is_parent: false },
      ];
    }
    if (parentCid === '100') {
      return [
        { cid: '110', parent_cid: '100', name: '电子书配件', is_parent: false },
      ];
    }
    return [];
  });

  assert.deepEqual(requestedParents, ['0', '100']);
  assert.deepEqual(result, [
    {
      cid: '100',
      parentCid: '0',
      name: '数码',
      isParent: true,
      level: 1,
      path: ['数码'],
    },
    {
      cid: '200',
      parentCid: '0',
      name: '服饰',
      isParent: false,
      level: 1,
      path: ['服饰'],
    },
    {
      cid: '110',
      parentCid: '100',
      name: '电子书配件',
      isParent: false,
      level: 2,
      path: ['数码', '电子书配件'],
    },
  ]);
});
