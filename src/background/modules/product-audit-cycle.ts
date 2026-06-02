import type { WxShopListingClient } from '../wxshop/listing/types';
import type {
  AddLogFn,
  ProductAuditFailureRule,
  ProductAuditFailureDefaultAction,
  ProductAuditTaskConfig,
  ProductAuditTaskResult,
  StatusRule,
} from '../../shared/types';
import { createDiagnosticLogger } from '../logging/diagnostic-logger.ts';
import { streamDraftProducts } from './fetch-draft-products';
import { deleteOne } from './delete-failed-products';
import { submitDraftForAudit } from './submit-draft-for-audit';

export interface RunProductAuditCycleInput {
  api: WxShopListingClient;
  addLog: AddLogFn;
  config: ProductAuditTaskConfig;
  runId: string;
  signal?: AbortSignal;
  accountId: string;
  failureRules: ProductAuditFailureRule[];
  defaultFailureAction: ProductAuditFailureDefaultAction;
  statusRules: StatusRule[];
}

function trackErrorCode(result: ProductAuditTaskResult, code: number | undefined, msg: string | undefined): void {
  if (code == null) return;
  const errorCodes = result.errorCodes || [];
  const existing = errorCodes.find(item => item.code === code);
  if (existing) {
    existing.count++;
  } else {
    errorCodes.push({ code, count: 1, msg: msg || '' });
  }
  result.errorCodes = errorCodes.sort((a, b) => b.count - a.count);
}

function trackEmbeddedErrorCodes(result: ProductAuditTaskResult, msg: string | undefined): void {
  if (!msg) return;
  for (const match of msg.matchAll(/错误码[:：]\s*(\d+)/g)) {
    trackErrorCode(result, Number(match[1]), msg);
  }
}

export async function runProductAuditCycle(input: RunProductAuditCycleInput): Promise<ProductAuditTaskResult> {
  const { api, addLog, config, runId, signal, accountId, failureRules, defaultFailureAction, statusRules } = input;
  const logger = createDiagnosticLogger({ domain: 'productAudit', component: 'ProductAuditCycle', accountId });
  logger.info(`开始商品提审 (runId=${runId}): 提交草稿=${config.submitUnauditedDrafts}(${config.submitLimit})`);

  const result: ProductAuditTaskResult = {
    scanned: 0,
    submitted: 0,
    kept: 0,
    deleted: 0,
    errors: 0,
    skipped: 0,
    stopped: false,
  };

  let submitCount = 0;
  const submitDone = () => !config.submitUnauditedDrafts || submitCount >= config.submitLimit;

  const trackLog: AddLogFn = (log) => {
    if (log.status === 'failed') {
      trackErrorCode(result, log.errorCode, log.errorMsg);
      trackEmbeddedErrorCodes(result, log.errorMsg);
    }
    addLog(log);
  };

  for await (const product of streamDraftProducts(api, signal, accountId)) {
    if (signal?.aborted) {
      result.stopped = true;
      result.reason = '用户手动停止';
      logger.info(`用户手动停止，已扫描 ${result.scanned} 条`);
      break;
    }

    if (config.submitUnauditedDrafts && submitDone()) break;

    result.scanned++;
    logger.info(`扫描 #${result.scanned}: ${product.title} (edit_status=${product.editStatus})`);

    const statusRule = statusRules.find(rule => rule.editStatus === product.editStatus);
    const action = statusRule?.action || 'skip';

    if (action === 'submit') {
      const submitResult = await submitDraftForAudit({
        api,
        addLog: trackLog,
        product,
        runId,
        signal,
        accountId,
        failureRules,
        defaultFailureAction,
      });

      if (submitResult.action === 'success') {
        submitCount++;
        result.submitted++;
      } else if (submitResult.action === 'stopTask') {
        result.stopped = true;
        result.reason = '命中停止任务规则';
      } else if (submitResult.action === 'deleteDraft') {
        result.deleted++;
      } else if (submitResult.action === 'keepDraft') {
        result.kept++;
      } else {
        result.skipped++;
      }
    } else if (action === 'delete') {
      const deleteResult = await deleteOne(api, trackLog, product, runId, accountId);
      if (deleteResult === 'success') {
        result.deleted++;
      } else if (deleteResult === 'stopped') {
        result.stopped = true;
        result.reason = '删除操作被限制';
      } else {
        result.errors++;
      }
    } else {
      logger.info(`跳过 (edit_status=${product.editStatus} ${statusRule?.label || '未知'}): ${product.title}`);
      result.skipped++;
    }

    if (result.stopped) break;
  }

  logger.info(`完成: 扫描=${result.scanned}, 提审成功=${result.submitted}, 保留=${result.kept}, 删除=${result.deleted}, 跳过=${result.skipped}, 错误=${result.errors}, 停止=${result.stopped}`);
  return result;
}
