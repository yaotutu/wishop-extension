import type { AppSettings } from '../../shared/settings.ts';
import type {
  CollectedProductListing,
  CreateWxProductDraftSuggestionInput,
  WxProductCategoryCandidate,
  WxProductDraftAttribute,
  WxProductDraftSuggestionResult,
} from '../../shared/types.ts';
import type { SiliconFlowChatMessage, SiliconFlowJsonCompletionInput } from '../ai/siliconflow-client.ts';
import { createSiliconFlowJsonCompletion } from '../ai/siliconflow-client.ts';
import { recordActivityCompleted, recordActivityFailed, recordActivityStarted } from '../activity-logs/activity-log-service.ts';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';

type CompleteJson = (input: SiliconFlowJsonCompletionInput) => Promise<unknown>;

interface RuntimeCategoryPath {
  catIds: string[];
  names: string[];
  path: string;
  leaf: true;
}

interface RuntimeCategorySnapshot {
  version?: number;
  total?: number;
  paths?: RuntimeCategoryPath[];
}

interface NormalizedInput {
  accountId: string;
  listingId: string;
}

export interface CreateWxFullCategorySuggestionDependencies {
  getSettings?: () => Promise<AppSettings>;
  getListing?: (listingId: string) => Promise<CollectedProductListing | null>;
  getCategoryPaths?: () => Promise<RuntimeCategoryPath[]>;
  completeJson?: CompleteJson;
}

const STATIC_CATEGORY_PATH = 'data/wxshop-categories/wxshop-category-paths.runtime.json';
const MAX_PROMPT_PARAMS = 80;
const MAX_AI_ATTRS = 40;
const LLM_TIMEOUT_MS = 90_000;

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeCatIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => normalizeText(item)).filter(Boolean);
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

function normalizeInput(input: CreateWxProductDraftSuggestionInput): NormalizedInput {
  return {
    accountId: normalizeText(input.accountId),
    listingId: normalizeText(input.listingId),
  };
}

function categoryPathKey(catIds: string[]): string {
  return catIds.join('/');
}

function normalizeRuntimeCategoryPath(value: unknown): RuntimeCategoryPath | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const catIds = normalizeCatIds(record.catIds);
  const names = Array.isArray(record.names) ? record.names.map(normalizeText).filter(Boolean) : [];
  if (catIds.length < 3 || names.length !== catIds.length) return null;
  return {
    catIds,
    names,
    path: normalizeText(record.path) || names.join(' / '),
    leaf: true,
  };
}

function createTimeoutFetcher(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`SiliconFlow 类目选择请求超过 ${Math.round(timeoutMs / 1000)} 秒未返回，已取消`);
      }
      throw error;
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  };
}

async function defaultGetSettings(): Promise<AppSettings> {
  const repository = await import('../store/settings-repository.ts');
  return repository.getAppSettings();
}

async function defaultGetListing(listingId: string): Promise<CollectedProductListing | null> {
  const repository = await import('../store/collected-product-listing-repository.ts');
  return repository.getCollectedProductListing(listingId);
}

async function defaultGetCategoryPaths(): Promise<RuntimeCategoryPath[]> {
  const url = chrome.runtime.getURL(STATIC_CATEGORY_PATH);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`读取微信小店类目缓存失败：${response.status}`);
  }
  const snapshot = await response.json() as RuntimeCategorySnapshot;
  const paths = (snapshot.paths || [])
    .map(normalizeRuntimeCategoryPath)
    .filter((item): item is RuntimeCategoryPath => Boolean(item));
  if (paths.length === 0) {
    throw new Error('微信小店类目缓存为空，请先生成全量类目缓存');
  }
  return paths;
}

function productFactsForPrompt(listing: CollectedProductListing, categoryPaths: RuntimeCategoryPath[]): Record<string, unknown> {
  const sourceCategory = listing.category.source;
  return {
    sourcePlatform: listing.identity.platform,
    sourceItemId: listing.identity.itemId,
    sourceUrl: listing.sourceUrl,
    title: listing.title,
    description: [
      listing.title,
      listing.detail.text,
      listing.price.rangeText,
      listing.delivery.text,
      sourceCategory?.path?.join(' / ') || sourceCategory?.name || '',
      ...listing.params.slice(0, MAX_PROMPT_PARAMS).map(param => `${param.name}: ${param.value}`),
    ].map(normalizeText).filter(Boolean).join('\n'),
    productParams: listing.params.slice(0, MAX_PROMPT_PARAMS).map(param => ({
      name: param.name,
      value: param.value,
      group: param.group,
    })),
    wechatCategoryCandidates: categoryPaths.map(path => ({
      catIds: path.catIds,
      path: path.path,
    })),
  };
}

