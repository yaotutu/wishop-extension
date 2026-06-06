import type {
  ProductCopyRecord,
  WxProductCategoryCandidate,
  WxProductDraftSuggestionResult,
} from '../../shared/types.ts';
import type { SiliconFlowChatMessage, SiliconFlowJsonCompletionInput } from '../ai/siliconflow-client.ts';
import { shortlistCategoryPaths, type RuntimeCategoryPath } from './product-copy-category-shortlist.ts';

type CompleteJson = (input: SiliconFlowJsonCompletionInput) => Promise<unknown>;

interface SelectCategoryWithAiInput {
  copyId: string;
  listing: ProductCopyRecord;
  categoryPaths: RuntimeCategoryPath[];
  completeJson: CompleteJson;
  apiKey: string;
  model: string;
  fetcher?: typeof fetch;
}

export interface SelectCategoryWithAiResult {
  result: WxProductDraftSuggestionResult;
  localCandidateCount: number;
  aiScreenedCandidateCount: number;
}

const MAX_PROMPT_PARAMS = 80;
const FIRST_ROUND_LOCAL_LIMIT = 240;
const FIRST_ROUND_PICK_LIMIT = 30;

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

function categoryPathKey(catIds: string[]): string {
  return catIds.join('/');
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function categoryPayload(categoryPaths: RuntimeCategoryPath[]): Array<{ catIds: string[]; path: string }> {
  return categoryPaths.map(path => ({
    catIds: path.catIds,
    path: path.path,
  }));
}

function productFactsForPrompt(
  listing: ProductCopyRecord,
  categoryPaths: RuntimeCategoryPath[],
): Record<string, unknown> {
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
    wechatCategoryCandidates: categoryPayload(categoryPaths),
  };
}

