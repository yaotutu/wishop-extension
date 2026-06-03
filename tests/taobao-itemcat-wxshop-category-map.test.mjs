import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTaobaoItemcatWxshopCategoryMap } from '../scripts/build-taobao-itemcat-wxshop-category-map.mjs';

test('builds WeChat category candidates keyed by Taobao itemcat id', () => {
  const taobaoSnapshot = {
    byId: {
      50024407: {
        name: '电子书配件',
        path: ['数码', '电子教育', '电子书配件'],
        parentId: '50024400',
        isParent: false,
      },
    },
  };
  const wxSnapshot = {
    paths: [
      {
        catIds: ['10000104', '10000108', '6012'],
        names: ['数码', '电子教育', '电子书配件'],
        leaf: true,
      },
      {
        catIds: ['10000215', '10000216', '9001'],
        names: ['食品饮料', '休闲食品', '饼干'],
        leaf: true,
      },
    ],
  };

  const { mappingRows } = buildTaobaoItemcatWxshopCategoryMap(taobaoSnapshot, wxSnapshot);

  assert.equal(mappingRows.length, 1);
  assert.equal(mappingRows[0].taobaoCatId, '50024407');
  assert.deepEqual(mappingRows[0].taobaoNames, ['数码', '电子教育', '电子书配件']);
  assert.deepEqual(mappingRows[0].bestWxCatIds, ['10000104', '10000108', '6012']);
  assert.equal(mappingRows[0].matchStatus, 'high');
});