function buildMessages(listing: CollectedProductListing, categoryPaths: RuntimeCategoryPath[]): SiliconFlowChatMessage[] {
  const facts = productFactsForPrompt(listing, categoryPaths);
  return [
    {
      role: 'system',
      content: [
        '你是微信小店商品类目选择助手，只输出 JSON。',
        '任务：根据商品标题、描述和商品参数，从用户 JSON 的 wechatCategoryCandidates 中选择唯一一个最匹配的微信小店叶子类目。',
        '必须返回候选列表中真实存在的一组 catIds，不允许编造类目 ID，不允许返回中间类目，不允许返回多个类目。',
        '如果多个类目相近，选择最贴近商品用途和销售形态的叶子类目，并把不确定点写入 warnings。',
        'attrs 只放能从标题、商品参数、SKU 规格明确推断的属性；不确定的信息放 warnings。',
        'JSON schema: {"catIds":["候选中的完整微信类目路径ID"],"categoryPath":["类目中文路径"],"attrs":[{"attrKey":"属性名","attrValue":"属性值"}],"confidence":0到1数字,"reason":"一句话说明","warnings":["需要人工确认的问题"]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify(facts),
    },
  ];
}

function normalizeFullCategorySuggestionPayload(
  payload: unknown,
  options: {
    listingId: string;
    categoryPaths: RuntimeCategoryPath[];
    expressTemplateId?: string;
  },
): WxProductDraftSuggestionResult {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const catIds = normalizeCatIds(record.catIds ?? record.cat_ids);
  const byKey = new Map(options.categoryPaths.map(path => [categoryPathKey(path.catIds), path]));
  const byLeaf = new Map(options.categoryPaths.map(path => [path.catIds.at(-1) || '', path]));
  const matchedPath = byKey.get(categoryPathKey(catIds)) || byLeaf.get(catIds.at(-1) || '');

  if (!matchedPath) {
    throw new Error('AI 返回的微信类目不在全量类目缓存中，请重新选择或人工确认');
  }

  const selectedCandidate: WxProductCategoryCandidate = {
    catIds: matchedPath.catIds,
    names: matchedPath.names,
    leaf: true,
    source: 'wxStaticSnapshot',
  };

  return {
    listingId: options.listingId,
    catIds: matchedPath.catIds,
    categoryPath: matchedPath.names,
    categoryCandidateSource: 'wxStaticSnapshot',
    categoryCandidates: [selectedCandidate],
    categoryLookup: {
      source: 'wxStaticSnapshot',
      status: 'fallback_wx_api',
      candidateScope: 'wxStaticAll',
      candidateCount: options.categoryPaths.length,
      warnings: [],
    },
    attrs: normalizeAttrs(record.attrs ?? record.attributes),
    confidence: normalizeConfidence(record.confidence),
    reason: normalizeText(record.reason) || 'AI 已从全量微信小店类目中选择最匹配类目',
    warnings: normalizeWarnings(record.warnings),
    expressTemplateId: normalizeText(options.expressTemplateId),
  };
}

export async function createWxProductFullCategorySuggestion(
  rawInput: CreateWxProductDraftSuggestionInput,
  dependencies: CreateWxFullCategorySuggestionDependencies = {},
): Promise<WxProductDraftSuggestionResult> {
  const input = normalizeInput(rawInput);
  if (!input.listingId) throw new Error('缺少本地采集商品 ID');
  const logger = createDiagnosticLogger({
    domain: 'listing',
    component: 'FullCategoryAI',
    accountId: input.accountId || undefined,
  });

  await recordActivityStarted({
    domain: 'listing',
    scope: 'global',
    trigger: 'background',
    title: 'AI 全量类目选择开始',
    detail: `采集商品：${input.listingId}`,
    metadata: { listingId: input.listingId, accountId: input.accountId || null },
  });

  try {
    logger.info('开始读取采集商品', { listingId: input.listingId });
    const loadListing = dependencies.getListing || defaultGetListing;
    const listing = await loadListing(input.listingId);
    if (!listing) throw new Error('采集商品不存在或已删除');

    logger.info('开始读取静态微信类目缓存');
    const loadCategoryPaths = dependencies.getCategoryPaths || defaultGetCategoryPaths;
    const categoryPaths = await loadCategoryPaths();
    if (categoryPaths.length === 0) throw new Error('微信小店类目缓存为空，请先生成全量类目缓存');

    logger.info('开始读取 AI 设置');
    const settings = await (dependencies.getSettings || defaultGetSettings)();
    const aiSettings = settings.aiListing;
    if (!aiSettings.siliconFlowApiKey.trim()) throw new Error('请先在设置里填写 SiliconFlow API Key');

    const messages = buildMessages(listing, categoryPaths);
    logger.info('开始调用 SiliconFlow 进行全量类目选择', {
      categoryCount: categoryPaths.length,
      timeoutMs: LLM_TIMEOUT_MS,
      model: aiSettings.siliconFlowModel,
    });
    const completeJson = dependencies.completeJson || createSiliconFlowJsonCompletion;
    const payload = await completeJson({
      apiKey: aiSettings.siliconFlowApiKey,
      model: aiSettings.siliconFlowModel,
      messages,
      temperature: 0.1,
      maxTokens: 1200,
      fetcher: dependencies.completeJson ? undefined : createTimeoutFetcher(LLM_TIMEOUT_MS),
    });

    logger.info('SiliconFlow 已返回，开始校验类目');
    const result = normalizeFullCategorySuggestionPayload(payload, {
      listingId: input.listingId,
      categoryPaths,
      expressTemplateId: aiSettings.defaultExpressTemplateId,
    });

    await recordActivityCompleted({
      domain: 'listing',
      scope: 'global',
      trigger: 'background',
      title: 'AI 全量类目选择完成',
      detail: `${result.categoryPath?.join(' / ') || result.catIds.join(' / ')}，候选 ${categoryPaths.length} 条`,
      metadata: { listingId: input.listingId, catIds: result.catIds.join('/'), categoryCount: categoryPaths.length },
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 全量类目选择失败';
    logger.error('AI 全量类目选择失败', { error: message });
    await recordActivityFailed({
      domain: 'listing',
      scope: 'global',
      trigger: 'background',
      title: 'AI 全量类目选择失败',
      detail: `采集商品：${input.listingId}`,
      error: { message },
      metadata: { listingId: input.listingId, accountId: input.accountId || null },
    });
    throw error;
  }
}
