import type { ProductCopyRecord } from '../../shared/types.ts';

export interface RuntimeCategoryPath {
  catIds: string[];
  names: string[];
  path: string;
  leaf: true;
}

const MAX_AI_CATEGORY_CANDIDATES = 120;
const MAX_PROMPT_PARAMS = 80;
const MAX_SEARCH_TERMS = 120;
const SEARCH_STOP_WORDS = new Set([
  '适用',
  '专用',
  '通用',
  '商品',
  '产品',
  '配件',
  '官方',
  '正品',
  '全新',
  '包邮',
  '现货',
  '淘宝',
  '天猫',
]);

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeSearchText(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function hasCjk(value: string): boolean {
  return /\p{Script=Han}/u.test(value);
}

function searchTokenWeight(token: string): number {
  if (/^\d+$/u.test(token)) return 1;
  if (/^[a-z0-9]+$/iu.test(token)) return Math.min(token.length, 10);
  return Math.min(Array.from(token).length, 8);
}

function addSearchToken(tokens: Map<string, number>, token: string, weight: number): void {
  const normalized = normalizeSearchText(token);
  if (normalized.length < 2 || SEARCH_STOP_WORDS.has(normalized)) return;
  tokens.set(normalized, Math.max(tokens.get(normalized) || 0, weight));
}

function addSearchText(tokens: Map<string, number>, value: unknown, weight: number): void {
  const text = normalizeSearchText(value);
  if (!text) return;
  const chunks = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (const chunk of chunks) {
    addSearchToken(tokens, chunk, weight + searchTokenWeight(chunk));
    if (!hasCjk(chunk)) continue;

    const chars = Array.from(chunk);
    for (const size of [2, 3, 4]) {
      for (let index = 0; index <= chars.length - size; index += 1) {
        addSearchToken(tokens, chars.slice(index, index + size).join(''), weight + size);
      }
    }
  }
}

function listingSearchTerms(listing: ProductCopyRecord): Array<[string, number]> {
  const terms = new Map<string, number>();
  const sourceCategory = listing.category.source;
  addSearchText(terms, listing.title, 12);
  addSearchText(terms, sourceCategory?.name, 14);
  sourceCategory?.path?.forEach((name, index) => addSearchText(terms, name, 14 + index));
  addSearchText(terms, listing.detail.text.slice(0, 500), 3);
  for (const param of listing.params.slice(0, MAX_PROMPT_PARAMS)) {
    addSearchText(terms, param.name, 4);
    addSearchText(terms, param.value, 7);
  }
  for (const group of listing.sku.groups) {
    addSearchText(terms, group.name, 4);
    group.values.forEach(value => addSearchText(terms, value, 5));
  }

  return Array.from(terms.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, MAX_SEARCH_TERMS);
}

function categorySearchText(path: RuntimeCategoryPath): string {
  return normalizeSearchText(`${path.path} ${path.names.join(' ')}`);
}

function scoreCategoryPath(path: RuntimeCategoryPath, terms: Array<[string, number]>): number {
  const searchText = categorySearchText(path);
  const leafText = normalizeSearchText(path.names.at(-1) || '');
  let score = 0;
  for (const [term, weight] of terms) {
    if (!searchText.includes(term)) continue;
    score += weight;
    if (leafText.includes(term)) score += weight;
  }
  return score;
}

/**
 * “AI 全量类目”不能把 4000+ 条微信类目原样塞进模型 prompt。
 * 这里先在本地全量类目缓存里做确定性检索，再把 Top 候选交给 AI 做最终判断。
 */
export function shortlistCategoryPaths(
  listing: ProductCopyRecord,
  categoryPaths: RuntimeCategoryPath[],
  limit = MAX_AI_CATEGORY_CANDIDATES,
): RuntimeCategoryPath[] {
  const terms = listingSearchTerms(listing);
  const ranked = categoryPaths
    .map((path, index) => ({ path, index, score: scoreCategoryPath(path, terms) }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map(item => item.path);

  // 如果商品文本完全没命中微信类目名称，仍给 AI 一小组稳定候选，避免空候选导致流程中断。
  return ranked.length > 0 ? ranked : categoryPaths.slice(0, limit);
}
