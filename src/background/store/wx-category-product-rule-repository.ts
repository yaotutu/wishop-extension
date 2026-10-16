import type { WxCategoryProductRuleCacheItem, WxCategoryProductRuleCacheStatus } from '../../shared/types.ts';
import { extensionDb } from '../db/extension-db.ts';

export const WX_CATEGORY_PRODUCT_RULE_RELEASE_MODE = 0;

/**
 * 微信发品规则接口按叶子类目 + release_mode 返回一套参数规则。
 * release_mode 当前固定为官方默认值 0，所以主键显式带上它，后续如果微信增加模式不会污染已有缓存。
 */
export function wxCategoryProductRuleCacheId(
  catId: string,
  releaseMode = WX_CATEGORY_PRODUCT_RULE_RELEASE_MODE,
): string {
  return `${releaseMode}:${catId.trim()}`;
}

export async function getWxCategoryProductRuleCacheItem(
  catId: string,
  releaseMode = WX_CATEGORY_PRODUCT_RULE_RELEASE_MODE,
): Promise<WxCategoryProductRuleCacheItem | null> {
  const id = wxCategoryProductRuleCacheId(catId, releaseMode);
  return await extensionDb.wxCategoryProductRules.get(id) || null;
}

export async function getValidWxCategoryProductRuleCacheItem(
  catId: string,
  releaseMode = WX_CATEGORY_PRODUCT_RULE_RELEASE_MODE,
): Promise<WxCategoryProductRuleCacheItem | null> {
  const item = await getWxCategoryProductRuleCacheItem(catId, releaseMode);
  // 失败项也会落库，用于展示同步缺口；发品时只能读取成功项。
  if (!item || item.lastError) return null;
  return item;
}

export async function saveWxCategoryProductRuleCacheItem(
  item: WxCategoryProductRuleCacheItem,
): Promise<WxCategoryProductRuleCacheItem> {
  await extensionDb.wxCategoryProductRules.put(item);
  return item;
}

export async function getWxCategoryProductRuleCacheSnapshot(): Promise<WxCategoryProductRuleCacheItem[]> {
  return extensionDb.wxCategoryProductRules.toArray();
}

export async function getWxCategoryProductRuleCacheStatus(
  total: number,
  runtimeState: Partial<WxCategoryProductRuleCacheStatus> = {},
): Promise<WxCategoryProductRuleCacheStatus> {
  const items = await getWxCategoryProductRuleCacheSnapshot();
  const cachedCatIds = new Set(items.filter(item => !item.lastError).map(item => item.catId));
  const failedCatIds = new Set(items.filter(item => item.lastError).map(item => item.catId));
  const lastUpdatedAt = items.reduce<number | undefined>((latest, item) => {
    if (!latest || item.updatedAt > latest) return item.updatedAt;
    return latest;
  }, undefined);
  const baseStatus: WxCategoryProductRuleCacheStatus = {
    total,
    cached: cachedCatIds.size,
    failed: failedCatIds.size,
    missing: Math.max(0, total - new Set(items.map(item => item.catId)).size),
    syncing: false,
    processed: 0,
    skipped: 0,
    lastUpdatedAt,
  };
  // 运行中进度只覆盖 current/processed 等短期字段；缓存总数必须以 IndexedDB 为准。
  return {
    ...baseStatus,
    ...runtimeState,
    total: baseStatus.total,
    cached: baseStatus.cached,
    failed: baseStatus.failed,
    missing: baseStatus.missing,
    lastUpdatedAt: baseStatus.lastUpdatedAt,
  };
}
