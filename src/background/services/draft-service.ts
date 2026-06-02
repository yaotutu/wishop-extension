import type { AddLogFn, DraftProduct, DraftProductDeleteInput, DraftProductDeleteResult } from '../../shared/types';
import { createScopedListingLog } from '../store/log-repository';
import { getListingClient } from '../wxshop/client-registry';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';
import type { WxShopListingClient } from '../wxshop/listing/types';

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

  const api = await getListingClient(accountId);
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
    const result = await (await getListingClient(accountId)).listProduct(productId);
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

export interface DeleteDraftWithClientOptions extends Required<Pick<DraftProductDeleteInput, 'productId'>> {
  api: WxShopListingClient;
  addLog: AddLogFn;
  productTitle?: string;
  runId?: string;
}

/**
 * 执行记录里的删除按钮删除的是微信小店草稿来源商品。
 * 这里接收 client 和日志函数，方便任务流、UI 手动操作和单元测试复用同一套结果记录逻辑。
 */
export async function deleteDraftWithClient(options: DeleteDraftWithClientOptions): Promise<DraftProductDeleteResult> {
  const { api, addLog, productId, productTitle = '', runId = '' } = options;
  const result = await api.deleteProduct(productId);
  if (result.errcode === 0) {
    addLog({
      runId,
      productId,
      productTitle,
      action: 'delete',
      status: 'success',
      errorMsg: '用户从执行记录手动删除草稿商品',
    });
    return { success: true };
  }

  addLog({
    runId,
    productId,
    productTitle,
    action: 'delete',
    status: 'failed',
    errorCode: result.errcode,
    errorMsg: result.errmsg,
  });
  return {
    success: false,
    errorCode: result.errcode,
    error: result.errmsg,
  };
}

/**
 * 从后台 runtime 入口删除草稿商品。
 * 账号凭证和 access token 仍由统一的微信小店 client 管理，页面只传商品 ID 和用于回写执行记录的标题/runId。
 */
export async function deleteDraft(accountId: string, input: DraftProductDeleteInput): Promise<DraftProductDeleteResult> {
  const logger = createDiagnosticLogger({ domain: 'listing', component: 'Drafts', accountId });
  const productId = input.productId.trim();
  if (!productId) {
    throw new Error('缺少要删除的草稿商品 ID');
  }

  try {
    const result = await deleteDraftWithClient({
      api: await getListingClient(accountId),
      addLog: createScopedListingLog(accountId),
      productId,
      productTitle: input.productTitle?.trim() || '',
      runId: input.runId?.trim() || '',
    });
    if (result.success) {
      clearDraftPagination(accountId);
    }
    return result;
  } catch (error: any) {
    const message = error?.message || String(error);
    createScopedListingLog(accountId)({
      runId: input.runId?.trim() || '',
      productId,
      productTitle: input.productTitle?.trim() || '',
      action: 'delete',
      status: 'failed',
      errorMsg: message,
    });
    logger.error(`删除草稿商品 ${productId} 失败:`, error);
    return { success: false, error: message };
  }
}
