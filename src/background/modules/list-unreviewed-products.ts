import { WxShopClient, DraftProduct } from '../wxshop/client';
import type { AddLogFn } from '../../shared/types';
import type { BlacklistRule } from '../../shared/types';
import { createLogger } from '../utils/logger';

export type ListOneResult = 'success' | 'skipped' | 'stopped' | 'deleted';

const SUBMIT_INTERVAL_MS = 3000;
const lastSubmitTimeMap = new Map<string, number>();

async function waitInterval(cacheKey: string, signal?: AbortSignal, logger?: any): Promise<void> {
  const lastSubmitTime = lastSubmitTimeMap.get(cacheKey) || 0;
  const now = Date.now();
  const elapsed = now - lastSubmitTime;
  if (elapsed < SUBMIT_INTERVAL_MS) {
    const waitMs = SUBMIT_INTERVAL_MS - elapsed;
    logger?.info?.(`等待间隔 ${waitMs}ms...`);
    if (signal) {
      await Promise.race([
        new Promise(resolve => setTimeout(resolve, waitMs)),
        new Promise(resolve => { signal.addEventListener('abort', resolve, { once: true }); }),
      ]);
    } else {
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
}

function matchBlacklist(errcode: number, errmsg: string | undefined, blacklist: BlacklistRule[]): BlacklistRule | undefined {
  return blacklist.find(r =>
    r.code === errcode || (errmsg && errmsg.includes(`错误码:${r.code}`))
  );
}

function matchSkipKeyword(errmsg: string | undefined, skipKeywords: string[]): string | undefined {
  if (!errmsg) return undefined;
  return skipKeywords.find(kw => errmsg.includes(kw));
}

export async function listOne(
  api: WxShopClient,
  addLog: AddLogFn,
  product: DraftProduct,
  runId: string,
  signal?: AbortSignal,
  accountId: string = '',
  blacklistRules: BlacklistRule[] = [],
  autoDeleteFailed: boolean = true,
  skipKeywords: string[] = [],
): Promise<ListOneResult> {
  const logger = createLogger('ListOne', accountId);
  try {
    const latest = await api.getProductDetail(product.productId);
    if (latest.editStatus !== 72 && latest.editStatus !== 1) {
      logger.info(`跳过 (状态已变为 ${latest.editStatus}): ${product.title}`);
      return 'skipped';
    }

    await waitInterval(api.config.appId, signal, logger);
    const res = await api.listProduct(product.productId);
    lastSubmitTimeMap.set(api.config.appId, Date.now());

    if (res.errcode === 0) {
      addLog({ runId, productId: product.productId, productTitle: product.title, action: 'list', status: 'success' });
      logger.info(`提交成功: ${product.title}`);
      return 'success';
    }

    logger.warn(`errcode=${res.errcode}, 完整报文:`, JSON.stringify(res));

    // 黑名单 → 停任务
    const blacklisted = matchBlacklist(res.errcode, res.errmsg, blacklistRules);
    if (blacklisted) {
      addLog({ runId, productId: product.productId, productTitle: product.title, action: 'list', status: 'failed', errorCode: res.errcode, errorMsg: res.errmsg });
      logger.warn(`黑名单错误码(${blacklisted.code})，停止任务`);
      return 'stopped';
    }

    // 不在黑名单 → 检查是否跳过删除 / 自动删除
    addLog({ runId, productId: product.productId, productTitle: product.title, action: 'list', status: 'failed', errorCode: res.errcode, errorMsg: res.errmsg });

    const matchedKeyword = matchSkipKeyword(res.errmsg, skipKeywords);
    if (matchedKeyword) {
      addLog({ runId, productId: product.productId, productTitle: product.title, action: 'skip', status: 'failed', errorCode: res.errcode, errorMsg: `上架失败，跳过删除（待处理）。原因: errcode:${res.errcode} ${res.errmsg || ''}` });
      logger.info(`上架失败，跳过删除（匹配关键词「${matchedKeyword}」）: ${product.title} (errcode=${res.errcode})`);
      return 'skipped';
    }

    if (autoDeleteFailed) {
      try {
        await api.deleteProduct(product.productId);
        const reason = res.errmsg ? `errcode:${res.errcode} ${res.errmsg}` : `errcode:${res.errcode}`;
        addLog({ runId, productId: product.productId, productTitle: product.title, action: 'delete', status: 'success', errorMsg: `上架失败，已自动删除。原因: ${reason}` });
        logger.info(`上架失败，已删除: ${product.title} (errcode=${res.errcode})`);
      } catch (e: any) {
        addLog({ runId, productId: product.productId, productTitle: product.title, action: 'delete', status: 'failed', errorMsg: `上架失败(errcode:${res.errcode})，删除也失败: ${e.message}` });
        logger.error(`上架后删除失败: ${product.title}`, e);
      }
      return 'deleted';
    } else {
      logger.info(`上架失败，跳过: ${product.title} (errcode=${res.errcode})`);
      return 'skipped';
    }
  } catch (error: any) {
    addLog({ runId, productId: product.productId, productTitle: product.title, action: 'list', status: 'failed', errorMsg: error.message });
    logger.error(`异常: ${product.title}`, error);
    return 'deleted';
  }
}
