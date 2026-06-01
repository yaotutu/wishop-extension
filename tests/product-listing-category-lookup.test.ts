import assert from 'node:assert/strict';
import test from 'node:test';
import type { TaobaoWxCategoryLookupData } from '../src/background/services/product-listing-category-lookup.ts';
import { resolveTaobaoWxCategoryLookup } from '../src/background/services/product-listing-category-lookup.ts';

const lookupData: TaobaoWxCategoryLookupData = {
  schemaVersion: 1,
  indexes: {
    normalizedPath: {
      '数码/电子教育/电子书配件': '数码 / 电子教育 / 电子书配件',
      '电子教育/电子书配件': '数码 / 电子教育 / 电子书配件',
      '数码/电子教育': '数码 / 电子教育',
      '数码': '数码',
    },
  },
  byTaobaoPath: {
    '数码 / 电子教育 / 电子书配件': {
      taobao: {
        names: ['数码', '电子教育', '电子书配件'],
        path: '数码 / 电子教育 / 电子书配件',
        level: 3,
      },
      wxLeafCandidates: [
        {
          catIds: ['10000104', '10000108', '6012'],
          names: ['数码', '电子教育', '电子书配件'],
          path: '数码 / 电子教育 / 电子书配件',
          confidence: 0.91,
          status: 'high',
          reason: '淘宝完整路径命中微信同名叶子类目',
        },
        {
          catIds: ['10000104', '10000108', '6013'],
          names: ['数码', '电子教育', '电子书阅读器'],
          path: '数码 / 电子教育 / 电子书阅读器',
          confidence: 0.62,
          status: 'review',
          reason: '同属电子教育，需要 AI 根据标题确认',
        },
      ],
    },
    '数码 / 电子教育': {
      taobao: {
        names: ['数码', '电子教育'],
        path: '数码 / 电子教育',
        level: 2,
      },
      wxLeafCandidates: [
        {
          catIds: ['10000104', '10000110', '6031'],
          names: ['数码', '电子教育', '电纸书'],
          path: '数码 / 电子教育 / 电纸书',
          confidence: 0.39,
          status: 'low',
          reason: '二级父类命中，交给 AI 在电子教育下选择',
        },
      ],
    },
    '数码': {
      taobao: {
        names: ['数码'],
        path: '数码',
        level: 1,
      },
      wxLeafCandidates: [
        {
          catIds: ['10000104', '10000109', '6019'],
          names: ['数码', '智能设备', '智能手表'],
          path: '数码 / 智能设备 / 智能手表',
          confidence: 0.42,
          status: 'low',
          reason: '一级父类命中，交给 AI 在数码下选择',
        },
      ],
    },
  },
};

test('resolves local WeChat category candidates from a collected Taobao category path', () => {
  const result = resolveTaobaoWxCategoryLookup({
    id: '50024407',
    name: '电子书配件',
    path: ['数码', '电子教育', '电子书配件'],
  }, lookupData);

  assert.equal(result.status, 'matched');
  assert.equal(result.matchedTaobaoPath, '数码 / 电子教育 / 电子书配件');
  assert.equal(result.matchDepth, 3);
  assert.equal(result.sourceDepth, 3);
  assert.equal(result.candidateScope, 'exact');
  assert.deepEqual(result.candidates.map(candidate => candidate.catIds), [
    ['10000104', '10000108', '6012'],
    ['10000104', '10000108', '6013'],
  ]);
  assert.deepEqual(result.candidates[0], {
    catIds: ['10000104', '10000108', '6012'],
    names: ['数码', '电子教育', '电子书配件'],
    leaf: true,
    confidence: 0.91,
    status: 'high',
    reason: '淘宝完整路径命中微信同名叶子类目',
    source: 'taobaoWxLookup',
  });
});

test('falls back to the matched Taobao level-2 parent when the collected level-3 path is absent', () => {
  const data: TaobaoWxCategoryLookupData = {
    schemaVersion: 1,
    indexes: {
      normalizedPath: {
        '数码/电子教育': '数码 / 电子教育',
        '数码': '数码',
      },
    },
    byTaobaoPath: {
      '数码 / 电子教育': lookupData.byTaobaoPath!['数码 / 电子教育'],
      '数码': lookupData.byTaobaoPath!['数码'],
    },
  };

  const result = resolveTaobaoWxCategoryLookup({
    name: '电子书配件',
    path: ['数码', '电子教育', '电子书配件'],
  }, data);

  assert.equal(result.status, 'matched');
  assert.equal(result.matchedTaobaoPath, '数码 / 电子教育');
  assert.equal(result.matchDepth, 2);
  assert.equal(result.sourceDepth, 3);
  assert.equal(result.candidateScope, 'level2Children');
  assert.deepEqual(result.candidates.map(candidate => candidate.catIds), [
    ['10000104', '10000110', '6031'],
  ]);
  assert.deepEqual(result.warnings, ['本地类目 lookup 未命中完整淘宝路径，已使用 2 级父类召回微信候选']);
});

test('falls back to the matched Taobao level-1 parent when level-2 also misses', () => {
  const data: TaobaoWxCategoryLookupData = {
    schemaVersion: 1,
    indexes: {
      normalizedPath: {
        '数码': '数码',
      },
    },
    byTaobaoPath: {
      '数码': lookupData.byTaobaoPath!['数码'],
    },
  };

  const result = resolveTaobaoWxCategoryLookup({
    name: '未知电子配件',
    path: ['数码', '未知二级', '未知电子配件'],
  }, data);

  assert.equal(result.status, 'matched');
  assert.equal(result.matchedTaobaoPath, '数码');
  assert.equal(result.matchDepth, 1);
  assert.equal(result.sourceDepth, 3);
  assert.equal(result.candidateScope, 'level1Children');
  assert.deepEqual(result.candidates.map(candidate => candidate.catIds), [
    ['10000104', '10000109', '6019'],
  ]);
});

test('falls back to the longest normalized Taobao category suffix when the page path has extra wrappers', () => {
  const result = resolveTaobaoWxCategoryLookup({
    name: '电子书配件',
    path: ['淘宝首页', '数码', '电子教育', '电子书配件'],
  }, lookupData);

  assert.equal(result.status, 'matched');
  assert.equal(result.matchedTaobaoPath, '数码 / 电子教育 / 电子书配件');
  assert.equal(result.matchDepth, 3);
  assert.deepEqual(result.warnings, ['淘宝原类目包含额外层级，已使用最长可匹配后缀']);
});

test('returns a not-found status when local lookup cannot match the collected category', () => {
  const result = resolveTaobaoWxCategoryLookup({
    name: '不存在的淘宝类目',
    path: ['不存在的淘宝类目'],
  }, lookupData);

  assert.equal(result.status, 'not_found');
  assert.deepEqual(result.candidates, []);
});
