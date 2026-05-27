import type { DraftProduct } from '../../shared/types';
import { createScopedListingLog } from '../store/log-repository';
import { getClient } from '../wxshop/client-registry';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';

interface PaginationState {
  nextKey: string;
  hasMore: boolean;
}

const draftPaginationMap = new Map<string, PaginationState>();

export function clearDraftPagination(accountId: string): void {
  draftPaginationMap.delete(accountId);
}

export async function fetchDrafts(accountId: string, reset?: boolean): Promise<{ products: DraftProduct[]; hasMore: boolean }> {
  const logger = createDiagnosticLogger({ domain: 'listing', component: 'Drafts', accountId });
  let pagination = draftPaginationMap.get(accountId);
  if (!pagination || reset) {
    pagination = { nextKey: '', hasMore: true };
    draftPaginationMap.set(accountId, pagination);
  }
  if (!pagination.hasMore) return { products: [], hasMore: false };

  const api = await getClient(accountId);
  const products: DraftProduct[] = [];
  let nextKey = pagination.nextKey;

  while (products.length < 10) {
    const result = await api.getDraftProducts(30, nextKey);
    for (const productId of result.productIds) {
      if (products.length >= 10) break;
      try {
        const detail = await api.getProductDetail(productId);
        if (detail.editStatus === 72) products.push(detail);
      } catch (error) {
        logger.error(`获取商品 ${productId} 详情失败:`, error);
      }
    }
    nextKey = result.nextKey;
    if (!result.hasMore || !nextKey) {
      pagination.hasMore = false;
      break;
    }
  }

  pagination.nextKey = nextKey;
  return { products, hasMore: pagination.hasMore };
}

export async function listDraft(accountId: string, productId: string): Promise<{ success: boolean; error?: string }> {
  const logger = createDiagnosticLogger({ domain: 'listing', component: 'Drafts', accountId });
  const addLog = createScopedListingLog(accountId);
  try {
    const result = await (await getClient(accountId)).listProduct(productId);
    if (result.errcode === 0) {
      addLog({ runId: '', productId, productTitle: '', action: 'list', status: 'success' });
      return { success: true };
    }
    addLog({ runId: '', productId, productTitle: '', action: 'list', status: 'failed', errorCode: result.errcode, errorMsg: result.errmsg });
    return { success: false, error: result.errmsg };
  } catch (error: any) {
    logger.error(`上架商品 ${productId} 失败:`, error);
    addLog({ runId: '', productId, productTitle: '', action: 'list', status: 'failed', errorMsg: error.message });
    return { success: false, error: error.message };
  }
}
