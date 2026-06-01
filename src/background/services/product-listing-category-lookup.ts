import type {
  TaobaoProductSourceCategorySnapshot,
  WxProductCategoryCandidate,
  WxProductCategoryCandidateScope,
  WxProductCategoryLookupSummary,
  WxProductCategoryMatchStatus,
} from '../../shared/types.ts';

interface TaobaoWxCategoryLookupCandidate {
  catIds?: unknown;
  names?: unknown;
  path?: unknown;
  confidence?: unknown;
  status?: unknown;
  reason?: unknown;
}

interface TaobaoWxCategoryLookupEntry {
  taobao?: {
    names?: unknown;
    path?: unknown;
    level?: unknown;
  };
  wxLeafCandidates?: TaobaoWxCategoryLookupCandidate[];
}

export interface TaobaoWxCategoryLookupData {
  schemaVersion?: number;
  indexes?: {
    normalizedPath?: Record<string, string>;
  };
  byTaobaoPath?: Record<string, TaobaoWxCategoryLookupEntry>;
}

export interface TaobaoWxCategoryLookupResult extends WxProductCategoryLookupSummary {
  candidates: WxProductCategoryCandidate[];
}

const DEFAULT_MAX_CANDIDATES = 5;
const EXTRA_WRAPPER_WARNING = '淘宝原类目包含额外层级，已使用最长可匹配后缀';

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizePathSegment(value: unknown): string {
  return normalizeText(value).replace(/[／/]+/gu, '/');
}

function normalizePathKey(parts: unknown[]): string {
  return parts
    .map(part => normalizePathSegment(part))
    .flatMap(part => part.split('/'))
    .map(part => normalizeText(part))
    .filter(Boolean)
    .join('/');
}

function splitSourceCategoryPath(sourceCategory: TaobaoProductSourceCategorySnapshot): string[] {
  if (Array.isArray(sourceCategory.path) && sourceCategory.path.length > 0) {
    return sourceCategory.path.map(item => normalizeText(item)).filter(Boolean);
  }
  return normalizeText(sourceCategory.name) ? [normalizeText(sourceCategory.name)] : [];
}

function categoryPathFromLookupCandidate(candidate: TaobaoWxCategoryLookupCandidate): string[] {
  if (Array.isArray(candidate.names)) {
    return candidate.names.map(name => normalizeText(name)).filter(Boolean);
  }
  const path = normalizeText(candidate.path);
  return path ? path.split('/').map(name => normalizeText(name)).filter(Boolean) : [];
}

function normalizeLookupStatus(value: unknown): WxProductCategoryMatchStatus | undefined {
  if (value === 'high' || value === 'review' || value === 'low') return value;
  return undefined;
}

function normalizeConfidence(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, value));
}

function normalizeCatIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => normalizeText(item)).filter(Boolean);
}

function uniqueCandidateKey(candidate: WxProductCategoryCandidate): string {
  return candidate.catIds.join('/');
}

function normalizeLookupCandidates(
  rawCandidates: TaobaoWxCategoryLookupCandidate[] | undefined,
  maxCandidates: number,
): WxProductCategoryCandidate[] {
  const seen = new Set<string>();
  const candidates: WxProductCategoryCandidate[] = [];
  for (const rawCandidate of rawCandidates || []) {
    const catIds = normalizeCatIds(rawCandidate.catIds);
    const names = categoryPathFromLookupCandidate(rawCandidate);
    if (catIds.length < 3 || names.length < 3) continue;
    const candidate: WxProductCategoryCandidate = {
      catIds,
      names,
      leaf: true,
      source: 'taobaoWxLookup',
      confidence: normalizeConfidence(rawCandidate.confidence),
      status: normalizeLookupStatus(rawCandidate.status),
      reason: normalizeText(rawCandidate.reason) || undefined,
    };
    const key = uniqueCandidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
    if (candidates.length >= maxCandidates) break;
  }
  return candidates;
}

function candidateScopeForDepth(matchDepth: number, sourceDepth: number): WxProductCategoryCandidateScope {
  if (matchDepth === sourceDepth) return 'exact';
  if (matchDepth >= 3) return 'level3Children';
  if (matchDepth === 2) return 'level2Children';
  return 'level1Children';
}

function parentFallbackWarning(matchDepth: number): string {
  return `本地类目 lookup 未命中完整淘宝路径，已使用 ${matchDepth} 级父类召回微信候选`;
}

