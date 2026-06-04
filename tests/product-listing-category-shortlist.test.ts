import assert from 'node:assert/strict';
import test from 'node:test';
import { shortlistCategoryPaths } from '../src/background/services/product-listing-category-shortlist.ts';
import { sampleCollectedProductListing } from './product-listing-fixtures.ts';

function fillerCategory(index: number) {
  return {
    catIds: ['10000000', String(10000000 + index), String(20000000 + index)],
    names: ['家居生活', `普通类目${index}`, `普通叶子${index}`],
    path: `家居生活 / 普通类目${index} / 普通叶子${index}`,
    leaf: true as const,
  };
}

function dataCableCategory() {
  return {
    catIds: ['10000099', '10000102', '1961'],
    names: ['手机通讯', '手机配件', '数据线'],
    path: '手机通讯 / 手机配件 / 数据线',
    leaf: true as const,
  };
}

test('shortlists full WeChat categories before calling AI', () => {
  const listing = sampleCollectedProductListing({
    title: '适用kindle充电传输数据线paperwhite电子书配件',
  });
  const categoryPaths = [
    ...Array.from({ length: 200 }, (_item, index) => fillerCategory(index)),
    dataCableCategory(),
  ];

  const shortlisted = shortlistCategoryPaths(listing, categoryPaths);

  assert.equal(shortlisted.length <= 120, true);
  assert.equal(shortlisted.some(candidate => candidate.path === '手机通讯 / 手机配件 / 数据线'), true);
});
