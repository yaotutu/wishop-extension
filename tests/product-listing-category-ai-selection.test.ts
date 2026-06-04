import assert from 'node:assert/strict';
import test from 'node:test';
import { selectWxCategoryWithTwoStageAi } from '../src/background/services/product-listing-category-ai-selection.ts';
import type { SiliconFlowJsonCompletionInput } from '../src/background/ai/siliconflow-client.ts';
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

function chargerCategory() {
  return {
    catIds: ['10000099', '10000102', '1962'],
    names: ['手机通讯', '手机配件', '充电器'],
    path: '手机通讯 / 手机配件 / 充电器',
    leaf: true as const,
  };
}

test('selects WeChat category with two SiliconFlow rounds after local full-category retrieval', async () => {
  const listing = sampleCollectedProductListing({
    title: '适用kindle充电传输数据线paperwhite电子书配件',
  });
  const target = dataCableCategory();
  const secondCandidate = chargerCategory();
  const categoryPaths = [
    ...Array.from({ length: 260 }, (_item, index) => fillerCategory(index)),
    target,
    secondCandidate,
  ];
  const calls: SiliconFlowJsonCompletionInput[] = [];

  const selection = await selectWxCategoryWithTwoStageAi({
    listingId: listing.id,
    listing,
    categoryPaths,
    apiKey: 'sk-test',
    model: 'Qwen/QwQ-32B',
    completeJson: async input => {
      calls.push(input);
      if (calls.length === 1) {
        return {
          candidateCatIds: [target.catIds, secondCandidate.catIds],
          reason: '先保留数据线和充电器两个相近候选',
          warnings: [],
        };
      }
      return {
        catIds: target.catIds,
        categoryPath: target.names,
        attrs: [],
        confidence: 0.89,
        reason: '标题包含数据线，最终匹配手机配件数据线',
        warnings: [],
      };
    },
  });

  assert.equal(calls.length, 2);
  const firstPayload = JSON.parse(calls[0].messages[1].content) as {
    wechatCategoryCandidates: Array<{ catIds: string[]; path: string }>;
  };
  const secondPayload = JSON.parse(calls[1].messages[1].content) as {
    wechatCategoryCandidates: Array<{ catIds: string[]; path: string }>;
  };
  assert.equal(firstPayload.wechatCategoryCandidates.length <= 240, true);
  assert.equal(firstPayload.wechatCategoryCandidates.some(candidate => candidate.path === target.path), true);
  assert.equal(secondPayload.wechatCategoryCandidates.length, 2);
  assert.deepEqual(selection.result.catIds, target.catIds);
  assert.equal(selection.localCandidateCount <= 240, true);
  assert.equal(selection.aiScreenedCandidateCount, 2);
  assert.equal(selection.result.categoryLookup?.warnings.some(warning => warning.includes('AI 第一轮筛选')), true);
});
