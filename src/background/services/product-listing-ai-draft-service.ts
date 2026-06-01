import type { AppSettings } from '../../shared/settings.ts';
import type {
  CollectedProductListing,
  CreateWxProductDraftSuggestionInput,
  WxProductCategoryCandidate,
  WxProductCategoryLookupSummary,
  WxProductCategoryPath,
  WxProductDraftAttribute,
  WxProductDraftSuggestionResult,
} from '../../shared/types.ts';
import type { SiliconFlowChatMessage, SiliconFlowJsonCompletionInput } from '../ai/siliconflow-client.ts';
import { createSiliconFlowJsonCompletion } from '../ai/siliconflow-client.ts';
import {
  loadTaobaoWxCategoryLookupData,
  resolveTaobaoWxCategoryLookup,
  type TaobaoWxCategoryLookupData,
} from './product-listing-category-lookup.ts';

type CompleteJson = (input: SiliconFlowJsonCompletionInput) => Promise<unknown>;

export interface CreateWxProductDraftSuggestionDependencies {
  getSettings?: () => Promise<AppSettings>;
  getListing?: (listingId: string) => Promise<CollectedProductListing | null>;
  getCategoryLookup?: () => Promise<TaobaoWxCategoryLookupData>;
  getCategoryPaths?: (accountId: string) => Promise<WxProductCategoryPath[]>;
  completeJson?: CompleteJson;
}

interface NormalizeSuggestionOptions {
  listingId: string;
  fallbackCatIds: string[];
  categoryPaths?: WxProductCategoryCandidate[];
  categoryLookup?: WxProductCategoryLookupSummary;
  expressTemplateId?: string;
}

interface NormalizedSuggestionInput {
  accountId: string;
  listingId: string;
  wxCatIds: string[];
}

const MAX_AI_ATTRS = 40;
const MAX_PROMPT_PARAMS = 80;
const MAX_PROMPT_SKUS = 20;
const MAX_CATEGORY_CANDIDATES = 30;

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeCatIds(value: unknown, fallbackCatIds: string[]): string[] {
  if (!Array.isArray(value)) return fallbackCatIds;
  const catIds = value
    .map(item => normalizeText(item))
    .filter(Boolean);
  return catIds.length > 0 ? Array.from(new Set(catIds)) : fallbackCatIds;
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(item => normalizeText(item)).filter(Boolean)));
}

