import assert from 'node:assert/strict';
import test from 'node:test';
import type { AiListingSettings } from '../src/shared/settings.ts';
import type { CollectedProductListing } from '../src/shared/types.ts';
import {
  createWxProductDraftSuggestion,
  normalizeWxProductDraftSuggestionPayload,
} from '../src/background/services/product-listing-ai-draft-service.ts';

function sampleListing(): CollectedProductListing {
  return {
    id: 'taobao:1010211244888',
    platform: 'taobao',
    sourceUrl: 'https://item.taobao.com/item.htm?id=1010211244888',
    itemId: '1010211244888',
    title: '适用kindle充电传输数据线paperwhite电子书配件',
    shopName: '百鸿胜数码电器',
    sourceCategory: {
      id: '50024407',
      name: '电子书配件',
      path: ['数码', '电子教育', '电子书配件'],
    },
    seller: {
      shopName: '百鸿胜数码电器',
      sellerId: 'seller-1',
      shopId: 'shop-1',
    },
    priceRangeText: '3.12起',
    mainImages: [
      'https://img.alicdn.com/main-1.jpg',
      'https://img.alicdn.com/main-2.jpg',
      'https://img.alicdn.com/main-3.jpg',
    ],
    detailImages: ['https://img.alicdn.com/detail-1.jpg'],
    productParams: [
      { name: '品牌', value: '灿冕', group: 'basic' },
      { name: '型号', value: 'KPW-1', group: 'basic' },
    ],
    skuGroups: [{ name: '颜色分类', values: ['白色', '黑色'] }],
    skuMatrix: [],
    salesText: '已售 14',
    deliveryText: '预计明天发货',
    missingFields: [],
    collectedAt: 1700000000000,
    updatedAt: 1700000000000,
  };
}

function aiSettings(patch: Partial<AiListingSettings> = {}): AiListingSettings {
  return {
    siliconFlowApiKey: 'sk-local-secret',
    siliconFlowModel: 'Qwen/QwQ-32B',
    defaultExpressTemplateId: '47428464001',
    ...patch,
  };
}

test('normalizes AI draft suggestion payload from either camelCase or WeChat-style attr keys', () => {
  const suggestion = normalizeWxProductDraftSuggestionPayload({
    catIds: [' 10000111 ', '10000113', '6091', ''],
    attrs: [
      { attrKey: ' 型号 ', attrValue: ' KPW-1 ' },
      { attr_key: '适用品牌', attr_value: 'Kindle' },
      { attrKey: '', attrValue: 'ignored' },
    ],
    confidence: 1.4,
    reason: '  参数来自淘宝标题和商品参数  ',
    warnings: ['  需要人工确认类目资质  ', ''],
  }, {
    listingId: 'taobao:1010211244888',
    fallbackCatIds: ['fallback'],
  });

  assert.deepEqual(suggestion.catIds, ['10000111', '10000113', '6091']);
  assert.deepEqual(suggestion.attrs, [
    { attrKey: '型号', attrValue: 'KPW-1' },
    { attrKey: '适用品牌', attrValue: 'Kindle' },
  ]);
  assert.equal(suggestion.confidence, 1);
  assert.equal(suggestion.reason, '参数来自淘宝标题和商品参数');
  assert.deepEqual(suggestion.warnings, ['需要人工确认类目资质']);
});

test('creates an AI draft suggestion from a collected product without exposing the SiliconFlow key', async () => {
  const prompts: string[] = [];
  const suggestion = await createWxProductDraftSuggestion({
    listingId: 'taobao:1010211244888',
    wxCatIds: ['10000111', '10000113', '6091'],
  }, {
    getSettings: async () => ({ shipmentCheck: {} as never, aiListing: aiSettings() }),
    getListing: async () => sampleListing(),
    completeJson: async ({ messages }) => {
      prompts.push(messages.map(message => message.content).join('\n'));
      return {
        catIds: ['10000111', '10000113', '6091'],
        attrs: [{ attrKey: '型号', attrValue: 'KPW-1' }],
        confidence: 0.74,
        reason: '按目标类目保留型号参数',
        warnings: [],
      };
    },
  });

  assert.equal(suggestion.expressTemplateId, '47428464001');
  assert.deepEqual(suggestion.attrs, [{ attrKey: '型号', attrValue: 'KPW-1' }]);
  assert.equal(suggestion.confidence, 0.74);
  assert.match(prompts[0], /"sourceCategory"/);
  assert.match(prompts[0], /电子教育/);
  assert.ok(prompts[0].includes('电子书配件'));
  assert.doesNotMatch(prompts[0], /sourceCategoryId/);
  assert.ok(prompts[0].includes('6091'));
  assert.doesNotMatch(prompts[0], /sk-local-secret/);
});

