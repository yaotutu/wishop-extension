import type { RuntimeCategoryPath } from './product-copy-category-shortlist.ts';

interface RuntimeCategorySnapshot {
  version?: number;
  total?: number;
  paths?: RuntimeCategoryPath[];
}

const STATIC_CATEGORY_PATH = 'data/wxshop-categories/wxshop-category-paths.runtime.json';

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeCatIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => normalizeText(item)).filter(Boolean);
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

export async function loadRuntimeWxCategoryPaths(): Promise<RuntimeCategoryPath[]> {
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