function normalizeAttrs(value: unknown): WxProductDraftAttribute[] {
  if (!Array.isArray(value)) return [];
  const attrs: WxProductDraftAttribute[] = [];
  const seen = new Set<string>();
  for (const item of value.slice(0, MAX_AI_ATTRS)) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const attrKey = normalizeText(record.attrKey ?? record.attr_key ?? record.key ?? record.name);
    const attrValue = normalizeText(record.attrValue ?? record.attr_value ?? record.value);
    if (!attrKey || !attrValue) continue;
    const signature = `${attrKey}\n${attrValue}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    attrs.push({ attrKey, attrValue });
  }
  return attrs;
}

function normalizeInput(input: CreateWxProductDraftSuggestionInput): NormalizedSuggestionInput {
  return {
    accountId: normalizeText(input.accountId),
    listingId: normalizeText(input.listingId),
    wxCatIds: Array.isArray(input.wxCatIds)
      ? input.wxCatIds.map(catId => normalizeText(catId)).filter(Boolean)
      : [],
  };
}

function categoryPathKey(catIds: string[]): string {
  return catIds.join('/');
}

function findCategoryPath<T extends WxProductCategoryPath>(catIds: string[], categoryPaths: T[] = []): T | undefined {
  const key = categoryPathKey(catIds);
  const leafCatId = catIds.at(-1);
  return categoryPaths.find(path => categoryPathKey(path.catIds) === key)
    || categoryPaths.find(path => leafCatId && path.catIds.at(-1) === leafCatId);
}

function buildListingSearchText(listing: CollectedProductListing): string {
  return [
    listing.title,
    listing.sourceCategory?.name,
    ...(listing.sourceCategory?.path || []),
    listing.priceRangeText,
    listing.deliveryText,
    ...listing.productParams.flatMap(param => [param.name, param.value, param.group]),
    ...listing.skuGroups.flatMap(group => [group.name, ...group.values]),
  ]
    .map(item => normalizeText(item).toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function scoreCategoryPath(searchText: string, categoryPath: WxProductCategoryPath): number {
  const names = categoryPath.names.map(name => normalizeText(name).toLowerCase()).filter(Boolean);
  let score = 0;
  for (const name of names) {
    if (searchText.includes(name)) score += name.length * 10;
    for (const char of Array.from(new Set(name.split('')))) {
      if (searchText.includes(char)) score += 1;
    }
  }
  return score;
}

function selectCategoryCandidates(
  listing: CollectedProductListing,
  categoryPaths: WxProductCategoryPath[],
): WxProductCategoryCandidate[] {
  const searchText = buildListingSearchText(listing);
  const leafPaths = categoryPaths.filter(path => path.leaf && path.catIds.length >= 3 && path.names.length >= 3);
  const scored = leafPaths
    .map(path => ({ path, score: scoreCategoryPath(searchText, path) }))
    .sort((left, right) => right.score - left.score);
  const positive = scored.filter(item => item.score > 0).slice(0, MAX_CATEGORY_CANDIDATES);
  return (positive.length > 0 ? positive : scored.slice(0, MAX_CATEGORY_CANDIDATES)).map(item => ({
    ...item.path,
    source: 'wxApi',
  }));
}

function categoryCandidatesForPrompt(categoryPaths: WxProductCategoryCandidate[]): Array<Record<string, unknown>> {
  return categoryPaths.map(path => ({
    catIds: path.catIds,
    path: path.names.join(' / '),
    source: path.source,
    confidence: path.confidence,
    status: path.status,
    reason: path.reason,
    qualificationTips: path.qualificationTips || [],
  }));
}

function productFactsForPrompt(
  listing: CollectedProductListing,
  input: NormalizedSuggestionInput,
  categoryCandidates: WxProductCategoryCandidate[],
  categoryLookup?: WxProductCategoryLookupSummary,
): Record<string, unknown> {
  return {
    sourcePlatform: listing.platform,
    sourceItemId: listing.itemId,
    sourceUrl: listing.sourceUrl,
    sourceCategory: listing.sourceCategory ? {
      id: listing.sourceCategory.id || '',
      name: listing.sourceCategory.name || '',
      path: listing.sourceCategory.path || [],
    } : undefined,
    targetWxCatIds: input.wxCatIds,
    categoryLookup,
    wechatCategoryCandidates: categoryCandidatesForPrompt(categoryCandidates),
    title: listing.title,
    priceRangeText: listing.priceRangeText,
    deliveryText: listing.deliveryText,
    productParams: listing.productParams.slice(0, MAX_PROMPT_PARAMS).map(param => ({
      name: param.name,
      value: param.value,
      group: param.group,
    })),
    skuGroups: listing.skuGroups,
    sampleSkus: listing.skuMatrix.slice(0, MAX_PROMPT_SKUS).map(sku => ({
      specs: sku.specs,
      priceText: sku.priceText,
      stockText: sku.stockText,
    })),
  };
}

function buildSuggestionMessages(
  listing: CollectedProductListing,
  input: NormalizedSuggestionInput,
  categoryCandidates: WxProductCategoryCandidate[],
  categoryLookup?: WxProductCategoryLookupSummary,
): SiliconFlowChatMessage[] {
  const facts = productFactsForPrompt(listing, input, categoryCandidates, categoryLookup);
  const categoryInstruction = categoryCandidates.length > 0
    ? '微信小店类目必须只从 user JSON 的 wechatCategoryCandidates 中选择一个 catIds，不允许编造候选列表之外的类目 ID。'
    : '用户已手动给出 targetWxCatIds，请沿用该微信小店类目路径，不要改写类目 ID。';
  return [
    {
      role: 'system',
      content: [
        '你是微信小店商品上架参数助手，只输出 JSON。',
        '任务：根据淘宝采集数据、原商品类目名称/路径和微信候选类目，整理微信小店草稿所需的类目路径和商品属性。',
        categoryInstruction,
        '不要输出品牌 ID，不要编造品牌资质；无品牌商品保持普通商品属性即可。',
        'attrs 只放能从标题、商品参数、SKU 规格明确推断的属性，不确定的信息放 warnings。',
        'JSON schema: {"catIds":["微信类目完整路径ID，通常为三级或四级"],"attrs":[{"attrKey":"属性名","attrValue":"属性值"}],"confidence":0到1数字,"reason":"一句话说明","warnings":["需要人工确认的问题"]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify(facts, null, 2),
    },
  ];
}

async function defaultGetSettings(): Promise<AppSettings> {
  const repository = await import('../store/settings-repository.ts');
  return repository.getAppSettings();
}

async function defaultGetListing(listingId: string): Promise<CollectedProductListing | null> {
  const repository = await import('../store/collected-product-listing-repository.ts');
  return repository.getCollectedProductListing(listingId);
}

async function defaultGetCategoryPaths(accountId: string): Promise<WxProductCategoryPath[]> {
  const registry = await import('../wxshop/client-registry.ts');
  const client = await registry.getListingClient(accountId);
  return client.getAllCategoryPaths();
}

export function normalizeWxProductDraftSuggestionPayload(
  payload: unknown,
  options: NormalizeSuggestionOptions,
): WxProductDraftSuggestionResult {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const catIds = normalizeCatIds(record.catIds ?? record.cat_ids, options.fallbackCatIds);
  const categoryPath = findCategoryPath(catIds, options.categoryPaths);
  const warnings = [
    ...normalizeWarnings(record.warnings),
    ...(options.categoryLookup?.warnings || []),
  ];
  if (options.categoryPaths && options.categoryPaths.length > 0 && catIds.length > 0 && !categoryPath) {
    warnings.push('AI 返回的微信类目不在候选列表中，请人工确认');
  }
  return {
    listingId: options.listingId,
    catIds,
    categoryPath: categoryPath?.names,
    categoryCandidateSource: categoryPath?.source || options.categoryPaths?.[0]?.source,
    categoryCandidates: options.categoryPaths,
    categoryLookup: options.categoryLookup,
    attrs: normalizeAttrs(record.attrs ?? record.attributes),
    confidence: normalizeConfidence(record.confidence),
    reason: normalizeText(record.reason) || 'AI 已根据采集数据整理商品属性',
    warnings: Array.from(new Set(warnings)),
    expressTemplateId: normalizeText(options.expressTemplateId),
  };
}

export async function createWxProductDraftSuggestion(
  rawInput: CreateWxProductDraftSuggestionInput,
  dependencies: CreateWxProductDraftSuggestionDependencies = {},
): Promise<WxProductDraftSuggestionResult> {
  const input = normalizeInput(rawInput);
  if (!input.listingId) throw new Error('缺少本地采集商品 ID');

  const loadListing = dependencies.getListing || defaultGetListing;
  const listing = await loadListing(input.listingId);
  if (!listing) throw new Error('采集商品不存在或已删除');

  const settings = await (dependencies.getSettings || defaultGetSettings)();
  const aiSettings = settings.aiListing;
  if (!aiSettings.siliconFlowApiKey.trim()) throw new Error('请先在设置里填写 SiliconFlow API Key');

  let categoryCandidates: WxProductCategoryCandidate[] = [];
  let categoryLookup: WxProductCategoryLookupSummary | undefined;
  if (input.wxCatIds.length === 0) {
    const loadCategoryLookup = dependencies.getCategoryLookup || loadTaobaoWxCategoryLookupData;
    const lookupResult = resolveTaobaoWxCategoryLookup(listing.sourceCategory, await loadCategoryLookup());
    categoryCandidates = lookupResult.candidates;
    categoryLookup = lookupResult;
    if (categoryCandidates.length === 0) {
      if (!input.accountId) throw new Error('请选择微信小店账号，用于读取微信小店类目');
      const loadCategoryPaths = dependencies.getCategoryPaths || defaultGetCategoryPaths;
      categoryCandidates = selectCategoryCandidates(listing, await loadCategoryPaths(input.accountId));
      categoryLookup = {
        source: 'wxApi',
        status: 'fallback_wx_api',
        taobaoPath: lookupResult.taobaoPath,
        sourceDepth: lookupResult.sourceDepth,
        matchDepth: 0,
        candidateScope: 'wxApiFallback',
        candidateCount: categoryCandidates.length,
        warnings: lookupResult.warnings,
      };
    }
    if (categoryCandidates.length === 0) throw new Error('微信小店类目接口未返回可用于 AI 匹配的三级类目');
  }

  const completeJson = dependencies.completeJson || createSiliconFlowJsonCompletion;
  const payload = await completeJson({
    apiKey: aiSettings.siliconFlowApiKey,
    model: aiSettings.siliconFlowModel,
    messages: buildSuggestionMessages(listing, input, categoryCandidates, categoryLookup),
    temperature: 0.1,
    maxTokens: 1600,
  });

  return normalizeWxProductDraftSuggestionPayload(payload, {
    listingId: input.listingId,
    fallbackCatIds: input.wxCatIds.length > 0 ? input.wxCatIds : categoryCandidates[0]?.catIds || [],
    categoryPaths: categoryCandidates,
    categoryLookup,
    expressTemplateId: aiSettings.defaultExpressTemplateId,
  });
}
