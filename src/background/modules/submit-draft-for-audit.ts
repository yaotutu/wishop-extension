import type { DraftProduct, WxShopListingClient } from '../wxshop/listing/types.ts';
import type {
  AddLogFn,
  ProductAuditFailureDefaultAction,
  ProductAuditFailureRule,
} from '../../shared/types.ts';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';
import { decideProductAuditFailure } from './product-audit-failure-policy.ts';

export type SubmitDraftForAuditResultAction = 'success' | 'keepDraft' | 'deleteDraft' | 'stopTask' | 'skipped';

export interface SubmitDraftForAuditResult {
  action: SubmitDraftForAuditResultAction;
}

export interface SubmitDraftForAuditInput {
  api: WxShopListingClient;
  addLog: AddLogFn;
  product: DraftProduct;
  runId: string;
  signal?: AbortSignal;
  accountId: string;
  failureRules: ProductAuditFailureRule[];
  defaultFailureAction: ProductAuditFailureDefaultAction;
}

const SUBMIT_INTERVAL_MS = 3000;
const lastSubmitTimeMap = new Map<string, number>();

async function waitSubmitInterval(cacheKey: string, signal?: AbortSignal, logger?: any): Promise<void> {
  const lastSubmitTime = lastSubmitTimeMap.get(cacheKey) || 0;
  const elapsed = Date.now() - lastSubmitTime;
  if (elapsed >= SUBMIT_INTERVAL_MS) return;

  const waitMs = SUBMIT_INTERVAL_MS - elapsed;
  logger?.info?.(`等待提审间隔 ${waitMs}ms...`);
  if (signal) {
    await Promise.race([
      new Promise(resolve => setTimeout(resolve, waitMs)),
      new Promise(resolve => { signal.addEventListener('abort', resolve, { once: true }); }),
    ]);
    return;
  }
  await new Promise(resolve => setTimeout(resolve, waitMs));
}

export async function submitDraftForAudit(input: SubmitDraftForAuditInput): Promise<SubmitDraftForAuditResult> {
  const { api, addLog, product, runId, signal, accountId, failureRules, defaultFailureAction } = input;
  const logger = createDiagnosticLogger({ domain: 'productAudit', component: 'SubmitDraftForAudit', accountId });

  try {
    const latest = await api.getProductDetail(product.productId);
    if (latest.editStatus !== 72 && latest.editStatus !== 1) {
      logger.info(`跳过 (状态已变为 ${latest.editStatus}): ${product.title}`);
      return { action: 'skipped' };
    }

    await waitSubmitInterval(accountId, signal, logger);
    const response = await api.submitProductAudit(product.productId);
    lastSubmitTimeMap.set(accountId, Date.now());

    if (response.errcode === 0) {
      addLog({
        runId,
        productId: product.productId,
        productTitle: product.title,
        action: 'submitAudit',
        status: 'success',
      });
      logger.info(`提审提交成功: ${product.title}`);
      return { action: 'success' };
    }

    const decision = decideProductAuditFailure({
      errcode: response.errcode,
      errmsg: response.errmsg,
      rules: failureRules,
      defaultAction: defaultFailureAction,
    });

    addLog({
      runId,
      productId: product.productId,
      productTitle: product.title,
      action: 'submitAudit',
      status: 'failed',
      errorCode: response.errcode,
      errorMsg: response.errmsg,
      decisionAction: decision.action,
      decisionReason: decision.reason,
      matchedRuleId: decision.matchedRule?.id,
    });

    if (decision.action === 'stopTask') {
      addLog({
        runId,
        productId: product.productId,
        productTitle: product.title,
        action: 'stopTask',
        status: 'failed',
        errorCode: response.errcode,
        errorMsg: decision.reason,
        decisionAction: decision.action,
        decisionReason: decision.reason,
        matchedRuleId: decision.matchedRule?.id,
      });
      logger.warn(`命中停止任务规则: ${decision.reason}`);
      return { action: 'stopTask' };
    }

    if (decision.action === 'keepDraft') {
      addLog({
        runId,
        productId: product.productId,
        productTitle: product.title,
        action: 'keepDraft',
        status: 'failed',
        errorCode: response.errcode,
        errorMsg: decision.reason,
        decisionAction: decision.action,
        decisionReason: decision.reason,
        matchedRuleId: decision.matchedRule?.id,
      });
      logger.info(`提审失败，保留草稿: ${product.title} (${decision.reason})`);
      return { action: 'keepDraft' };
    }

    try {
      await api.deleteProduct(product.productId);
      addLog({
        runId,
        productId: product.productId,
        productTitle: product.title,
        action: 'delete',
        status: 'success',
        errorMsg: `提审失败，已删除草稿。原因: ${decision.reason}`,
        decisionAction: decision.action,
        decisionReason: decision.reason,
        matchedRuleId: decision.matchedRule?.id,
      });
      logger.info(`提审失败，已删除草稿: ${product.title}`);
    } catch (error: any) {
      addLog({
        runId,
        productId: product.productId,
        productTitle: product.title,
        action: 'delete',
        status: 'failed',
        errorCode: response.errcode,
        errorMsg: `提审失败后删除草稿也失败: ${error?.message || String(error)}`,
        decisionAction: decision.action,
        decisionReason: decision.reason,
        matchedRuleId: decision.matchedRule?.id,
      });
      logger.error(`提审失败后删除草稿也失败: ${product.title}`, error);
    }
    return { action: 'deleteDraft' };
  } catch (error: any) {
    addLog({
      runId,
      productId: product.productId,
      productTitle: product.title,
      action: 'submitAudit',
      status: 'failed',
      errorMsg: error?.message || String(error),
    });
    logger.error(`提审提交异常: ${product.title}`, error);
    return { action: 'keepDraft' };
  }
}
