import { WxShopClient, DraftProduct } from '../wxshop/client';
import type { AddLogFn } from '../../shared/types';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';

const DELETE_INTERVAL_MS = 1000;
const lastDeleteTimeMap = new Map<string, number>();

export async function deleteOne(
  api: WxShopClient,
  addLog: AddLogFn,
  product: DraftProduct,
  runId: string,
  accountId: string = '',
): Promise<'success' | 'failed' | 'stopped'> {
  const logger = createDiagnosticLogger({ domain: 'listing', component: 'DeleteFailed', accountId });
  try {
    const cacheKey = accountId;
    const lastDeleteTime = lastDeleteTimeMap.get(cacheKey) || 0;
    const now = Date.now();
    const elapsed = now - lastDeleteTime;
    if (elapsed < DELETE_INTERVAL_MS) {
      await new Promise(resolve => setTimeout(resolve, DELETE_INTERVAL_MS - elapsed));
    }

    const res = await api.deleteProduct(product.productId);
    lastDeleteTimeMap.set(cacheKey, Date.now());

    if (res.errcode === 0) {
      addLog({ runId, productId: product.productId, productTitle: product.title, action: 'delete', status: 'success', errorMsg: product.editStatus === 3 ? '审核失败，已自动删除' : undefined });
      logger.info(`已删除: ${product.title}`);
      return 'success';
    }

    logger.warn(`errcode=${res.errcode}, 完整报文:`, JSON.stringify(res));

    if (res.errcode === 10020208 || res.errcode === 10020247) {
      addLog({ runId, productId: product.productId, productTitle: product.title, action: 'delete', status: 'failed', errorCode: res.errcode, errorMsg: res.errmsg });
      logger.warn(`全局限制(${res.errcode})，停止`);
      return 'stopped';
    }

    addLog({ runId, productId: product.productId, productTitle: product.title, action: 'delete', status: 'failed', errorCode: res.errcode, errorMsg: res.errmsg });
    return 'failed';
  } catch (error: any) {
    addLog({ runId, productId: product.productId, productTitle: product.title, action: 'delete', status: 'failed', errorMsg: error.message });
    logger.error(`异常: ${product.title}`, error);
    return 'failed';
  }
}

export async function batchDelete(
  api: WxShopClient,
  addLog: AddLogFn,
  products: Array<{ productId: string; title: string }>,
  runId: string,
  accountId: string = '',
): Promise<{ deleted: number; errors: number; stopped: boolean }> {
  let deleted = 0;
  let errors = 0;
  let stopped = false;

  for (const product of products) {
    const draft: DraftProduct = {
      productId: product.productId,
      title: product.title,
      headImgs: [],
      status: 0,
      editStatus: 0,
    };
    const res = await deleteOne(api, addLog, draft, runId, accountId);
    if (res === 'success') {
      deleted++;
    } else if (res === 'stopped') {
      stopped = true;
      break;
    } else {
      errors++;
    }
  }

  return { deleted, errors, stopped };
}