test('creates an AI draft suggestion by letting the model choose from WeChat category candidates', async () => {
  const prompts: string[] = [];
  const suggestion = await createWxProductDraftSuggestion({
    accountId: 'account-1',
    listingId: 'taobao:1010211244888',
  }, {
    getSettings: async () => ({ shipmentCheck: {} as never, aiListing: aiSettings() }),
    getListing: async () => sampleListing(),
    getCategoryLookup: async () => ({ schemaVersion: 1, indexes: { normalizedPath: {} }, byTaobaoPath: {} }),
    getCategoryPaths: async () => [
      {
        catIds: ['10000111', '10000113', '6091'],
        names: ['数码', '电子书配件', '数据线'],
        leaf: true,
      },
      {
        catIds: ['20000111', '20000113', '9001'],
        names: ['食品', '零食', '饼干'],
        leaf: true,
      },
    ],
    completeJson: async ({ messages }) => {
      prompts.push(messages.map(message => message.content).join('\n'));
      return {
        catIds: ['10000111', '10000113', '6091'],
        attrs: [{ attrKey: '型号', attrValue: 'KPW-1' }],
        confidence: 0.86,
        reason: '从微信候选类目中选择电子书配件数据线',
        warnings: [],
      };
    },
  });

  assert.deepEqual(suggestion.catIds, ['10000111', '10000113', '6091']);
  assert.deepEqual(suggestion.categoryPath, ['数码', '电子书配件', '数据线']);
  assert.match(prompts[0], /微信候选类目/);
  assert.match(prompts[0], /电子书配件/);
  assert.doesNotMatch(prompts[0], /sk-local-secret/);
});

test('uses local Taobao-to-WeChat lookup candidates before falling back to the full WeChat category list', async () => {
  const prompts: string[] = [];
  let fullCategoryApiCalled = false;
  const suggestion = await createWxProductDraftSuggestion({
    accountId: 'account-1',
    listingId: 'taobao:1010211244888',
  }, {
    getSettings: async () => ({ shipmentCheck: {} as never, aiListing: aiSettings() }),
    getListing: async () => sampleListing(),
    getCategoryLookup: async () => ({
      schemaVersion: 1,
      indexes: {
        normalizedPath: {
          '数码/电子教育/电子书配件': '数码 / 电子教育 / 电子书配件',
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
              reason: '本地 lookup 命中淘宝完整类目路径',
            },
          ],
        },
      },
    }),
    getCategoryPaths: async () => {
      fullCategoryApiCalled = true;
      return [];
    },
    completeJson: async ({ messages }) => {
      prompts.push(messages.map(message => message.content).join('\n'));
      return {
        catIds: ['10000104', '10000108', '6012'],
        attrs: [{ attrKey: '型号', attrValue: 'KPW-1' }],
        confidence: 0.91,
        reason: '从本地 lookup 候选中选择同名类目',
        warnings: [],
      };
    },
  });

  assert.equal(fullCategoryApiCalled, false);
  assert.deepEqual(suggestion.catIds, ['10000104', '10000108', '6012']);
  assert.equal(suggestion.categoryCandidateSource, 'taobaoWxLookup');
  assert.equal(suggestion.categoryCandidates?.length, 1);
  assert.match(prompts[0], /本地 lookup 命中淘宝完整类目路径/);
  assert.doesNotMatch(prompts[0], /食品/);
});

test('uses the matched Taobao parent category candidates when the full source category path is absent', async () => {
  const prompts: string[] = [];
  let fullCategoryApiCalled = false;
  const suggestion = await createWxProductDraftSuggestion({
    accountId: 'account-1',
    listingId: 'taobao:1010211244888',
  }, {
    getSettings: async () => ({ shipmentCheck: {} as never, aiListing: aiSettings() }),
    getListing: async () => sampleListing(),
    getCategoryLookup: async () => ({
      schemaVersion: 1,
      indexes: {
        normalizedPath: {
          '数码/电子教育': '数码 / 电子教育',
          '数码': '数码',
        },
      },
      byTaobaoPath: {
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
      },
    }),
    getCategoryPaths: async () => {
      fullCategoryApiCalled = true;
      return [];
    },
    completeJson: async ({ messages }) => {
      prompts.push(messages.map(message => message.content).join('\n'));
      return {
        catIds: ['10000104', '10000110', '6031'],
        attrs: [{ attrKey: '适用设备', attrValue: 'Kindle' }],
        confidence: 0.7,
        reason: '完整三级未命中，按电子教育父类候选选择电纸书',
        warnings: [],
      };
    },
  });

  assert.equal(fullCategoryApiCalled, false);
  assert.deepEqual(suggestion.catIds, ['10000104', '10000110', '6031']);
  assert.equal(suggestion.categoryLookup?.matchDepth, 2);
  assert.equal(suggestion.categoryLookup?.sourceDepth, 3);
  assert.equal(suggestion.categoryLookup?.candidateScope, 'level2Children');
  assert.match(prompts[0], /已使用 2 级父类召回微信候选/);
});

test('AI draft suggestion requires a local SiliconFlow API key before calling the model', async () => {
  let modelCalled = false;

  await assert.rejects(
    () => createWxProductDraftSuggestion({
      listingId: 'taobao:1010211244888',
      wxCatIds: ['10000111', '10000113', '6091'],
    }, {
      getSettings: async () => ({ shipmentCheck: {} as never, aiListing: aiSettings({ siliconFlowApiKey: '' }) }),
      getListing: async () => sampleListing(),
      completeJson: async () => {
        modelCalled = true;
        return {};
      },
    }),
    /请先在设置里填写 SiliconFlow API Key/,
  );

  assert.equal(modelCalled, false);
});
