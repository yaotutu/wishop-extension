import type {
  SyncWxCategoryProductRulesInput,
  SyncWxCategoryProductRulesResult,
  WxCategoryProductRuleAttr,
  WxCategoryProductRuleCacheItem,
  WxCategoryProductRuleCacheStatus,
} from '../../shared/types.ts';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';
import {
  getValidWxCategoryProductRuleCacheItem,
  getWxCategoryProductRuleCacheItem,
  getWxCategoryProductRuleCacheStatus as readWxCategoryProductRuleCacheStatus,
  saveWxCategoryProductRuleCacheItem,
  WX_CATEGORY_PRODUCT_RULE_RELEASE_MODE,
  wxCategoryProductRuleCacheId,
} from '../store/wx-category-product-rule-repository.ts';
import type {
  WxShopCategoryProductRule,
  WxShopListingClient,
} from '../wxshop/listing/types.ts';
import type { RuntimeCategoryPath } from './product-listing-category-shortlist.ts';
import { loadRuntimeWxCategoryPaths } from './wxshop-category-path-cache.ts';

type ActivityRecorder = (input: Record<string, unknown>) => Promise<unknown>;

export interface SyncWxCategoryProductRuleCacheDependencies {
  loadCategoryPaths?: () => Promise<RuntimeCategoryPath[]>;
  getClient?: (accountId: string) => Promise<WxShopListingClient>;
  saveCacheItem?: (item: WxCategoryProductRuleCacheItem) => Promise<WxCategoryProductRuleCacheItem>;
  getCacheItem?: (catId: string, releaseMode?: number) => Promise<WxCategoryProductRuleCacheItem | null>;
  wait?: (ms: number) => Promise<void>;
  intervalMs?: number;
  now?: () => number;
  recordStarted?: ActivityRecorder;
  recordCompleted?: ActivityRecorder;
  recordFailed?: ActivityRecorder;
}

interface RuntimeSyncState extends Partial<WxCategoryProductRuleCacheStatus> {
  runId?: string;
  accountId?: string;
}

