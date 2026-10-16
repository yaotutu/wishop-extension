import type { AppSettings } from '../../shared/settings.ts';
import type {
  ProductCopyRecord,
  CreateWxProductDraftSuggestionInput,
  WxProductDraftSuggestionResult,
} from '../../shared/types.ts';
import type { OpenAiCompatibleJsonCompletionInput } from '../ai/openai-compatible-client.ts';
import { createOpenAiCompatibleJsonCompletion, createOpenAiCompatibleTimeoutFetcher } from '../ai/openai-compatible-client.ts';
import { recordActivityCompleted, recordActivityFailed, recordActivityStarted } from '../activity-logs/activity-log-service.ts';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';
import { selectWxCategoryWithTwoStageAi } from './product-copy-category-ai-selection.ts';
import type { RuntimeCategoryPath } from './product-copy-category-shortlist.ts';
import { loadRuntimeWxCategoryPaths } from './wxshop-category-path-cache.ts';

type CompleteJson = (input: OpenAiCompatibleJsonCompletionInput) => Promise<unknown>;

interface NormalizedInput {
  accountId: string;
  copyId: string;
}

export interface CreateWxFullCategorySuggestionDependencies {
  getSettings?: () => Promise<AppSettings>;
  getCopyRecord?: (copyId: string) => Promise<ProductCopyRecord | null>;
  getCategoryPaths?: () => Promise<RuntimeCategoryPath[]>;
  completeJson?: CompleteJson;
}

const LLM_TIMEOUT_MS = 90_000;

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeInput(input: CreateWxProductDraftSuggestionInput): NormalizedInput {
  return {
    accountId: normalizeText(input.accountId),
    copyId: normalizeText(input.copyId),
  };
}

async function defaultGetSettings(): Promise<AppSettings> {
  const repository = await import('../store/settings-repository.ts');
  return repository.getAppSettings();
}

async function defaultGetCopyRecord(copyId: string): Promise<ProductCopyRecord | null> {
  const repository = await import('../store/product-copy-record-repository.ts');
  return repository.getProductCopyRecord(copyId);
}

async function defaultGetCategoryPaths(): Promise<RuntimeCategoryPath[]> {
  return loadRuntimeWxCategoryPaths();
}

export async function createWxProductFullCategorySuggestion(
  rawInput: CreateWxProductDraftSuggestionInput,
  dependencies: CreateWxFullCategorySuggestionDependencies = {},
): Promise<WxProductDraftSuggestionResult> {
  const input = normalizeInput(rawInput);
  if (!input.copyId) throw new Error('缺少本地采集商品 ID');
  const logger = createDiagnosticLogger({
    domain: 'productCopy',
    component: 'FullCategoryAI',
    accountId: input.accountId || undefined,
  });

  await recordActivityStarted({
    domain: 'productCopy',
    scope: 'global',
    trigger: 'background',
    title: 'AI 全量类目选择开始',
    detail: `采集商品：${input.copyId}`,
    metadata: { copyId: input.copyId, accountId: input.accountId || null },
  });

  try {
    logger.info('开始读取采集商品', { copyId: input.copyId });
    const loadCopyRecord = dependencies.getCopyRecord || defaultGetCopyRecord;
    const listing = await loadCopyRecord(input.copyId);
    if (!listing) throw new Error('采集商品不存在或已删除');

    logger.info('开始读取静态微信类目缓存');
    const loadCategoryPaths = dependencies.getCategoryPaths || defaultGetCategoryPaths;
    const categoryPaths = await loadCategoryPaths();
    if (categoryPaths.length === 0) throw new Error('微信小店类目缓存为空，请先生成全量类目缓存');

    logger.info('开始读取全局 AI 服务设置');
    const settings = await (dependencies.getSettings || defaultGetSettings)();
    const aiSettings = settings.aiService;
    if (!aiSettings.apiKey.trim()) throw new Error('请先在设置里填写 AI 服务 API Key');
    if (!aiSettings.baseUrl.trim()) throw new Error('请先在设置里填写 OpenAI 兼容地址');

    logger.info('开始调用 AI 服务进行两轮全量类目选择', {
      categoryCount: categoryPaths.length,
      timeoutMs: LLM_TIMEOUT_MS,
      model: aiSettings.model,
    });
    const completeJson = dependencies.completeJson || createOpenAiCompatibleJsonCompletion;
    const selection = await selectWxCategoryWithTwoStageAi({
      copyId: input.copyId,
      listing,
      categoryPaths,
      completeJson,
      baseUrl: aiSettings.baseUrl,
      apiKey: aiSettings.apiKey,
      model: aiSettings.model,
      fetcher: dependencies.completeJson ? undefined : createOpenAiCompatibleTimeoutFetcher({
        timeoutMs: LLM_TIMEOUT_MS,
        timeoutMessage: `AI 服务类目选择请求超过 ${Math.round(LLM_TIMEOUT_MS / 1000)} 秒未返回，已取消`,
      }),
    });
    const result = selection.result;
    logger.info('AI 服务两轮类目选择完成', {
      categoryCount: categoryPaths.length,
      localCandidateCount: selection.localCandidateCount,
      aiScreenedCandidateCount: selection.aiScreenedCandidateCount,
      catIds: result.catIds.join('/'),
    });

    await recordActivityCompleted({
      domain: 'productCopy',
      scope: 'global',
      trigger: 'background',
      title: 'AI 全量类目选择完成',
      detail: `${result.categoryPath?.join(' / ') || result.catIds.join(' / ')}，候选 ${selection.aiScreenedCandidateCount}/${selection.localCandidateCount}/${categoryPaths.length} 条`,
      metadata: {
        copyId: input.copyId,
        catIds: result.catIds.join('/'),
        categoryCount: categoryPaths.length,
        localCandidateCount: selection.localCandidateCount,
        aiScreenedCandidateCount: selection.aiScreenedCandidateCount,
      },
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 全量类目选择失败';
    logger.error('AI 全量类目选择失败', { error: message });
    await recordActivityFailed({
      domain: 'productCopy',
      scope: 'global',
      trigger: 'background',
      title: 'AI 全量类目选择失败',
      detail: `采集商品：${input.copyId}`,
      error: { message },
      metadata: { copyId: input.copyId, accountId: input.accountId || null },
    });
    throw error;
  }
}