function buildScreeningMessages(
  listing: ProductCopyRecord,
  categoryPaths: RuntimeCategoryPath[],
): SiliconFlowChatMessage[] {
  const facts = productFactsForPrompt(listing, categoryPaths);
  return [
    {
      role: 'system',
      content: [
        '你是微信小店商品类目第一轮筛选助手，只输出 JSON。',
        `任务：从用户 JSON 的 wechatCategoryCandidates 中筛出最多 ${FIRST_ROUND_PICK_LIMIT} 个可能匹配的微信小店叶子类目。`,
        '必须只返回候选列表中真实存在的 catIds，不允许编造类目 ID，不需要最终定夺。',
        '优先保留和商品用途、销售形态、标题关键词、原平台类目最接近的类目。',
        'JSON schema: {"candidateCatIds":[["完整类目路径ID"]],"reason":"一句话说明","warnings":["不确定点"]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify(facts),
    },
  ];
}

function buildFinalMessages(
  listing: ProductCopyRecord,
  categoryPaths: RuntimeCategoryPath[],
): SiliconFlowChatMessage[] {
  const facts = productFactsForPrompt(listing, categoryPaths);
  return [
    {
      role: 'system',
      content: [
        '你是微信小店商品类目终选助手，只输出 JSON。',
        '任务：根据商品标题、描述和商品参数，从用户 JSON 的 wechatCategoryCandidates 中选择唯一一个最匹配的微信小店叶子类目。',
        '必须返回候选列表中真实存在的一组 catIds，不允许编造类目 ID，不允许返回中间类目，不允许返回多个类目。',
        '如果多个类目相近，选择最贴近商品用途和销售形态的叶子类目，并把不确定点写入 warnings。',
        '本轮只选择类目，不处理商品参数。',
        'JSON schema: {"catIds":["候选中的完整微信类目路径ID"],"categoryPath":["类目中文路径"],"confidence":0到1数字,"reason":"一句话说明","warnings":["需要人工确认的问题"]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify(facts),
    },
  ];
}

function normalizeScreenedCategoryPaths(
  payload: unknown,
  localCandidates: RuntimeCategoryPath[],
): RuntimeCategoryPath[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const rawCandidateCatIds = Array.isArray(record.candidateCatIds) ? record.candidateCatIds : [];
  const byKey = new Map(localCandidates.map(path => [categoryPathKey(path.catIds), path]));
  const byLeaf = new Map(localCandidates.map(path => [path.catIds.at(-1) || '', path]));
  const selected: RuntimeCategoryPath[] = [];
  const seen = new Set<string>();

  for (const rawCatIds of rawCandidateCatIds) {
    const catIds = normalizeCatIds(rawCatIds);
    const matched = byKey.get(categoryPathKey(catIds)) || byLeaf.get(catIds.at(-1) || '');
    if (!matched) continue;
    const key = categoryPathKey(matched.catIds);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(matched);
    if (selected.length >= FIRST_ROUND_PICK_LIMIT) break;
  }

  if (selected.length === 0) {
    throw new Error('AI 第一轮类目筛选未返回有效候选类目');
  }
  return selected;
}

function normalizeFinalSuggestionPayload(
  payload: unknown,
  options: {
    copyId: string;
    categoryPaths: RuntimeCategoryPath[];
    localCandidates: RuntimeCategoryPath[];
    screenedCandidates: RuntimeCategoryPath[];
  },
): WxProductDraftSuggestionResult {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const catIds = normalizeCatIds(record.catIds ?? record.cat_ids);
  const byKey = new Map(options.screenedCandidates.map(path => [categoryPathKey(path.catIds), path]));
  const byLeaf = new Map(options.screenedCandidates.map(path => [path.catIds.at(-1) || '', path]));
  const matchedPath = byKey.get(categoryPathKey(catIds)) || byLeaf.get(catIds.at(-1) || '');

  if (!matchedPath) {
    throw new Error('AI 第二轮返回的微信类目不在第一轮筛选候选中，请重新生成');
  }

  const selectedCandidate: WxProductCategoryCandidate = {
    catIds: matchedPath.catIds,
    names: matchedPath.names,
    leaf: true,
    source: 'wxStaticSnapshot',
  };

  return {
    copyId: options.copyId,
    catIds: matchedPath.catIds,
    categoryPath: matchedPath.names,
    categoryCandidateSource: 'wxStaticSnapshot',
    categoryCandidates: [selectedCandidate],
    categoryLookup: {
      source: 'wxStaticSnapshot',
      status: 'matched',
      candidateScope: 'wxStaticAll',
      candidateCount: options.screenedCandidates.length,
      warnings: [`已从全量 ${options.categoryPaths.length} 条微信叶子类目中本地检索 ${options.localCandidates.length} 条，再由 AI 第一轮筛选为 ${options.screenedCandidates.length} 条后终选。`],
    },
    attrs: [],
    confidence: normalizeConfidence(record.confidence),
    reason: normalizeText(record.reason) || 'AI 已通过两轮筛选从全量微信小店类目中选择最匹配类目',
    warnings: normalizeWarnings(record.warnings),
  };
}

export async function selectWxCategoryWithTwoStageAi(
  input: SelectCategoryWithAiInput,
): Promise<SelectCategoryWithAiResult> {
  if (input.categoryPaths.length === 0) throw new Error('微信小店类目缓存为空，请先生成全量类目缓存');
  const localCandidates = shortlistCategoryPaths(input.listing, input.categoryPaths, FIRST_ROUND_LOCAL_LIMIT);

  let screeningPayload: unknown;
  try {
    screeningPayload = await input.completeJson({
      apiKey: input.apiKey,
      model: input.model,
      messages: buildScreeningMessages(input.listing, localCandidates),
      temperature: 0.1,
      maxTokens: 900,
      fetcher: input.fetcher,
    });
  } catch (error) {
    throw new Error(`SiliconFlow 类目第一轮筛选失败：${errorMessage(error, '未知错误')}`);
  }

  const screenedCandidates = normalizeScreenedCategoryPaths(screeningPayload, localCandidates);

  let finalPayload: unknown;
  try {
    finalPayload = await input.completeJson({
      apiKey: input.apiKey,
      model: input.model,
      messages: buildFinalMessages(input.listing, screenedCandidates),
      temperature: 0.1,
      maxTokens: 1200,
      fetcher: input.fetcher,
    });
  } catch (error) {
    throw new Error(`SiliconFlow 类目第二轮终选失败：${errorMessage(error, '未知错误')}`);
  }

  return {
    result: normalizeFinalSuggestionPayload(finalPayload, {
      copyId: input.copyId,
      categoryPaths: input.categoryPaths,
      localCandidates,
      screenedCandidates,
    }),
    localCandidateCount: localCandidates.length,
    aiScreenedCandidateCount: screenedCandidates.length,
  };
}