const DEFAULT_SYNC_INTERVAL_MS = 250;
let activeSync: Promise<void> | null = null;
let runtimeState: RuntimeSyncState = {};

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeInput(input: SyncWxCategoryProductRulesInput): SyncWxCategoryProductRulesInput {
  const accountId = normalizeText(input.accountId);
  if (!accountId) throw new Error('请选择用于下载微信类目云端数据的账号');
  return {
    accountId,
    force: input.force === true,
    limit: typeof input.limit === 'number' && input.limit > 0 ? Math.floor(input.limit) : undefined,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => globalThis.setTimeout(resolve, ms));
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function attrRulesByRequired(attrs: WxCategoryProductRuleAttr[]): WxCategoryProductRuleAttr[] {
  return attrs.filter(attr => attr.required);
}

function normalizeAttrRule(attr: WxCategoryProductRuleAttr): WxCategoryProductRuleAttr {
  return {
    name: normalizeText(attr.name),
    type: normalizeText(attr.type),
    values: Array.from(new Set((attr.values || []).map(normalizeText).filter(Boolean))),
    required: attr.required === true,
    appendAllowed: attr.appendAllowed === true,
    hint: normalizeText(attr.hint) || undefined,
  };
}

function normalizeAttrRules(attrs: WxCategoryProductRuleAttr[]): WxCategoryProductRuleAttr[] {
  return attrs.map(normalizeAttrRule).filter(attr => attr.name);
}

function buildRuleCacheItem(input: {
  path: RuntimeCategoryPath;
  rule?: WxShopCategoryProductRule;
  accountId: string;
  updatedAt: number;
  lastError?: string;
}): WxCategoryProductRuleCacheItem {
  const catId = input.path.catIds.at(-1) || '';
  const productAttrs = normalizeAttrRules(input.rule?.productAttrs || []);
  const saleAttrs = normalizeAttrRules(input.rule?.saleAttrs || []);
  return {
    id: wxCategoryProductRuleCacheId(catId, WX_CATEGORY_PRODUCT_RULE_RELEASE_MODE),
    catId,
    catIds: input.path.catIds,
    categoryPath: input.path.names,
    path: input.path.path,
    releaseMode: WX_CATEGORY_PRODUCT_RULE_RELEASE_MODE,
    productAttrs,
    saleAttrs,
    requiredProductAttrs: attrRulesByRequired(productAttrs),
    fetchedByAccountId: input.accountId,
    updatedAt: input.updatedAt,
    lastError: input.lastError,
  };
}

function createInitialRuntimeState(input: {
  runId: string;
  accountId: string;
  total: number;
  startedAt: number;
}): RuntimeSyncState {
  return {
    runId: input.runId,
    accountId: input.accountId,
    total: input.total,
    cached: 0,
    failed: 0,
    missing: input.total,
    syncing: true,
    processed: 0,
    skipped: 0,
    startedAt: input.startedAt,
    finishedAt: undefined,
    currentCatId: undefined,
    currentPath: undefined,
    lastError: undefined,
  };
}

async function defaultGetClient(accountId: string): Promise<WxShopListingClient> {
  const registry = await import('../wxshop/client-registry.ts');
  return registry.getListingClient(accountId);
}

async function defaultRecordStarted(input: Record<string, unknown>): Promise<unknown> {
  const activityLog = await import('../activity-logs/activity-log-service.ts');
  return activityLog.recordActivityStarted(input as never);
}

async function defaultRecordCompleted(input: Record<string, unknown>): Promise<unknown> {
  const activityLog = await import('../activity-logs/activity-log-service.ts');
  return activityLog.recordActivityCompleted(input as never);
}

async function defaultRecordFailed(input: Record<string, unknown>): Promise<unknown> {
  const activityLog = await import('../activity-logs/activity-log-service.ts');
  return activityLog.recordActivityFailed(input as never);
}

export function wxCategoryProductRuleCacheItemToProductRule(
  item: WxCategoryProductRuleCacheItem,
): WxShopCategoryProductRule {
  return {
    catId: item.catId,
    productAttrs: item.productAttrs,
    saleAttrs: item.saleAttrs,
  };
}

export async function getCachedWxCategoryProductRule(
  catId: string,
): Promise<WxShopCategoryProductRule | null> {
  // 草稿生成只允许使用本地成功缓存，避免发品时再临时扫微信接口。
  const item = await getValidWxCategoryProductRuleCacheItem(catId, WX_CATEGORY_PRODUCT_RULE_RELEASE_MODE);
  return item ? wxCategoryProductRuleCacheItemToProductRule(item) : null;
}

export async function getWxCategoryProductRuleCacheStatus(
  dependencies: Pick<SyncWxCategoryProductRuleCacheDependencies, 'loadCategoryPaths'> = {},
): Promise<WxCategoryProductRuleCacheStatus> {
  const categoryPaths = await (dependencies.loadCategoryPaths || loadRuntimeWxCategoryPaths)();
  return readWxCategoryProductRuleCacheStatus(categoryPaths.length, runtimeState);
}

export async function syncWxCategoryProductRulesToLocalCache(
  rawInput: SyncWxCategoryProductRulesInput,
  dependencies: SyncWxCategoryProductRuleCacheDependencies = {},
): Promise<WxCategoryProductRuleCacheStatus> {
  const input = normalizeInput(rawInput);
  const now = dependencies.now || Date.now;
  const wait = dependencies.wait || delay;
  const intervalMs = dependencies.intervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
  const runId = `syncWxCategoryProductRules:${input.accountId}:${now()}`;
  const logger = createDiagnosticLogger({
    domain: 'listing',
    component: 'WxCategoryRuleCache',
    accountId: input.accountId,
  });
  const loadCategoryPaths = dependencies.loadCategoryPaths || loadRuntimeWxCategoryPaths;
  const getClient = dependencies.getClient || defaultGetClient;
  const saveCacheItem = dependencies.saveCacheItem || saveWxCategoryProductRuleCacheItem;
  const getCacheItem = dependencies.getCacheItem || getWxCategoryProductRuleCacheItem;
  const recordStarted = dependencies.recordStarted || defaultRecordStarted;
  const recordCompleted = dependencies.recordCompleted || defaultRecordCompleted;
  const recordFailed = dependencies.recordFailed || defaultRecordFailed;

  const categoryPaths = await loadCategoryPaths();
  const pathsToSync = input.limit ? categoryPaths.slice(0, input.limit) : categoryPaths;
  // 本轮同步状态放内存，页面轮询状态时能看到当前处理到哪个叶子类目。
  runtimeState = createInitialRuntimeState({
    runId,
    accountId: input.accountId,
    total: categoryPaths.length,
    startedAt: now(),
  });

  await recordStarted({
    domain: 'listing',
    scope: 'account',
    accountId: input.accountId,
    trigger: 'manual',
    runId,
    title: '微信类目云端数据下载开始',
    detail: `待下载叶子类目 ${pathsToSync.length}/${categoryPaths.length} 个`,
    metadata: {
      total: categoryPaths.length,
      limit: input.limit || null,
      force: input.force === true,
    },
  });

  try {
    const client = await getClient(input.accountId);
    let cached = 0;
    let failed = 0;
    let skipped = 0;
    let processed = 0;

    for (const path of pathsToSync) {
      const catId = path.catIds.at(-1) || '';
      if (!catId) continue;

      runtimeState = {
        ...runtimeState,
        currentCatId: catId,
        currentPath: path.path,
        processed,
        skipped,
        cached,
        failed,
      };

      const existing = await getCacheItem(catId, WX_CATEGORY_PRODUCT_RULE_RELEASE_MODE);
      if (!input.force && existing && !existing.lastError) {
        // 已成功缓存的类目默认不重复请求；失败项不跳过，下一轮自动重试。
        skipped += 1;
        processed += 1;
        runtimeState = { ...runtimeState, processed, skipped, cached, failed };
        continue;
      }

      try {
        logger.info('开始下载微信类目发品规则', { catId, path: path.path });
        const rule = await client.getCategoryProductRule(catId);
        await saveCacheItem(buildRuleCacheItem({
          path,
          rule,
          accountId: input.accountId,
          updatedAt: now(),
        }));
        cached += 1;
      } catch (error) {
        const message = errorMessage(error, '下载微信类目发品规则失败');
        logger.warn('下载微信类目发品规则失败，已记录失败项并继续', { catId, path: path.path, error: message });
        // 失败也写入同一张表，方便页面展示“哪些类目还没有可用规则”，并让下次同步精确重试。
        await saveCacheItem(buildRuleCacheItem({
          path,
          accountId: input.accountId,
          updatedAt: now(),
          lastError: message,
        }));
        failed += 1;
      }

      processed += 1;
      runtimeState = { ...runtimeState, processed, skipped, cached, failed };
      if (intervalMs > 0) await wait(intervalMs);
    }

    runtimeState = {
      ...runtimeState,
      syncing: false,
      processed,
      skipped,
      cached,
      failed,
      currentCatId: undefined,
      currentPath: undefined,
      finishedAt: now(),
    };
    const status = await getWxCategoryProductRuleCacheStatus({ loadCategoryPaths });
    await recordCompleted({
      domain: 'listing',
      scope: 'account',
      accountId: input.accountId,
      trigger: 'manual',
      runId,
      title: '微信类目云端数据下载完成',
      detail: `已缓存 ${status.cached}/${status.total} 个，失败 ${status.failed} 个，跳过 ${skipped} 个`,
      summary: {
        cached: status.cached,
        failed: status.failed,
        skipped,
      },
      metadata: {
        total: status.total,
        cached: status.cached,
        failed: status.failed,
        missing: status.missing,
        skipped,
      },
    });
    return status;
  } catch (error) {
    const message = errorMessage(error, '微信类目云端数据下载失败');
    runtimeState = {
      ...runtimeState,
      syncing: false,
      finishedAt: now(),
      lastError: message,
    };
    await recordFailed({
      domain: 'listing',
      scope: 'account',
      accountId: input.accountId,
      trigger: 'manual',
      runId,
      title: '微信类目云端数据下载失败',
      error: { message },
    });
    throw error;
  }
}

export async function startWxCategoryProductRuleCacheSync(
  input: SyncWxCategoryProductRulesInput,
): Promise<SyncWxCategoryProductRulesResult> {
  const normalized = normalizeInput(input);
  if (activeSync) {
    const status = await getWxCategoryProductRuleCacheStatus();
    return { ...status, started: false };
  }

  activeSync = syncWxCategoryProductRulesToLocalCache(normalized)
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      activeSync = null;
    });

  const status = await getWxCategoryProductRuleCacheStatus();
  return { ...status, syncing: true, started: true };
}
