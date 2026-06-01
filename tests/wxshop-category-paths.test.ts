import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeWxCategoryPaths } from '../src/background/wxshop/listing/category-paths.ts';

test('normalizes nested WeChat category trees into leaf category paths', () => {
  const paths = normalizeWxCategoryPaths([
    {
      cat_id: '100',
      name: '数码',
      children: [
        {
          cat_id: '110',
          name: '电子书配件',
          children: [
            { cat_id: '111', name: '数据线', leaf: true },
          ],
        },
      ],
    },
  ]);

  assert.deepEqual(paths, [
    {
      catIds: ['100', '110', '111'],
      names: ['数码', '电子书配件', '数据线'],
      leaf: true,
      qualificationTips: [],
    },
  ]);
});

test('normalizes flat WeChat category lists into leaf category paths', () => {
  const paths = normalizeWxCategoryPaths([
    { cat_id: '100', name: '数码', f_cat_id: '0', leaf: false },
    { cat_id: '110', name: '电子书配件', f_cat_id: '100', leaf: false },
    { cat_id: '111', name: '数据线', f_cat_id: '110', leaf: true },
  ]);

  assert.deepEqual(paths, [
    {
      catIds: ['100', '110', '111'],
      names: ['数码', '电子书配件', '数据线'],
      leaf: true,
      qualificationTips: [],
    },
  ]);
});