function sourcePathCandidates(sourceCategory: TaobaoProductSourceCategorySnapshot): Array<{
  key: string;
  usedSuffix: boolean;
  sourceDepth: number;
  matchDepth: number;
}> {
  const parts = splitSourceCategoryPath(sourceCategory);
  const keys: Array<{
    key: string;
    usedSuffix: boolean;
    sourceDepth: number;
    matchDepth: number;
  }> = [];
  const seen = new Set<string>();
  const addKey = (key: string, usedSuffix: boolean, sourceDepth: number, matchDepth: number) => {
    const signature = `${key}:${sourceDepth}:${matchDepth}`;
    if (!key || seen.has(signature)) return;
    seen.add(signature);
    keys.push({ key, usedSuffix, sourceDepth, matchDepth });
  };

  if (parts.length === 0) {
    addKey(normalizePathKey([sourceCategory.name]), false, 1, 1);
    return keys;
  }

  // 先尝试最完整的路径；完整路径不命中时，逐级退到二级/一级父类。
  // 对于带有包装层的页面路径，也会尝试每个后缀，但仍优先更深层的匹配。
  for (let depth = parts.length; depth >= 1; depth -= 1) {
    for (let start = 0; start <= parts.length - depth; start += 1) {
      const suffix = parts.slice(start);
      const sourceDepth = suffix.length;
      const matchParts = suffix.slice(0, depth);
      addKey(normalizePathKey(matchParts), start > 0, sourceDepth, depth);
    }
  }

  const nameKey = normalizePathKey([sourceCategory.name]);
  if (nameKey) {
    const signature = `${nameKey}:1:1`;
    if (!seen.has(signature)) {
      seen.add(signature);
      keys.push({
        key: nameKey,
        usedSuffix: false,
        sourceDepth: 1,
        matchDepth: 1,
      });
    }
  }
  return keys;
}

function resultWarnings(candidateKey: { usedSuffix: boolean; sourceDepth: number; matchDepth: number }): string[] {
  const warnings: string[] = [];
  if (candidateKey.usedSuffix) warnings.push(EXTRA_WRAPPER_WARNING);
  if (candidateKey.matchDepth < candidateKey.sourceDepth) warnings.push(parentFallbackWarning(candidateKey.matchDepth));
  return warnings;
}

function lookupCanonicalPath(
  lookupData: TaobaoWxCategoryLookupData,
  key: string,
): string | undefined {
  const normalizedIndex = lookupData.indexes?.normalizedPath || {};
  const indexedPath = normalizedIndex[key] || normalizedIndex[key.replace(/\s+/g, '')];
  if (indexedPath) return indexedPath;
  if (lookupData.byTaobaoPath?.[key]) return key;
  return undefined;
}

// 用淘宝页面采集到的类目名称/路径查静态映射表，只返回候选，不在这里做最终决策。
// 最终类目仍交给 AI 或人工确认，避免把 lookup 里的宽泛/错误 best 当成硬映射。
export function resolveTaobaoWxCategoryLookup(
  sourceCategory: TaobaoProductSourceCategorySnapshot | undefined,
  lookupData: TaobaoWxCategoryLookupData,
  options: { maxCandidates?: number } = {},
): TaobaoWxCategoryLookupResult {
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  if (!sourceCategory) {
    return {
      source: 'taobaoWxLookup',
      status: 'missing_source_category',
      sourceDepth: 0,
      matchDepth: 0,
      candidateScope: 'wxApiFallback',
      candidateCount: 0,
      warnings: ['采集结果没有淘宝原类目，无法使用本地类目 lookup'],
      candidates: [],
    };
  }

  for (const candidateKey of sourcePathCandidates(sourceCategory)) {
    const matchedPath = lookupCanonicalPath(lookupData, candidateKey.key);
    const entry = matchedPath ? lookupData.byTaobaoPath?.[matchedPath] : undefined;
    if (!matchedPath || !entry) continue;

    const candidates = normalizeLookupCandidates(entry.wxLeafCandidates, maxCandidates);
    if (candidates.length === 0) continue;
    return {
      source: 'taobaoWxLookup',
      status: 'matched',
      taobaoPath: splitSourceCategoryPath(sourceCategory).join(' / '),
      matchedTaobaoPath: matchedPath,
      sourceDepth: candidateKey.sourceDepth,
      matchDepth: candidateKey.matchDepth,
      candidateScope: candidateScopeForDepth(candidateKey.matchDepth, candidateKey.sourceDepth),
      candidateCount: candidates.length,
      warnings: resultWarnings(candidateKey),
      candidates,
    };
  }

  const sourceDepth = splitSourceCategoryPath(sourceCategory).length;
  return {
    source: 'taobaoWxLookup',
    status: 'not_found',
    taobaoPath: splitSourceCategoryPath(sourceCategory).join(' / '),
    sourceDepth,
    matchDepth: 0,
    candidateScope: 'wxApiFallback',
    candidateCount: 0,
    warnings: ['本地类目 lookup 未命中淘宝原类目，将回退到微信全量类目筛选'],
    candidates: [],
  };
}

// 这份 lookup 数据体积较大，不能直接 import 到 background bundle。
// 通过 public 静态资源按需 fetch，可以避免 service worker 每次启动都解析 3MB+ 类目表。
export async function loadTaobaoWxCategoryLookupData(): Promise<TaobaoWxCategoryLookupData> {
  const lookupUrl = chrome.runtime.getURL('data/category-mapping/taobao-wxshop-category-lookup.runtime.json');
  const response = await fetch(lookupUrl);
  if (!response.ok) {
    throw new Error(`本地类目 lookup 加载失败：${response.status}`);
  }
  return await response.json() as TaobaoWxCategoryLookupData;
}
